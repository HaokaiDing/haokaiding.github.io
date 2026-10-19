// Single-user sync store for /fit/: one JSON document in KV, guarded by the SYNC_TOKEN secret.
//   GET /v1/data  -> { data, updatedAt } (data is null before the first upload)
//   PUT /v1/data  <- the whole document as JSON
const ALLOWED_ORIGINS = ['https://haokaiding.com', 'https://www.haokaiding.com'];
const DOC_KEY = 'doc';
const MAX_BYTES = 4 * 1024 * 1024;

function isAllowedOrigin(origin) {
  return Boolean(origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function digest(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

// Compare SHA-256 digests in constant time so the token length and prefix do not leak.
async function authorized(request, env) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !env.SYNC_TOKEN) return false;
  const [a, b] = await Promise.all([digest(m[1].trim()), digest(env.SYNC_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname !== '/v1/data') return json({ error: 'not found' }, 404, origin);
    if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401, origin);

    if (request.method === 'GET') {
      const { value, metadata } = await env.FIT.getWithMetadata(DOC_KEY);
      return json({ data: value ? JSON.parse(value) : null, updatedAt: metadata?.updatedAt || null }, 200, origin);
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
      if (!data || typeof data !== 'object' || typeof data.logs !== 'object') return json({ error: 'invalid document' }, 400, origin);
      const updatedAt = new Date().toISOString();
      await env.FIT.put(DOC_KEY, text, { metadata: { updatedAt } });
      return json({ ok: true, updatedAt }, 200, origin);
    }

    return json({ error: 'method not allowed' }, 405, origin);
  },
};
