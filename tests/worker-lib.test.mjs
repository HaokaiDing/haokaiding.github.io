import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBot, roundCoord } from '../worker/src/lib.js';

test('isBot flags crawlers and empty UA', () => {
  assert.equal(isBot(''), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(isBot('curl/8.4.0'), true);
  assert.equal(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'), false);
});

test('roundCoord rounds to 0.1 and rejects non-finite', () => {
  assert.equal(roundCoord(22.547), 22.5);
  assert.equal(roundCoord(-0.1278), -0.1);
  assert.equal(roundCoord('x'), null);
  assert.equal(roundCoord(NaN), null);
});

import { buildPointsPayload, isoMonth, pctChange } from '../worker/src/lib.js';

test('isoMonth formats a unix-seconds timestamp as YYYY-MM (UTC)', () => {
  assert.equal(isoMonth(Date.UTC(2026, 5, 16) / 1000), '2026-06');
});

test('pctChange computes rounded percent change, null when prev is falsy', () => {
  assert.equal(pctChange(120, 100), 20);
  assert.equal(pctChange(80, 100), -20);
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(0, 0), null);
});

test('buildPointsPayload sums views, counts cities/countries, shapes points', () => {
  const rows = [
    { country: 'CN', city: 'Shenzhen', lat: 22.5, lon: 113.9, n: 300 },
    { country: 'US', city: 'Boston', lat: 42.4, lon: -71.1, n: 140 },
    { country: 'CN', city: 'Shanghai', lat: 31.2, lon: 121.5, n: 120 },
  ];
  const p = buildPointsPayload(rows, Date.UTC(2026, 5, 1) / 1000, 7);
  assert.equal(p.totalViews, 560);
  assert.equal(p.last30, 7);
  assert.equal(p.cities, 3);
  assert.equal(p.countries, 2);
  assert.equal(p.since, '2026-06');
  assert.deepEqual(p.points[0], { lat: 22.5, lon: 113.9, city: 'Shenzhen', country: 'CN', n: 300 });
});

test('buildPointsPayload handles empty input', () => {
  const p = buildPointsPayload([], null);
  assert.equal(p.totalViews, 0);
  assert.equal(p.cities, 0);
  assert.equal(p.since, null);
  assert.deepEqual(p.points, []);
});

import { corsHeaders, checkBasicAuth } from '../worker/src/lib.js';

test('corsHeaders echoes allowed origins, falls back otherwise', () => {
  assert.equal(corsHeaders('https://haokaiding.qzz.io')['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
  assert.equal(corsHeaders('https://haokaiding.github.io')['Access-Control-Allow-Origin'], 'https://haokaiding.github.io');
  assert.equal(corsHeaders('http://localhost:4567')['Access-Control-Allow-Origin'], 'http://localhost:4567');
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
  assert.equal(corsHeaders(null)['Access-Control-Allow-Origin'], 'https://haokaiding.qzz.io');
});

test('checkBasicAuth validates the Basic header', () => {
  const header = 'Basic ' + Buffer.from('admin:s3cret').toString('base64');
  assert.equal(checkBasicAuth(header, 'admin', 's3cret'), true);
  assert.equal(checkBasicAuth(header, 'admin', 'wrong'), false);
  assert.equal(checkBasicAuth('Basic not-base64!!', 'admin', 's3cret'), false);
  assert.equal(checkBasicAuth(null, 'admin', 's3cret'), false);
});

import { esc, statsHtml, parseUA, refDomain, isLocalHost } from '../worker/src/lib.js';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  assert.equal(esc(null), '');
});

test('parseUA detects browser + os from common user agents', () => {
  const chromeMac = parseUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36');
  assert.deepEqual(chromeMac, { browser: 'Chrome', os: 'macOS' });

  const safariIos = parseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  assert.deepEqual(safariIos, { browser: 'Safari', os: 'iOS' });

  const edgeWin = parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 Edg/124.0.0.0');
  assert.deepEqual(edgeWin, { browser: 'Edge', os: 'Windows' });

  assert.deepEqual(parseUA(''), { browser: 'Unknown', os: 'Unknown' });
  assert.deepEqual(parseUA(null), { browser: 'Unknown', os: 'Unknown' });
});

test('refDomain extracts hostname, tolerates null + garbage', () => {
  assert.equal(refDomain('https://news.ycombinator.com/item?id=42'), 'news.ycombinator.com');
  assert.equal(refDomain(null), null);
  assert.equal(refDomain(''), null);
  assert.equal(refDomain('not a url'), null);
});

test('refDomain drops local-development hosts (own testing, not a real referrer)', () => {
  assert.equal(refDomain('http://localhost:8080/index.html'), null);
  assert.equal(refDomain('http://127.0.0.1:5500/'), null);
  assert.equal(refDomain('http://0.0.0.0:3000/'), null);
  assert.equal(refDomain('http://mymac.local:1313/'), null);
  // Real external referrers still pass through.
  assert.equal(refDomain('https://news.ycombinator.com/item?id=42'), 'news.ycombinator.com');
});

test('isLocalHost recognizes loopback + mDNS, rejects real hosts', () => {
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(isLocalHost('LOCALHOST'), true);
  assert.equal(isLocalHost('foo.local'), true);
  assert.equal(isLocalHost(null), false);
  assert.equal(isLocalHost('news.ycombinator.com'), false);
});

function fullStatsData(overrides = {}) {
  return {
    since: 1748736000,
    totalViews: 560,
    uniqueTotal: 47,
    countries: 2,
    cities: 3,
    periods: [
      { label: 'Today', views: 5, uniques: 3 },
      { label: 'Last 7 days', views: 40, uniques: 21 },
      { label: 'Last 30 days', views: 120, uniques: 60 },
      { label: 'This month', views: 90, uniques: 44 },
      { label: 'This year', views: 400, uniques: 120 },
      { label: 'All time', views: 560, uniques: 47 },
    ],
    topCountries: [{ country: 'CN', n: 420 }, { country: 'US', n: 140 }],
    topRegions: [{ region: 'Guangdong', country: 'CN', n: 300 }],
    topCities: [{ city: '<x>', country: 'CN', n: 300 }],
    topBrowsers: [{ browser: 'Chrome', n: 400 }, { browser: 'Safari', n: 160 }],
    topOS: [{ os: 'macOS', n: 350 }, { os: 'iOS', n: 210 }],
    topReferrers: [{ referrer: 'news.ycombinator.com', n: 12 }],
    trend: {
      day: [{ b: '2026-06-15', v: 8, u: 5 }, { b: '2026-06-16', v: 12, u: 7 }],
      week: [{ b: '2026-W23', v: 40, u: 21 }, { b: '2026-W24', v: 55, u: 28 }],
      month: [{ b: '2026-05', v: 90, u: 44 }, { b: '2026-06', v: 120, u: 60 }],
    },
    growth: {
      week: { v: 20, u: 8, cur: { v: 55, u: 28 }, prev: { v: 46, u: 26 } },
      month: { v: -5, u: 2, cur: { v: 120, u: 60 }, prev: { v: 126, u: 59 } },
    },
    recent: [{ ts: 1750000000, city: 'Boston', region: 'Massachusetts', country: 'US', browser: 'Firefox', os: 'Linux' }],
    ...overrides,
  };
}

test('statsHtml renders totals, country/city rows, and escapes values', () => {
  const html = statsHtml(fullStatsData());
  assert.match(html, /560/);
  assert.match(html, /CN/);
  assert.match(html, /Boston/);
  assert.match(html, /&lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /top countries/i);
  assert.match(html, /top cities/i);
  assert.match(html, /recent visits/i);
});

test('statsHtml renders the new MMV-parity sections', () => {
  const html = statsHtml(fullStatsData());
  assert.match(html, /unique/i);
  assert.match(html, /47/);                 // uniqueTotal metric
  assert.match(html, /All time/);           // visits summary period row
  assert.match(html, /This year/i);
  assert.match(html, /top regions/i);
  assert.match(html, /browsers/i);
  assert.match(html, /Guangdong/);
  assert.match(html, /Chrome/);
  assert.match(html, /news\.ycombinator\.com/);
  assert.match(html, /Firefox/);
});

test('statsHtml renders the trends chart, legend, toggle, and growth deltas', () => {
  const html = statsHtml(fullStatsData());
  assert.match(html, /trends/i);                 // trends section heading
  assert.match(html, /pageviews/i);              // legend label
  assert.match(html, /unique/i);                 // legend label
  assert.match(html, /data-g="day"/);            // toggle buttons
  assert.match(html, /data-g="week"/);
  assert.match(html, /data-g="month"/);
  assert.match(html, /2026-W24/);                // embedded trend data
  assert.match(html, /2026-06-16/);              // embedded day bucket
  assert.match(html, /%|new/);                   // a growth indicator (pct or "new")
  assert.doesNotMatch(html, /last 90 days/i);    // old daily section is gone
});

import { isAllowedOrigin } from '../worker/src/lib.js';

test('statsHtml renders an em dash (not 1970) for an empty database', () => {
  const html = statsHtml({
    since: null, totalViews: 0, uniqueTotal: 0, countries: 0, cities: 0,
    periods: [
      { label: 'Today', views: 0, uniques: 0 },
      { label: 'Last 7 days', views: 0, uniques: 0 },
      { label: 'Last 30 days', views: 0, uniques: 0 },
      { label: 'This month', views: 0, uniques: 0 },
      { label: 'This year', views: 0, uniques: 0 },
      { label: 'All time', views: 0, uniques: 0 },
    ],
    topCountries: [], topRegions: [], topCities: [], topBrowsers: [], topOS: [], topReferrers: [],
    trend: { day: [], week: [], month: [] },
    growth: {
      week: { v: null, u: null, cur: { v: 0, u: 0 }, prev: { v: 0, u: 0 } },
      month: { v: null, u: null, cur: { v: 0, u: 0 }, prev: { v: 0, u: 0 } },
    },
    recent: [],
  });
  assert.doesNotMatch(html, /1970/);
  assert.match(html, /visitor log/);
  assert.match(html, /since —/);
  assert.match(html, /no data yet/);             // empty trend chart empty-state
});

test('isAllowedOrigin accepts allowlisted + localhost, rejects others', () => {
  assert.equal(isAllowedOrigin('https://haokaiding.qzz.io'), true);
  assert.equal(isAllowedOrigin('https://haokaiding.github.io'), true);
  assert.equal(isAllowedOrigin('https://haokaiding.com'), true);
  assert.equal(isAllowedOrigin('https://www.haokaiding.com'), true);
  assert.equal(isAllowedOrigin('http://localhost:4567'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin(null), false);
});
