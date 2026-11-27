const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, powerMonitor, net } = require('electron');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const R = require('./data');
const D = require('./daily');

const PORT = 47820;
const STARTUP = process.argv.includes('--startup');

// ---------- date helpers (local time) ----------
const z = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const today = () => ds(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ds(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const isDate = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s);
const pick = a => a[Math.floor(Math.random() * a.length)];
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

// ---------- coach lines ----------
const L = {
  good: ["Every task done yesterday. That's how six months actually gets finished.", "Full marks for yesterday. Do it again today.", "Yesterday was a complete day. Stack another one on top."],
  ok: ["Half done is better than zero, but don't let 'half' become the habit.", "Some progress yesterday. Today, finish the list.", "Decent, not great. You know which task you dodged. Start with that one."],
  bad: ["Yesterday was close to zero. The roadmap doesn't move on its own, Rahul.", "You skipped yesterday. No excuses today: open the first task now.", "Zero-ish day. One bad day is noise, two is a pattern. Don't make it two."],
  start: ["Day one. Two hours today, that's all. Go.", "New day, clean slate. First task, right now."],
  dayDone: ["Every task done today. Proper work.", "Today's list is cleared. That's a win."],
  nudgeSoft: ["There's still time tonight.", "Finish strong."],
  nudgeHard: ["Close the laptop on a zero day? Not today.", "Twenty minutes now beats a perfect plan tomorrow."],
  boost: ["You're building something most people only talk about. Keep going.", "Consistency beats intensity. Show up today."],
  scold: ["Stop scrolling. Open the task.", "You said you wanted someone on your back. This is it. Go."],
  praise: ["That's how it's done.", "Proud of that one. Keep the streak alive."]
};

// ---------- store ----------
let S, storePath;
function load() {
  storePath = path.join(app.getPath('userData'), 'coach.json');
  let old = null;
  try { old = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch { old = null; }
  // nudgeDate = today on first run, so install day never gets a 9 pm scolding
  S = Object.assign({ name: 'Rahul', startDate: today(), autoStart: true, days: {}, weeks: {}, plans: {}, lastCheckin: null, promptDate: null, nudgeDate: today(), lastLine: '', events: [] }, old || {});
  S.plans = S.plans || {};
  // One-time: Rahul asked for everything to start on Monday 30 Nov 2026. Old progress is archived, not deleted.
  if (!S.resetNov30 && S.startDate < '2026-11-30') { startFresh('2026-11-30', 'Fresh start: your plan begins on Monday 30 November. Use the days before it to set up.'); S.resetNov30 = true; }
  save();
}
function startFresh(date, line) {
  S.archives = S.archives || [];
  if (Object.keys(S.days).length || Object.keys(S.weeks).length) S.archives.push({ at: new Date().toISOString(), startDate: S.startDate, days: S.days, weeks: S.weeks, plans: S.plans });
  S.days = {}; S.weeks = {}; S.plans = {};
  S.startDate = date; S.lastCheckin = null; S.promptDate = null; S.nudgeDate = today();
  S.lastLine = line || `Fresh start from ${date}.`;
}
function save() {
  const t = storePath + '.tmp';
  fs.writeFileSync(t, JSON.stringify(S, null, 1));
  fs.renameSync(t, storePath);
}

// ---------- plan logic ----------
const wkItems = k => (k[0] === 'b' ? [...R.backend[+k.slice(1) - 1].l.map((_, i) => 'l' + i), 'b', 'sd'] : ['learn', 'make']);
const wk = k => S.weeks[k] || (S.weeks[k] = { items: {}, done: false });
const validWeek = k => typeof k === 'string' && /^[ba]\d+$/.test(k) && +k.slice(1) >= 1 && +k.slice(1) <= (k[0] === 'b' ? R.backend.length : R.ae.length);
function currentWeek(p) {
  const len = p === 'b' ? R.backend.length : R.ae.length;
  for (let i = 1; i <= len; i++) if (!(S.weeks[p + i] && S.weeks[p + i].done)) return i;
  return len;
}
const calendarWeek = () => (today() < S.startDate ? 1 : Math.floor(diffDays(S.startDate, today()) / 7) + 1);
const doneCount = p => Object.keys(S.weeks).filter(k => k[0] === p && S.weeks[k].done).length;

function baseTasksFor(date) {
  const wd = parse(date).getDay();
  const bw = currentWeek('b'), aw = currentWeek('a');
  const B = R.backend[bw - 1], A = R.ae[aw - 1], DB = D.backend[bw - 1], DA = D.ae[aw - 1];
  let list;
  if (wd === 6) list = [
    { id: 'payflow', label: 'PayFlow build', detail: B.b, min: 120, subs: DB.p },
    { id: 'ae', label: 'After Effects study', detail: 'Break down one piece of motion work you love, frame by frame', min: 30,
      subs: ['Pick a piece on Motionographer or Vimeo Staff Picks', 'Watch it at 0.25x and list every move with rough timings', 'Note 2 techniques you want to steal this month'] }];
  else if (wd === 0) list = [
    { id: 'review', label: "Review the week's notes", detail: 'Re-answer every limit question without looking', min: 45,
      subs: ["Re-read this week's five-question notes", 'Answer without notes: ' + B.q, 'Write down the weak spots to revisit next week'] },
    { id: 'mock', label: 'Whiteboard one design, timed', detail: B.sd, min: 45,
      subs: ['Pick the design: ' + B.sd, 'Set a 35-minute timer and whiteboard it out loud', 'Compare with the reference solution and note 3 gaps'] },
    { id: 'shorts', label: 'Record 1–2 shorts', detail: "Turn this week's best note into a 45-second video", min: 30,
      subs: ["Pick the week's best note", 'Write a 2-second hook and a 3-beat script', 'Record 1–2 takes', 'Edit and post (or schedule)'] }];
  else {
    const i = wd - 1;
    list = [
      { id: 'core', label: 'Core topic', detail: B.t, min: 75, subs: DB.c[i] },
      { id: 'sd', label: 'System design', detail: B.sd, min: 30, subs: DB.s[i] },
      { id: 'note', label: 'Five-question note', detail: 'On today\'s core topic: ' + B.t, min: 15,
        subs: ['Problem: what pain does today\'s topic solve?', 'Mechanism: how does it work one level down?', 'Limits: where does it break?', 'Trade-off: what do you give up, and what are the alternatives?', 'Interview signal: which question would trigger this?'] },
      wd === 5
        ? { id: 'ae', label: 'AE remix day', detail: 'One scene, 3 versions, one variable changed', min: 30,
            subs: ['Pick one beat from this week\'s AE work (' + A.t + ')', 'Version 1: change the direction', 'Version 2: change the method (scale, mask, morph)', 'Version 3: change the timing', 'Write one line: which wins and why'] }
        : { id: 'ae', label: 'After Effects', detail: `${A.t}: ${A.make}`, min: 30, subs: DA.d[Math.min(i, 3)] }];
  }
  // Rahul adds his own subtasks (Plan tab / Today), so roadmap tasks start with none.
  return list.map(t => ({ ...t, subs: [] }));
}
// categories feed the four heatmaps
const TASKCAT = { core: 'java', note: 'java', payflow: 'java', review: 'java', shorts: 'java', sd: 'sd', mock: 'sd', ae: 'ae' };
const CATS = { java: 'Java & backend', sd: 'System design', ae: 'After Effects', dsa: 'DSA' };
// A day's plan = the roadmap's tasks for that weekday, minus what was removed for that date,
// plus subtasks and tasks added for that date (S.plans[date]).
function tasksFor(date) {
  const c = S.plans[date] || {}, hidden = c.hidden || {}, extra = c.extra || {};
  const base = baseTasksFor(date).filter(t => !hidden[t.id]).map(t => ({ ...t, cat: TASKCAT[t.id],
    subs: [...t.subs.filter(x => !hidden[x.id]), ...(extra[t.id] || []).map(x => ({ id: x.id, label: x.label, added: true }))] }));
  const added = (c.tasks || []).map(t => ({ id: t.id, label: t.label, detail: t.note || CATS[t.cat], min: t.min || 0, cat: t.cat, custom: true,
    subs: t.subs.map(x => ({ id: x.id, label: x.label, added: true })) }));
  return [...base, ...added];
}
const planOf = d => S.plans[d] || (S.plans[d] = { hidden: {}, extra: {}, tasks: [], seq: 0 });
const day = d => S.days[d] || (S.days[d] = { done: {}, note: '', reported: false });
const slim = tl => tl.map(t => ({ id: t.id, label: t.label, cat: t.cat, subs: t.subs.map(x => ({ id: x.id, label: x.label })) }));
const catOf = (e, taskId) => TASKCAT[taskId] || ((e && e.cats) || {})[taskId];
function dayScore(d) {
  const e = S.days[d]; if (!e) return 0;
  const t = e.total || tasksFor(d).length;
  const n = Object.values(e.done).filter(Boolean).length;
  return t ? Math.min(1, n / t) : 0;
}
function streak() {
  let s = 0, d = today();
  if (dayScore(d) < 0.5) d = addDays(d, -1);
  while (d >= S.startDate && dayScore(d) >= 0.5) { s++; d = addDays(d, -1); }
  return s;
}

function state() {
  const t = today(), y = addDays(t, -1), bw = currentWeek('b'), aw = currentWeek('a'), cw = calendarWeek();
  if (t >= S.startDate) { // keep today's plan on record for tomorrow's backlog
    const snap = slim(tasksFor(t)), e = day(t);
    if (JSON.stringify(e.snap) !== JSON.stringify(snap)) { e.snap = snap; save(); }
  }
  return {
    name: S.name, startDate: S.startDate, autoStart: S.autoStart, today: t, yesterday: y,
    needsCheckin: S.lastCheckin !== t,
    needsReport: y >= S.startDate && !(S.days[y] && S.days[y].reported),
    daysAway: S.lastCheckin ? diffDays(S.lastCheckin, t) : 0,
    todayTasks: tasksFor(t), yesterdayTasks: tasksFor(y),
    days: S.days, weeks: S.weeks, bw, aw, calendarWeek: cw,
    behind: t < S.startDate ? 0 : Math.max(0, Math.min(cw, R.backend.length) - bw), beforeStart: t < S.startDate,
    streak: streak(), backend: R.backend, ae: R.ae, line: S.lastLine,
    doneB: doneCount('b'), doneA: doneCount('a'), port: PORT,
    streaks: Object.fromEntries(['java', 'sd', 'ae', 'dsa'].map(c => [c, catStreak(e => catCount(e, c) > 0)])),
    backlog: backlog(), categories: CATS,
    version: VERSION, update: { status: upd.status, latest: upd.latest, notes: upd.notes, error: upd.error, checkedAt: upd.checkedAt }
  };
}

function afterChange(d) {
  const e = day(d), tl = tasksFor(d);
  e.total = tl.length;
  e.subs = e.subs || {};
  for (const t of tl) if (t.subs.length) e.done[t.id] = t.subs.every(x => e.subs[x.id]); // a task is done when all its subtasks are
  e.snap = slim(tl); // what was planned that day, for the backlog
  // how many subtasks each heatmap could get that day, so the colour can scale with the share done
  e.heatTotals = Object.fromEntries(['java', 'sd', 'ae', 'dsa'].map(c => [c, tl.filter(t => t.cat === c).reduce((a, t) => a + (t.subs.length || 1), 0)]));
  if (d === today() && dayScore(d) >= 1 && !e.fullCelebrated) {
    e.fullCelebrated = true;
    S.lastLine = pick(L.dayDone);
    save();
    overlay('confetti', S.lastLine);
  }
  save();
}
function setTask(d, id, v) {
  const e = day(d), t = tasksFor(d).find(x => x.id === id);
  e.subs = e.subs || {};
  e.done[id] = !!v;
  if (t) t.subs.forEach(s => { e.subs[s.id] = !!v; });
  afterChange(d);
}
function setSub(d, subId, v) {
  const e = day(d), pid = String(subId).split('.')[0], t = tasksFor(d).find(x => x.id === pid);
  if (!t || !t.subs.some(s => s.id === subId)) return false;
  e.subs = e.subs || {};
  e.subs[subId] = !!v;
  e.done[pid] = t.subs.every(s => e.subs[s.id]);
  afterChange(d);
  return true;
}
function setDsa(d, { count, add, problem }) {
  const e = day(d);
  e.dsaList = e.dsaList || [];
  if (str(problem, 120).trim()) { e.dsaList.push(str(problem, 120).trim()); if (add === undefined && count === undefined) add = 1; }
  if (typeof count === 'number' && count >= 0) e.dsa = Math.min(50, Math.floor(count));
  else e.dsa = Math.max(0, Math.min(50, (e.dsa || 0) + (Number(add) || 0)));
  if (d === today() && e.dsa >= 1 && !e.dsaCelebrated) { e.dsaCelebrated = true; save(); overlay('boost', e.dsa >= 2 ? 'Two DSA problems today. That\'s the habit.' : 'DSA done for today. One a day adds up to 365.'); }
  save();
}
function catStreak(fn) {
  let s = 0, d = today();
  if (!fn(S.days[d])) d = addDays(d, -1);
  while (d >= S.startDate && fn(S.days[d])) { s++; d = addDays(d, -1); }
  return s;
}
const CAT = { java: ['core', 'note', 'payflow', 'review', 'shorts'], sd: ['sd', 'mock'], ae: ['ae'] };
function catCount(e, c) {
  if (!e) return 0;
  const subs = Object.keys(e.subs || {}).filter(k => e.subs[k] && catOf(e, k.split('.')[0]) === c).length;
  const loose = Object.keys(e.done || {}).filter(k => e.done[k] && catOf(e, k) === c && !Object.keys(e.subs || {}).some(x => x.startsWith(k + '.'))).length;
  const credit = (e.blDone || []).filter(b => b.cat === c).length;
  return subs + loose + credit + (c === 'dsa' ? (e.dsa || 0) : 0);
}

// ---------- backlog: unfinished subtasks from the last 14 days since the start date ----------
function backlog() {
  const t = today(), out = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(t, -i);
    if (d < S.startDate) continue;
    const e = S.days[d] || {}, subs = e.subs || {}, bl = e.bl || {};
    for (const tk of (e.snap || slim(tasksFor(d)))) {
      const items = tk.subs.length ? tk.subs : [{ id: tk.id, label: tk.label }];
      for (const x of items) {
        const done = tk.subs.length ? subs[x.id] : (e.done || {})[tk.id];
        if (!done && !bl[x.id]) out.push({ date: d, task: tk.id, taskLabel: tk.label, cat: tk.cat || catOf(e, tk.id) || null, id: x.id, label: x.label });
      }
    }
  }
  return out;
}
function resolveBacklog(date, ids, action) {
  if (!isDate(date) || date >= today() || !['done', 'skip'].includes(action)) return false;
  const list = backlog().filter(b => b.date === date && (ids === '__all' || ids.includes(b.id)));
  if (!list.length) return false;
  const e = day(date), t = day(today());
  e.bl = e.bl || {};
  for (const b of list) {
    e.bl[b.id] = { [action]: true, on: today() };
    if (action === 'done') (t.blDone = t.blDone || []).push({ from: date, id: b.id, cat: b.cat });
  }
  save();
  if (action === 'done' && !backlog().length) overlay('boost', 'Backlog cleared. Nothing is hanging over you now.');
  return true;
}

// ---------- planning a day in the app ----------
const planDateOk = d => isDate(d) && d >= today() && diffDays(today(), d) <= 31;
function dayPlan(d) {
  const c = S.plans[d] || {}, hidden = Object.keys(c.hidden || {}).filter(k => c.hidden[k]);
  const base = baseTasksFor(d), names = {};
  base.forEach(t => { names[t.id] = t.label; t.subs.forEach(x => { names[x.id] = `${t.label}: ${x.label}`; }); });
  return { date: d, editable: planDateOk(d), tasks: tasksFor(d), hidden: hidden.map(id => ({ id, label: names[id] || id })), categories: CATS };
}
function planEdit(d, op) {
  if (!planDateOk(d) || !op || typeof op !== 'object') return { ok: false, error: 'You can plan today and up to 31 days ahead.' };
  const c = planOf(d), e = day(d), clean = v => str(v, 160).trim();
  if (op.addTask) {
    const a = op.addTask, label = clean(a.label), cat = CATS[a.category] ? a.category : null;
    if (!label || !cat) return { ok: false, error: 'A task needs a name and a category.' };
    if (c.tasks.length >= 20) return { ok: false, error: 'At most 20 added tasks a day.' };
    const id = 'c' + (++c.seq);
    const subs = (Array.isArray(a.subtasks) ? a.subtasks : String(a.subtasks || '').split('\n')).map(clean).filter(Boolean).slice(0, 20);
    c.tasks.push({ id, label, cat, min: Math.max(0, Math.min(600, Math.round(+a.minutes || 0))), note: clean(a.note), subs: subs.map((l, j) => ({ id: `${id}.${j}`, label: l })) });
    e.cats = e.cats || {}; e.cats[id] = cat;
  } else if (op.addSubtask) {
    const tid = String(op.addSubtask.task || ''), label = clean(op.addSubtask.label), t = tasksFor(d).find(x => x.id === tid);
    if (!t || !label) return { ok: false, error: 'Pick a task and type the subtask.' };
    const custom = c.tasks.find(x => x.id === tid);
    if (custom) { custom.seq = (custom.seq || custom.subs.length); custom.subs.push({ id: `${tid}.${custom.seq++}`, label }); }
    else { c.extra[tid] = c.extra[tid] || []; c.extra[tid].push({ id: `${tid}.x${++c.seq}`, label }); }
  } else if (op.remove) {
    const id = String(op.remove), tid = id.split('.')[0];
    const ci = c.tasks.findIndex(x => x.id === tid);
    if (ci >= 0 && id === tid) c.tasks.splice(ci, 1);
    else if (ci >= 0) c.tasks[ci].subs = c.tasks[ci].subs.filter(x => x.id !== id);
    else if (c.extra[tid] && c.extra[tid].some(x => x.id === id)) c.extra[tid] = c.extra[tid].filter(x => x.id !== id);
    else if (baseTasksFor(d).some(t => t.id === id || t.subs.some(x => x.id === id))) c.hidden[id] = true;
    else return { ok: false, error: 'Nothing with that id on this day.' };
  } else if (op.restore) {
    delete c.hidden[String(op.restore)];
  } else return { ok: false, error: 'Unknown change.' };
  afterChange(d);
  return { ok: true, plan: dayPlan(d) };
}

function doCheckin(p = {}) {
  const t = today();
  const d = isDate(p.date) ? p.date : addDays(t, -1);
  let verdict = null;
  if ((p.done || p.note || p.date || p.dsa !== undefined) && d >= S.startDate && d < t) {
    const e = day(d);
    if (p.done) {
      const ids = Array.isArray(p.done) ? p.done : Object.keys(p.done).filter(k => p.done[k]);
      e.done = {};
      e.subs = e.subs || {};
      for (const t of tasksFor(d)) {
        if (ids.includes(t.id)) { e.done[t.id] = true; t.subs.forEach(x => { e.subs[x.id] = true; }); }
        else if (t.subs.every(x => e.subs[x.id])) t.subs.forEach(x => { e.subs[x.id] = false; });
      }
    }
    if (str(p.note, 1000)) e.note = str(p.note, 1000);
    if (p.dsa !== undefined && p.dsa !== '' && !isNaN(+p.dsa)) e.dsa = Math.max(0, Math.min(50, Math.floor(+p.dsa)));
    e.total = tasksFor(d).length;
    e.reported = true;
    const sc = dayScore(d);
    verdict = sc >= 1 ? { kind: 'confetti', msg: pick(L.good) } : sc >= 0.5 ? { kind: 'boost', msg: pick(L.ok) } : { kind: 'scold', msg: pick(L.bad) };
  }
  S.lastCheckin = t;
  S.lastLine = verdict ? verdict.msg : pick(L.start);
  save();
  if (verdict) overlay(verdict.kind, verdict.msg);
  return { state: state(), verdict };
}

function setWeekItem(k, item, v) {
  if (!validWeek(k)) return false;
  const w = wk(k), items = wkItems(k);
  if (item === '__all') items.forEach(i => { w.items[i] = !!v; });
  else if (items.includes(item)) w.items[item] = !!v;
  else return false;
  const all = items.every(i => w.items[i]), was = w.done;
  w.done = all;
  if (all && !was) { w.doneAt = today(); save(); celebrateWeek(k); } else save();
  return true;
}
function celebrateWeek(k) {
  const n = +k.slice(1), isB = k[0] === 'b';
  const W = isB ? R.backend[n - 1] : R.ae[n - 1];
  const left = (isB ? R.backend.length : R.ae.length) - doneCount(k[0]);
  S.lastLine = `${isB ? 'Week' : 'AE week'} ${n} done: ${W.t}. ${left > 0 ? left + ' to go.' : 'Whole track complete!'}`;
  save();
  overlay('fireworks', S.lastLine);
}

// ---------- windows ----------
let win = null, tray = null, ov = null, quitting = false;
const ICON = path.join(__dirname, 'icon.png');

function showWin() {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 1120, height: 780, minWidth: 720, minHeight: 560, show: false, icon: ICON,
      backgroundColor: '#070f26', autoHideMenuBar: true, title: 'Daily Coach',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.loadFile(path.join(__dirname, 'index.html'));
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
  } else {
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    win.webContents.send('refresh');
  }
}
const refreshWin = () => { if (win && !win.isDestroyed()) win.webContents.send('refresh'); };

