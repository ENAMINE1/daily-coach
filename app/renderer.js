{
let st = null;
let theme = 'dark';
try { theme = localStorage.getItem('theme') || 'dark'; } catch {}
const applyTheme = () => { document.documentElement.dataset.theme = theme; const b = document.getElementById('themeBtn'); if (b) b.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme'; };
applyTheme();
const view = { tab: 'today', wk: {}, heat: 0 };
const ci = { open: false, step: 0, done: {}, note: '', habits: {}, verdict: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const dkey = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const prevToday = {};
const NAMED = {
  ocean:  { h: 217, dark: ['#0b2a5c', '#1f5fbf', '#4f9dff', '#b8dcff'], light: ['#cfe3ff', '#7fb2ff', '#2f6fe0', '#0b2f80'] },
  grape:  { h: 268, dark: ['#2a1352', '#5b2bb3', '#9a6bff', '#e2d2ff'], light: ['#e9e0ff', '#b79bff', '#7a45e6', '#2e0f6e'] },
  sunset: { h: 32,  dark: ['#4a2600', '#c26a00', '#ffa31a', '#fff176'], light: ['#fff3a3', '#ffd23f', '#fb8c00', '#1a1a1a'] },
  forest: { h: 137, dark: ['#0e4429', '#006d32', '#26a641', '#39d353'], light: ['#9be9a8', '#40c463', '#30a14e', '#216e39'] },
  rose:   { h: 340, dark: ['#4a0f24', '#a3194d', '#f0527f', '#ffc2d4'], light: ['#ffdbe6', '#ff8fb1', '#e0115f', '#6e0a2f'] },
  teal:   { h: 180, dark: ['#053b3b', '#0a7a78', '#19c2bd', '#a6f5ef'], light: ['#c9f4f1', '#6fdcd5', '#109c95', '#064a47'] }
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hueOf = c => { const [r, g, b] = hex(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round(((h * 60) + 360) % 360); };
const pal = m => Array.isArray(m.palette) ? m.palette : (NAMED[m.palette] || NAMED.forest)[theme === 'light' ? 'light' : 'dark'];
const hueFor = m => Array.isArray(m.palette) ? hueOf(m.palette[2]) : (NAMED[m.palette] || NAMED.forest).h;
function heatColor(m, r) {
  const P = pal(m), x = Math.max(0, Math.min(1, r)) * 3, i = Math.min(2, Math.floor(x)), t = x - i, a = hex(P[i]), b = hex(P[i + 1]);
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
}
function streakStats(m) {
  const end = new Date(); end.setHours(0, 0, 0, 0);
  let best = 0, run = 0, runStart = null, bestStart = null, bestEnd = null;
  for (let i = 364; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); const k = dkey(d);
    if ((m.counts[k] || 0) > 0) { if (!run) runStart = k; run++; if (run > best) { best = run; bestStart = runStart; bestEnd = k; } } else run = 0; }
  return { best, bestStart, bestEnd };
}

async function refresh() {
  st = await coach.state();
  if (st.needsCheckin && !ci.open) {
    ci.open = true; ci.step = st.needsReport ? 0 : 1; ci.verdict = null; ci.note = '';
    const y = st.days[st.yesterday] || {}; ci.done = { ...(y.done || {}) }; ci.habits = { ...(y.habits || {}) };
  }
  if (view.heat >= st.heatmaps.length) view.heat = 0;
  render();
}

function header() {
  const first = st.tracks[0], wg = st.weeklyGoals;
  $('#top').innerHTML = `
  <div><h1>${greet()}, ${esc(st.name)}</h1>
  <p>${esc(st.plan.title)} · ${first ? `calendar week ${Math.min(st.calendarWeek, first.total)} of ${first.total}` : `week of ${fmt(wg.start)}`}</p></div>
  <div class="stats">
    <div class="stat fire"><b>${st.streak}</b><span>day streak</span></div>
    ${st.tracks.slice(0, 3).map(t => `<div class="stat"><b>${t.done}/${t.total}</b><span>${esc(t.name)}</span></div>`).join('')}
    ${wg.items.length ? `<div class="stat"><b>${wg.items.filter(i => i.done).length}/${wg.items.length}</b><span>weekly goals</span></div>` : ''}
    ${!first ? `<div class="stat"><b>${st.weekOverview.reduce((a, d) => a + d.done, 0)}/${st.weekOverview.reduce((a, d) => a + d.total, 0)}</b><span>tasks this week</span></div>` : ''}
  </div>
  ${st.update && st.update.status === 'ready' ? `<div class="upd"><span><b>Update ${esc(st.update.latest)} is ready.</b> ${esc(st.update.notes)}</span><button class="btn primary small" id="updGo">Restart to update</button></div>` : ''}
  ${st.plan.errors.length ? `<div class="warn">${esc(st.plan.errors[0])} See History &amp; settings → Your plan.</div>` : ''}
  ${st.behind > 0 ? `<div class="warn">You're ${plural(st.behind, 'week')} behind the calendar on ${esc(first.name)}. Finish week ${first.current} before you start anything new.</div>` : ''}`;
}

// ---------- today ----------
function taskBlock(date, t, e) {
  const subs = e.subs || {}, n = t.subs.filter(x => subs[x.id]).length, done = !!(e.done || {})[t.id];
  return `<div class="tblock ${done ? 'done' : ''}">
  <label class="task head"><input type="checkbox" class="tt" data-date="${date}" data-id="${esc(t.id)}" ${done ? 'checked' : ''}>
  <div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${t.subs.length ? `${n}/${t.subs.length} · ` : ''}${t.min ? t.min + ' min' : ''}</div></label>
  ${t.subs.length ? `<div class="subs">${t.subs.map(x => `<label class="sub ${subs[x.id] ? 'done' : ''}"><input type="checkbox" class="st" data-date="${date}" data-id="${esc(x.id)}" ${subs[x.id] ? 'checked' : ''}><span>${esc(x.label)}</span></label>`).join('')}</div>` : ''}</div>`;
}
function habitCard(h) {
  const e = st.days[st.today] || {}, n = (e.habits || {})[h.id] || 0, list = (e.habitLog || {})[h.id] || [];
  const hint = n === 0 ? `${plural(h.target, h.unit)} keeps the streak alive.` : n < h.target ? `${h.target - n} more to hit today's target.` : n < h.great ? 'Target hit. One more makes it a great day.' : 'Great day. Keep it going tomorrow.';
  return `<section class="card"><h2>${esc(h.name)} today <span class="pill ${h.streak ? 'done' : ''}">${h.streak}-day streak</span></h2>
    <div class="dsa"><button class="btn" data-habit="${esc(h.id)}" data-add="-1" aria-label="One fewer" ${n ? '' : 'disabled'}>−</button><b class="dn ${n >= h.target ? 'ok' : ''}">${n}</b><button class="btn primary" data-habit="${esc(h.id)}" data-add="1">+1 ${esc(h.unit)}</button></div>
    <p class="k">${hint}</p>
    ${h.logItems ? `<div class="dadd"><input type="text" class="hname" data-habit="${esc(h.id)}" placeholder="${esc(h.itemPlaceholder || 'What did you do?')}" maxlength="120"><button class="btn small" data-hlog="${esc(h.id)}">Log it</button></div>` : ''}
    ${list.length ? `<ul class="dlist">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </section>`;
}
function today() {
  const e = st.days[st.today] || { done: {}, subs: {} };
  const tasks = st.todayTasks, n = tasks.filter(t => (e.done || {})[t.id]).length;
  const sn = tasks.reduce((a, t) => a + t.subs.filter(x => (e.subs || {})[x.id]).length, 0), stot = tasks.reduce((a, t) => a + t.subs.length, 0);
  const mins = tasks.reduce((a, t) => a + t.min, 0);
  const lq = st.tracks.map(t => t.weeks[t.current - 1].limitQuestion).find(Boolean);
  return `${st.heatmaps.length ? `<section class="inline-heat">${book()}</section>` : ''}<div class="tgrid">
  <section class="card"><h2>Today · ${fmt(st.today)}</h2>
    ${tasks.length ? `<div class="k">${n} of ${plural(tasks.length, 'task')}${stot ? ` · ${sn} of ${stot} subtasks` : ''}${mins ? ` · ${mins} minutes planned` : ''}</div><div class="bar"><i style="width:${(stot ? sn / stot : tasks.length ? n / tasks.length : 0) * 100}%"></i></div>
    ${tasks.map(t => taskBlock(st.today, t, e)).join('')}` : '<p class="k">Rest day. Nothing planned today.</p>'}
  </section>
  <div class="col">${st.habits.map(habitCard).join('')}
  <section class="card"><h2>Coach says</h2>
    <p class="line">${esc(st.line || 'Show up today. That is the whole trick.')}</p>
    ${lq ? `<div class="k">This week's key question</div><div class="q">${esc(lq)}</div><div class="k">Answer it out loud before the week ends. If you can't, the week isn't done.</div>` : ''}
  </section></div></div>`;
}

// ---------- heatmap book ----------
const ANIMS = [['page', 'Page turn'], ['slide', 'Slide'], ['flip', 'Calendar flip']];
let anim = null, heatLock = false, wheelAcc = 0;
const getAnim = () => { if (anim) return anim; try { anim = localStorage.getItem('heatAnim'); } catch {} return anim || (st && st.plan.animation) || 'page'; };
function graph(m) {
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 364); start.setDate(start.getDate() - start.getDay());
  const cells = [], months = []; let total = 0, active = 0, col = 0, lastM = -1;
  const unit = m.habit ? ((st.habits.find(h => h.id === m.habit) || {}).unit || 'time') : 'subtask';
  for (const d = new Date(start); d <= end || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) { if (d.getMonth() !== lastM && d.getDate() <= 7) { months.push([col + 1, d.toLocaleDateString(undefined, { month: 'short' })]); lastM = d.getMonth(); } col++; }
    if (d > end) { cells.push('<i class="g-x"></i>'); continue; }
    const k = dkey(d), c = m.counts[k] || 0; total += c; if (c) active++;
    const tot = m.habit ? m.full : (m.totals[k] || m.levels[3]), r = c ? Math.min(1, c / tot) : 0, isToday = k === st.today;
    const bump = isToday && prevToday[m.id] !== undefined && c > prevToday[m.id];
    if (isToday) prevToday[m.id] = c;
    const tip = !c ? 'nothing' : m.habit ? plural(c, unit) : `${c} of ${tot} subtasks (${Math.round(r * 100)}%)`;
    const shade = c ? heatColor(m, r) : '';
    cells.push(c ? `<i class="gc${r >= 1 ? ' gfull' : ''}${isToday ? ' g-today' : ''}${bump ? ' bump' : ''}" style="background:${shade};color:${shade}" title="${tip} on ${fmt(k)}"></i>`
                 : `<i class="g0${isToday ? ' g-today' : ''}" title="${tip} on ${fmt(k)}"></i>`);
  }
  const ss = streakStats(m);
  return `<section class="card wide gcard" style="--h:${hueFor(m)}"><div class="ghead"><h2>${esc(m.name)}</h2><span class="gdot" style="background:${pal(m)[2]}"></span></div>
  <div class="gscroll"><div class="gwrap" style="--cols:${col}">
    <div class="gmonths">${months.map(([c, mo]) => `<span style="grid-column:${c}">${mo}</span>`).join('')}</div>
    <div class="gdays"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
    <div class="ggrid">${cells.join('')}</div></div></div>
  <div class="glegend">Less <i class="g0"></i>${pal(m).map(c => `<i style="background:${c}"></i>`).join('')} More</div>
  <div class="gstats">
    <div><span>Total in the last year</span><b>${plural(total, unit)}</b><small>${plural(active, 'active day')}</small></div>
    <div><span>Longest streak</span><b>${plural(ss.best, 'day')}</b><small>${ss.best ? `${fmt(ss.bestStart)} – ${fmt(ss.bestEnd)}` : 'not started yet'}</small></div>
    <div><span>Current streak</span><b>${plural(m.streak, 'day')}</b><small>${m.streak ? 'keep it alive today' : 'start one today'}</small></div></div></section>`;
}
function book() {
  const i = view.heat, H = st.heatmaps, a = getAnim();
  return `<div class="hbar">
    <div class="hpills" role="tablist">${H.map((m, j) => `<button role="tab" aria-selected="${j === i}" class="hpill ${j === i ? 'on' : ''}" style="--h:${hueFor(m)}" data-heat="${j}">${esc(m.name)}<b>${m.streak}</b></button>`).join('')}</div>
    ${H.length > 1 ? `<div class="hanim"><span class="k" style="margin:0">Animation</span>${ANIMS.map(([k, n]) => `<button class="btn small ${a === k ? 'sel' : ''}" data-anim="${k}">${n}</button>`).join('')}</div>` : ''}
  </div>
  <div class="book ${H.length > 1 ? '' : 'single'}">
    <div class="stage" id="stage" data-anim="${a}" tabindex="0" aria-label="Heatmaps. Scroll or use arrow keys to turn pages">${H.map((m, j) => `<div class="page ${j === i ? 'on' : ''}" data-p="${j}">${graph(m)}</div>`).join('')}</div>
  </div>
  <div class="hfoot">${H.length > 1 ? `<div class="dots">${H.map((m, j) => `<button class="dot ${j === i ? 'on' : ''}" style="--h:${hueFor(m)}" data-heat="${j}" aria-label="${esc(m.name)}"></button>`).join('')}</div>` : '<span></span>'}
  <div class="glegend" style="margin:0">${H.length > 1 ? 'Scroll, swipe or press ← → to turn pages · ' : ''}each subtask brightens today's square</div></div>`;
}
function turnTo(n) {
  const len = st.heatmaps.length, cur = view.heat;
  n = ((n % len) + len) % len;
  if (n === cur || heatLock) return;
  const fwd = (n > cur && !(cur === 0 && n === len - 1)) || (cur === len - 1 && n === 0);
  view.heat = n;
  document.querySelectorAll('.hpill,.dot').forEach(b => { const on = +b.dataset.heat === n; b.classList.toggle('on', on); if (b.classList.contains('hpill')) b.setAttribute('aria-selected', on); });
  const stage = document.getElementById('stage'); if (!stage) return;
  const out = stage.querySelector(`.page[data-p="${cur}"]`), inn = stage.querySelector(`.page[data-p="${n}"]`);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { out.className = 'page'; inn.className = 'page on'; return; }
  heatLock = true;
  const dir = fwd ? 'next' : 'prev';
  out.className = `page out-${dir}`; inn.className = `page on in-${dir}`;
  setTimeout(() => { out.className = 'page'; inn.className = 'page on'; heatLock = false; }, 720);
}

// ---------- weeks / journey ----------
function weekCard(t) {
  const n = view.wk[t.id] || t.current, W = t.weeks[n - 1], key = `${t.id}#${n}`, w = st.weeks[key] || { items: {}, done: false };
  const cnt = W.items.filter(i => w.items[i.id]).length;
  return `<section class="card">
  <div class="wnav"><button data-wnav="${esc(t.id)}" data-d="-1" ${n <= 1 ? 'disabled' : ''} aria-label="Previous week">‹</button>
  <h2 style="margin:0;flex:1">${esc(t.name)} · week ${n}</h2>
  ${w.done ? '<span class="pill done">Done</span>' : n === t.current ? '<span class="pill now">Current</span>' : ''}
  <button data-wnav="${esc(t.id)}" data-d="1" ${n >= t.total ? 'disabled' : ''} aria-label="Next week">›</button></div>
  <h3>${esc(W.title)}</h3>${W.goal ? `<p class="k" style="margin-top:4px">${esc(W.goal)}</p>` : ''}
  <div class="bar"><i style="width:${cnt / W.items.length * 100}%"></i></div>
  ${W.limitQuestion ? `<div class="q" style="margin-bottom:12px"><b>Key question:</b> ${esc(W.limitQuestion)}</div>` : ''}
  ${W.items.map(i => `<label class="task ${w.items[i.id] ? 'done' : ''}"><input type="checkbox" class="wi" data-track="${esc(t.id)}" data-n="${n}" data-item="${i.id}" ${w.items[i.id] ? 'checked' : ''}><div><div class="d" style="color:var(--ink)">${esc(i.label)}</div></div></label>`).join('')}
  <div class="actions"><button class="btn small" data-wall="${esc(t.id)}" data-n="${n}" data-v="${w.done ? 0 : 1}">${w.done ? 'Reopen week' : 'Mark whole week done'}</button></div>
  </section>`;
}
function goalsCard() {
  const g = st.weeklyGoals; if (!g.items.length) return '';
  const n = g.items.filter(i => i.done).length;
  return `<section class="card"><h2>This week's goals ${g.done ? '<span class="pill done">Done</span>' : ''}</h2>
  <p class="k" style="margin-top:0">Week of ${fmt(g.start)} · resets every week</p>
  <div class="bar"><i style="width:${n / g.items.length * 100}%"></i></div>
  ${g.items.map(i => `<label class="task ${i.done ? 'done' : ''}"><input type="checkbox" class="wg" data-item="${i.id}" ${i.done ? 'checked' : ''}><div><div class="d" style="color:var(--ink)">${esc(i.label)}</div></div></label>`).join('')}</section>`;
}
function overviewCard() {
  const days = st.weekOverview; if (!days.some(d => d.total)) return '';
  return `<section class="card"><h2>Your week at a glance</h2>${days.map(d => `<div class="ovr ${d.date === st.today ? 'now' : ''}"><b>${fmt(d.date)}</b>
    <div class="bar" style="margin:0"><i style="width:${d.total ? d.done / d.total * 100 : 0}%"></i></div><span>${d.total ? `${d.done}/${d.total}` : 'rest'}</span></div>`).join('')}</section>`;
}
function journey() {
  return st.tracks.map(t => `<h2>${esc(t.name)}</h2><div class="tiles">${t.weeks.map((W, i) => {
    const d = st.weeks[`${t.id}#${i + 1}`] && st.weeks[`${t.id}#${i + 1}`].done;
    return `<button class="tile ${d ? 'done' : i + 1 === t.current ? 'now' : ''}" data-jump="${esc(t.id)}" data-n="${i + 1}"><small>Week ${i + 1}${d ? ' · done' : ''}</small>${esc(W.title)}</button>`;
  }).join('')}</div>`).join('');
}

// ---------- history & settings ----------
function history() {
  const logs = Object.keys(st.days).sort().reverse().slice(0, 30).map(d => {
    const e = st.days[d], n = Object.values(e.done || {}).filter(Boolean).length, subs = Object.values(e.subs || {}).filter(Boolean).length;
    const hab = st.habits.map(h => (e.habits || {})[h.id] ? `${(e.habits || {})[h.id]} ${esc(h.name)}` : '').filter(Boolean).join(' · ');
    return `<div class="log"><b>${fmt(d)}</b> · ${n}/${e.total || '?'} tasks · ${subs} subtasks${hab ? ' · ' + hab : ''}${e.reported ? '' : ' · not reported'}${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`;
  }).join('') || '<p class="k">No days logged yet.</p>';
  const p = st.plan;
  return `<div class="grid">
  <section class="card"><h2>Your plan</h2>
    <p style="margin:0"><b>${esc(p.title)}</b> <span class="pill ${p.source === 'custom' ? 'now' : ''}">${p.source === 'custom' ? 'Custom plan' : 'Default plan'}</span></p>
    ${p.description ? `<p class="k">${esc(p.description)}</p>` : ''}
    ${p.errors.length ? `<div class="errs"><b>Problems</b><ul>${p.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${p.warnings.length ? `<div class="k">Warnings</div><ul class="dlist">${p.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="k">Load a plan file (.json, .yaml or .yml)</div>
    <p class="d" style="color:var(--mute);margin:0 0 8px">Ask Claude or another AI to write one using GUIDELINE.md from the Daily Coach GitHub repo. Your progress stays. Weeks are matched by track id and week number.</p>
    <div class="actions" style="justify-content:flex-start"><label class="btn primary small filebtn">Choose plan file<input type="file" id="planFile" accept=".json,.yaml,.yml,application/json,text/yaml"></label>${p.source === 'custom' ? '<button class="btn small" id="planReset">Go back to the default plan</button>' : ''}</div>
    <div id="planMsg"></div>
  </section>
  <section class="card"><h2>Settings</h2>
    <label class="f"><span>Your name</span><input type="text" id="sName" value="${esc(st.name)}"></label>
    <label class="f"><span>Plan start date (sets the calendar week)</span><input type="date" id="sStart" value="${st.startDate}"></label>
    <label class="task"><input type="checkbox" id="sAuto" ${st.autoStart ? 'checked' : ''}><div><div class="t">Start with my computer</div><div class="d">Opens your morning check-in when you log in</div></div></label>
    <div class="actions"><button class="btn primary" id="sSave">Save settings</button></div>
    <div class="k">Preview the overlays</div>
    <div class="actions" style="justify-content:flex-start">${['fireworks', 'confetti', 'boost', 'scold'].map(k => `<button class="btn small" data-test="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div class="k">Version</div>
    <p style="margin:0 0 8px">Daily Coach ${esc(st.version)} · ${st.update.status === 'current' ? 'up to date' : st.update.status === 'ready' ? 'update ' + esc(st.update.latest) + ' ready' : st.update.status === 'error' ? 'last check failed: ' + esc(st.update.error) : esc(st.update.status)}</p>
    <button class="btn small" id="updCheck">Check for updates</button>
    <div class="k">Claude Code connection</div>
    <p class="d" style="color:var(--mute);margin:0">Local API at <code>http://127.0.0.1:${st.port}</code>. Say "check on me" in Claude Code and the daily-coach skill handles it.</p>
  </section>
  <section class="card"><h2>Daily reports</h2>${logs}</section></div>`;
}

// ---------- check-in modal ----------
function modal() {
  const m = $('#modal');
  if (!ci.open) { m.hidden = true; m.innerHTML = ''; return; }
  m.hidden = false;
  if (ci.step === 0) {
    const away = st.daysAway > 1 ? `<div class="verdict scold">${st.daysAway} days without a check-in. That's ${st.daysAway} days the plan didn't move. Today it does.</div>` : '';
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="ciT">
      <h1 id="ciT">${greet()}, ${esc(st.name)}</h1>
      <p class="sub">Report on yesterday, ${fmt(st.yesterday)}. Be honest: tick only what you actually finished.</p>${away}
      ${st.yesterdayTasks.map(t => `<label class="task ${ci.done[t.id] ? 'done' : ''}"><input type="checkbox" class="ci" data-id="${esc(t.id)}" ${ci.done[t.id] ? 'checked' : ''}><div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${t.min ? t.min + ' min' : ''}</div></label>`).join('')}
      ${st.habits.map(h => `<label class="f"><span>${esc(h.checkinQuestion || `${h.name}: how many ${h.unit}s yesterday?`)}</span><input type="number" class="cih" data-habit="${esc(h.id)}" min="0" max="999" value="${esc(ci.habits[h.id] ?? 0)}" style="max-width:120px"></label>`).join('')}
      <label class="f"><span>What did you actually learn or do? One line is enough.</span><textarea id="ciNote">${esc(ci.note)}</textarea></label>
      <div class="actions"><button class="btn primary" id="ciSubmit">Submit report</button></div></div>`;
  } else {
    const v = ci.verdict;
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="ciT">
      <h1 id="ciT">Today's plan</h1>
      ${v ? `<div class="verdict ${v.kind}">${esc(v.msg)}</div>` : '<p class="sub">Here is what today looks like.</p>'}
      ${st.todayTasks.map(t => `<div class="task"><div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${t.subs.length ? t.subs.length + ' steps · ' : ''}${t.min ? t.min + ' min' : ''}</div></div>`).join('') || '<p class="k">Rest day. Nothing planned.</p>'}
      ${st.habits.length ? `<p class="k">Plus your daily habits: ${st.habits.map(h => `${esc(h.name)} (${plural(h.target, h.unit)})`).join(', ')}</p>` : ''}
      <div class="actions"><button class="btn primary" id="ciGo">Let's go</button></div></div>`;
  }
}

function render() {
  if (!st) return;
  header();
  if (view.tab === 'journey' && !st.tracks.length) view.tab = 'today';
  document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === view.tab); if (b.dataset.tab === 'journey') b.hidden = !st.tracks.length; });
  const v = $('#view');
  if (view.tab === 'today') v.innerHTML = today();
  else if (view.tab === 'week') v.innerHTML = `<div class="grid">${goalsCard()}${overviewCard()}${st.tracks.map(weekCard).join('')}</div>`;
  else if (view.tab === 'journey') v.innerHTML = journey();
  else v.innerHTML = history();
  modal();
}

// ---------- events ----------
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.classList.contains('tt')) { st = await coach.toggleTask(t.dataset.date, t.dataset.id, t.checked); render(); }
  else if (t.classList.contains('st')) { st = await coach.toggleSub(t.dataset.date, t.dataset.id, t.checked); render(); }
  else if (t.classList.contains('wg')) { st = await coach.weekGoal(t.dataset.item, t.checked); render(); }
  else if (t.classList.contains('wi')) { st = await coach.weekItem(t.dataset.track, +t.dataset.n, t.dataset.item, t.checked); render(); }
  else if (t.classList.contains('ci')) { ci.done[t.dataset.id] = t.checked; t.closest('.task').classList.toggle('done', t.checked); }
  else if (t.id === 'planFile' && t.files[0]) {
    const f = t.files[0];
    if (f.size > 5e6) { $('#planMsg').innerHTML = '<div class="errs">That file is over 5 MB. A plan should be much smaller.</div>'; return; }
    const r = await coach.importPlan(await f.text());
    if (r.ok) { await refresh(); $('#planMsg') && ($('#planMsg').innerHTML = `<div class="okmsg">Loaded "${esc(r.title)}".${r.warnings && r.warnings.length ? ` ${plural(r.warnings.length, 'warning')} listed above.` : ''}</div>`); }
    else $('#planMsg').innerHTML = `<div class="errs"><b>That plan wasn't loaded. Fix these and try again:</b><ul>${r.errors.slice(0, 25).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${r.errors.length > 25 ? `<p>…and ${r.errors.length - 25} more.</p>` : ''}</div>`;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'ciNote') ci.note = e.target.value;
  if (e.target.classList.contains('cih')) ci.habits[e.target.dataset.habit] = e.target.value;
});
document.addEventListener('wheel', e => {
  const sg = e.target.closest && e.target.closest('.stage'); if (!sg || !st || st.heatmaps.length < 2) return;
  const vert = Math.abs(e.deltaY) >= Math.abs(e.deltaX), d = vert ? e.deltaY : e.deltaX, h = view.heat;
  if (vert && ((d > 0 && h === st.heatmaps.length - 1) || (d < 0 && h === 0)) && !heatLock) { wheelAcc = 0; return; }
  e.preventDefault(); if (heatLock) { wheelAcc = 0; return; }
  wheelAcc += d; if (Math.abs(wheelAcc) > 60) { turnTo(view.heat + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; }
}, { passive: false });
let touchX = null;
document.addEventListener('touchstart', e => { if (e.target.closest('.stage')) touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 50) turnTo(view.heat + (dx < 0 ? 1 : -1)); });
document.addEventListener('keydown', e => {
  if (view.tab === 'today' && !ci.open && !e.target.closest('input,textarea') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); turnTo(view.heat + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  if (e.target.classList.contains('hname') && e.key === 'Enter') document.querySelector(`[data-hlog="${e.target.dataset.habit}"]`).click();
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'themeBtn') { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('theme', theme); } catch {} applyTheme(); render(); return; }
  if (b.dataset.tab) { view.tab = b.dataset.tab; render(); }
  else if (b.dataset.heat !== undefined) turnTo(+b.dataset.heat);
  else if (b.dataset.turn) turnTo(view.heat + +b.dataset.turn);
  else if (b.dataset.anim) { anim = b.dataset.anim; try { localStorage.setItem('heatAnim', anim); } catch {} const sg = $('#stage'); if (sg) sg.dataset.anim = anim; document.querySelectorAll('.btn[data-anim]').forEach(x => x.classList.toggle('sel', x.dataset.anim === anim)); turnTo(view.heat + 1); }
  else if (b.dataset.wnav) { const t = st.tracks.find(x => x.id === b.dataset.wnav); view.wk[t.id] = Math.max(1, Math.min(t.total, (view.wk[t.id] || t.current) + +b.dataset.d)); render(); }
  else if (b.dataset.jump) { view.wk[b.dataset.jump] = +b.dataset.n; view.tab = 'week'; render(); }
  else if (b.dataset.wall) { st = await coach.weekItem(b.dataset.wall, +b.dataset.n, '__all', b.dataset.v === '1'); render(); }
  else if (b.dataset.habit) { st = await coach.habit(st.today, b.dataset.habit, { add: +b.dataset.add }); render(); }
  else if (b.dataset.hlog) { const inp = document.querySelector(`.hname[data-habit="${b.dataset.hlog}"]`), v = inp.value.trim(); if (v) { st = await coach.habit(st.today, b.dataset.hlog, { item: v }); render(); } }
  else if (b.dataset.test) coach.test(b.dataset.test);
  else if (b.id === 'ciSubmit') { const r = await coach.checkin({ date: st.yesterday, done: ci.done, note: ci.note, habits: ci.habits }); st = r.state; ci.verdict = r.verdict; ci.step = 1; render(); }
  else if (b.id === 'ciGo') { if (st.needsCheckin) { const r = await coach.checkin({}); st = r.state; } ci.open = false; render(); }
  else if (b.id === 'planReset') { await coach.resetPlan(); refresh(); }
  else if (b.id === 'updCheck') { b.disabled = true; b.textContent = 'Checking...'; await coach.checkUpdate(); refresh(); }
  else if (b.id === 'updGo') coach.applyUpdate();
  else if (b.id === 'sSave') { st = await coach.settings({ name: $('#sName').value, startDate: $('#sStart').value, autoStart: $('#sAuto').checked }); render(); }
});

coach.onRefresh(refresh);
refresh();
}
