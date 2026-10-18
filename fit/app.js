'use strict';

/* ---------- Built-in exercise library ---------- */

const GROUPS = [
  ['back', '背', '#3b82f6'],
  ['chest', '胸', '#ef4444'],
  ['shoulder', '肩', '#a855f7'],
  ['legs', '腿', '#22c55e'],
  ['arms', '手臂', '#f59e0b'],
  ['abs', '腹', '#14b8a6'],
  ['lower', '腰', '#ec4899'],
  ['cardio', '有氧', '#06b6d4'],
];
const GROUP = Object.fromEntries(GROUPS.map(([id, name, color]) => [id, { id, name, color }]));

// type: weight = 器械/自由重量 (kg, 组, 次); body = 自重 (组, 次, 附加 kg);
//       hold = 计时 (组, 秒); cardio = 有氧 (分钟, 档位, 距离)
const BUILTIN = [
  ['lat_pulldown', 'back', '高位下拉', 'weight', { w: 40, s: 4, r: 10 }],
  ['seated_row', 'back', '坐姿划船', 'weight', { w: 40, s: 4, r: 10 }],
  ['pullup', 'back', '引体向上', 'body', { s: 4, r: 8, w: 0 }],
  ['assisted_pullup', 'back', '辅助引体向上', 'weight', { w: 30, s: 4, r: 10 }, { w: '辅助重量' }],
  ['barbell_row', 'back', '杠铃划船', 'weight', { w: 30, s: 4, r: 10 }],
  ['db_row', 'back', '单臂哑铃划船', 'weight', { w: 14, s: 3, r: 12 }],
  ['tbar_row', 'back', 'T 杠划船', 'weight', { w: 30, s: 4, r: 10 }],
  ['straight_arm', 'back', '直臂下压', 'weight', { w: 20, s: 3, r: 12 }],

  ['bench_press', 'chest', '杠铃卧推', 'weight', { w: 40, s: 4, r: 8 }],
  ['db_press', 'chest', '哑铃卧推', 'weight', { w: 16, s: 4, r: 10 }],
  ['incline_db_press', 'chest', '上斜哑铃卧推', 'weight', { w: 14, s: 4, r: 10 }],
  ['machine_press', 'chest', '器械推胸', 'weight', { w: 35, s: 4, r: 10 }],
  ['pec_deck', 'chest', '蝴蝶机夹胸', 'weight', { w: 30, s: 3, r: 12 }],
  ['db_fly', 'chest', '哑铃飞鸟', 'weight', { w: 10, s: 3, r: 12 }],
  ['cable_fly', 'chest', '绳索夹胸', 'weight', { w: 10, s: 3, r: 12 }],
  ['dips', 'chest', '双杠臂屈伸', 'body', { s: 3, r: 10, w: 0 }],
  ['pushup', 'chest', '俯卧撑', 'body', { s: 3, r: 15, w: 0 }],

  ['db_shoulder_press', 'shoulder', '哑铃推举', 'weight', { w: 12, s: 4, r: 10 }],
  ['machine_shoulder_press', 'shoulder', '器械推肩', 'weight', { w: 25, s: 4, r: 10 }],
  ['ohp', 'shoulder', '杠铃推举', 'weight', { w: 30, s: 4, r: 8 }],
  ['lateral_raise', 'shoulder', '哑铃侧平举', 'weight', { w: 6, s: 4, r: 15 }],
  ['cable_lateral', 'shoulder', '绳索侧平举', 'weight', { w: 5, s: 3, r: 15 }],
  ['rear_delt', 'shoulder', '反向飞鸟', 'weight', { w: 20, s: 3, r: 15 }],
  ['face_pull', 'shoulder', '面拉', 'weight', { w: 15, s: 3, r: 15 }],

  ['squat', 'legs', '杠铃深蹲', 'weight', { w: 50, s: 4, r: 8 }],
  ['leg_press', 'legs', '腿举', 'weight', { w: 80, s: 4, r: 10 }],
  ['hack_squat', 'legs', '哈克深蹲', 'weight', { w: 40, s: 4, r: 10 }],
  ['leg_ext', 'legs', '腿屈伸', 'weight', { w: 30, s: 3, r: 12 }],
  ['leg_curl', 'legs', '腿弯举', 'weight', { w: 25, s: 3, r: 12 }],
  ['rdl', 'legs', '罗马尼亚硬拉', 'weight', { w: 40, s: 4, r: 10 }],
  ['bulgarian', 'legs', '保加利亚分腿蹲', 'weight', { w: 10, s: 3, r: 10 }],
  ['lunge', 'legs', '箭步蹲', 'weight', { w: 10, s: 3, r: 12 }],
  ['hip_thrust', 'legs', '臀推', 'weight', { w: 40, s: 4, r: 10 }],
  ['abduction', 'legs', '髋外展', 'weight', { w: 30, s: 3, r: 15 }],
  ['calf_raise', 'legs', '提踵', 'weight', { w: 30, s: 4, r: 15 }],

  ['bb_curl', 'arms', '杠铃弯举', 'weight', { w: 20, s: 3, r: 12 }],
  ['db_curl', 'arms', '哑铃弯举', 'weight', { w: 10, s: 3, r: 12 }],
  ['hammer_curl', 'arms', '锤式弯举', 'weight', { w: 10, s: 3, r: 12 }],
  ['preacher_curl', 'arms', '牧师凳弯举', 'weight', { w: 15, s: 3, r: 12 }],
  ['pushdown', 'arms', '绳索下压', 'weight', { w: 20, s: 3, r: 12 }],
  ['overhead_ext', 'arms', '过头臂屈伸', 'weight', { w: 12, s: 3, r: 12 }],
  ['close_bench', 'arms', '窄距卧推', 'weight', { w: 30, s: 3, r: 10 }],

  ['crunch', 'abs', '卷腹', 'body', { s: 3, r: 20, w: 0 }],
  ['plank', 'abs', '平板支撑', 'hold', { s: 3, t: 60 }],
  ['side_plank', 'abs', '侧平板支撑', 'hold', { s: 3, t: 40 }],
  ['hanging_leg_raise', 'abs', '悬垂举腿', 'body', { s: 3, r: 12, w: 0 }],
  ['ab_wheel', 'abs', '健腹轮', 'body', { s: 3, r: 10, w: 0 }],
  ['russian_twist', 'abs', '俄罗斯转体', 'body', { s: 3, r: 20, w: 5 }],
  ['machine_crunch', 'abs', '器械卷腹', 'weight', { w: 25, s: 3, r: 15 }],

  ['back_ext', 'lower', '山羊挺身', 'body', { s: 3, r: 15, w: 0 }],
  ['machine_back_ext', 'lower', '器械背伸展', 'weight', { w: 30, s: 3, r: 15 }],
  ['deadlift', 'lower', '硬拉', 'weight', { w: 60, s: 4, r: 6 }],
  ['good_morning', 'lower', '早安式体前屈', 'weight', { w: 20, s: 3, r: 12 }],
  ['bird_dog', 'lower', '鸟狗式', 'body', { s: 3, r: 12, w: 0 }],
  ['glute_bridge', 'lower', '臀桥', 'body', { s: 3, r: 15, w: 0 }],

  ['treadmill', 'cardio', '跑步机', 'cardio', { t: 30, lv: 8, d: 4 }, { lv: '速度', lvU: 'km/h', lvStep: 0.5 }],
  ['incline_walk', 'cardio', '坡度快走', 'cardio', { t: 30, lv: 10 }, { lv: '坡度', lvU: '%' }],
  ['elliptical', 'cardio', '椭圆机', 'cardio', { t: 30, lv: 8 }, { lv: '阻力' }],
  ['spin_bike', 'cardio', '动感单车', 'cardio', { t: 30, lv: 8 }, { lv: '阻力' }],
  ['rower', 'cardio', '划船机', 'cardio', { t: 15, lv: 5, d: 3 }, { lv: '阻力' }],
  ['stair', 'cardio', '爬楼机', 'cardio', { t: 20, lv: 6 }, { lv: '档位' }],
  ['jump_rope', 'cardio', '跳绳', 'cardio', { t: 10 }, { lv: '次/分' }],
];