function overlay(kind, msg) {
  S.events.push({ at: new Date().toISOString(), kind, msg: str(msg) });
  if (S.events.length > 60) S.events = S.events.slice(-60);
  save();
  if (ov && !ov.isDestroyed()) ov.destroy();
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  ov = new BrowserWindow({
    x, y, width, height, transparent: true, frame: false, show: false, skipTaskbar: true, focusable: false,
    resizable: false, movable: false, hasShadow: false, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  ov.setAlwaysOnTop(true, 'screen-saver');
  ov.setIgnoreMouseEvents(true);
  ov.loadFile(path.join(__dirname, 'overlay.html'), { query: { kind, msg: str(msg) } });
  ov.once('ready-to-show', () => ov && !ov.isDestroyed() && ov.showInactive());
  const mine = ov;
  setTimeout(() => { if (!mine.isDestroyed()) mine.destroy(); }, kind === 'fireworks' ? 9500 : 7000);
  refreshWin();
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Daily Coach ' + VERSION);
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Daily Coach', click: showWin },
    { label: 'Test fireworks', click: () => overlay('fireworks', 'This is what finishing a week looks like.') },
    { label: 'Check for updates', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: !!S.autoStart, click: i => { S.autoStart = i.checked; save(); applyLogin(); } },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showWin);
}
function applyLogin() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!S.autoStart, path: process.execPath, args: ['--startup'], name: 'DailyCoach' });
}

