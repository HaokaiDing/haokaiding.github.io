import { isBot, roundCoord, buildPointsPayload, corsHeaders, isAllowedOrigin, statsHtml, parseUA, refDomain, pctChange } from './lib.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/hit' && request.method === 'POST') {
      const ua = request.headers.get('User-Agent');
      if (isAllowedOrigin(origin) && !isBot(ua)) {
        const cf = request.cf || {};
        const lat = roundCoord(cf.latitude != null ? parseFloat(cf.latitude) : NaN);
        const lon = roundCoord(cf.longitude != null ? parseFloat(cf.longitude) : NaN);
        const ip = request.headers.get('CF-Connecting-IP') || null;
        const region = cf.region || null;
        const { browser, os } = parseUA(ua);
        const referrer = refDomain(request.headers.get('Referer'));
        await env.DB.prepare('INSERT INTO hits (ts, country, city, lat, lon, ip, region, browser, os, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(Math.floor(Date.now() / 1000), cf.country || null, cf.city || null, lat, lon, ip, region, browser, os, referrer)
          .run();
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/points' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = new Request(url.toString());
      let json;
      const cached = await cache.match(cacheKey);
      if (cached) {
        json = await cached.text();
      } else {
        const grouped = await env.DB.prepare(
          'SELECT country, city, lat, lon, COUNT(*) AS n FROM hits WHERE lat IS NOT NULL AND lon IS NOT NULL GROUP BY lat, lon ORDER BY n DESC'
        ).all();
        const first = await env.DB.prepare('SELECT MIN(ts) AS first FROM hits').first();
        const last30row = await env.DB.prepare('SELECT COUNT(*) AS n FROM hits WHERE ts >= ?').bind(Math.floor(Date.now() / 1000) - 30 * 86400).first();
        json = JSON.stringify(buildPointsPayload(grouped.results || [], first ? first.first : null, last30row ? last30row.n : 0));
        await cache.put(cacheKey, new Response(json, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        }));
      }
      return new Response(json, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders(origin) },
      });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = new Request(url.toString());
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const totals = await env.DB.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS uniques, COUNT(DISTINCT country) AS countries, MIN(ts) AS first FROM hits').first();
      const cityRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM (SELECT 1 FROM hits GROUP BY lat, lon)').first();

      // Period cutoffs (unix seconds) computed from current UTC time.
      const nowMs = Date.now();
      const d = new Date(nowMs);
      const sec = (ms) => Math.floor(ms / 1000);
      const startOfToday = sec(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const startOfMonth = sec(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const startOfYear = sec(Date.UTC(d.getUTCFullYear(), 0, 1));
      const nowSec = sec(nowMs);
      const periodDefs = [
        ['Today', startOfToday],
        ['Last 7 days', nowSec - 7 * 86400],
        ['Last 30 days', nowSec - 30 * 86400],
        ['This month', startOfMonth],
        ['This year', startOfYear],
        ['All time', null],
      ];
      const periods = [];
      for (const [label, cutoff] of periodDefs) {
        const row = cutoff == null
          ? await env.DB.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT ip) AS uniques FROM hits').first()
          : await env.DB.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT ip) AS uniques FROM hits WHERE ts >= ?').bind(cutoff).first();
        periods.push({ label, views: row ? row.views : 0, uniques: row ? row.uniques : 0 });
      }

      const topCountries = (await env.DB.prepare('SELECT country, COUNT(*) AS n FROM hits GROUP BY country ORDER BY n DESC LIMIT 12').all()).results || [];
      const topRegions = (await env.DB.prepare('SELECT region, country, COUNT(*) AS n FROM hits WHERE region IS NOT NULL GROUP BY region, country ORDER BY n DESC LIMIT 12').all()).results || [];
      const topCities = (await env.DB.prepare('SELECT city, country, COUNT(*) AS n FROM hits GROUP BY city, country ORDER BY n DESC LIMIT 12').all()).results || [];
      const topBrowsers = (await env.DB.prepare('SELECT browser, COUNT(*) AS n FROM hits WHERE browser IS NOT NULL GROUP BY browser ORDER BY n DESC LIMIT 8').all()).results || [];
      const topOS = (await env.DB.prepare('SELECT os, COUNT(*) AS n FROM hits WHERE os IS NOT NULL GROUP BY os ORDER BY n DESC LIMIT 8').all()).results || [];
      const topReferrers = (await env.DB.prepare("SELECT referrer, COUNT(*) AS n FROM hits WHERE referrer IS NOT NULL AND referrer NOT IN ('haokaiding.qzz.io', 'haokaiding.github.io', 'haokaiding.com', 'www.haokaiding.com') AND referrer NOT IN ('localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1') AND referrer NOT LIKE '%.local' AND referrer NOT LIKE '%.localhost' GROUP BY referrer ORDER BY n DESC LIMIT 10").all()).results || [];
      const recent = (await env.DB.prepare('SELECT ts, city, region, country, browser, os FROM hits ORDER BY ts DESC LIMIT 50').all()).results || [];

      // Trend series at three granularities (chronological order).
      const dayCut = nowSec - 90 * 86400;
      const weekCut = nowSec - 52 * 7 * 86400;
      const trendDay = (await env.DB.prepare("SELECT date(ts,'unixepoch') AS b, COUNT(*) AS v, COUNT(DISTINCT ip) AS u FROM hits WHERE ts >= ? GROUP BY b ORDER BY b").bind(dayCut).all()).results || [];
      const trendWeek = (await env.DB.prepare("SELECT strftime('%Y-W%W', ts,'unixepoch') AS b, COUNT(*) AS v, COUNT(DISTINCT ip) AS u FROM hits WHERE ts >= ? GROUP BY b ORDER BY b").bind(weekCut).all()).results || [];
      const trendMonth = (await env.DB.prepare("SELECT strftime('%Y-%m', ts,'unixepoch') AS b, COUNT(*) AS v, COUNT(DISTINCT ip) AS u FROM hits GROUP BY b ORDER BY b").all()).results || [];

      // Rolling-window growth: current vs prior period.
      async function win(fromSec, toSec) { // toSec optional upper bound
        const q = toSec
          ? 'SELECT COUNT(*) AS v, COUNT(DISTINCT ip) AS u FROM hits WHERE ts >= ? AND ts < ?'
          : 'SELECT COUNT(*) AS v, COUNT(DISTINCT ip) AS u FROM hits WHERE ts >= ?';
        const r = toSec ? await env.DB.prepare(q).bind(fromSec, toSec).first() : await env.DB.prepare(q).bind(fromSec).first();
        return { v: r ? r.v : 0, u: r ? r.u : 0 };
      }
      const w0 = nowSec - 7 * 86400, w1 = nowSec - 14 * 86400, m0 = nowSec - 30 * 86400, m1 = nowSec - 60 * 86400;
      const curW = await win(w0), prevW = await win(w1, w0), curM = await win(m0), prevM = await win(m1, m0);
      const growth = {
        week: { v: pctChange(curW.v, prevW.v), u: pctChange(curW.u, prevW.u), cur: curW, prev: prevW },
        month: { v: pctChange(curM.v, prevM.v), u: pctChange(curM.u, prevM.u), cur: curM, prev: prevM },
      };

      const data = {
        since: totals ? totals.first : null,
        totalViews: totals ? totals.total : 0,
        uniqueTotal: totals ? totals.uniques : 0,
        countries: totals ? totals.countries : 0,
        cities: cityRow ? cityRow.c : 0,
        periods,
        topCountries, topRegions, topCities, topBrowsers, topOS, topReferrers,
        trend: { day: trendDay, week: trendWeek, month: trendMonth }, growth,
        recent,
      };
      const resp = new Response(statsHtml(data), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
      await cache.put(cacheKey, resp.clone());
      return resp;
    }

    return new Response('Not found', { status: 404 });
  },
};