const TYPES = {
  weight: { name: '器械 / 自由重量', fields: ['w', 's', 'r'] },
  body: { name: '自重', fields: ['s', 'r', 'w'] },
  hold: { name: '计时', fields: ['s', 't'] },
  cardio: { name: '有氧', fields: ['t', 'lv', 'd'] },
};

/* ---------- Storage ---------- */

const KEY = 'fitlog.v1';
const UI_KEY = 'fitlog.ui';

function emptyDb() {
  return { v: 1, logs: {}, custom: [], defs: {} };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    return emptyDb();
  }
}

function normalize(d) {
  if (!d || typeof d !== 'object' || typeof d.logs !== 'object') throw new Error('不是有效的健身记录文件');
  return { v: 1, logs: d.logs || {}, custom: Array.isArray(d.custom) ? d.custom : [], defs: d.defs || {} };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    toast('保存失败：浏览器存储不可用');
  }
}

function loadUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {}
}

let db = loadDb();
let ui = loadUi();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Helpers ---------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = s => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`; };
const fmtShort = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const round = v => Math.round(v * 100) / 100;

function exercises() {
  const list = BUILTIN.map(([id, group, name, type, defaults, x]) => ({ id, group, name, type, defaults, x: x || {}, builtin: true }));
  return list.concat(db.custom.map(c => ({ ...c, x: c.x || {} })));
}
function exById(id) {
  return exercises().find(e => e.id === id) || { id, group: 'cardio', name: '已删除的动作', type: 'weight', defaults: {}, x: {} };
}
function defaultsOf(ex) {
  return { ...ex.defaults, ...(db.defs[ex.id] || {}) };
}

function fieldDef(ex, k) {
  switch (k) {
    case 'w': return { label: ex.x.w || (ex.type === 'body' ? '附加重量' : '重量'), unit: 'kg', step: 2.5 };
    case 's': return { label: '组数', unit: '组', step: 1 };
    case 'r': return { label: '每组次数', unit: '次', step: 1 };
    case 't': return ex.type === 'hold' ? { label: '每组时长', unit: '秒', step: 5 } : { label: '时长', unit: '分钟', step: 1 };
    case 'lv': return { label: ex.x.lv || '档位', unit: ex.x.lvU || '', step: ex.x.lvStep || 1 };
    case 'd': return { label: '距离', unit: 'km', step: 0.1 };
  }
}

function summary(e, ex) {
  const p = [];
  const sr = () => (e.s && e.r ? `${e.s}×${e.r}` : e.s ? `${e.s} 组` : e.r ? `${e.r} 次` : '');
  if (ex.type === 'weight') {
    if (e.w != null) p.push(`${e.w} kg`);
    if (sr()) p.push(sr());
  } else if (ex.type === 'body') {
    if (sr()) p.push(sr());
    if (e.w) p.push(`+${e.w} kg`);
  } else if (ex.type === 'hold') {
    if (e.t != null) p.push(`${e.s || 1}×${e.t} 秒`);
  } else {
    if (e.t != null) p.push(`${e.t} 分钟`);
    if (e.lv != null) { const f = fieldDef(ex, 'lv'); p.push(`${f.label} ${e.lv}${f.unit ? ' ' + f.unit : ''}`); }
    if (e.d != null) p.push(`${e.d} km`);
  }
  return p.join(' · ') || '—';
}

// All entries, sorted oldest → newest, each with its date.
function allEntries() {
  const out = [];
  for (const [date, list] of Object.entries(db.logs)) for (const e of list) out.push({ ...e, date });
  return out.sort((a, b) => (a.date === b.date ? (a.ts || 0) - (b.ts || 0) : a.date < b.date ? -1 : 1));
}
function historyOf(exId) {
  return allEntries().filter(e => e.ex === exId);
}
function prevOf(e) {
  const h = historyOf(e.ex);
  const before = h.filter(x => x.date < e.date || (x.date === e.date && (x.ts || 0) < (e.ts || 0)));
  return before[before.length - 1] || null;
}
function lastUpTo(exId, date) {
  const h = historyOf(exId).filter(x => x.date <= date);
  return h[h.length - 1] || null;
}

// Main progress metric per type, used for the trend line and "best".
function metric(e, ex) {
  if (ex.type === 'weight') return e.w ?? 0;
  if (ex.type === 'body') return (e.s || 1) * (e.r || 0);
  return e.t ?? 0;
}
function metricUnit(ex) {
  return ex.type === 'weight' ? 'kg' : ex.type === 'body' ? '次' : ex.type === 'hold' ? '秒' : '分钟';
}
function deltaBadges(e, ex) {
  const prev = prevOf(e);
  if (!prev) return '';
  let html = '';
  let d = metric(e, ex) - metric(prev, ex);
  let unit = metricUnit(ex);
  if (ex.type === 'weight' && d === 0) {
    d = (e.s || 1) * (e.r || 0) - (prev.s || 1) * (prev.r || 0);
    unit = '次';
  }
  if (d > 0) html += `<span class="badge up">↑${round(d)} ${unit}</span>`;
  else if (d < 0) html += `<span class="badge down">↓${round(-d)} ${unit}</span>`;
  const earlier = historyOf(e.ex).filter(x => x !== e && (x.date < e.date || (x.date === e.date && (x.ts || 0) < (e.ts || 0))));
  if (earlier.length && metric(e, ex) > Math.max(...earlier.map(x => metric(x, ex)))) html += '<span class="badge pr">PR</span>';
  return html ? `<span class="badges">${html}</span>` : '';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function sparkline(values) {
  if (values.length < 2) return '';
  const w = 72, h = 28, p = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [p + (i * (w - 2 * p)) / (values.length - 1), h - p - ((v - min) / span) * (h - 2 * p)]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.8" fill="var(--accent)"/></svg>`;
}

