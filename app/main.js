const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, powerMonitor, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { parsePlanText, validatePlan, normalizePlan, DAYS, dayList } = require('./plan');

const PORT = 47820;
const STARTUP = process.argv.includes('--startup');

// ---------- helpers ----------
const z = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const today = () => ds(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ds(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const isDate = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s);
const pick = a => (a && a.length ? a[Math.floor(Math.random() * a.length)] : '');
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const fill = (tpl, ctx) => String(tpl == null ? '' : tpl).replace(/\{([\w.]+)\}/g, (m, k) => {
  const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), ctx);
  return v == null ? m : String(v);
});
const hm = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// ---------- plan ----------
let P = null, planInfo = { source: 'default', errors: [], warnings: [] };
const userPlanPath = () => path.join(app.getPath('userData'), 'plan.json');
function loadPlan() {
  const def = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.default.json'), 'utf8'));
  planInfo = { source: 'default', errors: [], warnings: [] };
  let chosen = def;
  if (fs.existsSync(userPlanPath())) {
    try {
      const p = JSON.parse(fs.readFileSync(userPlanPath(), 'utf8'));
      const v = validatePlan(p);
      if (v.errors.length) planInfo = { source: 'default', errors: ['Your plan file has problems, so the default plan is in use.', ...v.errors], warnings: v.warnings };
      else { chosen = p; planInfo = { source: 'custom', errors: [], warnings: v.warnings }; }
    } catch (e) { planInfo = { source: 'default', errors: ['Could not read your plan file: ' + e.message], warnings: [] }; }
  }
  P = normalizePlan(chosen);
}
function installPlan(text) {
  let p;
  try { p = parsePlanText(text); } catch (e) { return { ok: false, errors: ['Could not parse the file: ' + e.message] }; }
  const v = validatePlan(p);
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };
  fs.writeFileSync(userPlanPath(), JSON.stringify(p, null, 1));
  loadPlan();
  if (P.meta.startDate && isDate(P.meta.startDate)) { S.startDate = P.meta.startDate; }
  migrate(); save(); refreshWin();
  return { ok: true, warnings: v.warnings, title: P.meta.title };
}
function resetPlan() { try { fs.rmSync(userPlanPath(), { force: true }); } catch {} loadPlan(); migrate(); save(); refreshWin(); return { ok: true }; }
const msg = k => fill(pick(P.coach.messages[k]), { name: P.meta.owner });

