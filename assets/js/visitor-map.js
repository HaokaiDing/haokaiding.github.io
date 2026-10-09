const ENDPOINT = 'https://visitors.haokaiding.com';
const VIEW_W = 1000, VIEW_H = 500;

export function project(lon, lat, w, h) {
  return [(lon + 180) / 360 * w, (90 - lat) / 180 * h];
}

export function dotRadius(n, max = 11, min = 2.6) {
  return Math.min(max, Math.max(min, Math.cbrt(n) * 1.55));
}

export function renderDots(doc, points) {
  const g = doc.getElementById('visitor-dots');
  if (!g) return;
  while (g.firstChild) g.removeChild(g.firstChild);
  const NS = 'http://www.w3.org/2000/svg';
  for (const p of points) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    const [x, y] = project(p.lon, p.lat, VIEW_W, VIEW_H);
    const c = doc.createElementNS(NS, 'circle');
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', dotRadius(p.n).toFixed(1));
    c.setAttribute('class', 'vm-dot');
    const t = doc.createElementNS(NS, 'title');
    t.textContent = `${p.city || '?'}, ${p.country || '?'} — ${p.n}`;
    c.appendChild(t);
    g.appendChild(c);
  }
}

function setHeadline(doc, data) {
  const el = doc.getElementById('vmHeadline');
  if (!el) return;
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 864e5);
  const n = data.last30 != null ? data.last30 : 0;
  el.textContent = `${n} pageviews · ${fmt(start)} – ${fmt(now)}`;
}

async function loadPoints(doc) {
  try {
    const res = await fetch(ENDPOINT + '/points', { mode: 'cors', signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderDots(doc, data.points || []);
    setHeadline(doc, data);
  } catch {
    const el = doc.getElementById('vmHeadline');
    if (el) el.textContent = 'visitor map unavailable';
    const fb = doc.getElementById('visitorMapFallback');
    if (fb) fb.classList.add('show-help');
  }
}

function sendBeacon() {
  try {
    if (sessionStorage.getItem('vm_hit')) return;
    sessionStorage.setItem('vm_hit', '1');
  } catch { /* storage blocked: skip the once-per-session guard, beacon anyway */ }
  fetch(ENDPOINT + '/hit', { method: 'POST', keepalive: true, mode: 'cors' }).catch(() => {});
}

if (typeof document !== 'undefined') {
  const start = () => { sendBeacon(); loadPoints(document); };
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
}