/* ---------- App state ---------- */

const state = {
  tab: 'today',
  date: todayStr(),
  libGroup: 'all',
  histMode: 'cal',
  calMonth: todayStr().slice(0, 7),
};

const ICON = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chev: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
};

function render() {
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('#fab').classList.toggle('hidden', state.tab !== 'today' || !(db.logs[state.date] || []).length);
  ({ today: renderToday, lib: renderLib, hist: renderHist, me: renderMe })[state.tab]();
}

/* ---------- Today ---------- */

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function renderToday() {
  const d = state.date;
  const isToday = d === todayStr();
  $('#top').innerHTML = `
    <div class="top-row">
      <div>
        <h1>${isToday ? '今天' : fmtDate(d).split(' ')[0]}</h1>
        <div class="sub">${fmtDate(d)}${isToday ? '' : ' · <button class="linkbtn" style="padding:0" data-act="goToday">回到今天</button>'}</div>
      </div>
      <div class="datenav">
        <button class="iconbtn" data-act="prevDay" aria-label="前一天">${ICON.left}</button>
        <button class="iconbtn" data-act="nextDay" aria-label="后一天">${ICON.right}</button>
      </div>
    </div>`;

  const list = db.logs[d] || [];
  let html = '';
  if (!isStandalone() && !ui.hideInstall) {
    html += `<div class="banner"><p>在 Safari 里点 <b>分享</b> → <b>添加到主屏幕</b>，就能像 App 一样全屏打开、离线使用。<br>注意：主屏幕 App 和 Safari 的数据互相独立，建议添加后再开始记录。</p><button data-act="hideInstall" aria-label="关闭">×</button></div>`;
  }
  if (list.length) {
    let sets = 0, vol = 0, mins = 0;
    for (const e of list) {
      const ex = exById(e.ex);
      if (ex.type === 'cardio') mins += e.t || 0;
      else sets += e.s || 0;
      if (ex.type === 'weight' && e.w) vol += e.w * (e.s || 1) * (e.r || 0);
    }
    html += `<div class="stats">
      <div class="stat"><b>${list.length}</b><span>动作</span></div>
      <div class="stat"><b>${sets}</b><span>组</span></div>
      <div class="stat"><b>${vol >= 10000 ? round(vol / 1000) + 't' : Math.round(vol)}</b><span>容量 kg</span></div>
      <div class="stat"><b>${round(mins)}</b><span>有氧 分钟</span></div>
    </div>`;
    html += '<div class="section-title">已完成</div><div class="card">';
    for (const e of list) {
      const ex = exById(e.ex);
      html += `<button class="row" data-act="editEntry" data-id="${e.id}">
        <span class="bar" style="background:${GROUP[ex.group]?.color || '#999'}"></span>
        <span class="main"><div class="name">${esc(ex.name)}</div><div class="meta">${esc(summary(e, ex))}${e.note ? ' · ' + esc(e.note) : ''}</div></span>
        ${deltaBadges({ ...e, date: d }, ex)}
      </button>`;
    }
    html += '</div>';
    const last = lastWorkoutBefore(d);
    if (last) html += `<div style="margin-top:14px"><button class="btn soft" data-act="copyDay" data-date="${last}">再练一次 ${fmtShort(last)} 的动作</button></div>`;
  } else {
    html += `<div class="empty"><div class="big">🏋️</div><div>${isToday ? '今天' : '这天'}还没有记录</div></div>
      <button class="btn primary" data-act="add">${ICON.plus.replace('<svg', '<svg width="22" height="22"')} 添加动作</button>`;
    const last = lastWorkoutBefore(d);
    if (last) html += `<button class="btn soft" data-act="copyDay" data-date="${last}">照 ${fmtShort(last)} 的训练再练一次</button>`;
  }
  $('#view').innerHTML = html;
}