// ---------- store ----------
let S, storePath;
function load() {
  storePath = path.join(app.getPath('userData'), 'coach.json');
  let old = null;
  try { old = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch { old = null; }
  S = Object.assign({ name: null, startDate: today(), autoStart: true, days: {}, weeks: {}, lastCheckin: null, promptDate: null, nudgeDate: today(), lastLine: '', events: [] }, old || {});
}
function save() {
  const t = storePath + '.tmp';
  fs.writeFileSync(t, JSON.stringify(S, null, 1));
  fs.renameSync(t, storePath);
}
// Older versions stored weeks as "b5" with items l0/b/sd, and DSA as day.dsa. Copy them into the new shape.
function migrate() {
  for (const t of P.tracks) {
    t.weeks.forEach((w, i) => {
      const oldKey = t.id + (i + 1), key = wkey(t, i + 1);
      if (/^[a-z]$/.test(t.id) && S.weeks[oldKey] && !S.weeks[key]) {
        const o = S.weeks[oldKey], items = {};
        const legacy = Object.keys(o.items || {});
        const order = legacy.some(k => /^l\d+$/.test(k)) || legacy.includes('b') ? [...legacy.filter(k => /^l\d+$/.test(k)).sort((a, b) => a.slice(1) - b.slice(1)), 'b', 'sd'] : ['learn', 'make'];
        order.forEach((k, j) => { if (o.items && o.items[k]) items['i' + j] = true; });
        S.weeks[key] = { items, done: !!o.done, doneAt: o.doneAt };
      }
    });
  }
  for (const e of Object.values(S.days)) {
    if (e.dsa !== undefined && !(e.habits && e.habits.dsa !== undefined)) { e.habits = Object.assign({}, e.habits, { dsa: e.dsa }); }
    if (e.dsaList && !(e.habitLog && e.habitLog.dsa)) { e.habitLog = Object.assign({}, e.habitLog, { dsa: e.dsaList }); }
  }
}
const name = () => S.name || P.meta.owner;

// ---------- plan logic ----------
const wkey = (t, n) => `${t.id}#${n}`;
const trackById = id => P.tracks.find(t => t.id === id);
const weekItems = (t, n) => { const w = t.weeks[n - 1]; return (w.checklist && w.checklist.length ? w.checklist : ['Week complete']).map((label, i) => ({ id: 'i' + i, label })); };
function currentWeek(t) { for (let i = 1; i <= t.weeks.length; i++) if (!(S.weeks[wkey(t, i)] && S.weeks[wkey(t, i)].done)) return i; return t.weeks.length; }
const doneCount = t => t.weeks.filter((_, i) => S.weeks[wkey(t, i + 1)] && S.weeks[wkey(t, i + 1)].done).length;
const calendarWeek = () => Math.max(1, Math.floor(diffDays(S.startDate, today()) / 7) + 1);
const weekOrder = () => { const s = DAYS.indexOf(P.meta.weekStartsOn === 'sun' ? 'sun' : 'mon'); return [...DAYS.slice(s), ...DAYS.slice(0, s)]; };

function tasksFor(date) {
  const wd = DAYS[parse(date).getDay()];
  const order = weekOrder();
  return [...dayList(P.rhythm, wd), ...(P.dates[date] || [])].map(task => {
    const t = task.track ? trackById(task.track) : null;
    const n = t ? currentWeek(t) : 0;
    const W = t ? t.weeks[n - 1] : {};
    let occ = 0;
    for (const d of order) { if (d === wd) break; if (dayList(P.rhythm, d).some(x => x.id === task.id)) occ++; }
    const ctx = { week: Object.assign({}, W, { number: n }), track: t ? { name: t.name, id: t.id } : {}, name: name() };
    let subs = W && W.days && W.days[task.id] && W.days[task.id][occ];
    if (!subs) subs = task.subtasks || (W && W.days && W.days[task.id] && W.days[task.id][W.days[task.id].length - 1]) || [];
    return {
      id: task.id, label: fill(task.label, ctx), detail: fill(task.detail || '', ctx), min: task.minutes || 0, track: task.track || null,
      subs: subs.map((label, j) => ({ id: `${task.id}.${j}`, label: fill(label, ctx) }))
    };
  });
}
const day = d => S.days[d] || (S.days[d] = { done: {}, subs: {}, note: '', reported: false });
function dayScore(d) {
  const e = S.days[d]; if (!e) return 0;
  const t = e.total || tasksFor(d).length;
  const n = Object.values(e.done || {}).filter(Boolean).length;
  return t ? Math.min(1, n / t) : 0;
}
function streak() {
  let s = 0, d = today();
  if (dayScore(d) < 0.5) d = addDays(d, -1);
  while (d >= S.startDate && dayScore(d) >= 0.5) { s++; d = addDays(d, -1); }
  return s;
}
const habitById = id => P.habits.find(h => h.id === id);
const habitCount = (e, id) => (e && e.habits && e.habits[id]) || 0;
function habitStreak(h) {
  let s = 0, d = today();
  if (habitCount(S.days[d], h.id) < h.target) d = addDays(d, -1);
  while (habitCount(S.days[d], h.id) >= h.target) { s++; d = addDays(d, -1); }
  return s;
}
function heatCount(e, m) {
  if (!e) return 0;
  if (m.habit) return habitCount(e, m.habit);
  const subs = e.subs || {}, keys = Object.keys(subs);
  if (keys.length) return keys.filter(k => subs[k] && m.tasks.includes(k.split('.')[0])).length;
  return Object.keys(e.done || {}).filter(k => e.done[k] && m.tasks.includes(k)).length * 2;
}
function heatStreak(m) {
  let s = 0, d = today();
  if (!heatCount(S.days[d], m)) d = addDays(d, -1);
  while (heatCount(S.days[d], m) > 0) { s++; d = addDays(d, -1); }
  return s;
}

// weekly goals repeat every calendar week, keyed by the week's first day
function weekStart(date) { const d = parse(date), s = P.meta.weekStartsOn === 'sun' ? 0 : 1; d.setDate(d.getDate() - ((d.getDay() - s + 7) % 7)); return ds(d); }
function weeklyGoals() {
  const k = weekStart(today()), g = (S.weekGoals || {})[k] || { items: {}, done: false };
  return { start: k, done: !!g.done, items: P.weeklyGoals.map((label, i) => ({ id: 'g' + i, label, done: !!g.items['g' + i] })) };
}
function setWeekGoal(item, v) {
  if (!P.weeklyGoals.length) return false;
  S.weekGoals = S.weekGoals || {};
  const k = weekStart(today()), g = S.weekGoals[k] || (S.weekGoals[k] = { items: {}, done: false }), ids = P.weeklyGoals.map((_, i) => 'g' + i);
  if (item === '__all') ids.forEach(i => { g.items[i] = !!v; }); else if (ids.includes(item)) g.items[item] = !!v; else return false;
  const all = ids.every(i => g.items[i]), was = g.done; g.done = all;
  if (all && !was) { S.lastLine = `All of this week's goals done. ${msg('praise')}`; save(); celebrate(P.coach.celebrations.weekComplete, S.lastLine); } else save();
  return true;
}
function weekOverview() {
  const k = weekStart(today());
  return Array.from({ length: 7 }, (_, i) => { const d = addDays(k, i), t = tasksFor(d), e = S.days[d] || {};
    return { date: d, total: t.length, done: t.filter(x => e.done && e.done[x.id]).length, labels: t.map(x => x.label) }; });
}

function state() {
  const t = today(), y = addDays(t, -1), cw = calendarWeek(), first = P.tracks[0] || null;
  return {
    name: name(), startDate: S.startDate, autoStart: S.autoStart, today: t, yesterday: y,
    needsCheckin: S.lastCheckin !== t,
    needsReport: y >= S.startDate && !(S.days[y] && S.days[y].reported),
    daysAway: S.lastCheckin ? diffDays(S.lastCheckin, t) : 0,
    todayTasks: tasksFor(t), yesterdayTasks: tasksFor(y), days: S.days, weeks: S.weeks,
    tracks: P.tracks.map(tr => ({ id: tr.id, name: tr.name, color: tr.color || null, total: tr.weeks.length, current: currentWeek(tr), done: doneCount(tr),
      weeks: tr.weeks.map((w, i) => ({ title: w.title, limitQuestion: w.limitQuestion || '', goal: w.goal || '', items: weekItems(tr, i + 1) })) })),
    calendarWeek: cw, behind: first ? Math.max(0, Math.min(cw, first.weeks.length) - currentWeek(first)) : 0,
    weeklyGoals: weeklyGoals(), weekOverview: weekOverview(), shape: P.tracks.length ? 'program' : P.weeklyGoals.length ? 'weekly' : 'routine',
    streak: streak(), line: S.lastLine,
    habits: P.habits.map(h => ({ ...h, streak: habitStreak(h) })),
    heatmaps: P.heatmaps.map(m => ({ ...m, streak: heatStreak(m), counts: Object.fromEntries(Object.keys(S.days).map(k => [k, heatCount(S.days[k], m)])) })),
    plan: { title: P.meta.title, description: P.meta.description || '', source: planInfo.source, errors: planInfo.errors, warnings: planInfo.warnings, animation: P.ui.heatmapAnimation },
    port: PORT, version: VERSION, update: { status: upd.status, latest: upd.latest, notes: upd.notes, error: upd.error, checkedAt: upd.checkedAt }
  };
}

function celebrate(kind, text) { if (kind && kind !== 'none') overlay(kind, text); }
function afterChange(d) {
  const e = day(d);
  e.total = tasksFor(d).length;
  if (d === today() && e.total && dayScore(d) >= 1 && !e.fullCelebrated) {
    e.fullCelebrated = true; S.lastLine = msg('dayDone'); save();
    celebrate(P.coach.celebrations.dayComplete, S.lastLine);
  }
  save();
}
function setTask(d, id, v) {
  const e = day(d), t = tasksFor(d).find(x => x.id === id);
  if (!t) return false;
  e.subs = e.subs || {}; e.done[id] = !!v;
  t.subs.forEach(s => { e.subs[s.id] = !!v; });
  afterChange(d); return true;
}
function setSub(d, subId, v) {
  const e = day(d), pid = String(subId).split('.')[0], t = tasksFor(d).find(x => x.id === pid);
  if (!t || !t.subs.some(s => s.id === subId)) return false;
  e.subs = e.subs || {}; e.subs[subId] = !!v;
  e.done[pid] = t.subs.length ? t.subs.every(s => e.subs[s.id]) : !!v;
  afterChange(d); return true;
}
function setHabit(d, id, { count, add, item }) {
  const h = habitById(id); if (!h) return false;
  const e = day(d);
  e.habits = e.habits || {}; e.habitLog = e.habitLog || {};
  if (str(item, 120).trim()) { (e.habitLog[id] = e.habitLog[id] || []).push(str(item, 120).trim()); if (add === undefined && count === undefined) add = 1; }
  const before = e.habits[id] || 0;
  if (typeof count === 'number' && Number.isFinite(count) && count >= 0) e.habits[id] = Math.min(999, Math.floor(count));
  else e.habits[id] = Math.max(0, Math.min(999, before + (Number(add) || 0)));
  if (id === 'dsa') e.dsa = e.habits[id]; // keep older readers working
  const now = e.habits[id];
  e.habitCelebrated = e.habitCelebrated || {};
  if (d === today() && now >= h.target && !e.habitCelebrated[id]) { e.habitCelebrated[id] = 1; save(); celebrate(P.coach.celebrations.habitTarget, (h.messages && h.messages.target) || `${h.name}: target hit for today.`); }
  else if (d === today() && now >= h.great && e.habitCelebrated[id] === 1) { e.habitCelebrated[id] = 2; save(); celebrate(P.coach.celebrations.habitTarget, (h.messages && h.messages.great) || `${h.name}: great day.`); }
  save(); return true;
}

function doCheckin(p = {}) {
  const t = today();
  const d = isDate(p.date) ? p.date : addDays(t, -1);
  let verdict = null;
  if ((p.done || p.note || p.date || p.habits) && d >= S.startDate && d < t) {
    const e = day(d);
    if (p.done) {
      const ids = Array.isArray(p.done) ? p.done : Object.keys(p.done).filter(k => p.done[k]);
      e.done = {}; e.subs = e.subs || {};
      for (const tk of tasksFor(d)) {
        if (ids.includes(tk.id)) { e.done[tk.id] = true; tk.subs.forEach(x => { e.subs[x.id] = true; }); }
        else if (tk.subs.length && tk.subs.every(x => e.subs[x.id])) tk.subs.forEach(x => { e.subs[x.id] = false; });
      }
    }
    if (p.habits && typeof p.habits === 'object') for (const [k, v] of Object.entries(p.habits)) if (habitById(k) && v !== '' && !isNaN(+v)) { e.habits = e.habits || {}; e.habits[k] = Math.max(0, Math.min(999, Math.floor(+v))); if (k === 'dsa') e.dsa = e.habits[k]; }
    if (str(p.note, 1000)) e.note = str(p.note, 1000);
    e.total = tasksFor(d).length; e.reported = true;
    const sc = dayScore(d);
    verdict = sc >= 1 ? { kind: 'confetti', msg: msg('good') } : sc >= 0.5 ? { kind: 'boost', msg: msg('ok') } : { kind: 'scold', msg: msg('bad') };
  }
  S.lastCheckin = t; S.lastLine = verdict ? verdict.msg : msg('start');
  save();
  if (verdict) overlay(verdict.kind, verdict.msg);
  return { state: state(), verdict };
}

function setWeekItem(trackId, n, item, v) {
  const t = trackById(trackId); n = +n;
  if (!t || !(n >= 1 && n <= t.weeks.length)) return false;
  const key = wkey(t, n), w = S.weeks[key] || (S.weeks[key] = { items: {}, done: false }), items = weekItems(t, n).map(x => x.id);
  if (item === '__all') items.forEach(i => { w.items[i] = !!v; });
  else if (items.includes(item)) w.items[item] = !!v;
  else return false;
  const all = items.every(i => w.items[i]), was = w.done;
  w.done = all;
  if (all && !was) {
    w.doneAt = today();
    const left = t.weeks.length - doneCount(t);
    S.lastLine = `${t.name} week ${n} done: ${t.weeks[n - 1].title}. ${left > 0 ? left + ' to go.' : 'Whole track complete!'}`;
    save(); celebrate(P.coach.celebrations.weekComplete, S.lastLine);
  } else save();
  return true;
}
const parseWeekRef = (ref, track, week) => {
  if (track) return [track, week];
  const s = String(ref || '');
  let m = s.match(/^([a-z][a-z0-9_-]*)#(\d+)$/); if (m) return [m[1], +m[2]];
  m = s.match(/^([a-z])(\d+)$/); if (m) return [m[1], +m[2]];
  return [null, 0];
};

// ---------- windows ----------
let win = null, tray = null, ov = null, quitting = false;
const ICON = path.join(__dirname, 'icon.png');
function showWin() {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 1160, height: 820, minWidth: 720, minHeight: 560, show: false, icon: ICON,
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
    win.show(); win.focus(); win.webContents.send('refresh');
  }
}
const refreshWin = () => { if (win && !win.isDestroyed()) win.webContents.send('refresh'); };
function overlay(kind, text) {
  S.events.push({ at: new Date().toISOString(), kind, msg: str(text) });
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
  ov.loadFile(path.join(__dirname, 'overlay.html'), { query: { kind, msg: str(text), name: name() } });
  ov.once('ready-to-show', () => ov && !ov.isDestroyed() && ov.showInactive());
  const mine = ov;
  setTimeout(() => { if (!mine.isDestroyed()) mine.destroy(); }, kind === 'fireworks' ? 9500 : 7000);
  refreshWin();
}
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Daily Coach ' + VERSION);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Daily Coach', click: showWin },
    { label: 'Test fireworks', click: () => overlay('fireworks', 'This is what finishing a week looks like.') },
    { label: 'Check for updates', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Start with computer', type: 'checkbox', checked: !!S.autoStart, click: i => { S.autoStart = i.checked; save(); applyLogin(); } },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
}
function applyLogin() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!S.autoStart, path: process.execPath, args: ['--startup'], name: 'DailyCoach' });
}
function tick() {
  const t = today(), now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const from = hm(P.schedule.checkinFrom), nudge = hm(P.schedule.nudgeAt);
  if (from !== null && S.lastCheckin !== t && mins >= from && S.promptDate !== t) { S.promptDate = t; save(); showWin(); }
  if (nudge !== null && mins >= nudge && S.nudgeDate !== t && t >= S.startDate) {
    S.nudgeDate = t; save();
    const sc = dayScore(t), tasks = tasksFor(t);
    const lagging = P.habits.filter(h => h.nudge !== false && habitCount(S.days[t], h.id) < h.target).map(h => h.name);
    const left = tasks.length - Object.values(day(t).done).filter(Boolean).length;
    if (tasks.length && sc < 1) overlay(sc < 0.5 ? 'scold' : 'boost', `${left} task${left === 1 ? '' : 's'} still open today${lagging.length ? `, and nothing logged for ${lagging.join(', ')}` : ''}. ${msg(sc < 0.5 ? 'nudgeHard' : 'nudgeSoft')}`);
    else if (lagging.length) overlay('boost', `All tasks done, but nothing logged for ${lagging.join(', ')} yet.`);
  }
}

