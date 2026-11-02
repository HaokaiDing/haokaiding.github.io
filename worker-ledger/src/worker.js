// Single-user backend for /ledger/: one JSON document in KV behind a password, plus the Gemini
// calls (receipt scan, free-text entries, category fallback, monthly review) so the API key
// never reaches the browser.
//
//   POST /v1/login     {password}            -> {token}     (session token, 180 days)
//   POST /v1/logout                          -> {ok}
//   GET  /v1/data                            -> {data, updatedAt}
//   PUT  /v1/data      <- the whole document
//   GET  /v1/rates?base=AED                  -> open.er-api.com table, cached 12 h
//   POST /v1/ai/receipt {image, mime, currency, now}
//   POST /v1/ai/text    {text, source, currency, now}
//   POST /v1/ai/category {merchant, amount, kind, currency}
//   POST /v1/ai/review  {facts}
//   POST /v1/quick      {image | text, source}  -> plain-text summary for a notification
//
// Secrets: PASSWORD (what the user types), API_TOKEN (long-lived token for scripts),
// SHORTCUT_TOKEN (add-only, used by the iPhone shortcuts), GEMINI_KEY, GEMINI_BASE (optional;
// empty = Google). Var: GEMINI_MODEL.
const ALLOWED_ORIGINS = ['https://haokaiding.com', 'https://www.haokaiding.com'];
const DOC_KEY = 'doc';
const MAX_BYTES = 8 * 1024 * 1024;
const SESSION_TTL = 180 * 86400;
const LOGIN_WINDOW = 15 * 60;
const LOGIN_MAX_FAILS = 8;

const EXPENSE = [
  ['food', '餐饮'], ['groceries', '买菜日用'], ['transport', '交通'], ['shopping', '购物'], ['housing', '住房'],
  ['utilities', '水电通讯'], ['entertainment', '娱乐'], ['health', '医疗健康'], ['travel', '旅行'],
  ['education', '学习'], ['social', '人情社交'], ['subscription', '订阅'], ['other', '其他'],
];
const INCOME = [['salary', '工资'], ['bonus', '奖金'], ['investment', '理财'], ['refund', '退款报销'], ['otherIncome', '其他收入']];
const catList = list => list.map(([id, name]) => `${id}=${name}`).join(', ');

