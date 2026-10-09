import { WORLD_SVG } from './worldmap.js';

export function isBot(ua) {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|pinterest|w3c_validator|headlesschrome|lighthouse|gptbot|ccbot|claudebot|python-requests|curl|wget|go-http-client|node-fetch|axios|httpclient/i.test(ua);
}

export function roundCoord(n, step = 0.1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}

export function isoMonth(tsSeconds) {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

export function pctChange(cur, prev) {
  if (!prev) return null;            // prev 0/undefined → null (caller renders "new"/"—")
  return Math.round(((cur - prev) / prev) * 100);
}

export function buildPointsPayload(rows, firstTsSeconds, last30 = 0) {
  let total = 0;
  const countries = new Set();
  for (const r of rows) {
    total += r.n;
    if (r.country) countries.add(r.country);
  }
  return {
    since: firstTsSeconds ? isoMonth(firstTsSeconds) : null,
    totalViews: total,
    last30,
    cities: rows.length,
    countries: countries.size,
    points: rows.map(r => ({ lat: r.lat, lon: r.lon, city: r.city, country: r.country, n: r.n })),
  };
}

const ALLOWED_ORIGINS = ['https://haokaiding.com', 'https://www.haokaiding.com'];

export function isAllowedOrigin(origin) {
  return Boolean(origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)));
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export function checkBasicAuth(header, user, pass) {
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function flag(cc) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '\u{1F3F3}\u{FE0F}';
  const up = cc.toUpperCase();
  return String.fromCodePoint(...[...up].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

export function regionName(cc) {
  if (!cc) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc.toUpperCase()) || cc;
  } catch {
    return cc;
  }
}

export function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  return { browser, os };
}

// Local-development hosts: never counted as real referrers (own dev testing).
export const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];

export function isLocalHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return LOCAL_HOSTS.includes(h) || h.endsWith('.local') || h.endsWith('.localhost');
}

export function refDomain(referer) {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname || null;
    return isLocalHost(host) ? null : host;
  } catch { return null; }
}