function lastWorkoutBefore(d) {
  const dates = Object.keys(db.logs).filter(x => x < d && db.logs[x].length).sort();
  return dates[dates.length - 1] || null;
}

// Prefill today with the exercises from an earlier day (using each one's latest numbers).
function copyDay(from) {
  const d = state.date;
  const src = db.logs[from] || [];
  const list = (db.logs[d] = db.logs[d] || []);
  const have = new Set(list.map(e => e.ex));
  let n = 0;
  for (const e of src) {
    if (have.has(e.ex)) continue;
    const last = lastUpTo(e.ex, d) || e;
    const { id, ts, date, note, ...nums } = last;
    list.push({ ...nums, id: uid(), ts: Date.now() + n, ex: e.ex });
    have.add(e.ex);
    n++;
  }
  save();
  render();
  toast(n ? `已添加 ${n} 个动作，点开可改数字` : '这些动作已经在列表里了');
}

/* ---------- Sheets ---------- */

function openSheet(title, body, onReady) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = body;
  $('#sheetBody').scrollTop = 0;
  const s = $('#sheet'), b = $('#backdrop');
  s.classList.remove('hidden');
  b.classList.remove('hidden');
  requestAnimationFrame(() => { s.classList.add('show'); b.classList.add('show'); });
  document.body.style.overflow = 'hidden';
  if (onReady) onReady($('#sheetBody'));
}
function closeSheet() {
  const s = $('#sheet'), b = $('#backdrop');
  s.classList.remove('show');
  b.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => { if (!s.classList.contains('show')) { s.classList.add('hidden'); b.classList.add('hidden'); } }, 260);
}

let pickerGroup = 'all';
function openPicker() {
  const body = `<input class="search" id="pickSearch" type="search" placeholder="搜索动作" autocomplete="off" />
    <div class="chips" id="pickChips"></div><div id="pickList"></div>`;
  openSheet(`添加到 ${state.date === todayStr() ? '今天' : fmtShort(state.date)}`, body, el => {
    const draw = () => {
      const q = $('#pickSearch').value.trim();
      $('#pickChips').innerHTML = [['all', '全部'], ['recent', '最近']].concat(GROUPS.map(g => [g[0], g[1]]))
        .map(([id, n]) => `<button class="chip ${pickerGroup === id ? 'on' : ''}" data-pg="${id}">${n}</button>`).join('');
      $('#pickList').innerHTML = exerciseList(q, pickerGroup, 'pick');
    };
    el.addEventListener('input', e => { if (e.target.id === 'pickSearch') draw(); });
    el.addEventListener('click', e => {
      const c = e.target.closest('[data-pg]');
      if (c) { pickerGroup = c.dataset.pg; draw(); }
    });
    draw();
  });
}

function recentIds() {
  const seen = [];
  const all = allEntries();
  for (let i = all.length - 1; i >= 0 && seen.length < 12; i--) if (!seen.includes(all[i].ex)) seen.push(all[i].ex);
  return seen;
}