// Morning prompt + 9 pm nudge
function tick() {
  const t = today(), h = new Date().getHours();
  if (S.lastCheckin !== t && h >= 5 && S.promptDate !== t) { S.promptDate = t; save(); showWin(); }
  if (h >= 21 && S.nudgeDate !== t && t >= S.startDate) {
    S.nudgeDate = t;
    const sc = dayScore(t);
    save();
    const noDsa = !(S.days[t] && S.days[t].dsa);
    if (sc >= 1 && noDsa) overlay('boost', 'All tasks done, but no DSA question yet. One problem before bed.');
    if (sc < 1) {
      const left = tasksFor(t).length - Object.values(day(t).done).filter(Boolean).length;
      overlay(sc < 0.5 ? 'scold' : 'boost', `${left} task${left === 1 ? '' : 's'} still open today${noDsa ? ', and no DSA question yet' : ''}. ${pick(sc < 0.5 ? L.nudgeHard : L.nudgeSoft)}`);
    }
  }
}

// ---------- local API for Claude Code ----------
function summary() {
  const s = state(), t = s.today;
  const B = R.backend[s.bw - 1], A = R.ae[s.aw - 1];
  const wkInfo = (k, W) => ({ key: k, title: W.t, done: !!(S.weeks[k] && S.weeks[k].done), items: wkItems(k).map(i => ({ id: i, done: !!(S.weeks[k] && S.weeks[k].items[i]) })) });
  return {
    today: t, streak: s.streak, calendarWeek: s.calendarWeek, behindByWeeks: s.behind,
    lastCheckin: S.lastCheckin, checkedInToday: !s.needsCheckin,
    todayTasks: s.todayTasks.map(x => ({ id: x.id, label: x.label, detail: x.detail, min: x.min, done: !!(S.days[t] && S.days[t].done[x.id]), subtasks: x.subs.map(y => ({ id: y.id, label: y.label, done: !!(S.days[t] && S.days[t].subs && S.days[t].subs[y.id]) })) })),
    backendWeek: { number: s.bw, limitQuestion: B.q, learn: B.l, build: B.b, systemDesign: B.sd, ...wkInfo('b' + s.bw, B) },
    aeWeek: { number: s.aw, make: A.make, ...wkInfo('a' + s.aw, A) },
    weeksDone: { backend: s.doneB, ae: s.doneA, backendTotal: R.backend.length, aeTotal: R.ae.length },
    dsa: { today: (S.days[t] && S.days[t].dsa) || 0, problemsToday: (S.days[t] && S.days[t].dsaList) || [], streak: catStreak(e => catCount(e, 'dsa') > 0) },
    categoryStreaks: s.streaks,
    startDate: S.startDate, backlog: s.backlog,
    last7: logDays(7), lastCoachLine: S.lastLine
  };
}
function logDays(n) {
  n = Math.max(1, Math.min(90, n || 7));
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today(), -i);
    if (d < S.startDate) break;
    const e = S.days[d];
    out.push({ date: d, score: Math.round(dayScore(d) * 100), subtasksDone: e && e.subs ? Object.values(e.subs).filter(Boolean).length : 0, dsa: (e && e.dsa) || 0, dsaProblems: (e && e.dsaList) || [], done: e ? Object.keys(e.done).filter(k => e.done[k]) : [], note: e ? e.note : '', reported: !!(e && e.reported) });
  }
  return out;
}

