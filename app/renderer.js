{
let st = null;
const view = { tab: 'today', b: null, a: null };
const ci = { open: false, step: 0, done: {}, note: '', verdict: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

async function refresh() {
  st = await coach.state();
  if (st.needsCheckin && !ci.open) {
    ci.open = true; ci.step = st.needsReport ? 0 : 1; ci.verdict = null; ci.note = ''; ci.dsa = undefined;
    const y = st.days[st.yesterday]; ci.done = y ? { ...y.done } : {};
  }
  render();
}

function header() {
  const pctB = Math.round(st.doneB / st.backend.length * 100);
  $('#top').innerHTML = `
  <div><h1>${greet()}, ${esc(st.name)}</h1>
  <p>Calendar week ${Math.min(st.calendarWeek, 26)} of 26 · you're on backend week ${st.bw} and AE week ${st.aw} · ${pctB}% of backend done</p></div>
  <div class="stats">
    <div class="stat fire"><b>${st.streak}</b><span>day streak</span></div>
    <div class="stat"><b>${st.doneB}/${st.backend.length}</b><span>backend weeks</span></div>
    <div class="stat"><b>${st.doneA}/${st.ae.length}</b><span>AE weeks</span></div>
  </div>
  ${st.update && st.update.status === 'ready' ? `<div class="upd"><span><b>Update ${esc(st.update.latest)} is ready.</b> ${esc(st.update.notes)}</span><button class="btn primary small" id="updGo">Restart to update</button></div>` : ''}
  ${st.behind > 0 ? `<div class="warn">You're ${st.behind} week${st.behind > 1 ? 's' : ''} behind the calendar. Finish week ${st.bw} before you start anything new.</div>` : ''}`;
}

function taskRow(date, t, done, cls = 'tt') {
  return `<label class="task ${done ? 'done' : ''}"><input type="checkbox" class="${cls}" data-date="${date}" data-id="${esc(t.id)}" ${done ? 'checked' : ''}>
  <div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${t.min} min</div></label>`;
}

function subTask(date, t, e) {
  const subs = e.subs || {}, n = t.subs.filter(x => subs[x.id]).length, done = !!e.done[t.id];
  return `<div class="tblock ${done ? 'done' : ''}">
  <label class="task head"><input type="checkbox" class="tt" data-date="${date}" data-id="${esc(t.id)}" ${done ? 'checked' : ''}>
  <div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${n}/${t.subs.length} · ${t.min} min</div></label>
  <div class="subs">${t.subs.map(x => `<label class="sub ${subs[x.id] ? 'done' : ''}"><input type="checkbox" class="st" data-date="${date}" data-id="${esc(x.id)}" ${subs[x.id] ? 'checked' : ''}><span>${esc(x.label)}</span></label>`).join('')}</div></div>`;
}

const CAT = { java: ['core', 'note', 'payflow', 'review', 'shorts'], sd: ['sd', 'mock'], ae: ['ae'] };
const CATS = [
  { id: 'java', name: 'Java & backend', unit: 'subtask', lv: c => c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 8 ? 3 : 4 },
  { id: 'sd', name: 'System design', unit: 'subtask', lv: c => Math.min(4, c === 0 ? 0 : c + 1) },
  { id: 'ae', name: 'After Effects', unit: 'subtask', lv: c => Math.min(4, c === 0 ? 0 : c + 1) },
  { id: 'dsa', name: 'DSA', unit: 'problem', lv: c => Math.min(4, c === 0 ? 0 : c + 1) }];
const catCount = (e, c) => {
  if (!e) return 0;
  if (c === 'dsa') return e.dsa || 0;
  const subs = e.subs || {}, keys = Object.keys(subs);
  if (keys.length) return keys.filter(k => subs[k] && CAT[c].includes(k.split('.')[0])).length;
  return Object.keys(e.done || {}).filter(k => e.done[k] && CAT[c].includes(k)).length * 2;
};
const contrib = e => ['java', 'sd', 'ae'].reduce((a, c) => a + catCount(e, c), 0);
const dkey = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

function graph(cat) {
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 364); start.setDate(start.getDate() - start.getDay());
  const cells = [], months = []; let total = 0, active = 0, col = 0, lastM = -1;
  for (const d = new Date(start); d <= end || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) { if (d.getMonth() !== lastM && d.getDate() <= 7) { months.push([col + 1, d.toLocaleDateString(undefined, { month: 'short' })]); lastM = d.getMonth(); } col++; }
    if (d > end) { cells.push('<i class="g-x"></i>'); continue; }
    const k = dkey(d), c = catCount(st.days[k], cat.id); total += c; if (c) active++;
    cells.push(`<i class="g${cat.lv(c)}${k === st.today ? ' g-today' : ''}" title="${c} ${cat.unit}${c === 1 ? '' : 's'} on ${fmt(k)}"></i>`);
  }
  return `<section class="card wide gcard"><div class="ghead"><h2>${cat.name}</h2><span class="k" style="margin:0">${total} ${cat.unit}${total === 1 ? '' : 's'} in the last year · ${active} active days · <b class="gs">${st.streaks[cat.id]}-day streak</b></span></div>
  <div class="gscroll"><div class="gwrap" style="--cols:${col}">
    <div class="gmonths">${months.map(([c, m]) => `<span style="grid-column:${c}">${m}</span>`).join('')}</div>
    <div class="gdays"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
    <div class="ggrid">${cells.join('')}</div></div></div></section>`;
}
const ANIMS = [['page', 'Page turn'], ['slide', 'Slide'], ['flip', 'Calendar flip']];
let anim = 'page';
try { anim = localStorage.getItem('heatAnim') || 'page'; } catch {}
let heatLock = false, wheelAcc = 0;
function streaks() {
  const i = view.heat || 0;
  return `<div class="hbar">
    <div class="hpills" role="tablist">${CATS.map((c, j) => `<button role="tab" aria-selected="${j === i}" class="hpill ${j === i ? 'on' : ''}" data-heat="${j}">${c.name}<b>${st.streaks[c.id]}</b></button>`).join('')}</div>
    <div class="hanim"><span class="k" style="margin:0">Animation</span>${ANIMS.map(([k, n]) => `<button class="btn small ${anim === k ? 'sel' : ''}" data-anim="${k}">${n}</button>`).join('')}</div>
  </div>
  <div class="book">
    <button class="turn prev" data-turn="-1" aria-label="Previous heatmap">‹</button>
    <div class="stage" id="stage" data-anim="${anim}" tabindex="0" aria-label="Heatmaps. Scroll or use arrow keys to turn pages">${CATS.map((c, j) => `<div class="page ${j === i ? 'on' : ''}" data-p="${j}">${graph(c)}</div>`).join('')}</div>
    <button class="turn next" data-turn="1" aria-label="Next heatmap">›</button>
  </div>
  <div class="hfoot"><div class="dots">${CATS.map((c, j) => `<button class="dot ${j === i ? 'on' : ''}" data-heat="${j}" aria-label="${c.name}"></button>`).join('')}</div>
  <div class="glegend" style="margin:0">Scroll, swipe or press ← → to turn pages · Less <i class="g0"></i><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i> More</div></div>`;
}
function turnTo(n) {
  const cur = view.heat || 0, len = CATS.length;
  n = ((n % len) + len) % len;
  if (n === cur || heatLock) return;
  const fwd = (n > cur && !(cur === 0 && n === len - 1)) || (cur === len - 1 && n === 0);
  const stage = document.getElementById('stage');
  view.heat = n;
  document.querySelectorAll('.hpill,.dot').forEach(b => { const on = +b.dataset.heat === n; b.classList.toggle('on', on); if (b.classList.contains('hpill')) b.setAttribute('aria-selected', on); });
  if (!stage) return;
  const out = stage.querySelector(`.page[data-p="${cur}"]`), inn = stage.querySelector(`.page[data-p="${n}"]`);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { out.className = 'page'; inn.className = 'page on'; return; }
  heatLock = true;
  const dir = fwd ? 'next' : 'prev';
  out.className = `page out-${dir}`; inn.className = `page on in-${dir}`;
  setTimeout(() => { out.className = 'page'; inn.className = 'page on'; heatLock = false; }, 720);
}