// List of exercises grouped by body part; act = 'pick' (add to day) or 'exInfo' (library detail).
function exerciseList(q, group, act) {
  let list = exercises();
  if (group === 'recent') {
    const ids = recentIds();
    list = ids.map(id => list.find(e => e.id === id)).filter(Boolean);
    if (!list.length) return '<div class="empty">还没有记录过动作</div>';
  } else if (group !== 'all') list = list.filter(e => e.group === group);
  if (q) list = list.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || GROUP[e.group]?.name.includes(q));
  if (!list.length) return '<div class="empty">没有找到，可以在「动作」里新建自定义动作</div>';
  const byGroup = group === 'recent' ? [['recent', list]] : GROUPS.map(g => [g[0], list.filter(e => e.group === g[0])]).filter(([, l]) => l.length);
  return byGroup.map(([gid, l]) => `
    ${gid === 'recent' ? '' : `<div class="section-title">${GROUP[gid].name}</div>`}
    <div class="card">${l.map(ex => {
      const last = lastUpTo(ex.id, '9999-12-31');
      const meta = last ? `上次 ${fmtShort(last.date)}：${summary(last, ex)}` : `默认 ${summary(defaultsOf(ex), ex)}`;
      return `<button class="row" data-act="${act}" data-ex="${esc(ex.id)}">
        <span class="dot" style="background:${GROUP[ex.group].color}"></span>
        <span class="main"><div class="name">${esc(ex.name)}</div><div class="meta">${esc(meta)}</div></span>
        <span class="chev">${ICON.chev}</span></button>`;
    }).join('')}</div>`).join('');
}

function stepperHtml(ex, k, val) {
  const f = fieldDef(ex, k);
  return `<div class="field">
    <label for="f_${k}">${esc(f.label)}<small>${esc(f.unit || ' ')}</small></label>
    <div class="stepper">
      <button type="button" data-step="${k}" data-dir="-1" aria-label="减少">−</button>
      <input id="f_${k}" data-k="${k}" type="text" inputmode="decimal" value="${val ?? ''}" placeholder="—" />
      <button type="button" data-step="${k}" data-dir="1" aria-label="增加">+</button>
    </div></div>`;
}

function bindSteppers(el, ex) {
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const k = b.dataset.step;
    const input = el.querySelector(`#f_${k}`);
    const f = fieldDef(ex, k);
    const cur = num(input.value) ?? 0;
    input.value = Math.max(0, round(cur + Number(b.dataset.dir) * f.step));
  });
}

function readFields(el, ex) {
  const out = {};
  for (const k of TYPES[ex.type].fields) {
    const raw = el.querySelector(`#f_${k}`).value.trim().replace(',', '.');
    const v = num(raw);
    if (v != null) out[k] = v;
  }
  return out;
}

// Add a new entry (entryId null) or edit an existing one on state.date.
function openEditor(exId, entryId) {
  const ex = exById(exId);
  const list = db.logs[state.date] || [];
  const entry = entryId ? list.find(e => e.id === entryId) : null;
  const ref = entry ? prevOf({ ...entry, date: state.date }) : lastUpTo(ex.id, state.date);
  const init = entry || (ref ? ref : defaultsOf(ex));
  const best = historyOf(ex.id).filter(e => e.id !== entryId).reduce((b, e) => (!b || metric(e, ex) > metric(b, ex) ? e : b), null);

  let body = '';
  if (ref) {
    body += `<div class="lastbox">${entry ? '' : '<button class="reuse" data-act2="reuse">用上次的数</button>'}
      <div class="t">上次 · ${fmtDate(ref.date)}</div><div class="v">${esc(summary(ref, ex))}</div>
      ${best && best !== ref ? `<div class="t" style="margin-top:6px">最佳 · ${fmtShort(best.date)} · ${esc(summary(best, ex))}</div>` : ''}</div>`;
  } else {
    body += `<p class="hint">第一次记录这个动作，已填入常见默认值，按实际修改即可。</p>`;
  }
  body += `<div class="card">${TYPES[ex.type].fields.map(k => stepperHtml(ex, k, init[k])).join('')}</div>`;
  body += `<div class="section-title">备注</div><input class="textin" id="f_note" type="text" placeholder="例如：最后一组力竭、座椅 4 档" value="${esc(entry?.note || '')}" />`;
  body += `<div style="margin-top:18px"><button class="btn primary" data-act2="save">${entry ? '保存修改' : '记录'}</button>
    ${entry ? '<button class="btn danger" data-act2="del">删除这条记录</button>' : ''}</div>`;

  openSheet(ex.name, body, el => {
    bindSteppers(el, ex);
    el.querySelector('[data-act2="save"]').onclick = () => {
      const vals = readFields(el, ex);
      const note = el.querySelector('#f_note').value.trim();
      const day = (db.logs[state.date] = db.logs[state.date] || []);
      if (entry) {
        for (const k of TYPES[ex.type].fields) delete entry[k];
        Object.assign(entry, vals);
        if (note) entry.note = note; else delete entry.note;
      } else {
        day.push({ id: uid(), ex: ex.id, ts: Date.now(), ...vals, ...(note ? { note } : {}) });
      }
      save();
      closeSheet();
      state.tab = 'today';
      render();
      toast(entry ? '已保存' : `已记录 ${ex.name}`);
    };
    const del = el.querySelector('[data-act2="del"]');
    if (del) del.onclick = () => {
      if (!confirm(`删除这条「${ex.name}」记录？`)) return;
      db.logs[state.date] = list.filter(e => e.id !== entryId);
      if (!db.logs[state.date].length) delete db.logs[state.date];
      save();
      closeSheet();
      render();
      toast('已删除');
    };
    const reuse = el.querySelector('[data-act2="reuse"]');
    if (reuse) reuse.onclick = () => {
      for (const k of TYPES[ex.type].fields) el.querySelector(`#f_${k}`).value = ref[k] ?? '';
    };
  });
}

