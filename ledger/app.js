'use strict';
// 记账 — web version of the iPhone ledger app. Data lives in localStorage and syncs to the
// haokaiding-ledger worker (worker-ledger/) behind a password; Gemini calls go through it too.

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('api')
  ? new URLSearchParams(location.search).get('api')
  : 'https://ledger-sync.haokaiding.com';

/* ---------- Catalog ---------- */

const CATS = {
  food: { name: '餐饮', e: '🍜', c: '#e07a5f' },
  groceries: { name: '买菜日用', e: '🛒', c: '#6fa58a' },
  transport: { name: '交通', e: '🚗', c: '#5b8fb9' },
  shopping: { name: '购物', e: '🛍️', c: '#c97b9c' },
  housing: { name: '住房', e: '🏠', c: '#a1887f' },
  utilities: { name: '水电通讯', e: '💡', c: '#d9a93a' },
  entertainment: { name: '娱乐', e: '🎮', c: '#9575cd' },
  health: { name: '医疗健康', e: '💊', c: '#3fa79c' },
  travel: { name: '旅行', e: '✈️', c: '#3aa8d8' },
  education: { name: '学习', e: '📚', c: '#7986cb' },
  social: { name: '人情社交', e: '🎁', c: '#e5728f' },
  subscription: { name: '订阅', e: '🔁', c: '#8a9aa6' },
  other: { name: '其他', e: '📦', c: '#9e9a94' },
  salary: { name: '工资', e: '💼', c: '#4f8a3c' },
  bonus: { name: '奖金', e: '⭐', c: '#c9a227' },
  investment: { name: '理财', e: '📈', c: '#2e8b78' },
  refund: { name: '退款报销', e: '↩️', c: '#5b8fb9' },
  otherIncome: { name: '其他收入', e: '➕', c: '#7a9a6a' },
};
const EXPENSE_IDS = ['food', 'groceries', 'transport', 'shopping', 'housing', 'utilities', 'entertainment', 'health', 'travel', 'education', 'social', 'subscription', 'other'];
const INCOME_IDS = ['salary', 'bonus', 'investment', 'refund', 'otherIncome'];
const ALL_IDS = [...EXPENSE_IDS, ...INCOME_IDS];
const catIds = kind => (kind === 'income' ? INCOME_IDS : EXPENSE_IDS);
const fallbackCat = kind => (kind === 'income' ? 'otherIncome' : 'other');
const cat = id => CATS[id] || CATS.other;
const validCat = (id, kind) => (catIds(kind).includes(id) ? id : fallbackCat(kind));

const COMMON_CUR = ['AED', 'CNY', 'USD', 'EUR', 'GBP', 'HKD', 'JPY', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'SGD', 'KRW',
  'TWD', 'MOP', 'THB', 'MYR', 'INR', 'AUD', 'CAD', 'CHF', 'TRY', 'EGP'];
const ALL_CUR = new Set((() => { try { return Intl.supportedValuesOf('currency'); } catch { return COMMON_CUR; } })());

// Built-in keywords so guesses are good before anything is learned. Chinese keywords match as
// substrings; English ones must be whole words ("du" the telecom does not match "dubai mall").
const KEYWORDS = {
  food: ['餐', '饭', '午饭', '晚饭', '早饭', '早餐', '午餐', '晚餐', '夜宵', '外卖', '咖啡', '奶茶', '星巴克', '瑞幸', '麦当劳', '肯德基', '火锅', '烧烤', '面', '饮料', '零食', '甜品', '蛋糕',
    'starbucks', 'costa', 'tim hortons', 'mcdonald', 'mcdonalds', 'kfc', 'burger', 'pizza', 'subway', 'shake shack', 'talabat', 'deliveroo', 'careem food', 'noon food', 'restaurant', 'cafe', 'coffee', 'bakery', 'lunch', 'dinner', 'breakfast', 'shawarma'],
  groceries: ['超市', '买菜', '水果', '日用', '纸巾', '便利店', '枕头', '被子', '床单', '毛巾', '洗衣',
    'carrefour', 'lulu', 'spinneys', 'waitrose', 'choithrams', 'union coop', 'kibsons', 'grocery', 'supermarket', 'hypermarket', '7 eleven', 'instashop'],
  transport: ['打车', '滴滴', '出租', '地铁', '公交', '加油', '油费', '停车', '高铁', '火车', '过路费',
    'uber', 'careem', 'careem hala', 'taxi', 'rta', 'nol', 'salik', 'metro', 'bus', 'adnoc', 'enoc', 'eppco', 'parking', 'petrol', 'fuel', 'darb', 'mawaqif', 'yango', 'bolt'],
  shopping: ['淘宝', '京东', '拼多多', '衣服', '鞋', '购物', '电子', '数码', '电脑', '手机',
    'amazon', 'noon', 'namshi', 'shein', 'ikea', 'zara', 'uniqlo', 'h&m', 'apple store', 'sharaf dg', 'virgin megastore', 'decathlon', 'mall', 'macbook', 'mbp', 'iphone', 'ipad', 'airpods'],
  housing: ['房租', '租房', '租金', '物业', '押金','rent', 'ejari', 'landlord'],
  utilities: ['电费', '水费', '网费', '话费', '宽带', '燃气', '电话卡', '流量', 'dewa', 'addc', 'taqa', 'sewa', 'etisalat', 'du', 'virgin mobile', 'internet', 'electricity', 'sim'],
  entertainment: ['电影', '游戏', 'ktv', '演出', '门票', 'cinema', 'vox', 'reel cinemas', 'steam', 'playstation'],
  health: ['医院', '药', '体检', '牙', '健身', 'pharmacy', 'clinic', 'hospital', 'aster', 'life pharmacy', 'boots', 'gym'],
  travel: ['机票', '酒店', '旅行', '旅游', 'emirates', 'etihad', 'flydubai', 'air arabia', 'booking', 'airbnb', 'agoda', 'hotel'],
  education: ['书', '课程', '学费', '培训', 'kindle', 'coursera', 'udemy', 'tuition'],
  social: ['红包', '礼物', '请客', '份子', 'gift'],
  subscription: ['会员', '订阅', 'icloud', 'netflix', 'spotify', 'youtube', 'chatgpt', 'openai', 'claude', 'anthropic', 'apple music', 'disney', 'osn', 'shahid', 'github'],
  salary: ['工资', '薪水', '兼职', '劳务', 'salary', 'payroll', 'stipend', 'freelance', '补助', '津贴'],
  bonus: ['奖金', '年终奖', 'bonus'],
  investment: ['利息', '分红', '理财', '基金', '股票', 'dividend', 'interest'],
  refund: ['退款', '报销', '返现', 'refund', 'reimbursement', 'cashback'],
};
const KEYWORD_RULES = Object.entries(KEYWORDS).flatMap(([id, words]) =>
  words.map(w => ({ id, kw: w.toLowerCase(), word: /^[\x00-\x7f]+$/.test(w) })));