function mini() {
  return `<div class="minis">${CATS.map(c => {
    const strip = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const n = catCount(st.days[dkey(d)], c.id); strip.push(`<i class="g${c.lv(n)}"></i>`); }
    const n = catCount(st.days[st.today], c.id);
    return `<button class="mini" data-tab="streaks" data-jumpheat="${CATS.indexOf(c)}"><span class="mn">${c.name}</span><b>${st.streaks[c.id]}<small> day streak</small></b><span class="ms">${strip.join('')}</span><span class="mt">${n} ${c.unit}${n === 1 ? '' : 's'} today</span></button>`;
  }).join('')}</div>`;
}
function dsaCard() {
  const e = st.days[st.today] || {}, n = e.dsa || 0, list = e.dsaList || [];
  return `<section class="card"><h2>DSA today</h2>
    <div class="dsa"><button class="btn" data-dsa="-1" aria-label="One fewer" ${n ? '' : 'disabled'}>−</button><b class="dn ${n ? 'ok' : ''}">${n}</b><button class="btn primary" data-dsa="1">+1 solved</button></div>
    <p class="k">${n === 0 ? 'One problem is enough to keep the streak. Two is better.' : n === 1 ? 'Streak safe. One more makes it a great day.' : 'Great day. Keep it going tomorrow.'}</p>
    <div class="dadd"><input type="text" id="dsaName" placeholder="Problem name, e.g. LC 146 LRU Cache" maxlength="120"><button class="btn small" id="dsaAdd">Log it</button></div>
    ${list.length ? `<ul class="dlist">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function today() {
  const e = st.days[st.today] || { done: {}, subs: {} };
  const n = st.todayTasks.filter(t => e.done[t.id]).length, tot = st.todayTasks.length;
  const sn = st.todayTasks.reduce((a, t) => a + t.subs.filter(x => (e.subs || {})[x.id]).length, 0), stot = st.todayTasks.reduce((a, t) => a + t.subs.length, 0);
  const mins = st.todayTasks.reduce((a, t) => a + t.min, 0);
  const B = st.backend[st.bw - 1];
  return `<section class="inline-heat">${streaks()}</section><div class="tgrid">
  <section class="card"><h2>Today · ${fmt(st.today)}</h2>
    <div class="k">${n} of ${tot} tasks · ${sn} of ${stot} subtasks · ${mins} minutes planned</div><div class="bar"><i style="width:${stot ? sn / stot * 100 : 0}%"></i></div>
    ${st.todayTasks.map(t => subTask(st.today, t, e)).join('')}
  </section>
  <div class="col">${dsaCard()}<section class="card"><h2>Coach says</h2>
    <p class="line">${esc(st.line || 'Show up today. That is the whole trick.')}</p>
    <div class="k">This week's limit question</div><div class="q">${esc(B.q)}</div>
    <div class="k">Answer it out loud before Sunday. If you can't, the week isn't done.</div>
  </section></div></div>`;
}

function weekCard(p) {
  const isB = p === 'b', list = isB ? st.backend : st.ae;
  const n = view[p] || (isB ? st.bw : st.aw);
  const key = p + n, W = list[n - 1], w = st.weeks[key] || { items: {}, done: false };
  const items = isB ? [...W.l.map((x, i) => ['l' + i, 'Learn', x]), ['b', 'Build', W.b], ['sd', 'System design', W.sd]]
                    : [['learn', 'Learn', W.t], ['make', 'Make', W.make]];
  const cnt = items.filter(i => w.items[i[0]]).length;
  return `<section class="card">
  <div class="wnav"><button data-wnav="${p}" data-d="-1" ${n <= 1 ? 'disabled' : ''} aria-label="Previous week">‹</button>
  <h2 style="margin:0;flex:1">${isB ? 'Backend' : 'After Effects'} week ${n}</h2>
  ${w.done ? '<span class="pill done">Done</span>' : n === (isB ? st.bw : st.aw) ? '<span class="pill now">Current</span>' : ''}
  <button data-wnav="${p}" data-d="1" ${n >= list.length ? 'disabled' : ''} aria-label="Next week">›</button></div>
  <h3>${esc(W.t)}</h3>
  <div class="bar"><i style="width:${cnt / items.length * 100}%"></i></div>
  ${isB ? `<div class="q" style="margin-bottom:12px"><b>Limit question:</b> ${esc(W.q)}</div>` : ''}
  ${items.map(([id, lab, txt]) => `<label class="task ${w.items[id] ? 'done' : ''}"><input type="checkbox" class="wi" data-key="${key}" data-item="${id}" ${w.items[id] ? 'checked' : ''}><div><div class="t">${lab}</div><div class="d">${esc(txt)}</div></div></label>`).join('')}
  <div class="actions"><button class="btn small" data-all="${key}" data-v="${w.done ? 0 : 1}">${w.done ? 'Reopen week' : 'Mark whole week done'}</button></div>
  </section>`;
}

function journey() {
  const tiles = (p, list, cur) => list.map((W, i) => {
    const k = p + (i + 1), d = st.weeks[k] && st.weeks[k].done;
    return `<button class="tile ${d ? 'done' : i + 1 === cur ? 'now' : ''}" data-jump="${p}" data-n="${i + 1}"><small>${p === 'b' ? 'Week' : 'AE week'} ${i + 1}${d ? ' · done' : ''}</small>${esc(W.t)}</button>`;
  }).join('');
  return `<h2>Backend journey</h2><div class="tiles">${tiles('b', st.backend, st.bw)}</div>
  <h2>After Effects journey</h2><div class="tiles">${tiles('a', st.ae, st.aw)}</div>`;
}

function history() {
  const logs = Object.keys(st.days).sort().reverse().slice(0, 30).map(d => {
    const e = st.days[d], n = Object.values(e.done).filter(Boolean).length;
    return `<div class="log"><b>${fmt(d)}</b> · ${n}/${e.total || '?'} tasks · ${contrib(e)} subtasks · ${e.dsa || 0} DSA${e.reported ? '' : ' · not reported'}${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`;
  }).join('') || '<p class="k">No days logged yet.</p>';
  return `<div class="grid">
  <section class="card"><h2>Daily reports</h2>${logs}</section>
  <section class="card"><h2>Settings</h2>
    <label class="f"><span>Your name</span><input type="text" id="sName" value="${esc(st.name)}"></label>
    <label class="f"><span>Plan start date (sets the calendar week)</span><input type="date" id="sStart" value="${st.startDate}"></label>
    <label class="task"><input type="checkbox" id="sAuto" ${st.autoStart ? 'checked' : ''}><div><div class="t">Start with Windows</div><div class="d">Opens your morning check-in when you log in</div></div></label>
    <div class="actions"><button class="btn primary" id="sSave">Save settings</button></div>
    <div class="k">Preview the overlays</div>
    <div class="actions" style="justify-content:flex-start">${['fireworks', 'confetti', 'boost', 'scold'].map(k => `<button class="btn small" data-test="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div class="k">Version</div>
    <p style="margin:0 0 8px">Daily Coach ${esc(st.version)} · ${st.update.status === 'current' ? 'up to date' : st.update.status === 'ready' ? 'update ' + esc(st.update.latest) + ' ready' : st.update.status === 'error' ? 'last check failed: ' + esc(st.update.error) : st.update.status}${st.update.checkedAt ? ' · checked ' + new Date(st.update.checkedAt).toLocaleTimeString() : ''}</p>
    <button class="btn small" id="updCheck">Check for updates</button>
    <div class="k">Claude Code connection</div>
    <p class="d" style="color:var(--mute);margin:0">Local API running at <code>http://127.0.0.1:${st.port}</code>. In Claude Code, say "check on me" or "celebrate", and the daily-coach skill handles it.</p>
  </section></div>`;
}

function modal() {
  const m = $('#modal');
  if (!ci.open) { m.hidden = true; m.innerHTML = ''; return; }
  m.hidden = false;
  if (ci.step === 0) {
    const away = st.daysAway > 1 ? `<div class="verdict scold">${st.daysAway} days without a check-in. That's ${st.daysAway} days the plan didn't move. Today it does.</div>` : '';
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="ciT">
      <h1 id="ciT">${greet()}, ${esc(st.name)}</h1>
      <p class="sub">Report on yesterday, ${fmt(st.yesterday)}. Be honest: tick only what you actually finished.</p>${away}
      ${st.yesterdayTasks.map(t => taskRow(st.yesterday, t, ci.done[t.id], 'ci')).join('')}
      <label class="f"><span>DSA problems solved yesterday</span><input type="number" id="ciDsa" min="0" max="50" value="${ci.dsa ?? ((st.days[st.yesterday] || {}).dsa || 0)}" style="max-width:120px"></label>
      <label class="f"><span>What did you actually learn? One line is enough.</span><textarea id="ciNote" placeholder="e.g. Finally understood why HashMap resizes at 0.75 load factor">${esc(ci.note)}</textarea></label>
      <div class="actions"><button class="btn primary" id="ciSubmit">Submit report</button></div></div>`;
  } else {
    const v = ci.verdict;
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="ciT">
      <h1 id="ciT">Today's plan</h1>
      ${v ? `<div class="verdict ${v.kind}">${esc(v.msg)}</div>` : `<p class="sub">${st.needsReport ? '' : 'Here is what today looks like.'}</p>`}
      ${st.todayTasks.map(t => `<div class="task"><div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.detail)}</div></div><div class="m">${t.subs.length} steps · ${t.min} min</div></div>`).join('')}
      <div class="actions"><button class="btn primary" id="ciGo">Let's go</button></div></div>`;
  }
}

