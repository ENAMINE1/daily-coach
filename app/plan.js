// Plan loading, normalising and validation. A plan file (JSON or YAML) fully describes
// what the app tracks: tracks of weeks, a weekly rhythm of tasks, habits, heatmaps and coach voice.
const yaml = require('./js-yaml.min.js');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const CELEBRATIONS = ['fireworks', 'confetti', 'boost', 'message', 'none'];

const DEFAULT_MESSAGES = {
  good: ['Every task done yesterday, {name}. Do it again today.', 'Full marks for yesterday. Stack another one on top.'],
  ok: ['Half done is better than zero, but don\'t let "half" become the habit.', 'Some progress yesterday. Today, finish the list.'],
  bad: ['Yesterday was close to zero, {name}. The plan doesn\'t move on its own.', 'You skipped yesterday. Open the first task now.'],
  start: ['New day, clean slate. First task, right now.'],
  dayDone: ['Every task done today. Proper work.'],
  nudgeSoft: ['There\'s still time tonight.'],
  nudgeHard: ['Twenty minutes now beats a perfect plan tomorrow.'],
  boost: ['Consistency beats intensity. Show up today.'],
  scold: ['Stop scrolling. Open the task.'],
  praise: ['That\'s how it\'s done.']
};

function parsePlanText(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) throw new Error('The plan file is empty.');
  if (t[0] === '{') return JSON.parse(t);
  const doc = yaml.load(t, { schema: yaml.JSON_SCHEMA });
  if (!doc || typeof doc !== 'object') throw new Error('The plan must be a JSON object or a YAML mapping.');
  return doc;
}

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const strArr = v => Array.isArray(v) && v.every(isStr);