function startServer() {
  const srv = http.createServer((req, res) => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o, null, 1)); };
    // Block web pages: browsers always send Origin on cross-site requests.
    if (req.headers.origin) return send(403, { error: 'browser requests are not allowed' });
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET') {
      if (u.pathname === '/status') return send(200, summary());
      if (u.pathname === '/log') return send(200, logDays(+u.searchParams.get('days') || 7));
      if (u.pathname === '/backlog') return send(200, backlog());
      if (u.pathname === '/plan-day') { const d = u.searchParams.get('date') || today(); return isDate(d) ? send(200, dayPlan(d)) : send(400, { error: 'date must be YYYY-MM-DD' }); }
      if (u.pathname === '/') return send(200, { app: 'Daily Coach', endpoints: ['GET /status', 'GET /log?days=7', 'POST /celebrate', 'POST /boost', 'POST /scold', 'POST /message', 'POST /complete', 'POST /checkin', 'POST /week-item', 'POST /open', 'POST /update', 'POST /dsa', 'GET /backlog', 'POST /backlog', 'GET /plan-day?date=', 'POST /plan-day'], version: VERSION });
      return send(404, { error: 'not found' });
    }
    if (req.method !== 'POST') return send(405, { error: 'use GET or POST' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let j = {};
      try { j = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'invalid JSON' }); }
      for (const [k, v] of u.searchParams) if (j[k] === undefined) j[k] = v;
      const msg = str(j.message);
      switch (u.pathname) {
        case '/celebrate': overlay(j.style === 'confetti' ? 'confetti' : 'fireworks', msg || pick(L.praise)); break;
        case '/boost': overlay('boost', msg || pick(L.boost)); break;
        case '/scold': overlay('scold', msg || pick(L.scold)); break;
        case '/message': overlay('message', msg || 'Hello from Claude.'); break;
        case '/open': showWin(); break;
        case '/dsa': setDsa(isDate(j.date) ? j.date : today(), { count: j.count !== undefined ? +j.count : undefined, add: j.add, problem: j.problem }); break;
        case '/update': { checkForUpdates(false).then(u => send(200, { current: VERSION, ...u })); return; }
        case '/complete': {
          const d = isDate(j.date) ? j.date : today();
          const ids = Array.isArray(j.tasks) ? j.tasks.map(String) : String(j.tasks || j.task || '').split(',').map(x => x.trim()).filter(Boolean);
          const tl = tasksFor(d), valid = tl.flatMap(x => [x.id, ...x.subs.map(y => y.id)]);
          const bad = ids.filter(i => !valid.includes(i));
          if (!ids.length || bad.length) return send(400, { error: 'unknown task or subtask id', valid });
          const v = j.done !== false && j.done !== 'false';
          ids.forEach(i => (i.includes('.') ? setSub(d, i, v) : setTask(d, i, v)));
          break;
        }
        case '/backlog': {
          if (!resolveBacklog(String(j.date || ''), j.ids === '__all' || j.all ? '__all' : [].concat(j.ids || j.id || []).map(String), j.action === 'skip' ? 'skip' : 'done')) return send(400, { error: 'nothing in the backlog matches', backlog: backlog() });
          break;
        }
        case '/plan-day': {
          const r = planEdit(isDate(j.date) ? j.date : today(), j);
          if (!r.ok) return send(400, r);
          refreshWin(); return send(200, r);
        }
        case '/checkin': { const r = doCheckin({ date: j.date, done: j.done, note: j.note }); refreshWin(); return send(200, { ok: true, verdict: r.verdict }); }
        case '/week-item': {
          if (!setWeekItem(String(j.week || ''), String(j.item || ''), j.done !== false && j.done !== 'false')) return send(400, { error: 'unknown week or item (week like "b5" or "a3"; item like "l0", "b", "sd", "learn", "make" or "__all")' });
          break;
        }
        default: return send(404, { error: 'not found' });
      }
      refreshWin();
      send(200, { ok: true });
    });
  });
  srv.on('error', e => console.error('API server error', e.message));
  srv.listen(PORT, '127.0.0.1');
}