function render() {
  if (!st) return;
  header();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view.tab));
  const v = $('#view');
  if (view.tab === 'today') v.innerHTML = today();
  else if (view.tab === 'week') v.innerHTML = `<div class="grid">${weekCard('b')}${weekCard('a')}</div>`;
  else if (view.tab === 'journey') v.innerHTML = journey();
  else v.innerHTML = history();
  modal();
}

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.classList.contains('tt')) { st = await coach.toggleTask(t.dataset.date, t.dataset.id, t.checked); render(); }
  else if (t.classList.contains('st')) { st = await coach.toggleSub(t.dataset.date, t.dataset.id, t.checked); render(); }
  else if (t.classList.contains('wi')) { st = await coach.weekItem(t.dataset.key, t.dataset.item, t.checked); render(); }
  else if (t.classList.contains('ci')) { ci.done[t.dataset.id] = t.checked; t.closest('.task').classList.toggle('done', t.checked); }
});
document.addEventListener('wheel', e => {
  const sg = e.target.closest && e.target.closest('.stage'); if (!sg) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (sg.querySelector('.gscroll') && Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.target.closest('.gscroll') && e.target.closest('.gscroll').scrollWidth > e.target.closest('.gscroll').clientWidth) return;
  const vert = Math.abs(e.deltaY) >= Math.abs(e.deltaX), h = view.heat || 0;
  if (vert && ((d > 0 && h === CATS.length - 1) || (d < 0 && h === 0)) && !heatLock) { wheelAcc = 0; return; }
  e.preventDefault(); if (heatLock) { wheelAcc = 0; return; }
  wheelAcc += d; if (Math.abs(wheelAcc) > 60) { turnTo((view.heat || 0) + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; }
}, { passive: false });
let touchX = null;
document.addEventListener('touchstart', e => { if (e.target.closest('.stage')) touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 50) turnTo((view.heat || 0) + (dx < 0 ? 1 : -1)); });
document.addEventListener('keydown', e => {
  if (view.tab === 'today' && !e.target.closest('input,textarea') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); turnTo((view.heat || 0) + (e.key === 'ArrowRight' ? 1 : -1)); return; } if (e.target.id === 'dsaName' && e.key === 'Enter') $('#dsaAdd').click(); });