/* ---------- Helpers ---------- */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(16) + Math.random().toString(16).slice(2));
const fold = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normKey = s => fold(s).replace(/[^\p{L}]/gu, '');
const pad = n => String(n).padStart(2, '0');
const ymOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthStart = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).getTime(); };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const fmtNum = (x, dp = 2) => Number(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const money = (x, cur, sign = '') => `${sign}${cur} ${fmtNum(Math.abs(x))}`;
const localInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nowText = () => { const d = new Date(); return `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())} ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]}`; };

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function busy(text) {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = `<div><span class="spin"></span>${esc(text)}</div>`;
  document.body.appendChild(el);
  return () => el.remove();
}

/* ---------- Storage ---------- */

const KEY = 'ledger.v1';
const AUTH_KEY = 'ledger.auth';
const RATES_KEY = 'ledger.rates';

// Every entry carries `u` (last change, ms); deletions leave a tombstone in `deleted` so two
// copies can be merged without bringing deleted rows back.
function emptyDb() {
  return { v: 1, entries: {}, deleted: {}, settings: { home: 'AED', u: 0 }, reviews: {} };
}
function normalize(d) {
  if (!d || typeof d !== 'object' || typeof d.entries !== 'object') throw new Error('不是有效的记账文件');
  return { v: 1, entries: d.entries || {}, deleted: d.deleted || {}, settings: { home: 'AED', u: 0, ...(d.settings || {}) }, reviews: d.reviews || {} };
}
function loadDb() {
  try { const raw = localStorage.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : emptyDb(); } catch { return emptyDb(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('保存失败：浏览器存储不可用'); }
  categorizer = null;
  scheduleSync();
}

let db = loadDb();
let auth = (() => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch { return {}; } })();
const saveAuth = () => { try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch {} };
const home = () => db.settings.home || 'AED';
const ui = { tab: 'list', month: ymOf(Date.now()) };

/* ---------- Server ---------- */

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + auth.token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    cache: 'no-store',
  });
  let body = null;
  try { body = await r.json(); } catch {}
  if (r.status === 401) { logout(true); throw new Error('登录已失效，请重新输入密码'); }
  if (!r.ok) throw new Error(body?.error || '服务器错误 ' + r.status);
  return body;
}

/* ---------- Exchange rates ---------- */

let rates = (() => { try { return JSON.parse(localStorage.getItem(RATES_KEY)); } catch { return null; } })();
async function refreshRates(force) {
  const base = home();
  if (!force && rates && rates.base === base && Date.now() - rates.fetched < 12 * 3600 * 1000) return;
  try {
    rates = await api('/v1/rates?base=' + base);
    rates.fetched = Date.now();
    try { localStorage.setItem(RATES_KEY, JSON.stringify(rates)); } catch {}
    render();
  } catch {}
}
// Units of `to` per 1 `from`.
function rate(from, to) {
  if (from === to) return 1;
  if (!rates?.rates) return null;
  const r = rates.rates, f = from === rates.base ? 1 : r[from], t = to === rates.base ? 1 : r[to];
  return f && t ? t / f : null;
}
// The entry in the home currency: the rate fixed when it was recorded, else today's rate.
function homeAmount(e) {
  const h = home();
  if (e.currency === h) return e.amount;
  if (e.rateHome === h && e.rate) return round2(e.amount * e.rate);
  const r = rate(e.currency, h);
  return r == null ? null : round2(e.amount * r);
}

/* ---------- Quick parser ("星巴克 25", "+5000 工资", "咖啡 30 USD", "昨天 打车 32") ---------- */