/* ---------- Library ---------- */

function renderLib() {
  $('#top').innerHTML = `<div class="top-row"><h1>动作</h1><button class="linkbtn" data-act="newEx">+ 自定义</button></div>`;
  const chips = [['all', '全部']].concat(GROUPS.map(g => [g[0], g[1]]))
    .map(([id, n]) => `<button class="chip ${state.libGroup === id ? 'on' : ''}" data-act="libGroup" data-g="${id}">${n}</button>`).join('');
  $('#view').innerHTML = `<input class="search" id="libSearch" type="search" placeholder="搜索动作" autocomplete="off" value="${esc(state.libQ || '')}" />
    <div class="chips">${chips}</div><div id="libList">${exerciseList(state.libQ || '', state.libGroup, 'exInfo')}</div>`;
}

function openExInfo(exId) {
  const ex = exById(exId);
  const hist = historyOf(ex.id);
  const def = defaultsOf(ex);
  let body = `<p class="hint">${GROUP[ex.group].name} · ${TYPES[ex.type].name}${ex.builtin ? '' : ' · 自定义'}</p>`;
  body += `<button class="btn primary" data-act2="log">记录到${state.date === todayStr() ? '今天' : ' ' + fmtShort(state.date)}</button>`;
  if (hist.length) {
    const best = hist.reduce((b, e) => (metric(e, ex) > metric(b, ex) ? e : b));
    body += `<div class="section-title">进步 · 共 ${hist.length} 次</div>
      <div class="card"><div class="kv"><span>最佳</span><span>${esc(summary(best, ex))}（${fmtShort(best.date)}）</span></div>
      <div class="kv"><span>趋势（${metricUnit(ex)}）</span><span>${sparkline(hist.slice(-20).map(e => metric(e, ex))) || '再练一次就有曲线'}</span></div></div>`;
    body += `<div class="section-title">最近记录</div><div class="card">${hist.slice(-15).reverse().map(e =>
      `<div class="kv"><span>${fmtDate(e.date)}</span><span>${esc(summary(e, ex))}</span></div>`).join('')}</div>`;
  }
  body += `<div class="section-title">默认值（第一次记录时自动填入）</div>
    <div class="card" id="defCard">${TYPES[ex.type].fields.map(k => stepperHtml(ex, k, def[k])).join('')}</div>
    <div style="margin-top:10px"><button class="btn" data-act2="saveDef">保存默认值</button>
    ${ex.builtin ? '' : '<button class="btn danger" data-act2="delEx">删除这个自定义动作</button>'}</div>`;

  openSheet(ex.name, body, el => {
    bindSteppers(el, ex);
    el.querySelector('[data-act2="log"]').onclick = () => openEditor(ex.id, null);
    el.querySelector('[data-act2="saveDef"]').onclick = () => {
      const vals = readFields(el.querySelector('#defCard'), ex);
      if (ex.builtin) db.defs[ex.id] = vals;
      else db.custom.find(c => c.id === ex.id).defaults = vals;
      save();
      toast('默认值已保存');
      render();
    };
    const del = el.querySelector('[data-act2="delEx"]');
    if (del) del.onclick = () => {
      if (!confirm(`删除「${ex.name}」？已有的记录会保留，但显示为“已删除的动作”。`)) return;
      db.custom = db.custom.filter(c => c.id !== ex.id);
      save();
      closeSheet();
      render();
    };
  });
}

function openNewEx() {
  const body = `<div class="section-title">名称</div><input class="textin" id="nx_name" type="text" placeholder="例如：史密斯深蹲" />
    <div class="section-title">部位</div><select class="textin" id="nx_group">${GROUPS.map(g => `<option value="${g[0]}" ${state.libGroup === g[0] ? 'selected' : ''}>${g[1]}</option>`).join('')}</select>
    <div class="section-title">记录方式</div><select class="textin" id="nx_type">${Object.entries(TYPES).map(([k, t]) =>
      `<option value="${k}">${t.name}（${t.fields.map(f => fieldDef({ type: k, x: {} }, f).label).join('、')}）</option>`).join('')}</select>
    <div style="margin-top:18px"><button class="btn primary" id="nx_save">创建</button></div>`;
  openSheet('自定义动作', body, el => {
    el.querySelector('#nx_save').onclick = () => {
      const name = el.querySelector('#nx_name').value.trim();
      if (!name) { toast('请输入名称'); return; }
      const type = el.querySelector('#nx_type').value;
      const defaults = { weight: { w: 20, s: 3, r: 12 }, body: { s: 3, r: 12, w: 0 }, hold: { s: 3, t: 45 }, cardio: { t: 20 } }[type];
      const ex = { id: 'c_' + uid(), group: el.querySelector('#nx_group').value, name, type, defaults };
      db.custom.push(ex);
      save();
      render();
      openExInfo(ex.id);
      toast('已创建');
    };
  });
}