// ---------- auto-update from GitHub ----------
const UPDATE_BASE = process.env.DAILYCOACH_UPDATE_BASE || 'https://raw.githubusercontent.com/ENAMINE1/daily-coach/main/app/';
const VERSION = require('./package.json').version;
let upd = { status: 'idle', latest: null, notes: '', checkedAt: null, error: '' };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const SAFE = /^[A-Za-z0-9._-]+$/;
async function fetchBuf(url) {
  const r = await net.fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split('/').pop()}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > 3 * 1024 * 1024) throw new Error('file too large');
  return b;
}
function stagingDir() { return path.join(app.getPath('userData'), 'update-staging'); }

async function checkForUpdates(manual) {
  if (upd.status === 'checking' || upd.status === 'downloading') return upd;
  upd = { ...upd, status: 'checking', error: '' };
  try {
    const m = JSON.parse((await fetchBuf(UPDATE_BASE + 'manifest.json')).toString('utf8'));
    upd.checkedAt = new Date().toISOString();
    if (!m.version || !m.files || !newer(m.version, VERSION)) { upd.status = 'current'; upd.latest = m.version || VERSION; if (manual) overlay('message', `You're on the latest version (${VERSION}).`); return upd; }
    upd = { ...upd, status: 'downloading', latest: m.version, notes: str(m.notes, 400) };
    const dir = stagingDir();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, hash] of Object.entries(m.files)) {
      if (!SAFE.test(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('bad manifest entry ' + name);
      const local = path.join(__dirname, name);
      if (fs.existsSync(local) && sha(fs.readFileSync(local)) === hash) continue;
      const b = await fetchBuf(UPDATE_BASE + name);
      if (sha(b) !== hash) throw new Error('checksum mismatch for ' + name);
      fs.writeFileSync(path.join(dir, name), b);
    }
    fs.writeFileSync(path.join(dir, '.version'), m.version);
    upd.status = 'ready';
    refreshWin();
    // apply straight away if you're not looking at the window
    if (!win || win.isDestroyed() || !win.isVisible()) applyUpdate();
  } catch (e) {
    upd.status = 'error'; upd.error = e.message;
    if (manual) overlay('message', 'Update check failed: ' + e.message);
  }
  refreshWin();
  return upd;
}