// ---------- local API (Claude Code) ----------
function summary() {
  const s = state(), t = s.today, e = S.days[t] || {};
  return {
    plan: s.plan.title, today: t, streak: s.streak, calendarWeek: s.calendarWeek, behindByWeeks: s.behind,
    lastCheckin: S.lastCheckin, checkedInToday: !s.needsCheckin,
    todayTasks: s.todayTasks.map(x => ({ id: x.id, label: x.label, detail: x.detail, min: x.min, done: !!(e.done && e.done[x.id]),
      subtasks: x.subs.map(y => ({ id: y.id, label: y.label, done: !!(e.subs && e.subs[y.id]) })) })),
    tracks: P.tracks.map(tr => { const n = currentWeek(tr), w = tr.weeks[n - 1], st = S.weeks[wkey(tr, n)] || { items: {} };
      return { id: tr.id, name: tr.name, week: n, of: tr.weeks.length, weeksDone: doneCount(tr), ref: wkey(tr, n), title: w.title, limitQuestion: w.limitQuestion || null,
        checklist: weekItems(tr, n).map(i => ({ id: i.id, label: i.label, done: !!st.items[i.id] })) }; }),
    weeklyGoals: weeklyGoals(),
    habits: P.habits.map(h => ({ id: h.id, name: h.name, unit: h.unit, target: h.target, today: habitCount(e, h.id), items: (e.habitLog && e.habitLog[h.id]) || [], streak: habitStreak(h) })),
    heatmapStreaks: Object.fromEntries(P.heatmaps.map(m => [m.id, heatStreak(m)])),
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
    out.push({ date: d, score: Math.round(dayScore(d) * 100), done: e ? Object.keys(e.done || {}).filter(k => e.done[k]) : [],
      subtasksDone: e && e.subs ? Object.values(e.subs).filter(Boolean).length : 0, habits: (e && e.habits) || {}, note: e ? e.note : '', reported: !!(e && e.reported) });
  }
  return out;
}
function startServer() {
  const srv = http.createServer((req, res) => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o, null, 1)); };
    if (req.headers.origin) return send(403, { error: 'browser requests are not allowed' });
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET') {
      if (u.pathname === '/status') return send(200, summary());
      if (u.pathname === '/log') return send(200, logDays(+u.searchParams.get('days') || 7));
      if (u.pathname === '/plan') return send(200, { title: P.meta.title, source: planInfo.source, errors: planInfo.errors, warnings: planInfo.warnings, plan: P });
      if (u.pathname === '/') return send(200, { app: 'Daily Coach', version: VERSION, endpoints: ['GET /status', 'GET /log?days=7', 'GET /plan', 'POST /plan', 'POST /plan/reset', 'POST /celebrate', 'POST /boost', 'POST /scold', 'POST /message', 'POST /complete', 'POST /checkin', 'POST /week-item', 'POST /week-goal', 'POST /habit', 'POST /open', 'POST /update'] });
      return send(404, { error: 'not found' });
    }
    if (req.method !== 'POST') return send(405, { error: 'use GET or POST' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      if (u.pathname === '/plan') { const r = installPlan(body); return send(r.ok ? 200 : 400, r); }
      if (u.pathname === '/plan/reset') return send(200, resetPlan());
      let j = {};
      try { j = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'invalid JSON' }); }
      for (const [k, v] of u.searchParams) if (j[k] === undefined) j[k] = v;
      const m = str(j.message);
      const yes = j.done !== false && j.done !== 'false';
      switch (u.pathname) {
        case '/celebrate': overlay(j.style === 'confetti' ? 'confetti' : 'fireworks', m || msg('praise')); break;
        case '/boost': overlay('boost', m || msg('boost')); break;
        case '/scold': overlay('scold', m || msg('scold')); break;
        case '/message': overlay('message', m || 'Hello from Claude.'); break;
        case '/open': showWin(); break;
        case '/update': checkForUpdates(false).then(x => send(200, { current: VERSION, ...x })); return;
        case '/complete': {
          const d = isDate(j.date) ? j.date : today();
          const ids = Array.isArray(j.tasks) ? j.tasks.map(String) : String(j.tasks || j.task || '').split(',').map(x => x.trim()).filter(Boolean);
          const valid = tasksFor(d).flatMap(x => [x.id, ...x.subs.map(y => y.id)]);
          const bad = ids.filter(i => !valid.includes(i));
          if (!ids.length || bad.length) return send(400, { error: 'unknown task or subtask id', valid });
          ids.forEach(i => (i.includes('.') ? setSub(d, i, yes) : setTask(d, i, yes)));
          break;
        }
        case '/checkin': { const r = doCheckin({ date: j.date, done: j.done, note: j.note, habits: j.habits }); refreshWin(); return send(200, { ok: true, verdict: r.verdict }); }
        case '/week-item': {
          const [tid, n] = parseWeekRef(j.week, j.track, j.weekNumber);
          if (!setWeekItem(tid, n, String(j.item || ''), yes)) return send(400, { error: 'unknown week or item. Use {"week":"<track>#<n>","item":"i0"} or item "__all"' });
          break;
        }
        case '/week-goal': if (!setWeekGoal(String(j.item || ''), yes)) return send(400, { error: 'unknown goal; use item "g0", "g1"... or "__all"' }); break;
        case '/habit': case '/dsa': {
          const id = u.pathname === '/dsa' ? 'dsa' : String(j.id || '');
          if (!setHabit(isDate(j.date) ? j.date : today(), id, { count: j.count !== undefined ? +j.count : undefined, add: j.add, item: j.item || j.problem })) return send(400, { error: 'unknown habit', habits: P.habits.map(h => h.id) });
          break;
        }
        default: return send(404, { error: 'not found' });
      }
      refreshWin(); send(200, { ok: true });
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
  if (b.length > 8 * 1024 * 1024) throw new Error('file too large');
  return b;
}
const stagingDir = () => path.join(app.getPath('userData'), 'update-staging');
async function checkForUpdates(manual) {
  if (upd.status === 'checking' || upd.status === 'downloading') return upd;
  upd = { ...upd, status: 'checking', error: '' };
  try {
    const m = JSON.parse((await fetchBuf(UPDATE_BASE + 'manifest.json')).toString('utf8'));
    upd.checkedAt = new Date().toISOString();
    if (!m.version || !m.files || !newer(m.version, VERSION)) { upd.status = 'current'; upd.latest = m.version || VERSION; if (manual) overlay('message', `You're on the latest version (${VERSION}).`); return upd; }
    upd = { ...upd, status: 'downloading', latest: m.version, notes: str(m.notes, 400) };
    const dir = stagingDir();
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    for (const [f, hash] of Object.entries(m.files)) {
      if (!SAFE.test(f) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('bad manifest entry ' + f);
      const local = path.join(__dirname, f);
      if (fs.existsSync(local) && sha(fs.readFileSync(local)) === hash) continue;
      const b = await fetchBuf(UPDATE_BASE + f);
      if (sha(b) !== hash) throw new Error('checksum mismatch for ' + f);
      fs.writeFileSync(path.join(dir, f), b);
    }
    fs.writeFileSync(path.join(dir, '.version'), m.version);
    upd.status = 'ready'; refreshWin();
    if (!win || win.isDestroyed() || !win.isVisible()) applyUpdate();
  } catch (e) { upd.status = 'error'; upd.error = e.message; if (manual) overlay('message', 'Update check failed: ' + e.message); }
  refreshWin(); return upd;
}
function applyUpdate() {
  const dir = stagingDir();
  if (!fs.existsSync(path.join(dir, '.version'))) return false;
  const ver = fs.readFileSync(path.join(dir, '.version'), 'utf8').trim();
  const files = fs.readdirSync(dir).filter(f => f !== '.version' && SAFE.test(f));
  const backup = path.join(app.getPath('userData'), 'update-backup');
  fs.rmSync(backup, { recursive: true, force: true }); fs.mkdirSync(backup, { recursive: true });
  const done = [];
  try {
    for (const f of files) {
      const target = path.join(__dirname, f);
      if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backup, f));
      fs.copyFileSync(path.join(dir, f), target); done.push(f);
    }
  } catch (e) {
    for (const f of done) { const b = path.join(backup, f), t = path.join(__dirname, f); if (fs.existsSync(b)) fs.copyFileSync(b, t); else fs.rmSync(t, { force: true }); }
    upd.status = 'error'; upd.error = 'install failed, rolled back: ' + e.message; return false;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  S.justUpdated = { from: VERSION, to: ver, notes: upd.notes }; save();
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--startup').concat(win && win.isVisible() ? [] : ['--startup']) });
  app.exit(0); return true;
}
function syncSkill() {
  try {
    const src = path.join(__dirname, 'SKILL.md'); if (!fs.existsSync(src)) return;
    const dir = path.join(os.homedir(), '.claude', 'skills', 'daily-coach'), dst = path.join(dir, 'SKILL.md'), b = fs.readFileSync(src);
    if (fs.existsSync(dst) && sha(fs.readFileSync(dst)) === sha(b)) return;
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(dst, b);
  } catch (e) { console.error('skill sync failed', e.message); }
}

