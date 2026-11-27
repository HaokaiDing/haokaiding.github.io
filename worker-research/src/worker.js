// Single-user password-gated backend for haokaiding.com/research/
//
//   POST /v1/login          {password}         -> {token} (180-day session)
//   POST /v1/logout                            -> {ok: true}
//   GET  /v1/data                              -> {state, config, runs, fleet, updatedAt, syncedAt}
//   PUT  /v1/state          {items, ...}       -> {ok: true, updatedAt}
//   PUT  /v1/snapshot       {config, runs, fleet, syncedAt} -> {ok: true, syncedAt}
//   PUT  /v1/asset/:key     <binary image>     -> {ok: true, key}
//   GET  /v1/asset/:key     (?token=...)       -> binary image (PNG/JPG/SVG)
//
// Secrets:
//   PASSWORD  — user login password (set via wrangler secret put PASSWORD)
//   API_TOKEN — long-lived bearer token for Mac sync (~/.config/research-sync/token)

const ALLOWED_ORIGINS = ['https://haokaiding.com', 'https://www.haokaiding.com'];
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const SESSION_TTL = 180 * 86400;
const BACKUP_TTL = 90 * 86400;
const ASSET_TTL = 60 * 86400;
const LOGIN_WINDOW = 15 * 60;
const LOGIN_MAX_FAILS = 8;

function isAllowedOrigin(origin) {
  return Boolean(
    origin &&
      (ALLOWED_ORIGINS.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  );
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sameSecret(a, b) {
  if (!a || !b) return false;
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function extractToken(request, url) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  if (m) return m[1].trim();
  // Allow query token ONLY for GET /v1/asset/* (so <img> tags can authenticate)
  if (request.method === 'GET' && url.pathname.startsWith('/v1/asset/')) {
    return (url.searchParams.get('token') || '').trim();
  }
  return '';
}

async function authorized(request, env, url) {
  const token = extractToken(request, url);
  if (!token) return false;
  if (env.API_TOKEN && (await sameSecret(token, env.API_TOKEN))) return true;
  return (await env.RESEARCH.get('session:' + hex(await sha256(token)))) !== null;
}

async function handleLogin(request, env, origin) {
  if (!env.PASSWORD) return json({ error: '服务器还没设置密码（请运行 set-secrets.sh）' }, 500, origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const failKey = 'fail:' + ip;
  const fails = Number((await env.RESEARCH.get(failKey)) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    return json({ error: '尝试次数太多，请 15 分钟后再试' }, 429, origin);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400, origin);
  }
  if (!(await sameSecret(String(body?.password || ''), env.PASSWORD))) {
    await env.RESEARCH.put(failKey, String(fails + 1), { expirationTtl: LOGIN_WINDOW });
    return json({ error: '密码不对' }, 401, origin);
  }
  await env.RESEARCH.delete(failKey);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.RESEARCH.put('session:' + hex(await sha256(token)), new Date().toISOString(), {
    expirationTtl: SESSION_TTL,
  });
  return json({ token }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/v1/login' && request.method === 'POST') {
      return handleLogin(request, env, origin);
    }

    if (!(await authorized(request, env, url))) {
      return json({ error: 'unauthorized' }, 401, origin);
    }

    if (path === '/v1/logout' && request.method === 'POST') {
      const token = extractToken(request, url);
      if (token) await env.RESEARCH.delete('session:' + hex(await sha256(token)));
      return json({ ok: true }, 200, origin);
    }

    if (path === '/v1/data' && request.method === 'GET') {
      const [stateRaw, snapRaw, fleetRaw] = await Promise.all([
        env.RESEARCH.get('state', 'json'),
        env.RESEARCH.get('snapshot', 'json'),
        env.RESEARCH.get('fleet', 'json'),
      ]);
      return json(
        {
          state: stateRaw?.state || { version: 2, items: [] },
          updatedAt: stateRaw?.updatedAt || null,
          config: snapRaw?.config || { projects: [], machines: [] },
          runs: snapRaw?.runs || [],
          fleet: fleetRaw || snapRaw?.fleet || null,
          syncedAt: snapRaw?.syncedAt || null,
        },
        200,
        origin
      );
    }

    if (path === '/v1/fleet' && request.method === 'GET') {
      const fleetRaw = await env.RESEARCH.get('fleet', 'json');
      return json({ fleet: fleetRaw || null }, 200, origin);
    }

    if (path === '/v1/fleet' && request.method === 'PUT') {
      const raw = await request.text();
      if (raw.length > 512 * 1024) return json({ error: 'payload too large' }, 413, origin);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid json' }, 400, origin);
      }
      body.pushed_at = new Date().toISOString();
      await env.RESEARCH.put('fleet', JSON.stringify(body));
      return json({ ok: true, pushed_at: body.pushed_at }, 200, origin);
    }

    if (path === '/v1/state' && request.method === 'PUT') {
      const raw = await request.text();
      if (raw.length > MAX_JSON_BYTES) return json({ error: 'payload too large' }, 413, origin);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid json' }, 400, origin);
      }
      const updatedAt = new Date().toISOString();
      const record = { state: body, updatedAt };
      const dayKey = 'backup:' + updatedAt.slice(0, 10);
      await Promise.all([
        env.RESEARCH.put('state', JSON.stringify(record)),
        env.RESEARCH.put(dayKey, JSON.stringify(record), { expirationTtl: BACKUP_TTL }),
      ]);
      return json({ ok: true, updatedAt }, 200, origin);
    }

    if (path === '/v1/snapshot' && request.method === 'PUT') {
      const raw = await request.text();
      if (raw.length > MAX_JSON_BYTES) return json({ error: 'payload too large' }, 413, origin);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid json' }, 400, origin);
      }
      body.syncedAt = body.syncedAt || new Date().toISOString();
      await env.RESEARCH.put('snapshot', JSON.stringify(body));
      return json({ ok: true, syncedAt: body.syncedAt }, 200, origin);
    }

    if (path.startsWith('/v1/asset/')) {
      const key = decodeURIComponent(path.slice('/v1/asset/'.length));
      if (!key || key.length > 200) return json({ error: 'invalid asset key' }, 400, origin);
      const kvKey = 'asset:' + key;

      if (request.method === 'PUT') {
        const buf = await request.arrayBuffer();
        if (buf.byteLength > MAX_ASSET_BYTES) return json({ error: 'asset too large' }, 413, origin);
        const contentType = request.headers.get('Content-Type') || 'image/png';
        await env.RESEARCH.put(kvKey, buf, {
          expirationTtl: ASSET_TTL,
          metadata: { contentType },
        });
        return json({ ok: true, key }, 200, origin);
      }

      if (request.method === 'GET') {
        const { value, metadata } = await env.RESEARCH.getWithMetadata(kvKey, 'arrayBuffer');
        if (!value) return json({ error: 'not found' }, 404, origin);
        return new Response(value, {
          status: 200,
          headers: {
            'Content-Type': metadata?.contentType || 'image/png',
            'Cache-Control': 'private, max-age=3600',
            ...corsHeaders(origin),
          },
        });
      }
    }

    return json({ error: 'not found' }, 404, origin);
  },
};