function isAllowedOrigin(origin) {
  return Boolean(origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

// Compare SHA-256 digests in constant time so length and prefix do not leak.
async function sameSecret(a, b) {
  if (!a || !b) return false;
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function bearer(request) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  return m ? m[1].trim() : '';
}

async function authorized(request, env) {
  const token = bearer(request);
  if (!token) return false;
  if (env.API_TOKEN && (await sameSecret(token, env.API_TOKEN))) return true;
  return (await env.LEDGER.get('session:' + hex(await sha256(token)))) !== null;
}

async function login(request, env, origin) {
  if (!env.PASSWORD) return json({ error: '服务器还没设置密码' }, 500, origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const failKey = 'fail:' + ip;
  const fails = Number((await env.LEDGER.get(failKey)) || 0);
  if (fails >= LOGIN_MAX_FAILS) return json({ error: '尝试次数太多，请 15 分钟后再试' }, 429, origin);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400, origin);
  }
  if (!(await sameSecret(String(body?.password || ''), env.PASSWORD))) {
    await env.LEDGER.put(failKey, String(fails + 1), { expirationTtl: LOGIN_WINDOW });
    return json({ error: '密码不对' }, 401, origin);
  }
  await env.LEDGER.delete(failKey);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.LEDGER.put('session:' + hex(await sha256(token)), new Date().toISOString(), { expirationTtl: SESSION_TTL });
  return json({ token }, 200, origin);
}

/* ---------- Gemini ---------- */

function geminiEndpoint(env) {
  let base = (env.GEMINI_BASE || '').trim() || 'https://generativelanguage.googleapis.com';
  base = base.replace(/\/+$/, '').replace(/\/v1(beta)?$/, '');
  return `${base}/v1beta/models/${env.GEMINI_MODEL || 'gemini-3.8-flash'}:generateContent`;
}

async function gemini(env, parts, timeoutMs) {
  if (!env.GEMINI_KEY) throw new HttpError(503, '服务器还没配置 Gemini key');
  const url = geminiEndpoint(env);
  const google = new URL(url).host === 'generativelanguage.googleapis.com';
  const headers = { 'Content-Type': 'application/json' };
  if (google) headers['x-goog-api-key'] = env.GEMINI_KEY.trim();
  else headers.Authorization = 'Bearer ' + env.GEMINI_KEY.trim();
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      // Thinking tokens count toward maxOutputTokens on Gemini 3, so leave headroom.
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  if (!r.ok) throw new HttpError(502, `Gemini HTTP ${r.status}: ${text.slice(0, 200)}`);
  // The answer can arrive split over several text parts; thought parts are skipped.
  let answer = '';
  try {
    const parts = JSON.parse(text).candidates[0].content.parts;
    answer = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
  } catch {
    throw new HttpError(502, '返回内容看不懂：' + text.slice(0, 200));
  }
  const open = answer.indexOf('{'), close = answer.lastIndexOf('}');
  try {
    return JSON.parse(answer.slice(open, close + 1));
  } catch {
    throw new HttpError(502, '返回内容看不懂：' + answer.slice(0, 200));
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const header = (currency, now) =>
  `Extract personal finance transactions for a bookkeeping app.\nThe user lives in the UAE; default currency ${currency}. Now is ${now}.`;

const entryFields = `For each entry:
- merchant: short shop/payee name as a person would say it ("Carrefour", "Careem", "房租"), no store codes; for income, the source (employer, client).
- amount: positive number in the currency shown or stated.
- currency: ISO code if shown or stated, else null.
- date: "yyyy-MM-dd HH:mm" or "yyyy-MM-dd" when known; relative dates ("今天", "昨天", "上周五", "yesterday") are relative to now; if the year is missing assume the latest date not after now; null if unknown.
- kind: "income" for salary, refunds, incoming transfers or cashback; otherwise "expense".
- category: expense ids: ${catList(EXPENSE)}; income ids: ${catList(INCOME)}.
- note: short, may be "".`;

const answerShape = `Answer JSON only: {"entries": [{"merchant": "", "amount": 0, "currency": null, "date": null, "kind": "expense", "category": "other", "note": ""}]}
If there is no transaction, answer {"entries": []}.`;

function receiptPrompt(currency, now) {
  return `${header(currency, now)}

The image is one of:
- a shop receipt or invoice → ONE entry: the final total actually paid (after tax, tips and discounts), not line items. Put up to 3 notable items in "note".
- a payment confirmation or notification (bank app, SMS, Apple Pay, Careem, Talabat, Alipay, WeChat…) → one entry.
- a list of transactions (bank statement, card history) → one entry per transaction row.
Skip balances, available credit, pending authorisations that were reversed, and ads.

${entryFields}

${answerShape}`;
}

function textPrompt(text, source, currency, now) {
  const what = source === 'bank'
    ? `The text below is a bank or card notification (SMS / app push), often in English or Arabic.
Only completed purchases, withdrawals, transfers out (expense) and salary, refunds, transfers in (income) count. Return {"entries": []} for OTP codes, declined or failed transactions, pre-authorisations, balance or limit alerts, statements, due-date reminders and promotions.
merchant: the shop or payee only ("CAREEM HALA" → "Careem"); never the bank or the card number. amount: the transaction amount, never the balance.`
    : `The text below is the user's own note, typed or dictated, possibly several transactions in one sentence. Make one entry per transaction.
When the user split a bill with other people ("AA 180 三个人", "和 Alice 吃饭 300 一人一半"), amount = the user's own share and mention the split in note.`;
  return `${header(currency, now)}
${what}

${entryFields}

${answerShape}

Text:
"""
${String(text).slice(0, 2000)}
"""`;
}

function categoryPrompt(merchant, amount, kind, currency) {
  const cats = catList(kind === 'income' ? INCOME : EXPENSE);
  return `You categorize one personal ${kind === 'income' ? 'income' : 'expense'} entry from a bank card or a typed note.
The user lives in the UAE and writes in Chinese or English. Merchant strings may be card descriptors with store codes or city names.
Allowed category ids: ${cats}.
Merchant: "${String(merchant).replace(/"/g, "'").slice(0, 200)}"
Amount: ${amount ? `${amount} ${currency}` : 'unknown'}
Answer with JSON only: {"category": "<one allowed id>"}`;
}

function reviewPrompt(facts) {
  return `Write a short monthly money note for one person, in Simplified Chinese, warm and plain, never preachy.

Rules:
- Quote amounts exactly as they appear in the facts (already formatted, e.g. "1,616 AED"); never compute new totals or percentages.
- If month_in_progress is true, it is only day days_elapsed of days_in_month: say it is in progress, compare only with the comparable_last_month_* figures (last month's same days), and never conclude that spending "dropped" just because the month isn't over.
- If has_last_month_data is false or last_month_sparse is true (tracking started part-way through last month), don't compare with last month at all.
- If largest_expense_share is present, one purchase dominates: name it once, then talk about everyday spending using expense_without_largest.
- If entries_this_period is very small (≤ 3), give one highlight that says so plainly and no suggestion.
- title: ≤ 12 Chinese characters and specific (what stood out), not "X月收支小结".
- The total expense and income are already shown above the text: never restate them.
- highlights: 2–3 items, each one concrete observation with a number from the facts, ≤ 40 characters — e.g. everyday spending without the big purchase, the biggest category and how it compares, the merchant visited most often (count), where income came from. No filler adjectives and no restating the same number twice.
- suggestion: one practical sentence ≤ 30 characters, or "" when nothing useful.

Facts:
${JSON.stringify(facts).slice(0, 8000)}

Answer JSON only: {"title": "", "highlights": [""], "suggestion": ""}`;
}

async function ai(kind, request, env, origin) {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400, origin);
  }
  const currency = /^[A-Z]{3}$/.test(b.currency || '') ? b.currency : 'AED';
  const now = String(b.now || new Date().toISOString()).slice(0, 40);
  try {
    if (kind === 'receipt') {
      if (!b.image || b.image.length > 7_000_000) return json({ error: '图片太大或为空' }, 400, origin);
      const mime = /^image\/(jpeg|png|webp|heic)$/.test(b.mime || '') ? b.mime : 'image/jpeg';
      const out = await gemini(env, [{ inline_data: { mime_type: mime, data: b.image } }, { text: receiptPrompt(currency, now) }], 60000);
      return json({ entries: Array.isArray(out.entries) ? out.entries : [] }, 200, origin);
    }
    if (kind === 'text') {
      const out = await gemini(env, [{ text: textPrompt(b.text || '', b.source, currency, now) }], 40000);
      return json({ entries: Array.isArray(out.entries) ? out.entries : [] }, 200, origin);
    }
    if (kind === 'category') {
      const k = b.kind === 'income' ? 'income' : 'expense';
      const out = await gemini(env, [{ text: categoryPrompt(b.merchant || '', b.amount, k, currency) }], 15000);
      const ids = (k === 'income' ? INCOME : EXPENSE).map(c => c[0]);
      return json({ category: ids.includes(out.category) ? out.category : k === 'income' ? 'otherIncome' : 'other' }, 200, origin);
    }
    if (kind === 'review') {
      const out = await gemini(env, [{ text: reviewPrompt(b.facts || {}) }], 45000);
      return json({
        title: String(out.title || ''),
        highlights: Array.isArray(out.highlights) ? out.highlights.filter(Boolean).map(String) : [],
        suggestion: String(out.suggestion || ''),
      }, 200, origin);
    }
  } catch (e) {
    return json({ error: e.name === 'TimeoutError' ? 'Gemini 超时了，再试一次' : e.message }, e.status || 502, origin);
  }
  return json({ error: 'not found' }, 404, origin);
}

async function getRates(env, base) {
  const cacheKey = 'rates:' + base;
  const cached = await env.LEDGER.get(cacheKey, 'json');
  if (cached && Date.now() - cached.fetched < 12 * 3600 * 1000) return cached;
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (d.result !== 'success') throw new Error('bad rates');
    const out = { base: d.base_code, rates: d.rates, updated: d.time_last_update_unix * 1000, fetched: Date.now() };
    await env.LEDGER.put(cacheKey, JSON.stringify(out));
    return out;
  } catch {
    return cached;
  }
}