/* ---------- History ---------- */

function renderHist() {
  $('#top').innerHTML = `<div class="top-row"><h1>历史</h1></div>`;
  let html = `<div class="seg"><button data-act="histMode" data-m="cal" class="${state.histMode === 'cal' ? 'on' : ''}">日历</button>
    <button data-act="histMode" data-m="prog" class="${state.histMode === 'prog' ? 'on' : ''}">进步</button></div>`;
  html += state.histMode === 'cal' ? calendarHtml() : progressHtml();
  $('#view').innerHTML = html;
}

function calendarHtml() {
  const [y, m] = state.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const today = todayStr();
  let cells = ['一', '二', '三', '四', '五', '六', '日'].map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div class="day out"></div>';
  let trainDays = 0, sets = 0, mins = 0;
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const list = db.logs[ds] || [];
    const groups = [...new Set(list.map(e => exById(e.ex).group))];
    if (list.length) trainDays++;
    for (const e of list) { const ex = exById(e.ex); if (ex.type === 'cardio') mins += e.t || 0; else sets += e.s || 0; }
    cells += `<button class="day ${list.length ? 'has' : ''} ${ds === today ? 'today' : ''}" data-act="openDay" data-date="${ds}">
      <span>${d}</span><span class="dots">${groups.slice(0, 4).map(g => `<i style="background:${GROUP[g]?.color || '#999'}"></i>`).join('')}</span></button>`;
  }
  let html = `<div class="card cal"><div class="cal-head">
      <button class="iconbtn" data-act="calPrev" aria-label="上个月">${ICON.left}</button>
      <b>${y} 年 ${m} 月</b>
      <button class="iconbtn" data-act="calNext" aria-label="下个月">${ICON.right}</button></div>
    <div class="cal-grid">${cells}</div></div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
      <div class="stat"><b>${trainDays}</b><span>训练天数</span></div>
      <div class="stat"><b>${sets}</b><span>力量组数</span></div>
      <div class="stat"><b>${round(mins)}</b><span>有氧 分钟</span></div></div>
    <div class="chips" style="margin-top:12px;flex-wrap:wrap">${GROUPS.map(g => `<span style="display:flex;align-items:center;gap:5px;font-size:13px;color:var(--muted)"><i class="dot" style="background:${g[2]};width:8px;height:8px"></i>${g[1]}</span>`).join('')}</div>`;

  const recent = Object.keys(db.logs).filter(d => db.logs[d].length).sort().reverse().slice(0, 10);
  if (recent.length) {
    html += `<div class="section-title">最近训练</div><div class="card">${recent.map(d => {
      const names = db.logs[d].map(e => exById(e.ex).name);
      const groups = [...new Set(db.logs[d].map(e => exById(e.ex).group))].map(g => GROUP[g]?.name).join(' ');
      return `<button class="row" data-act="openDay" data-date="${d}"><span class="main">
        <div class="name">${fmtDate(d)} <span style="color:var(--muted);font-weight:500;font-size:14px">${esc(groups)}</span></div>
        <div class="meta">${esc(names.join('、'))}</div></span><span class="chev">${ICON.chev}</span></button>`;
    }).join('')}</div>`;
  }
  return html;
}

function progressHtml() {
  const all = allEntries();
  if (!all.length) return '<div class="empty"><div class="big">📈</div>记录几次之后，这里会显示每个动作的进步</div>';
  const byEx = new Map();
  for (const e of all) { if (!byEx.has(e.ex)) byEx.set(e.ex, []); byEx.get(e.ex).push(e); }
  const rows = [...byEx.entries()].sort((a, b) => (a[1].at(-1).date < b[1].at(-1).date ? 1 : -1));
  return `<p class="hint">按最近练过排序。趋势线：器械看重量，自重看总次数，计时和有氧看时长。</p><div class="card">${rows.map(([id, h]) => {
    const ex = exById(id);
    const last = h[h.length - 1];
    const best = h.reduce((b, e) => (metric(e, ex) > metric(b, ex) ? e : b));
    return `<button class="row" data-act="exInfo" data-ex="${esc(id)}">
      <span class="bar" style="background:${GROUP[ex.group]?.color || '#999'}"></span>
      <span class="main"><div class="name">${esc(ex.name)}</div>
      <div class="meta">上次 ${fmtShort(last.date)}：${esc(summary(last, ex))}</div>
      <div class="meta">最佳：${esc(summary(best, ex))} · 共 ${h.length} 次</div></span>
      ${sparkline(h.slice(-12).map(e => metric(e, ex)))}</button>`;
  }).join('')}</div>`;
}

/* ---------- Data ---------- */