function validatePlan(p) {
  const errors = [], warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { errors: ['plan: must be an object'], warnings };
  if (p.schemaVersion !== 1) err('schemaVersion', 'must be 1');
  if (!p.meta || !isStr(p.meta.title)) err('meta.title', 'required text');
  if (p.meta && p.meta.startDate !== undefined && !/^\d{4}-\d\d-\d\d$/.test(p.meta.startDate)) err('meta.startDate', 'must be YYYY-MM-DD');

  const trackIds = new Set();
  if (!Array.isArray(p.tracks) || !p.tracks.length) err('tracks', 'need at least one track');
  else p.tracks.forEach((t, i) => {
    const at = `tracks[${i}]`;
    if (!t || !ID.test(t.id || '')) err(`${at}.id`, 'lowercase id like "backend" (letters, digits, - or _)');
    else if (trackIds.has(t.id)) err(`${at}.id`, `duplicate id "${t.id}"`); else trackIds.add(t.id);
    if (!isStr(t && t.name)) err(`${at}.name`, 'required text');
    if (!Array.isArray(t && t.weeks) || !t.weeks.length) { err(`${at}.weeks`, 'need at least one week'); return; }
    if (t.weeks.length > 104) err(`${at}.weeks`, 'at most 104 weeks');
    t.weeks.forEach((w, j) => {
      const aw = `${at}.weeks[${j}]`;
      if (!w || !isStr(w.title)) err(`${aw}.title`, 'required text');
      if (w && w.checklist !== undefined && !strArr(w.checklist)) err(`${aw}.checklist`, 'must be a list of text');
      if (w && w.days !== undefined) {
        if (typeof w.days !== 'object' || Array.isArray(w.days)) err(`${aw}.days`, 'must map task ids to lists of subtask lists');
        else for (const [k, v] of Object.entries(w.days)) {
          if (!Array.isArray(v) || !v.every(strArr)) err(`${aw}.days.${k}`, 'must be a list of lists of text, one inner list per occurrence of the task that week');
        }
      }
    });
  });

  const taskIds = new Set();
  if (!p.rhythm || typeof p.rhythm !== 'object') err('rhythm', 'required: map of weekday (mon..sun) to a list of tasks');
  else {
    for (const k of Object.keys(p.rhythm)) if (!DAYS.includes(k)) err(`rhythm.${k}`, 'unknown weekday; use mon, tue, wed, thu, fri, sat, sun');
    let any = false;
    for (const d of DAYS) {
      const list = p.rhythm[d];
      if (list === undefined) continue;
      if (!Array.isArray(list)) { err(`rhythm.${d}`, 'must be a list'); continue; }
      const seen = new Set();
      list.forEach((t, i) => {
        const at = `rhythm.${d}[${i}]`; any = true;
        if (!t || !ID.test(t.id || '')) return err(`${at}.id`, 'lowercase task id');
        if (seen.has(t.id)) err(`${at}.id`, `task "${t.id}" appears twice on ${d}`); seen.add(t.id); taskIds.add(t.id);
        if (!isStr(t.label)) err(`${at}.label`, 'required text');
        if (t.track !== undefined && !trackIds.has(t.track)) err(`${at}.track`, `no track with id "${t.track}"`);
        if (t.minutes !== undefined && !(Number.isFinite(t.minutes) && t.minutes >= 0 && t.minutes <= 600)) err(`${at}.minutes`, 'number from 0 to 600');
        if (t.subtasks !== undefined && !strArr(t.subtasks)) err(`${at}.subtasks`, 'must be a list of text');
        if (!t.subtasks && !t.track) warn(at, 'no subtasks and no track: the task will have no checklist');
      });
    }
    if (!any) err('rhythm', 'no tasks on any day');
  }

  const habitIds = new Set();
  (p.habits || []).forEach((h, i) => {
    const at = `habits[${i}]`;
    if (!h || !ID.test(h.id || '')) return err(`${at}.id`, 'lowercase id');
    if (habitIds.has(h.id) || taskIds.has(h.id)) err(`${at}.id`, `id "${h.id}" already used`); habitIds.add(h.id);
    if (!isStr(h.name)) err(`${at}.name`, 'required text');
    if (h.target !== undefined && !(Number.isInteger(h.target) && h.target >= 1)) err(`${at}.target`, 'whole number ≥ 1');
  });

  const hmIds = new Set();
  (p.heatmaps || []).forEach((m, i) => {
    const at = `heatmaps[${i}]`;
    if (!m || !ID.test(m.id || '')) return err(`${at}.id`, 'lowercase id');
    if (hmIds.has(m.id)) err(`${at}.id`, 'duplicate'); hmIds.add(m.id);
    if (!isStr(m.name)) err(`${at}.name`, 'required text');
    const hasTasks = Array.isArray(m.tasks) && m.tasks.length, hasHabit = isStr(m.habit);
    if (hasTasks === hasHabit) err(at, 'set exactly one of "tasks" (list of task ids) or "habit" (a habit id)');
    if (hasTasks) m.tasks.forEach(t => { if (!taskIds.has(t)) err(`${at}.tasks`, `no task with id "${t}" in rhythm`); });
    if (hasHabit && !habitIds.has(m.habit)) err(`${at}.habit`, `no habit with id "${m.habit}"`);
    if (m.levels !== undefined && !(Array.isArray(m.levels) && m.levels.length === 4 && m.levels.every((x, k) => Number.isInteger(x) && x >= 1 && (k === 0 || x >= m.levels[k - 1])))) err(`${at}.levels`, '4 ascending whole numbers, e.g. [1, 3, 6, 9]');
  });

  if (p.coach) {
    if (p.coach.messages) for (const [k, v] of Object.entries(p.coach.messages)) {
      if (!DEFAULT_MESSAGES[k]) warn(`coach.messages.${k}`, 'unknown message group (ignored)');
      else if (!strArr(v)) err(`coach.messages.${k}`, 'must be a list of text');
    }
    if (p.coach.celebrations) for (const [k, v] of Object.entries(p.coach.celebrations)) if (!CELEBRATIONS.includes(v)) err(`coach.celebrations.${k}`, `one of ${CELEBRATIONS.join(', ')}`);
  }
  if (p.schedule) {
    const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const k of ['checkinFrom', 'nudgeAt']) if (p.schedule[k] !== undefined && p.schedule[k] !== null && !hm.test(p.schedule[k])) err(`schedule.${k}`, 'time as "HH:MM" (24h) or null to turn off');
  }
  return { errors, warnings };
}

function normalizePlan(p) {
  const n = JSON.parse(JSON.stringify(p));
  n.meta = Object.assign({ owner: 'friend', weekStartsOn: 'mon' }, n.meta);
  n.rhythm = n.rhythm || {};
  n.habits = (n.habits || []).map(h => Object.assign({ unit: 'time', target: 1, great: Math.max(2, (h.target || 1) + 1), logItems: false }, h));
  n.heatmaps = (n.heatmaps || []).map(m => Object.assign({ levels: m.habit ? [1, 1, 2, 3] : [1, 3, 6, 9] }, m));
  if (!n.heatmaps.length) {
    const ids = [...new Set(Object.values(n.rhythm).flat().map(t => t.id))];
    n.heatmaps.push({ id: 'all', name: 'All tasks', tasks: ids, levels: [1, 3, 6, 9] });
    n.habits.forEach(h => n.heatmaps.push({ id: h.id, name: h.name, habit: h.id, levels: [1, 1, 2, 3] }));
  }
  n.coach = n.coach || {};
  n.coach.messages = Object.assign({}, DEFAULT_MESSAGES, n.coach.messages || {});
  n.coach.celebrations = Object.assign({ weekComplete: 'fireworks', dayComplete: 'confetti', habitTarget: 'boost' }, n.coach.celebrations || {});
  n.schedule = Object.assign({ checkinFrom: '05:00', nudgeAt: '21:00' }, n.schedule || {});
  n.ui = Object.assign({ heatmapAnimation: 'page' }, n.ui || {});
  return n;
}

module.exports = { parsePlanText, validatePlan, normalizePlan, DAYS };