const AMOUNT_RE = /(?<![A-Za-z0-9.,])(?:([A-Za-z]{3})\s*)?([+\-＋－]?)\s*([¥￥$€£₹฿₩]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(元|块|rmb|dhs|dh|[A-Za-z]{3})?(?![A-Za-z0-9]|\.\d)/gid;
const DAY_WORDS = [['大前天', 3], ['前天', 2], ['昨天', 1], ['昨晚', 1], ['今天', 0], ['day before yesterday', 2], ['yesterday', 1], ['today', 0]];
const SYMBOLS = { '¥': 'CNY', '￥': 'CNY', $: 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', '฿': 'THB', '₩': 'KRW' };

// Rare codes count only in capitals, so "pen" or "top" in a merchant name are not currencies.
function curCode(w) {
  const up = w.toUpperCase();
  if (COMMON_CUR.includes(up)) return up;
  return w === up && ALL_CUR.has(up) ? up : null;
}
function curUnit(s) {
  const l = s.toLowerCase();
  if (['元', '块', 'rmb'].includes(l)) return 'CNY';
  if (['dh', 'dhs', 'dirham', 'dirhams'].includes(l)) return 'AED';
  return curCode(s);
}
const cleanText = s => s.split(/\s+/).filter(Boolean).join(' ').replace(/^[ ,，:：;；\-－]+|[ ,，:：;；\-－]+$/g, '');

function parseOne(text) {
  let daysAgo = null;
  for (const [w, d] of DAY_WORDS) {
    const re = new RegExp(w, 'i');
    if (re.test(text)) { text = text.replace(new RegExp(w, 'gi'), ' '); daysAgo = d; break; }
  }
  const matches = [...text.matchAll(AMOUNT_RE)];
  // With several numbers ("7-Eleven 12", "咖啡 2杯 30") the last one is the amount.
  const m = matches[matches.length - 1];
  if (!m) return { merchant: cleanText(text), amount: null, kind: null, currency: null, daysAgo };
  const amount = parseFloat(m[4].replace(/,/g, ''));
  const before = m[1] ? curCode(m[1]) : null;
  const after = m[5] ? curUnit(m[5]) : null;
  const currency = before || (m[3] ? SYMBOLS[m[3]] : null) || after;
  const kind = m[2] === '+' || m[2] === '＋' ? 'income' : m[2] === '-' || m[2] === '－' ? 'expense' : null;
  const idx = m.indices;
  const start = before ? idx[1][0] : [2, 3, 4].map(i => idx[i]).find(r => r && r[1] > r[0])[0];
  const end = after ? idx[5][1] : idx[4][1];
  const rest = text.slice(0, start) + ' ' + text.slice(end);
  return { merchant: cleanText(rest), amount, kind, currency, daysAgo };
}

// Several entries in one line: "打车 32，午饭 45、咖啡 18". A day word carries forward.
function parseMany(text) {
  const parts = text.replace(/[，；;、\n]|,(?!\d{3}(?!\d))/g, '\u001f').split('\u001f');
  let carried = null;
  return parts.map(p => {
    const e = parseOne(p);
    if (e.daysAgo != null) carried = e.daysAgo; else e.daysAgo = carried;
    return e;
  }).filter(e => e.amount != null && e.amount > 0);
}

function dateFromDaysAgo(daysAgo) {
  if (!daysAgo) return Date.now();
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/* ---------- Categorizer: learns from your own history, fully offline ---------- */

function keywordMatch(merchant) {
  const lower = fold(merchant);
  const padded = ' ' + lower.split(/[^\p{L}\p{N}&]+/u).filter(Boolean).join(' ') + ' ';
  let best = null;
  for (const r of KEYWORD_RULES) {
    if (!(r.word ? padded.includes(' ' + r.kw + ' ') : lower.includes(r.kw))) continue;
    if (!best || r.kw.length > best.kw.length || (r.kw.length === best.kw.length && ALL_IDS.indexOf(r.id) < ALL_IDS.indexOf(best.id))) best = r;
  }
  return best?.id || null;
}

const bucket = t => { const d = new Date(t); return (d.getDay() === 0 || d.getDay() === 6 ? 8 : 0) + Math.floor(d.getHours() / 3); };

function topCount(counts) {
  let best = null;
  for (const [k, v] of Object.entries(counts)) {
    if (!best || v > best[1] || (v === best[1] && ALL_IDS.indexOf(k) < ALL_IDS.indexOf(best[0]))) best = [k, v];
  }
  return best;
}

let categorizer = null;
function getCategorizer() {
  if (categorizer) return categorizer;
  const learned = {}, lastUse = {}, freq = { expense: {}, income: {} }, buckets = {};
  for (const e of Object.values(db.entries)) {
    freq[e.kind][e.cat] = (freq[e.kind][e.cat] || 0) + 1;
    const k = normKey(e.merchant);
    if (k) {
      if (!learned[k] || e.date >= learned[k].date) learned[k] = { cat: e.cat, kind: e.kind, date: e.date };
      if (!lastUse[k] || e.date >= lastUse[k].date) lastUse[k] = { name: e.merchant.trim(), date: e.date };
    }
    if (e.kind === 'expense') { const b = (buckets[bucket(e.date)] ||= {}); b[e.cat] = (b[e.cat] || 0) + 1; }
  }
  const recent = Object.values(lastUse).sort((a, b) => b.date - a.date).map(x => x.name);

  function learnedMatch(key) {
    if (learned[key]) return learned[key];
    // Fuzzy: "星巴克" vs "星巴克 mall of emirates". Short ASCII keys match inside unrelated words.
    let best = null, bestK = '';
    for (const [k, v] of Object.entries(learned)) {
      const usable = /[^\x00-\x7f]/.test(k) ? k.length >= 2 : k.length >= 4;
      if (!usable || !(key.includes(k) || (key.length >= 2 && k.startsWith(key)))) continue;
      if (!best || k.length > bestK.length || (k.length === bestK.length && v.date > best.date)) { best = v; bestK = k; }
    }
    return best;
  }

  categorizer = {
    // kind: pass it when fixed by the user or a +/- sign; null lets the merchant decide.
    suggest(merchant, date = Date.now(), kind = null) {
      const key = normKey(merchant);
      const hit = key && learnedMatch(key);
      if (hit && (!kind || hit.kind === kind)) return { cat: hit.cat, kind: hit.kind, src: 'learned' };
      const kw = keywordMatch(merchant);
      if (kw) {
        const k = INCOME_IDS.includes(kw) ? 'income' : 'expense';
        if (!kind || k === kind) return { cat: kw, kind: k, src: 'keyword' };
      }
      kind = kind || 'expense';
      if (kind === 'expense') {
        const counts = buckets[bucket(date)];
        const best = counts && topCount(counts);
        const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
        if (best && best[1] >= 3 && best[1] >= 0.4 * total) return { cat: best[0], kind, src: 'time' };
      }
      const best = topCount(freq[kind]);
      if (best) return { cat: best[0], kind, src: 'frequent' };
      return { cat: fallbackCat(kind), kind, src: 'fallback' };
    },
    ranked(kind, suggested) {
      const counts = freq[kind] || {};
      const base = catIds(kind).slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || catIds(kind).indexOf(a) - catIds(kind).indexOf(b));
      return suggested && base.includes(suggested) ? [suggested, ...base.filter(x => x !== suggested)] : base;
    },
    completions(text, limit = 5) {
      const key = normKey(text);
      if (!key) return recent.slice(0, limit);
      return recent.filter(m => { const n = normKey(m); return n !== key && n.startsWith(key); }).slice(0, limit);
    },
  };
  return categorizer;
}
const weak = src => !['learned', 'keyword', 'ai'].includes(src);

/* ---------- Summaries ---------- */

function entriesIn(from, to) {
  return Object.values(db.entries).filter(e => e.date >= from && e.date < to);
}
function summarize(list) {
  let expense = 0, income = 0, missing = 0;
  const byCat = {};
  for (const e of list) {
    const h = homeAmount(e);
    if (h == null) { missing++; continue; }
    if (e.kind === 'income') income += h; else expense += h;
    if (e.kind === 'expense') { const c = (byCat[e.cat] ||= { total: 0, count: 0 }); c.total += h; c.count++; }
  }
  return { expense: round2(expense), income: round2(income), byCat, missing };
}
function byMerchant(list, kind) {
  const m = {};
  for (const e of list) {
    if (e.kind !== kind) continue;
    const h = homeAmount(e);
    if (h == null) continue;
    const k = normKey(e.merchant) || e.merchant;
    const x = (m[k] ||= { name: e.merchant.trim(), total: 0, count: 0 });
    x.total += h; x.count++;
  }
  return Object.values(m).sort((a, b) => b.total - a.total);
}

/* ---------- Render ---------- */

function render() {
  const app = $('#app');
  if (!auth.token) { app.innerHTML = loginView(); $('#pw')?.focus(); return; }
  const y = window.scrollY;
  app.innerHTML = `<main>${ui.tab === 'list' ? listView() : ui.tab === 'stats' ? statsView() : settingsView()}</main>
    ${ui.tab === 'list' ? `<div class="fab"><div class="row">
      <button class="scan" data-act="scan">📷 识别截图</button>
      <button class="add" data-act="add">＋ 记一笔</button></div></div>` : ''}
    <nav class="tabs"><div class="row">
      ${[['list', '☰', '明细'], ['stats', '◔', '统计'], ['settings', '⚙︎', '设置']].map(([k, ic, name]) =>
        `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${name}</button>`).join('')}
    </div></nav>`;
  window.scrollTo(0, y);
}

function loginView() {
  return `<div class="login">
    <h1 class="serif">记账</h1>
    <p>输入密码，记录会从云端同步下来。</p>
    <form id="loginForm">
      <input id="pw" type="password" autocomplete="current-password" placeholder="密码" enterkeyhint="go" />
      <button class="btn primary" type="submit" style="margin-top:14px">登录</button>
      <div class="err" id="loginErr"></div>
    </form></div>`;
}

function monthHeader() {
  const [y, m] = ui.month.split('-').map(Number);
  const isNow = ui.month >= ymOf(Date.now());
  return `<div class="top"><h1 class="serif">${y}年${m}月</h1>
    <div class="monthnav"><button data-act="prevMonth" aria-label="上个月">‹</button><button data-act="nextMonth" aria-label="下个月" ${isNow ? 'disabled' : ''}>›</button></div></div>`;
}

function summaryCard(s) {
  const bal = round2(s.income - s.expense), h = home();
  return `<div class="card summary num">
    <div><div class="lab">支出 · ${h}</div><div class="val serif">${fmtNum(s.expense)}</div></div>
    <div><div class="lab">收入 · ${h}</div><div class="val serif inc">${fmtNum(s.income)}</div></div>
    <div><div class="lab">结余 · ${h}</div><div class="val serif ${bal < 0 ? 'neg' : ''}">${bal < 0 ? '-' : ''}${fmtNum(Math.abs(bal))}</div></div></div>`;
}

function entryRow(e) {
  const c = cat(e.cat), h = home();
  const sign = e.kind === 'income' ? '+' : '-';
  const ha = homeAmount(e);
  const sub = [c.name, e.note].filter(Boolean).join(' · ');
  const main = e.currency === h || ha == null ? money(e.amount, e.currency, sign) : money(ha, h, sign);
  const orig = e.currency !== h && ha != null ? `<span class="orig">${money(e.amount, e.currency)}</span>` : '';
  return `<button class="entry" data-edit="${e.id}">
    <span class="icon" style="background:${c.c}22">${c.e}</span>
    <span class="mid"><div class="t">${esc(e.merchant || c.name)}</div><div class="s">${esc(sub)}</div></span>
    <span class="amt num ${e.kind === 'income' ? 'inc' : ''}">${main}${orig}</span></button>`;
}

function listView() {
  const from = monthStart(ui.month), to = monthStart(addMonths(ui.month, 1));
  const list = entriesIn(from, to).sort((a, b) => b.date - a.date || b.created - a.created);
  const s = summarize(list);
  const days = new Map();
  for (const e of list) { const k = dayKey(e.date); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
  const h = home();
  let html = monthHeader() + summaryCard(s);
  if (!list.length) html += `<div class="empty">这个月还没有记录<br/>点下面的按钮记一笔</div>`;
  for (const [k, es] of days) {
    const d = new Date(es[0].date);
    const net = round2(es.reduce((a, e) => a + (homeAmount(e) || 0) * (e.kind === 'income' ? 1 : -1), 0));
    html += `<div class="dayhead"><span>${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}</span><span class="num">${money(net, h, net >= 0 ? '+' : '-')}</span></div>
      <div class="card entries">${es.map(entryRow).join('')}</div>`;
  }
  if (s.missing) html += `<p class="hint">有 ${s.missing} 笔外币记录还没有汇率，联网后会自动换算。</p>`;
  return html;
}

function statsView() {
  const from = monthStart(ui.month), to = monthStart(addMonths(ui.month, 1));
  const list = entriesIn(from, to);
  const s = summarize(list), h = home();
  let html = monthHeader() + summaryCard(s);

  const cats = Object.entries(s.byCat).sort((a, b) => b[1].total - a[1].total);
  html += `<div class="sec">支出分类</div>`;
  if (!cats.length) html += `<div class="card empty" style="padding:30px">没有支出</div>`;
  else {
    const max = cats[0][1].total;
    html += `<div class="card bars">${cats.map(([id, c]) => `<div class="barrow">
      <span class="icon" style="width:30px;height:30px;font-size:16px;background:${cat(id).c}22">${cat(id).e}</span>
      <div><div class="name"><span>${cat(id).name}</span><span>${c.count} 笔 · ${Math.round(c.total / s.expense * 100)}%</span></div>
      <div class="track"><div class="fill" style="width:${(c.total / max) * 100}%;background:${cat(id).c}"></div></div></div>
      <span class="v num">${fmtNum(c.total)}</span></div>`).join('')}</div>`;
  }

  const merchants = byMerchant(list, 'expense').filter(m => m.name).slice(0, 6);
  if (merchants.length) {
    html += `<div class="sec">花得最多的地方</div><div class="card">${merchants.map(m =>
      `<div class="kv"><span>${esc(m.name)}<span class="hint" style="margin-left:6px">${m.count} 次</span></span><span class="num">${money(m.total, h)}</span></div>`).join('')}</div>`;
  }

  // Last 6 months, expense vs income.
  const months = [...Array(6)].map((_, i) => addMonths(ui.month, i - 5));
  const sums = months.map(m => summarize(entriesIn(monthStart(m), monthStart(addMonths(m, 1)))));
  const top = Math.max(1, ...sums.map(x => Math.max(x.expense, x.income)));
  html += `<div class="sec">近 6 个月</div><div class="card"><div class="trend">${months.map((m, i) => `<div class="col ${m === ui.month ? 'on' : ''}" data-month="${m}">
      <div class="pair"><div class="b" style="height:${sums[i].expense / top * 100}%;background:var(--accent)"></div><div class="b" style="height:${sums[i].income / top * 100}%;background:var(--income)"></div></div>
      <span class="m">${Number(m.slice(5))}月</span></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>支出</span><span><i style="background:var(--income)"></i>收入</span></div></div>`;

  const rv = db.reviews[ui.month];
  html += `<div class="sec">月度回顾</div>`;
  if (rv) {
    html += `<div class="card review"><h3>${esc(rv.title)}</h3><ul>${rv.highlights.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${rv.suggestion ? `<div class="sug">${esc(rv.suggestion)}</div>` : ''}
      <div class="hint" style="margin:10px 0 0">生成于 ${dayKey(rv.at)}</div></div>
      <button class="btn" data-act="review">重新生成</button>`;
  } else {
    html += `<button class="btn" data-act="review" ${list.length ? '' : 'disabled'}>✨ 生成本月回顾</button>
      <p class="hint">只把汇总数字（分类合计、常去的商家、最大几笔）发给 Gemini，不发送完整账单。</p>`;
  }
  return html;
}

function settingsView() {
  const h = home();
  const count = Object.keys(db.entries).length;
  const opts = COMMON_CUR.map(c => `<option ${c === h ? 'selected' : ''}>${c}</option>`).join('');
  return `<div class="top"><h1 class="serif">设置</h1></div>
    <div class="card">
      <div class="kv"><span>主币种</span><select id="homeCur">${opts}</select></div>
      <div class="kv"><span>汇率</span><span>${rates?.updated ? '更新于 ' + dayKey(rates.updated) : '还没有'}</span></div>
      <div class="kv"><span>记录</span><span>${count} 笔</span></div>
    </div>
    <p class="hint">外币记录按记账当时的汇率换算成主币种；改主币种后，旧记录用今天的汇率换算。</p>
    <div class="sec">云同步</div>
    <div class="card"><div class="kv"><span>状态</span><span id="syncStatus">${esc(syncStatusText())}</span></div></div>
    <button class="btn" data-act="syncNow">立即同步</button>
    <p class="hint">每次保存后自动上传到 ledger-sync.haokaiding.com，服务器每天另存一份备份（保留 90 天）。</p>
    <div class="sec">数据</div>
    <button class="btn" data-act="exportJson">导出 JSON 备份</button>
    <button class="btn" data-act="exportCsv">导出 CSV（Excel 可打开）</button>
    <button class="btn" data-act="importJson">从 JSON 导入（合并）</button>
    <button class="btn danger" data-act="logout" style="margin-top:22px">退出登录</button>
    <p class="hint">退出后这台设备上的本地记录会清除，云端记录保留。</p>`;
}

/* ---------- Sheets ---------- */

let sheetState = null;

// iOS keeps fixed elements on the layout viewport, so the on-screen keyboard covers a sheet's
// bottom and pushes its top bar (取消 / 保存) off screen. Fit sheets to the visible viewport.
if (window.visualViewport) {
  const vv = window.visualViewport, root = document.documentElement.style;
  const fit = () => {
    root.setProperty('--vvh', vv.height + 'px');
    root.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}
function openSheet(html, onMount) {
  const keep = sheetState;
  closeSheet(true);
  sheetState = keep;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = html;
  document.body.append(scrim, sheet);
  scrim.addEventListener('click', () => closeSheet());
  requestAnimationFrame(() => { scrim.classList.add('show'); sheet.classList.add('show'); });
  document.body.style.overflow = 'hidden';
  onMount?.(sheet);
  return sheet;
}
function closeSheet(instant) {
  document.querySelectorAll('.sheet, .scrim').forEach(el => {
    if (instant) { el.remove(); return; }
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  });
  document.body.style.overflow = '';
  sheetState = null;
}

/* Editor: new entry (with quick text) or edit an existing one. */
function openEditor(id) {
  const e = id ? db.entries[id] : null;
  const st = sheetState = {
    id,
    kind: e?.kind || 'expense',
    cat: e?.cat || null,
    catTouched: Boolean(e),
    catSrc: e ? 'learned' : null,
    currency: e?.currency || home(),
    date: e?.date || Date.now(),
    touched: {},
    multi: [],
    aiSeq: 0,
  };
  const curOpts = [...new Set([st.currency, ...COMMON_CUR])].map(c => `<option ${c === st.currency ? 'selected' : ''}>${c}</option>`).join('');
  openSheet(`<div class="bar"><button data-close>取消</button><h2>${e ? '编辑' : '记一笔'}</h2><button class="strong" id="edSave">保存</button></div>
    <div class="body">
      ${e ? '' : `<div class="field quick"><label>说一句，比如：兰州拉面 20、打车 34.5、昨天 +500 卖吹风</label>
        <textarea id="edQuick" rows="1" enterkeyhint="done" autocomplete="off" placeholder="输入金额和用途"></textarea></div>
        <div id="edMulti"></div>`}
      <div id="edSingle">
        <div class="seg" id="edKind"><button data-kind="expense">支出</button><button data-kind="income">收入</button></div>
        <div class="field"><label>金额</label><div class="amountrow">
          <input id="edAmount" class="num" type="text" inputmode="decimal" placeholder="0.00" value="${e ? e.amount : ''}" />
          <select id="edCur">${curOpts}</select></div><div class="hint" id="edConv" style="margin:2px 0 0"></div></div>
        <div class="field"><label>商家 / 用途</label><input id="edMerchant" type="text" autocomplete="off" value="${esc(e?.merchant || '')}" placeholder="例如 Careem" /></div>
        <div class="chips" id="edComp"></div>
        <div class="hint" id="edCatHint" style="margin-top:0"></div>
        <div class="cats" id="edCats"></div>
        <div class="field"><label>时间</label><input id="edDate" type="datetime-local" value="${localInput(st.date)}" /></div>
        <div class="field"><label>备注</label><input id="edNote" type="text" autocomplete="off" value="${esc(e?.note || '')}" /></div>
        ${e ? `<button class="btn danger" id="edDelete">删除这笔</button>` : ''}
      </div>
    </div>`, sheet => {
    const q = sel => sheet.querySelector(sel);
    const refresh = () => renderEditorParts(sheet);
    q('#edKind').addEventListener('click', ev => {
      const k = ev.target.closest('[data-kind]')?.dataset.kind;
      if (!k) return;
      st.kind = k; st.touched.kind = true;
      if (!catIds(k).includes(st.cat)) { st.cat = null; st.catTouched = false; }
      suggestCat(sheet);
    });
    q('#edCats').addEventListener('click', ev => {
      const c = ev.target.closest('[data-cat]')?.dataset.cat;
      if (!c) return;
      st.cat = c; st.catTouched = true; st.catSrc = 'user';
      refresh();
    });
    q('#edComp').addEventListener('click', ev => {
      const m = ev.target.closest('[data-comp]')?.dataset.comp;
      if (m == null) return;
      q('#edMerchant').value = m; st.touched.merchant = true;
      suggestCat(sheet);
    });
    q('#edMerchant').addEventListener('input', () => { st.touched.merchant = true; suggestCat(sheet); });
    q('#edAmount').addEventListener('input', () => { st.touched.amount = true; refresh(); });
    q('#edCur').addEventListener('change', () => { st.currency = q('#edCur').value; st.touched.currency = true; refresh(); });
    q('#edDate').addEventListener('change', () => { const t = new Date(q('#edDate').value).getTime(); if (t) { st.date = t; st.touched.date = true; } });
    q('#edQuick')?.addEventListener('input', () => applyQuick(sheet));
    // The keyboard's 完成 key saves when there's something to save (not while an IME is composing).
    q('#edQuick')?.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault();
      if (st.multi.length || parseFloat(q('#edAmount').value) > 0) saveEditor(sheet);
      else q('#edQuick').blur();
    });
    q('#edSave').addEventListener('click', () => saveEditor(sheet));
    q('#edDelete')?.addEventListener('click', () => {
      if (!confirm('删除这笔记录？')) return;
      delete db.entries[id];
      db.deleted[id] = Date.now();
      save(); closeSheet(); render(); toast('已删除');
    });
    q('[data-close]').addEventListener('click', () => closeSheet());
    sheet.addEventListener('click', ev => { if (ev.target.closest('[data-act="aiText"]')) aiFromText(q('#edQuick').value); });
    if (e) refresh(); else { suggestCat(sheet); setTimeout(() => q('#edQuick').focus(), 260); }
  });
}

function applyQuick(sheet) {
  const st = sheetState, q = s => sheet.querySelector(s);
  const text = q('#edQuick').value;
  const many = parseMany(text);
  st.multi = many.length >= 2 ? many : [];
  const p = many[0] || parseOne(text);
  if (!st.multi.length) {
    if (!st.touched.amount) q('#edAmount').value = p.amount ?? '';
    if (!st.touched.merchant) q('#edMerchant').value = p.merchant || '';
    if (!st.touched.kind && p.kind) st.kind = p.kind;
    if (!st.touched.kind && !p.kind) st.kind = st.kindFromCat || 'expense';
    if (!st.touched.currency) { st.currency = p.currency || home(); q('#edCur').value = st.currency; }
    if (!st.touched.date) { st.date = dateFromDaysAgo(p.daysAgo); q('#edDate').value = localInput(st.date); }
  }
  suggestCat(sheet);
}

// Rules first; Gemini only when the rules had nothing to go on (unknown merchant).
let aiTimer;
function suggestCat(sheet) {
  const st = sheetState;
  const merchant = sheet.querySelector('#edMerchant').value;
  const quickKind = st.touched.kind ? st.kind : (sheet.querySelector('#edQuick') ? parseOne(sheet.querySelector('#edQuick').value).kind : st.kind);
  if (!st.catTouched) {
    const s = getCategorizer().suggest(merchant, st.date, st.touched.kind || quickKind ? st.kind : null);
    st.cat = s.cat; st.catSrc = s.src;
    if (!st.touched.kind) { st.kind = s.kind; st.kindFromCat = s.kind; }
  }
  renderEditorParts(sheet);
  clearTimeout(aiTimer);
  if (!st.catTouched && weak(st.catSrc) && normKey(merchant).length >= 2) {
    const seq = ++st.aiSeq;
    aiTimer = setTimeout(async () => {
      try {
        const amount = parseFloat(sheet.querySelector('#edAmount').value) || null;
        const r = await api('/v1/ai/category', { method: 'POST', body: JSON.stringify({ merchant, amount, kind: st.kind, currency: st.currency }) });
        if (sheetState !== st || st.aiSeq !== seq || st.catTouched) return;
        st.cat = validCat(r.category, st.kind); st.catSrc = 'ai';
        renderEditorParts(sheet);
      } catch {}
    }, 700);
  }
}

function renderEditorParts(sheet) {
  const st = sheetState, q = s => sheet.querySelector(s);
  q('#edKind').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.kind === st.kind));
  const ranked = getCategorizer().ranked(st.kind, st.cat);
  q('#edCats').innerHTML = ranked.map(id => `<button class="cat ${id === st.cat ? 'on' : ''}" data-cat="${id}"><span class="e">${cat(id).e}</span>${cat(id).name}</button>`).join('');
  const srcText = { learned: '按你以前的记录', keyword: '按关键词', ai: 'Gemini 猜的', time: '按这个时段的习惯', frequent: '你最常用的', fallback: '' }[st.catSrc] || '';
  q('#edCatHint').textContent = st.cat && !st.catTouched && srcText ? `分类：${cat(st.cat).name}（${srcText}，可点下面改）` : '';
  const comps = getCategorizer().completions(q('#edMerchant').value, 6);
  q('#edComp').innerHTML = !st.id ? comps.map(m => `<button class="chip" data-comp="${esc(m)}">${esc(m)}</button>`).join('') : '';
  const amt = parseFloat(q('#edAmount').value);
  const old = st.id ? db.entries[st.id] : null;
  const fixed = old && old.currency === st.currency && old.rateHome === home() && old.rate;
  const r = fixed ? old.rate : rate(st.currency, home());
  q('#edConv').textContent = st.currency !== home() && amt > 0
    ? (r ? `≈ ${money(amt * r, home())}（${fixed ? '记账时的汇率' : '今天的汇率'}）` : '还没有汇率，联网后会换算') : '';

  const multi = q('#edMulti');
  if (!multi) return;
  q('#edSingle').style.display = st.multi.length ? 'none' : '';
  const quick = q('#edQuick').value.trim();
  if (st.multi.length) {
    const rows = multiEntries();
    multi.innerHTML = `<div class="hint">识别到 ${rows.length} 笔，保存时一起记：</div>
      <div class="card preview entries">${rows.map(e => entryRow({ ...e, id: '' })).join('').replace(/<button class="entry"/g, '<div class="entry"').replace(/<\/button>/g, '</div>')}</div>`;
  } else {
    multi.innerHTML = quick.length >= 6 && /\p{L}/u.test(quick) && !parseOne(quick).amount
      ? `<button class="btn" data-act="aiText" style="margin:0 0 10px">✨ 让 Gemini 读这句话</button>` : '';
  }
}

function multiEntries() {
  const c = getCategorizer();
  return sheetState.multi.map(p => {
    const kind = p.kind || null;
    const s = c.suggest(p.merchant, Date.now(), kind);
    const currency = p.currency || home();
    return makeEntry({ amount: p.amount, kind: kind || s.kind, cat: s.cat, merchant: p.merchant, note: '', date: dateFromDaysAgo(p.daysAgo), currency });
  });
}

function makeEntry(x) {
  const h = home(), r = rate(x.currency, h);
  const now = Date.now();
  return {
    id: x.id || uid(),
    amount: round2(x.amount),
    kind: x.kind,
    cat: validCat(x.cat, x.kind),
    merchant: (x.merchant || '').trim(),
    note: (x.note || '').trim(),
    date: x.date,
    created: x.created || now,
    currency: x.currency,
    // Fix the rate at record time so old entries don't move with the market.
    rate: x.currency === h ? 1 : r ?? x.rate ?? null,
    rateHome: x.currency === h || r != null ? h : x.rateHome || '',
    u: now,
  };
}

function saveEditor(sheet) {
  const st = sheetState, q = s => sheet.querySelector(s);
  if (st.multi.length) {
    const rows = multiEntries();
    for (const e of rows) db.entries[e.id] = e;
    save(); closeSheet(); ui.month = ymOf(rows[0].date); render(); toast(`已记 ${rows.length} 笔`);
    return;
  }
  const amount = parseFloat(String(q('#edAmount').value).replace(/,/g, ''));
  if (!(amount > 0)) { toast('请填金额'); q('#edAmount').focus(); return; }
  const old = st.id ? db.entries[st.id] : null;
  const sameMoney = old && old.currency === st.currency;
  const e = makeEntry({
    id: st.id, created: old?.created, amount, kind: st.kind, cat: st.cat || fallbackCat(st.kind),
    merchant: q('#edMerchant').value, note: q('#edNote').value, date: st.date, currency: st.currency,
  });
  // Editing keeps the rate fixed when the entry was first recorded.
  if (sameMoney) { e.rate = old.rate; e.rateHome = old.rateHome; }
  db.entries[e.id] = e;
  save(); closeSheet(); ui.month = ymOf(e.date); render(); toast(old ? '已保存' : '已记一笔');
}

/* ---------- Screenshot / free text via Gemini ---------- */

async function imageToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('图片打不开')); i.src = url; });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function scanImage(file) {
  const done = busy('Gemini 正在识别…');
  try {
    const image = await imageToJpeg(file);
    const r = await api('/v1/ai/receipt', { method: 'POST', body: JSON.stringify({ image, mime: 'image/jpeg', currency: home(), now: nowText() }) });
    done();
    if (!r.entries.length) { toast('图里没找到交易'); return; }
    openReview(r.entries, '识别结果');
  } catch (e) {
    done();
    alert('识别失败：' + e.message);
  }
}

async function aiFromText(text) {
  if (!text.trim()) return;
  const done = busy('Gemini 正在读…');
  try {
    const r = await api('/v1/ai/text', { method: 'POST', body: JSON.stringify({ text, source: 'note', currency: home(), now: nowText() }) });
    done();
    if (!r.entries.length) { toast('没读出交易'); return; }
    openReview(r.entries, 'Gemini 读到的');
  } catch (e) {
    done();
    alert('失败：' + e.message);
  }
}

function parseAiDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s).trim());
  if (!m) return null;
  // Date-only answers mean "that day": noon keeps it inside the day.
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0).getTime();
  return d <= Date.now() + 86400000 ? d : null;
}

// Rows from Gemini become editable drafts. A merchant you have categorized before (or a
// built-in keyword) keeps that category; otherwise Gemini's guess is used.
function openReview(rows, title) {
  const c = getCategorizer();
  const drafts = rows.map(r => {
    const kind = String(r.kind).toLowerCase() === 'income' ? 'income' : 'expense';
    const amount = Math.abs(parseFloat(String(r.amount).replace(/[^\d.\-]/g, ''))) || 0;
    const date = parseAiDate(r.date) || Date.now();
    const merchant = String(r.merchant || '').trim();
    const rule = c.suggest(merchant, date, kind);
    const cur = String(r.currency || '').trim().toUpperCase();
    return {
      on: amount > 0, amount, kind, merchant, date,
      cat: rule.src === 'learned' || rule.src === 'keyword' ? rule.cat : validCat(r.category, kind),
      currency: /^[A-Z]{3}$/.test(cur) ? cur : home(),
      note: String(r.note || '').trim(),
    };
  });
  // Possible duplicates: same amount and currency within a day of an existing entry.
  const existing = Object.values(db.entries);
  for (const d of drafts) {
    d.dup = existing.some(e => e.currency === d.currency && Math.abs(e.amount - d.amount) < 0.01 && Math.abs(e.date - d.date) < 86400000);
    if (d.dup) d.on = false;
  }
  const catOpts = (kind, sel) => catIds(kind).map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${cat(id).e} ${cat(id).name}</option>`).join('');
  const sheet = openSheet(`<div class="bar"><button data-close>取消</button><h2>${esc(title)}</h2><button class="strong" id="rvSave">保存</button></div>
    <div class="body"><p class="hint">勾选要记的，可以直接改。${drafts.some(d => d.dup) ? '标了“可能重复”的默认不勾。' : ''}</p>
    <div class="card">${drafts.map((d, i) => `<div class="scanrow" data-i="${i}">
      <input type="checkbox" ${d.on ? 'checked' : ''} data-f="on" />
      <div class="grid">
        <input data-f="merchant" value="${esc(d.merchant)}" placeholder="商家" />
        <input data-f="amount" class="num" inputmode="decimal" value="${d.amount}" />
        <select data-f="kind"><option value="expense" ${d.kind === 'expense' ? 'selected' : ''}>支出</option><option value="income" ${d.kind === 'income' ? 'selected' : ''}>收入</option></select>
        <input data-f="currency" value="${esc(d.currency)}" maxlength="3" style="text-transform:uppercase" />
        <select data-f="cat" class="full">${catOpts(d.kind, d.cat)}</select>
        <input data-f="date" type="datetime-local" class="full" value="${localInput(d.date)}" />
        ${d.note ? `<input data-f="note" class="full" value="${esc(d.note)}" />` : ''}
        ${d.dup ? `<span class="hint full" style="margin:0">⚠️ 可能重复：已有一笔相同金额的记录</span>` : ''}
      </div></div>`).join('')}</div></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', () => closeSheet());
  sheet.addEventListener('change', ev => {
    const row = ev.target.closest('[data-i]');
    if (!row) return;
    const d = drafts[row.dataset.i], f = ev.target.dataset.f;
    if (f === 'on') d.on = ev.target.checked;
    else if (f === 'amount') d.amount = parseFloat(ev.target.value) || 0;
    else if (f === 'date') d.date = new Date(ev.target.value).getTime() || d.date;
    else if (f === 'currency') d.currency = ev.target.value.trim().toUpperCase() || home();
    else if (f === 'kind') { d.kind = ev.target.value; d.cat = validCat(d.cat, d.kind); row.querySelector('[data-f="cat"]').innerHTML = catOpts(d.kind, d.cat); }
    else d[f] = ev.target.value;
  });
  sheet.querySelector('#rvSave').addEventListener('click', () => {
    const pick = drafts.filter(d => d.on && d.amount > 0);
    if (!pick.length) { toast('没有勾选'); return; }
    let last;
    for (const d of pick) { last = makeEntry(d); db.entries[last.id] = last; }
    save(); closeSheet(); ui.month = ymOf(last.date); render(); toast(`已记 ${pick.length} 笔`);
  });
}

/* ---------- Monthly review ---------- */

function reviewFacts(ym) {
  const h = home(), now = Date.now();
  const start = monthStart(ym), end = monthStart(addMonths(ym, 1));
  const inProgress = now >= start && now < end;
  const upTo = inProgress ? now : end;
  const elapsed = inProgress ? new Date(now).getDate() : null;
  const prevStart = monthStart(addMonths(ym, -1));
  const prevEnd = elapsed ? Math.min(start, prevStart + elapsed * 86400000) : start;
  const cur = entriesIn(start, upTo), prev = entriesIn(prevStart, prevEnd), prevFull = entriesIn(prevStart, start);
  const s = summarize(cur), p = summarize(prev);
  const m = x => `${fmtNum(Math.round(x), 0)} ${h}`;
  const cats = Object.entries(s.byCat).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
    .map(([id, c]) => ({ category: cat(id).name, total: m(c.total), count: c.count, comparable_last_month: m(p.byCat[id]?.total || 0) }));
  const exp = cur.filter(e => e.kind === 'expense').map(e => [e, homeAmount(e)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
  const f = {
    month: Number(ym.slice(5)),
    entries_this_period: cur.length,
    expense: m(s.expense), income: m(s.income),
    has_last_month_data: prevFull.length > 0,
    last_month_sparse: cur.length >= 6 && prev.length < cur.length * 0.4,
    comparable_last_month_expense: m(p.expense), comparable_last_month_income: m(p.income),
    expense_by_category: cats,
    top_merchants: byMerchant(cur, 'expense').filter(x => x.name).slice(0, 5).map(x => ({ merchant: x.name, total: m(x.total), count: x.count })),
    largest_expenses: exp.slice(0, 3).map(([e, a]) => ({ merchant: e.merchant, category: cat(e.cat).name, amount: m(a) })),
    income_sources: byMerchant(cur, 'income').slice(0, 4).map(x => ({ source: x.name || '未填', total: m(x.total) })),
  };
  // One purchase that dwarfs the rest (a laptop, a deposit) hides the everyday picture.
  if (exp.length && s.expense > 0 && exp[0][1] / s.expense >= 0.3) {
    f.largest_expense_share = Math.round(exp[0][1] / s.expense * 100) + '%';
    f.expense_without_largest = m(s.expense - exp[0][1]);
    f.largest_expense = exp[0][0].merchant;
  }
  if (elapsed) Object.assign(f, { month_in_progress: true, days_elapsed: elapsed, days_in_month: new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).getDate() });
  return f;
}

async function makeReview() {
  const ym = ui.month;
  const done = busy('Gemini 正在写回顾…');
  try {
    const r = await api('/v1/ai/review', { method: 'POST', body: JSON.stringify({ facts: reviewFacts(ym) }) });
    db.reviews[ym] = { ...r, at: Date.now(), u: Date.now() };
    save(); render();
  } catch (e) {
    alert('生成失败：' + e.message);
  } finally {
    done();
  }
}

/* ---------- Cloud sync ---------- */

function mergeDb(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, t);
  const entries = {};
  for (const d of [a, b]) {
    for (const e of Object.values(d.entries)) {
      const cur = entries[e.id];
      if (!cur || (e.u || 0) > (cur.u || 0)) entries[e.id] = e;
    }
  }
  for (const [id, e] of Object.entries(entries)) if ((deleted[id] || 0) >= (e.u || 0)) delete entries[id];
  const settings = (a.settings.u || 0) >= (b.settings.u || 0) ? a.settings : b.settings;
  const reviews = { ...b.reviews };
  for (const [k, v] of Object.entries(a.reviews)) if (!reviews[k] || (v.u || 0) >= (reviews[k].u || 0)) reviews[k] = v;
  return { v: 1, entries, deleted, settings, reviews };
}

// Key-sorted JSON so two equal documents compare equal regardless of insertion order.
function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x);
}

let syncing = false, syncAgain = false, syncTimer;
function scheduleSync(delay = 1200) {
  if (!auth.token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync() {
  if (!auth.token) return false;
  if (syncing) { syncAgain = true; return false; }
  syncing = true;
  setSyncStatus('同步中…');
  let ok = false;
  try {
    const { data } = await api('/v1/data');
    const remote = data ? normalize(data) : emptyDb();
    const merged = mergeDb(db, remote);
    if (!data || canon(merged) !== canon(remote)) await api('/v1/data', { method: 'PUT', body: JSON.stringify(merged) });
    // Merge again with the current db: something may have been saved while we were waiting.
    const next = mergeDb(db, merged);
    if (canon(next) !== canon(db)) {
      db = next;
      categorizer = null;
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
      if (!sheetState) render();
    }
    auth.last = Date.now();
    delete auth.err;
    ok = true;
  } catch (e) {
    if (auth.token) auth.err = navigator.onLine === false ? '离线，联网后会自动同步' : e.message || '同步失败';
  } finally {
    syncing = false;
    saveAuth();
    setSyncStatus();
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
  return ok;
}

function syncStatusText() {
  if (auth.err) return '⚠️ ' + auth.err;
  if (!auth.last) return '还没同步过';
  const d = new Date(auth.last);
  return `已同步 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function setSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = text || syncStatusText();
}

function logout(expired) {
  if (!expired) api('/v1/logout', { method: 'POST' }).catch(() => {});
  auth = {};
  saveAuth();
  db = emptyDb();
  categorizer = null;
  try { localStorage.removeItem(KEY); } catch {}
  closeSheet(true);
  render();
}

/* ---------- Export / import ---------- */

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportCsv() {
  const h = home();
  const rows = [['日期', '类型', '分类', '商家', '金额', '币种', `折合${h}`, '备注']];
  for (const e of Object.values(db.entries).sort((a, b) => a.date - b.date)) {
    const d = new Date(e.date);
    rows.push([`${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`, e.kind === 'income' ? '收入' : '支出', cat(e.cat).name, e.merchant, e.amount, e.currency, homeAmount(e) ?? '', e.note]);
  }
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
  download(`ledger-${dayKey(Date.now())}.csv`, '﻿' + csv, 'text/csv');
}

/* ---------- Events ---------- */

document.addEventListener('submit', async ev => {
  if (ev.target.id !== 'loginForm') return;
  ev.preventDefault();
  const pw = $('#pw').value;
  if (!pw) return;
  const err = $('#loginErr');
  err.textContent = '';
  try {
    const r = await fetch(API + '/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || '登录失败 ' + r.status);
    auth = { token: body.token };
    saveAuth();
    const done = busy('正在同步…');
    await runSync();
    done();
    refreshRates();
    render();
  } catch (e) {
    err.textContent = navigator.onLine === false ? '没有网络' : e.message;
  }
});

document.addEventListener('click', ev => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; window.scrollTo(0, 0); render(); return; }
  const edit = ev.target.closest('[data-edit]');
  if (edit && edit.dataset.edit) { openEditor(edit.dataset.edit); return; }
  const month = ev.target.closest('[data-month]');
  if (month) { ui.month = month.dataset.month; render(); return; }
  const act = ev.target.closest('[data-act]')?.dataset.act;
  switch (act) {
    case 'add': openEditor(); break;
    case 'scan': $('#scanFile').click(); break;
    case 'prevMonth': ui.month = addMonths(ui.month, -1); render(); break;
    case 'nextMonth': ui.month = addMonths(ui.month, 1); render(); break;
    case 'review': makeReview(); break;
    case 'syncNow': runSync().then(ok => toast(ok ? '已同步' : auth.err || '同步失败')); break;
    case 'exportJson': download(`ledger-${dayKey(Date.now())}.json`, JSON.stringify(db), 'application/json'); break;
    case 'exportCsv': exportCsv(); break;
    case 'importJson': $('#importFile').click(); break;
    case 'logout': if (confirm('退出登录？云端记录会保留。')) logout(); break;
  }
});

document.addEventListener('change', ev => {
  if (ev.target.id === 'homeCur') {
    db.settings = { ...db.settings, home: ev.target.value, u: Date.now() };
    save(); refreshRates(true); render();
  }
});

$('#scanFile').addEventListener('change', ev => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (f) scanImage(f);
});

$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const incoming = normalize(JSON.parse(await f.text()));
    const before = Object.keys(db.entries).length;
    db = mergeDb(db, incoming);
    save(); render();
    toast(`导入完成，新增 ${Object.keys(db.entries).length - before} 笔`);
  } catch (e) {
    alert('导入失败：' + e.message);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { scheduleSync(0); refreshRates(); }
});
window.addEventListener('online', () => scheduleSync(0));

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

render();
if (auth.token) { scheduleSync(0); refreshRates(); }