function renderMe() {
  $('#top').innerHTML = `<div class="top-row"><h1>数据</h1></div>`;
  const all = allEntries();
  const days = Object.keys(db.logs).filter(d => db.logs[d].length).length;
  const first = all[0]?.date;
  $('#view').innerHTML = `
    <div class="card">
      <div class="kv"><span>训练天数</span><span>${days}</span></div>
      <div class="kv"><span>动作记录</span><span>${all.length} 条</span></div>
      <div class="kv"><span>第一次记录</span><span>${first ? fmtDate(first) : '—'}</span></div>
      <div class="kv"><span>自定义动作</span><span>${db.custom.length} 个</span></div>
    </div>
    <div class="section-title">备份</div>
    <p class="hint">数据只保存在这台手机的浏览器里，不会上传。换手机、清除 Safari 数据或删除主屏幕图标前，请先导出备份。</p>
    <div class="btns2"><button class="btn" data-act="export">导出 JSON</button><button class="btn" data-act="import">导入 JSON</button></div>
    <div class="section-title">安装</div>
    <p class="hint">${isStandalone() ? '已经从主屏幕打开 ✓' : '在 Safari 里点 <b>分享</b> → <b>添加到主屏幕</b>。主屏幕 App 和 Safari 标签页的数据互相独立，可以用导出 / 导入把记录搬过去。'}</p>
    <div class="section-title">危险操作</div>
    <button class="btn danger" data-act="wipe">清空全部记录</button>
    <p class="foot">健身记录 · 离线可用 · haokaiding.com/fit</p>`;
}

async function exportData() {
  const json = JSON.stringify({ app: 'fitlog', exportedAt: new Date().toISOString(), ...db }, null, 2);
  const name = `fitlog-${todayStr()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = normalize(JSON.parse(await f.text()));
    const n = Object.values(data.logs).reduce((s, l) => s + l.length, 0);
    const merge = confirm(`文件里有 ${n} 条记录。\n\n确定 = 合并到现有记录\n取消 = 选择是否覆盖`);
    if (merge) {
      for (const [d, list] of Object.entries(data.logs)) {
        const cur = (db.logs[d] = db.logs[d] || []);
        const ids = new Set(cur.map(x => x.id));
        for (const x of list) if (!ids.has(x.id)) cur.push(x);
      }
      const cids = new Set(db.custom.map(c => c.id));
      for (const c of data.custom) if (!cids.has(c.id)) db.custom.push(c);
      db.defs = { ...data.defs, ...db.defs };
    } else if (confirm('用文件内容覆盖现有全部记录？')) {
      db = data;
    } else return;
    save();
    render();
    toast('导入完成');
  } catch (err) {
    alert('导入失败：' + err.message);
  }
});

/* ---------- Events ---------- */

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  switch (act) {
    case 'prevDay': state.date = addDays(state.date, -1); render(); break;
    case 'nextDay': state.date = addDays(state.date, 1); render(); break;
    case 'goToday': state.date = todayStr(); render(); break;
    case 'add': openPicker(); break;
    case 'pick': openEditor(t.dataset.ex, null); break;
    case 'editEntry': openEditor((db.logs[state.date] || []).find(x => x.id === t.dataset.id)?.ex, t.dataset.id); break;
    case 'copyDay': copyDay(t.dataset.date); break;
    case 'hideInstall': ui.hideInstall = true; saveUi(); render(); break;
    case 'libGroup': state.libGroup = t.dataset.g; render(); break;
    case 'exInfo': openExInfo(t.dataset.ex); break;
    case 'newEx': openNewEx(); break;
    case 'histMode': state.histMode = t.dataset.m; render(); break;
    case 'calPrev':
    case 'calNext': {
      const [y, m] = state.calMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + (act === 'calNext' ? 1 : -1), 1);
      state.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      render();
      break;
    }
    case 'openDay': state.date = t.dataset.date; state.tab = 'today'; render(); window.scrollTo(0, 0); break;
    case 'export': exportData(); break;
    case 'import': $('#importFile').click(); break;
    case 'wipe':
      if (confirm('清空全部健身记录和自定义动作？此操作不能撤销，建议先导出备份。') && confirm('再确认一次：真的清空？')) {
        db = emptyDb(); save(); render(); toast('已清空');
      }
      break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'libSearch') {
    state.libQ = e.target.value;
    $('#libList').innerHTML = exerciseList(state.libQ.trim(), state.libGroup, 'exInfo');
  }
});

$('#fab').addEventListener('click', openPicker);
$('#sheetClose').addEventListener('click', closeSheet);
$('#backdrop').addEventListener('click', closeSheet);
document.querySelectorAll('#tabbar button').forEach(b => b.addEventListener('click', () => {
  if (state.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  state.tab = b.dataset.tab;
  if (state.tab === 'hist') state.calMonth = state.date.slice(0, 7);
  window.scrollTo(0, 0);
  render();
}));

// Keep "today" correct when the app is resumed on a later day.
let lastSeenDay = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayStr();
  if (now !== lastSeenDay) {
    if (state.date === lastSeenDay) state.date = now;
    lastSeenDay = now;
    render();
  }
});

// Other tabs or windows writing the same storage.
window.addEventListener('storage', e => { if (e.key === KEY) { db = loadDb(); render(); } });

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