function applyUpdate() {
  const dir = stagingDir();
  if (!fs.existsSync(path.join(dir, '.version'))) return false;
  const ver = fs.readFileSync(path.join(dir, '.version'), 'utf8').trim();
  const files = fs.readdirSync(dir).filter(f => f !== '.version' && SAFE.test(f));
  const backup = path.join(app.getPath('userData'), 'update-backup');
  fs.rmSync(backup, { recursive: true, force: true });
  fs.mkdirSync(backup, { recursive: true });
  const done = [];
  try {
    for (const f of files) {
      const target = path.join(__dirname, f);
      if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backup, f));
      fs.copyFileSync(path.join(dir, f), target);
      done.push(f);
    }
  } catch (e) {
    for (const f of done) { const b = path.join(backup, f); const t = path.join(__dirname, f); if (fs.existsSync(b)) fs.copyFileSync(b, t); else fs.rmSync(t, { force: true }); }
    upd.status = 'error'; upd.error = 'install failed, rolled back: ' + e.message;
    return false;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  S.justUpdated = { from: VERSION, to: ver, notes: upd.notes };
  save();
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--startup').concat(win && win.isVisible() ? [] : ['--startup']) });
  app.exit(0);
  return true;
}

// keep the Claude Code skill in sync with the app version
function syncSkill() {
  try {
    const src = path.join(__dirname, 'SKILL.md');
    if (!fs.existsSync(src)) return;
    const dir = path.join(os.homedir(), '.claude', 'skills', 'daily-coach');
    const dst = path.join(dir, 'SKILL.md');
    const b = fs.readFileSync(src);
    if (fs.existsSync(dst) && sha(fs.readFileSync(dst)) === sha(b)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dst, b);
  } catch (e) { console.error('skill sync failed', e.message); }
}