// ---------- IPC ----------
ipcMain.handle('state', () => state());
ipcMain.handle('toggleTask', (_, d, id, v) => { if (isDate(d) && typeof id === 'string') setTask(d, id, v); return state(); });
ipcMain.handle('toggleSub', (_, d, id, v) => { if (isDate(d) && typeof id === 'string') setSub(d, id, v); return state(); });
ipcMain.handle('habit', (_, d, id, o) => { if (isDate(d)) setHabit(d, String(id), o || {}); return state(); });
ipcMain.handle('weekItem', (_, tid, n, item, v) => { setWeekItem(tid, n, item, v); return state(); });
ipcMain.handle('weekGoal', (_, item, v) => { setWeekGoal(String(item), v); return state(); });
ipcMain.handle('checkin', (_, p) => doCheckin(p || {}));
ipcMain.handle('importPlan', (_, text) => installPlan(String(text || '')));
ipcMain.handle('resetPlan', () => resetPlan());
ipcMain.handle('checkUpdate', () => checkForUpdates(true));
ipcMain.handle('applyUpdate', () => applyUpdate());
ipcMain.handle('settings', (_, s = {}) => {
  if (str(s.name, 40).trim()) S.name = str(s.name, 40).trim();
  if (isDate(s.startDate) && s.startDate <= today()) S.startDate = s.startDate;
  if (typeof s.autoStart === 'boolean') { S.autoStart = s.autoStart; applyLogin(); }
  save(); return state();
});
ipcMain.handle('test', (_, kind) => { overlay(['fireworks', 'confetti', 'boost', 'scold'].includes(kind) ? kind : 'fireworks', 'Preview: this is how it looks.'); });

// ---------- boot ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWin);
  app.setAppUserModelId('com.dailycoach.app');
  app.on('window-all-closed', () => { /* stay in tray */ });
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    load(); loadPlan(); migrate(); save();
    applyLogin(); buildTray(); startServer(); syncSkill();
    if (S.justUpdated) { const j = S.justUpdated; S.justUpdated = null; save(); setTimeout(() => overlay('confetti', `Updated to ${j.to}. ${j.notes || ''}`.trim()), 2500); }
    if (!STARTUP) showWin();
    tick();
    setInterval(tick, 5 * 60 * 1000);
    setTimeout(() => checkForUpdates(false), 20000);
    setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
    powerMonitor.on('resume', () => setTimeout(tick, 3000));
    powerMonitor.on('unlock-screen', () => setTimeout(tick, 1500));
  });
}