document.addEventListener('input', e => { if (e.target.id === 'ciNote') ci.note = e.target.value; if (e.target.id === 'ciDsa') ci.dsa = e.target.value; });
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) { if (b.dataset.jumpheat !== undefined) view.heat = +b.dataset.jumpheat; view.tab = b.dataset.tab; render(); }
  else if (b.dataset.wnav) { const p = b.dataset.wnav, list = p === 'b' ? st.backend : st.ae; view[p] = Math.max(1, Math.min(list.length, (view[p] || (p === 'b' ? st.bw : st.aw)) + +b.dataset.d)); render(); }
  else if (b.dataset.jump) { view[b.dataset.jump] = +b.dataset.n; view.tab = 'week'; render(); }
  else if (b.dataset.all) { st = await coach.weekItem(b.dataset.all, '__all', b.dataset.v === '1'); render(); }
  else if (b.dataset.test) { coach.test(b.dataset.test); }
  else if (b.id === 'ciSubmit') { const r = await coach.checkin({ date: st.yesterday, done: ci.done, note: ci.note, dsa: ci.dsa ?? ((st.days[st.yesterday] || {}).dsa || 0) }); st = r.state; ci.verdict = r.verdict; ci.step = 1; render(); }
  else if (b.id === 'ciGo') { if (st.needsCheckin) { const r = await coach.checkin({}); st = r.state; } ci.open = false; render(); }
  else if (b.dataset.dsa) { st = await coach.dsa(st.today, { add: +b.dataset.dsa }); render(); }
  else if (b.id === 'dsaAdd') { const v = $('#dsaName').value.trim(); if (v) { st = await coach.dsa(st.today, { problem: v }); render(); } }
  else if (b.dataset.heat !== undefined) { turnTo(+b.dataset.heat); }
  else if (b.dataset.turn) { turnTo((view.heat || 0) + +b.dataset.turn); }
  else if (b.dataset.anim) { anim = b.dataset.anim; try { localStorage.setItem('heatAnim', anim); } catch {} const sg = document.getElementById('stage'); if (sg) sg.dataset.anim = anim; document.querySelectorAll('[data-anim].btn').forEach(x => x.classList.toggle('sel', x.dataset.anim === anim)); turnTo((view.heat || 0) + 1); }
  else if (b.id === 'updCheck') { b.disabled = true; b.textContent = 'Checking...'; await coach.checkUpdate(); refresh(); }
  else if (b.id === 'updGo') { coach.applyUpdate(); }
  else if (b.id === 'sSave') { st = await coach.settings({ name: $('#sName').value, startDate: $('#sStart').value, autoStart: $('#sAuto').checked }); render(); }
});

coach.onRefresh(refresh);
refresh();
}