export function relTime(tsSeconds, nowMs = Date.now()) {
  const s = Math.max(0, Math.floor(nowMs / 1000) - tsSeconds);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

export function fmtN(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function statsHtml(data) {
  const since = data.since ? isoMonth(data.since) : '—';
  const now = Date.now();
  const periods = data.periods || [];
  const topRegions = data.topRegions || [];
  const topBrowsers = data.topBrowsers || [];
  const topOS = data.topOS || [];
  const topReferrers = data.topReferrers || [];
  const trend = data.trend || { day: [], week: [], month: [] };
  const growth = data.growth || {};

  // Inline delta pill for a metric card. n: percent change (null → "new", 0 → "0%").
  const deltaPill = (n, suffix) => {
    const tag = suffix ? ` · ${suffix}` : '';
    if (n == null) return `<span class="delta flat">new${tag}</span>`;
    if (n > 0) return `<span class="delta up">▲ ${n}%${tag}</span>`;
    if (n < 0) return `<span class="delta down">▼ ${Math.abs(n)}%${tag}</span>`;
    return `<span class="delta flat">0%${tag}</span>`;
  };
  const last30 = periods.find(p => p.label === 'Last 30 days');
  const cards =
    `<div class="card"><label>pageviews</label><b class="mv">${fmtN(data.totalViews)}</b>${deltaPill(growth.week ? growth.week.v : null, '7d')}</div>` +
    `<div class="card"><label>unique visitors</label><b class="mv">${fmtN(data.uniqueTotal)}</b>${deltaPill(growth.week ? growth.week.u : null, '7d')}</div>` +
    `<div class="card"><label>countries</label><b class="mv">${fmtN(data.countries)}</b><span class="delta sub">across ${fmtN(data.cities)} cities</span></div>` +
    `<div class="card"><label>last 30 days</label><b class="mv">${fmtN(last30 ? last30.views : 0)}</b>${deltaPill(growth.month ? growth.month.v : null, '30d')}</div>`;

  // Growth pill for the under-cards summary row.
  const gPill = (n) => n == null
    ? '<span class="g-flat">new</span>'
    : n > 0 ? `<span class="g-up">▲ ${n}%</span>`
    : n < 0 ? `<span class="g-down">▼ ${Math.abs(n)}%</span>`
    : '<span class="g-flat">0%</span>';
  const gRow = (label, g) => g
    ? `<span class="g-line"><span class="g-lbl">${label}:</span> views ${gPill(g.v)} · unique ${gPill(g.u)}</span>`
    : '';
  const growthHtml = `${gRow('last 7 days vs prior', growth.week)}${gRow('last 30 days vs prior', growth.month)}`;

  const summary = periods.map(p =>
    `<tr><th scope="row">${esc(p.label)}</th><td class="n">${fmtN(p.views)}</td><td class="n u">${fmtN(p.uniques)}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty">no data yet</td></tr>';

  const cMax = Math.max(1, ...data.topCountries.map(c => c.n));
  const topCountries = data.topCountries.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="nm">${esc(regionName(c.country) || c.country)}</span><span class="track"><i style="width:${Math.round(c.n / cMax * 100)}%"></i></span><span class="ct">${fmtN(c.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topRegionsHtml = topRegions.map(r =>
    `<div class="row"><span class="flag">${flag(r.country)}</span><span class="nm">${esc(r.region || '?')}<span class="cc">${esc(r.country || '')}</span></span><span class="ct">${fmtN(r.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topCities = data.topCities.map(c =>
    `<div class="row"><span class="flag">${flag(c.country)}</span><span class="nm">${esc(c.city || '?')}<span class="cc">${esc(c.country || '')}</span></span><span class="ct">${fmtN(c.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const bMax = Math.max(1, ...topBrowsers.map(b => b.n));
  const topBrowsersHtml = topBrowsers.map(b =>
    `<div class="row"><span class="nm">${esc(b.browser || '?')}</span><span class="track"><i style="width:${Math.round(b.n / bMax * 100)}%"></i></span><span class="ct">${fmtN(b.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const oMax = Math.max(1, ...topOS.map(o => o.n));
  const topOSHtml = topOS.map(o =>
    `<div class="row"><span class="nm">${esc(o.os || '?')}</span><span class="track"><i style="width:${Math.round(o.n / oMax * 100)}%"></i></span><span class="ct">${fmtN(o.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const topReferrersHtml = topReferrers.map(r =>
    `<div class="row"><span class="nm">${esc(r.referrer || '?')}</span><span class="ct">${fmtN(r.n)}</span></div>`
  ).join('') || '<p class="empty">no data yet</p>';

  const recent = data.recent.map(r => {
    const place = [r.city, r.region].filter(Boolean).map(esc).join(', ') || '?';
    const ua = [r.browser, r.os].filter(Boolean).map(esc).join(' · ');
    return `<div class="row"><span class="flag">${flag(r.country)}</span><span class="nm">${place}<span class="cc">${esc(r.country || '')}</span></span>${ua ? `<span class="ua">${ua}</span>` : ''}<span class="when">${relTime(r.ts, now)} ago</span></div>`;
  }).join('') || '<p class="empty">no visits yet</p>';

  const trendJson = JSON.stringify(trend);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>visitor log · haokaiding.com</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"><style>
:root{--ink:#0f1c2e;--muted:#5a6b7b;--soft:#8595a4;--faint:#93a1b0;--accent:#12a07a;--up:#12a07a;--down:#e0564f;--surface:#fff;--line:#eef1f5;--hair:#f4f6f9;--land:#dde3ea}
*{box-sizing:border-box}
body{font-family:'Hanken Grotesk',system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:radial-gradient(120% 80% at 50% -10%,#eef3f8 0%,#f5f7fa 55%) fixed;margin:0;padding:24px;line-height:1.55}
.wrap{max-width:960px;margin:0 auto}
.num,.mv,.ct,.summary td.n,.when{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.card,.sec{background:var(--surface);border:1px solid var(--line);border-radius:15px;box-shadow:0 1px 2px rgba(16,30,46,.04),0 6px 20px rgba(16,30,46,.05)}
.head{display:flex;align-items:baseline;gap:12px;margin:0 0 20px;flex-wrap:wrap}
.head h1{font-size:20px;font-weight:600;letter-spacing:-.01em;margin:0}
.head .sub{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--soft)}
.head .live{margin-left:auto;font-size:12px;color:var(--accent);font-weight:600;display:flex;align-items:center;gap:6px}
.head .live i{width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(18,160,122,.45)}70%{box-shadow:0 0 0 6px rgba(18,160,122,0)}100%{box-shadow:0 0 0 0 rgba(18,160,122,0)}}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.card{padding:14px 16px}
.card label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-weight:600;margin-bottom:6px}
.card .mv{display:block;font-size:27px;font-weight:600;color:var(--ink);line-height:1.1}
.delta{display:inline-block;margin-top:7px;font-size:12px;font-weight:600}
.delta.up{color:var(--up)}.delta.down{color:var(--down)}.delta.flat{color:var(--faint);font-weight:500}
.delta.sub{color:var(--soft);font-weight:500}
.summary{padding:16px 18px;margin-bottom:18px}
.summary table{width:100%;border-collapse:collapse;font-size:14px}
.summary th,.summary td{text-align:right;padding:8px 0;border-top:1px solid var(--hair)}
.summary thead th{border-top:none}
.summary tbody tr:first-child th,.summary tbody tr:first-child td{border-top:1px solid var(--line)}
.summary thead th{color:var(--soft);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-variant:small-caps}
.summary th[scope=row]{text-align:left;font-weight:500;color:var(--ink)}
.summary td.n{color:var(--ink)}
.summary td.u{color:var(--soft)}
.summary td.empty{text-align:center;color:var(--faint)}
.panel{padding:10px;margin-bottom:18px;line-height:0}
.panel svg{width:100%;height:auto;display:block;border-radius:8px}
.vm-land{fill:var(--land)}
.vm-dot{fill:var(--accent);fill-opacity:.9}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;margin-bottom:18px}
.sec{padding:16px 18px}
.h2{font-size:12px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.07em;margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.row{display:flex;align-items:center;gap:11px;padding:8px 0;border-top:1px solid var(--hair);font-size:14px}
.row:first-child{border-top:none}
.flag{font-size:17px;width:22px;flex:none;text-align:center}
.nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc{color:var(--faint);font-size:12px;margin-left:6px}
.ua{flex:none;color:var(--faint);font-size:12px}
.track{flex:1;height:7px;border-radius:6px;background:var(--line)}
.track i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#16b487,#0f8e6a)}
.ct{flex:none;min-width:46px;text-align:right;color:var(--muted)}
.when{flex:none;color:var(--faint);font-size:12px}
.empty{color:var(--faint);font-size:13px;margin:4px 0}
.growth{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0 0 18px;padding:0 2px;font-size:12px;color:var(--muted)}
.g-line{display:inline-flex;align-items:center;gap:6px}
.g-lbl{color:var(--faint)}
.g-up{color:var(--up);font-weight:600}
.g-down{color:var(--down);font-weight:600}
.g-flat{color:var(--faint);font-weight:500}
.seg{display:inline-flex;background:var(--line);border-radius:9px;padding:2px;gap:0}
.seg button{font:12px/1 inherit;font-family:inherit;color:var(--muted);background:transparent;border:none;border-radius:7px;padding:5px 11px;cursor:pointer}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(16,30,46,.08)}
#trend-chart svg{width:100%;height:auto;display:block}
.trend-legend{display:flex;gap:18px;margin-top:10px;font-size:12px;color:var(--muted)}
.trend-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.trend-legend .lg-v{background:#cfeadf}
.trend-legend .lg-u{background:#0f8e6a}
.foot{color:var(--faint);font-size:12px;margin-top:20px;text-align:center}
</style></head><body><div class="wrap">
<div class="head"><h1>visitor log</h1><span class="sub">haokaiding.com · since ${esc(since)}</span><span class="live"><i></i>self-hosted</span></div>
<div class="cards">${cards}</div>
<div class="growth">${growthHtml}</div>
<div class="summary"><div class="h2">visits summary</div><table><thead><tr><th scope="col"></th><th scope="col">Pageviews</th><th scope="col">Unique visitors</th></tr></thead><tbody>${summary}</tbody></table></div>
<div class="card panel">${WORLD_SVG}</div>
<div class="grid">
  <div class="sec"><div class="h2">top countries</div>${topCountries}</div>
  <div class="sec"><div class="h2">top regions</div>${topRegionsHtml}</div>
  <div class="sec"><div class="h2">top cities</div>${topCities}</div>
  <div class="sec"><div class="h2">top browsers</div>${topBrowsersHtml}</div>
  <div class="sec"><div class="h2">top OS</div>${topOSHtml}</div>
  <div class="sec"><div class="h2">top referrers</div>${topReferrersHtml}</div>
</div>
<div class="sec" style="margin-bottom:18px"><div class="h2">recent visits</div>${recent}</div>
<div class="sec"><div class="h2">trends
  <span class="seg"><button data-g="day" class="on">day</button><button data-g="week">week</button><button data-g="month">month</button></span></div>
  <div id="trend-chart"></div>
  <div class="trend-legend"><span><i class="lg-v"></i>pageviews</span><span><i class="lg-u"></i>unique visitors</span></div>
</div>
<p class="foot">self-hosted on Cloudflare</p>
</div>
<script>
(function(){
  fetch('/points').then(function(r){return r.json();}).then(function(d){
    var g=document.getElementById('visitor-dots');
    if(!g||!d.points)return;
    var NS='http://www.w3.org/2000/svg';
    d.points.forEach(function(p){
      if(!isFinite(p.lon)||!isFinite(p.lat))return;
      var x=(p.lon+180)/360*1000, y=(90-p.lat)/180*500;
      var r=Math.min(11,Math.max(3,Math.cbrt(p.n)*1.6));
      var halo=document.createElementNS(NS,'circle');
      halo.setAttribute('cx',x.toFixed(1));halo.setAttribute('cy',y.toFixed(1));halo.setAttribute('r',(r*2.2).toFixed(1));halo.setAttribute('class','vm-dot');halo.setAttribute('fill-opacity','0.16');g.appendChild(halo);
      var c=document.createElementNS(NS,'circle');
      c.setAttribute('cx',x.toFixed(1));c.setAttribute('cy',y.toFixed(1));c.setAttribute('r',r.toFixed(1));c.setAttribute('class','vm-dot');
      var t=document.createElementNS(NS,'title');t.textContent=(p.city||'?')+', '+(p.country||'?')+' — '+p.n;c.appendChild(t);g.appendChild(c);
    });
  }).catch(function(){});

  var TREND=${trendJson};
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function drawTrend(series){
    var el=document.getElementById('trend-chart');
    if(!el)return;
    if(!series.length){el.innerHTML='<p class="empty">no data yet</p>';return;}
    var W=840,H=210,padL=6,padR=6,padT=14,padB=22,n=series.length;
    var maxV=Math.max(1,...series.map(function(d){return d.v;})),iw=W-padL-padR,ih=H-padT-padB,bw=iw/n;
    var yOf=function(val){return padT+ih-val/maxV*ih;};
    var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="visits trend">';
    s+='<defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12a07a" stop-opacity="0.18"/><stop offset="1" stop-color="#12a07a" stop-opacity="0"/></linearGradient></defs>';
    [0.25,0.5,0.75,1].forEach(function(f){var gy=padT+ih-ih*f;
      s+='<line x1="'+padL+'" y1="'+gy.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+gy.toFixed(1)+'" stroke="#eef1f5" stroke-width="1"/>';});
    series.forEach(function(d,i){var bh=d.v/maxV*ih,x=padL+i*bw,y=padT+ih-bh;
      s+='<rect x="'+(x+bw*0.18).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+Math.max(0.5,bw*0.64).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2.5" fill="#cfeadf"><title>'+esc(d.b)+': '+d.v+' views, '+d.u+' unique</title></rect>';});
    var cx=series.map(function(d,i){return padL+i*bw+bw/2;});
    var cy=series.map(function(d){return yOf(d.u);});
    var pts=cx.map(function(x,i){return x.toFixed(1)+','+cy[i].toFixed(1);}).join(' ');
    var base=padT+ih;
    s+='<polygon fill="url(#trendArea)" points="'+cx[0].toFixed(1)+','+base.toFixed(1)+' '+pts+' '+cx[n-1].toFixed(1)+','+base.toFixed(1)+'"/>';
    s+='<polyline fill="none" stroke="#0f8e6a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="'+pts+'"/>';
    cx.forEach(function(x,i){if(i%6===0||i===n-1){s+='<circle cx="'+x.toFixed(1)+'" cy="'+cy[i].toFixed(1)+'" r="2.4" fill="#0f8e6a"/>';}});
    var labels=[0,Math.floor((n-1)/2),n-1].filter(function(v,i,a){return a.indexOf(v)===i;});
    labels.forEach(function(i){var anchor=i===0?'start':i===n-1?'end':'middle';var x=padL+i*bw+bw/2;
      s+='<text x="'+x.toFixed(1)+'" y="'+(H-7)+'" font-size="10" fill="#93a1b0" text-anchor="'+anchor+'">'+esc(series[i].b)+'</text>';});
    s+='</svg>';
    el.innerHTML=s;
  }
  var btns=document.querySelectorAll('.seg button');
  function select(g){btns.forEach(function(b){b.classList.toggle('on',b.getAttribute('data-g')===g);});drawTrend(TREND[g]||[]);}
  btns.forEach(function(b){b.addEventListener('click',function(){select(b.getAttribute('data-g'));});});
  select('day');
})();
</script>
</body></html>`;
}