async function rates(url, env, origin) {
  const base = /^[A-Z]{3}$/.test(url.searchParams.get('base') || '') ? url.searchParams.get('base') : 'AED';
  const out = await getRates(env, base);
  return out ? json(out, 200, origin) : json({ error: '汇率服务暂时不可用' }, 502, origin);
}

/* ---------- Quick entries from iPhone shortcuts (Back Tap screenshot, bank SMS, dictation) ---------- */

// Entries added here wait under `inbox:<id>` until a client upload contains them, so a client
// that downloaded the document just before can't overwrite them away.
const INBOX = 'inbox:';
const TZ_OFFSET = 4 * 3600 * 1000; // the user is in the UAE (UTC+4, no DST)
const pad2 = n => String(n).padStart(2, '0');
const normKey = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}]/gu, '');

function localNowText() {
  const d = new Date(Date.now() + TZ_OFFSET);
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} ${day}`;
}

// "yyyy-MM-dd[ HH:mm]" in UAE time -> ms; date-only means noon; future dates are model mistakes.
function parseLocalDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s || '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) - TZ_OFFSET;
  return t <= Date.now() + 86400000 ? t : null;
}

async function inboxEntries(env) {
  const { keys } = await env.LEDGER.list({ prefix: INBOX });
  const vals = await Promise.all(keys.map(k => env.LEDGER.get(k.name, 'json')));
  return vals.filter(Boolean);
}

function catLabel(id) {
  return Object.fromEntries([...EXPENSE, ...INCOME])[id] || id;
}

async function quick(request, env) {
  const text = (s, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  let b;
  try {
    b = await request.json();
  } catch {
    return text('记账失败：请求格式不对', 400);
  }
  const doc = (await env.LEDGER.get(DOC_KEY, 'json')) || { entries: {}, deleted: {}, settings: { home: 'AED' } };
  const home = doc.settings?.home || 'AED';
  const now = localNowText();
  let rows;
  try {
    if (b.image) {
      const image = String(b.image).replace(/\s+/g, '');
      if (image.length > 7_000_000) return text('记账失败：截图太大', 400);
      const out = await gemini(env, [{ inline_data: { mime_type: b.mime || 'image/jpeg', data: image } }, { text: receiptPrompt(home, now) }], 60000);
      rows = out.entries;
    } else if (String(b.text || '').trim()) {
      const out = await gemini(env, [{ text: textPrompt(b.text, b.source === 'bank' ? 'bank' : 'note', home, now) }], 40000);
      rows = out.entries;
    } else {
      return text('记账失败：没有收到截图或文字', 400);
    }
  } catch (e) {
    return text('记账失败：' + (e.name === 'TimeoutError' ? 'Gemini 超时了' : e.message), 502);
  }
  rows = (Array.isArray(rows) ? rows : []).filter(r => parseFloat(r.amount) > 0);
  if (!rows.length) return text(b.source === 'bank' ? '这条短信不是交易，没有记' : '没找到交易，没有记');

  // A merchant you categorized before keeps that category; otherwise Gemini's guess.
  const existing = [...Object.values(doc.entries || {}), ...(await inboxEntries(env))];
  const learned = {};
  for (const e of existing) {
    const k = normKey(e.merchant);
    if (k && (!learned[k] || e.date >= learned[k].date)) learned[k] = e;
  }
  const rateTable = await getRates(env, home);
  const saved = [], skipped = [];
  for (const r of rows) {
    const kind = String(r.kind).toLowerCase() === 'income' ? 'income' : 'expense';
    const ids = (kind === 'income' ? INCOME : EXPENSE).map(c => c[0]);
    const merchant = String(r.merchant || '').trim();
    const amount = Math.round(Math.abs(parseFloat(r.amount)) * 100) / 100;
    const cur = String(r.currency || '').trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(cur) ? cur : home;
    const date = parseLocalDate(r.date) || Date.now();
    // The same amount within a day is most likely the same transaction seen twice
    // (a screenshot of the SMS, or two banks notifying one card payment).
    if (existing.some(e => e.currency === currency && Math.abs(e.amount - amount) < 0.01 && Math.abs(e.date - date) < 86400000)) {
      skipped.push(`${merchant} ${amount} ${currency}`);
      continue;
    }
    const hit = learned[normKey(merchant)];
    const category = hit && hit.kind === kind ? hit.cat : ids.includes(r.category) ? r.category : kind === 'income' ? 'otherIncome' : 'other';
    let rate = 1, rateHome = home;
    if (currency !== home) {
      const t = rateTable?.rates?.[currency];
      if (t) rate = Math.round((1 / t) * 1e8) / 1e8;
      else { rate = null; rateHome = ''; }
    }
    const now = Date.now();
    const e = {
      id: crypto.randomUUID().replace(/-/g, ''), amount, kind, cat: category, merchant,
      note: String(r.note || '').trim(), date, created: now, currency, rate, rateHome, u: now,
      via: b.image ? 'screenshot' : b.source === 'bank' ? 'sms' : 'voice',
    };
    await env.LEDGER.put(INBOX + e.id, JSON.stringify(e), { expirationTtl: 365 * 86400 });
    existing.push(e);
    saved.push(`${merchant || catLabel(category)} ${kind === 'income' ? '+' : ''}${amount} ${currency}（${catLabel(category)}）`);
  }
  const lines = [];
  if (saved.length) lines.push(`已记 ${saved.length} 笔：` + saved.join('；'));
  if (skipped.length) lines.push(`可能重复，没记：` + skipped.join('；'));
  return text(lines.join('\n'));
}

async function storeDoc(env, data) {
  // Inbox entries the upload doesn't know yet are folded in; the ones it already has are done.
  const inbox = await inboxEntries(env);
  for (const e of inbox) {
    if (data.entries[e.id] || (data.deleted && data.deleted[e.id])) await env.LEDGER.delete(INBOX + e.id);
    else data.entries[e.id] = e;
  }
  const text = JSON.stringify(data);
  const updatedAt = new Date().toISOString();
  // Keep the first version of each day for 90 days, so a bad sync can be rolled back.
  const backupKey = 'backup:' + updatedAt.slice(0, 10);
  if ((await env.LEDGER.get(backupKey)) === null) {
    const prev = await env.LEDGER.get(DOC_KEY);
    if (prev) await env.LEDGER.put(backupKey, prev, { expirationTtl: 90 * 86400 });
  }
  await env.LEDGER.put(DOC_KEY, text, { metadata: { updatedAt } });
  return updatedAt;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (path === '/v1/login' && request.method === 'POST') return login(request, env, origin);
    if (path === '/v1/quick' && request.method === 'POST') {
      // Shortcuts carry their own token, which can only add entries; the full tokens work too.
      const ok = (env.SHORTCUT_TOKEN && (await sameSecret(bearer(request), env.SHORTCUT_TOKEN))) || (await authorized(request, env));
      return ok ? quick(request, env) : new Response('记账失败：快捷指令的密钥不对', { status: 401 });
    }
    if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401, origin);

    if (path === '/v1/logout' && request.method === 'POST') {
      await env.LEDGER.delete('session:' + hex(await sha256(bearer(request))));
      return json({ ok: true }, 200, origin);
    }

    if (path === '/v1/data') {
      if (request.method === 'GET') {
        const { value, metadata } = await env.LEDGER.getWithMetadata(DOC_KEY);
        let data = value ? JSON.parse(value) : null;
        const inbox = await inboxEntries(env);
        if (inbox.length) {
          data = data || { v: 1, entries: {}, deleted: {}, settings: { home: 'AED', u: 0 }, reviews: {} };
          for (const e of inbox) if (!data.entries[e.id] && !data.deleted?.[e.id]) data.entries[e.id] = e;
        }
        return json({ data, updatedAt: metadata?.updatedAt || null }, 200, origin);
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413, origin);
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          return json({ error: 'invalid json' }, 400, origin);
        }
        if (!data || typeof data !== 'object' || typeof data.entries !== 'object') return json({ error: 'invalid document' }, 400, origin);
        const updatedAt = await storeDoc(env, data);
        return json({ ok: true, updatedAt }, 200, origin);
      }
      return json({ error: 'method not allowed' }, 405, origin);
    }

    if (path === '/v1/rates' && request.method === 'GET') return rates(url, env, origin);
    const m = /^\/v1\/ai\/(receipt|text|category|review)$/.exec(path);
    if (m && request.method === 'POST') return ai(m[1], request, env, origin);
    return json({ error: 'not found' }, 404, origin);
  },
};