// ---------- IPC ----------
ipcMain.handle('state', () => state());
ipcMain.handle('toggleTask', (_, d, id, v) => { if (isDate(d) && typeof id === 'string') setTask(d, id, v); return state(); });
ipcMain.handle('toggleSub', (_, d, id, v) => { if (isDate(d) && typeof id === 'string') setSub(d, id, v); return state(); });
ipcMain.handle('dsa', (_, d, o) => { if (isDate(d)) setDsa(d, o || {}); return state(); });
ipcMain.handle('checkUpdate', () => checkForUpdates(true));
ipcMain.handle('applyUpdate', () => applyUpdate());
ipcMain.handle('checkin', (_, p) => doCheckin(p || {}));
ipcMain.handle('backlog', (_, d, ids, action) => { resolveBacklog(d, ids === '__all' ? '__all' : [].concat(ids || []).map(String), action); return state(); });
ipcMain.handle('dayPlan', (_, d) => (isDate(d) ? dayPlan(d) : null));
ipcMain.handle('planEdit', (_, d, op) => { const r = planEdit(d, op); refreshWin(); return r; });
ipcMain.handle('startFresh', (_, d) => { if (isDate(d) && diffDays(today(), d) <= 60 && diffDays(d, today()) <= 365) { startFresh(d); save(); } return state(); });
ipcMain.handle('weekItem', (_, k, item, v) => { setWeekItem(k, item, v); return state(); });
ipcMain.handle('settings', (_, s = {}) => {
  if (str(s.name, 40).trim()) S.name = str(s.name, 40).trim();
  if (isDate(s.startDate) && diffDays(today(), s.startDate) <= 60) S.startDate = s.startDate;
  if (typeof s.autoStart === 'boolean') { S.autoStart = s.autoStart; applyLogin(); }
  save();
  return state();
});
ipcMain.handle('test', (_, kind) => { overlay(['fireworks', 'confetti', 'boost', 'scold'].includes(kind) ? kind : 'fireworks', 'Preview: this is how it looks.'); });

// ---------- boot ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWin);
  app.setAppUserModelId('com.rahul.dailycoach');
  app.on('window-all-closed', () => { /* stay in tray */ });
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    load();
    applyLogin();
    buildTray();
    startServer();
    syncSkill();
    if (S.justUpdated) { const j = S.justUpdated; S.justUpdated = null; save(); setTimeout(() => overlay('confetti', `Updated to ${j.to}. ${j.notes || ''}`.trim()), 2500); }
    setTimeout(() => checkForUpdates(false), 20000);
    setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
    if (!STARTUP) showWin();
    tick();
    setInterval(tick, 5 * 60 * 1000);
    powerMonitor.on('resume', () => setTimeout(tick, 3000));
    powerMonitor.on('unlock-screen', () => setTimeout(tick, 1500));
  });
}
