// Fake Lag store: people share lags and effects, the admin approves them.
// Public:  GET /api/items  POST /api/submit  POST /api/like/:id
// Admin:   GET /api/admin/pending  POST /api/admin/:id/(approve|reject|delete)   (Authorization: Bearer ADMIN_KEY)
// Everything else is served from ./public (the admin page).
import Schema from '../../app/renderer/schema.js';

const LIMITS = { submitsPerDay: 5, likesPerItemPerDay: 1, adminFailsPerDay: 20, maxPending: 500, bodyBytes: 10000 };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const day = () => Math.floor(Date.now() / 86400000);
const now = () => Math.floor(Date.now() / 1000);

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const fail = (error, status) => json({ error }, status);

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// who is asking, without storing who they are: a salted hash that changes every day
async function visitor(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  return hex(await sha256(`${env.HASH_SALT || 'dev-salt'}|${day()}|${ip}`)).slice(0, 32);
}

// counts one hit and says whether the visitor is still under the limit
async function underLimit(env, key, limit) {
  const d = day();
  const row = await env.DB.prepare(
    `INSERT INTO hits (k, n, day) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN hits.day = ?2 THEN hits.n + 1 ELSE 1 END, day = ?2
     RETURNING n`).bind(key, d).first();
  return row.n <= limit;
}

async function isAdmin(request, env) {
  const expected = env.ADMIN_KEY;
  if (!expected || expected.length < 24) return false;           // no key configured: nobody is admin
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [a, b] = await Promise.all([sha256(got), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return { error: 'json only', status: 415 };
  const len = Number(request.headers.get('content-length') || 0);
  if (len > LIMITS.bodyBytes) return { error: 'too big', status: 413 };
  // read at most bodyBytes, even when the sender gives no length (chunked): never buffer more
  const reader = request.body ? request.body.getReader() : null, chunks = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.bodyBytes) { reader.cancel(); return { error: 'too big', status: 413 }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
  try { return { value: JSON.parse(new TextDecoder().decode(bytes)) }; } catch { return { error: 'bad json', status: 400 }; }
}

const rowOut = r => ({ id: r.id, likes: r.likes, created: r.created, status: r.status, data: JSON.parse(r.data) });

async function api(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean);   // ['api', ...]
  const m = request.method;

  if (m === 'GET' && parts[1] === 'items' && parts.length === 2) {
    const kind = url.searchParams.get('kind') === 'lag' ? 'lag' : 'effect';
    const order = url.searchParams.get('sort') === 'top' ? 'likes DESC, created DESC' : 'created DESC';
    const { results } = await env.DB.prepare(`SELECT * FROM items WHERE status = 'approved' AND kind = ?1 ORDER BY ${order} LIMIT 100`).bind(kind).all();
    return json({ items: results.map(rowOut) });
  }

  if (m === 'POST' && parts[1] === 'submit' && parts.length === 2) {
    const body = await readJson(request);
    if (body.error) return fail(body.error, body.status);
    const v = Schema.validate(body.value);
    if (!v.ok) return fail(v.error, 400);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `sub:${who}`, LIMITS.submitsPerDay))) return fail('rate', 429);
    const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM items WHERE status = 'pending'`).first();
    if (pending.n >= LIMITS.maxPending) return fail('queue full', 503);
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO items (id, kind, data, created) VALUES (?1, ?2, ?3, ?4)`)
      .bind(id, v.value.kind, JSON.stringify(v.value), now()).run();
    return json({ id, status: 'pending' }, 201);
  }

  if (m === 'POST' && parts[1] === 'like' && parts.length === 3) {
    const id = parts[2];
    if (!ID.test(id)) return fail('not found', 404);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `like:${who}:${id}`, LIMITS.likesPerItemPerDay))) {
      const r = await env.DB.prepare(`SELECT likes FROM items WHERE id = ?1 AND status = 'approved'`).bind(id).first();
      return r ? json({ likes: r.likes, already: true }) : fail('not found', 404);
    }
    const r = await env.DB.prepare(`UPDATE items SET likes = likes + 1 WHERE id = ?1 AND status = 'approved' RETURNING likes`).bind(id).first();
    return r ? json({ likes: r.likes }) : fail('not found', 404);
  }

  if (parts[1] === 'admin') {
    const who = await visitor(request, env);
    // too many wrong keys from this visitor today: stop answering, even with the right key
    const fails = await env.DB.prepare(`SELECT n, day FROM hits WHERE k = ?1`).bind(`adminfail:${who}`).first();
    if (fails && fails.day === day() && fails.n >= LIMITS.adminFailsPerDay) return fail('locked for today', 429);
    if (!(await isAdmin(request, env))) {
      await underLimit(env, `adminfail:${who}`, LIMITS.adminFailsPerDay);
      return fail('unauthorized', 401);
    }
    if (parts[2] !== 'pending' && !ID.test(parts[2] || '')) return fail('not found', 404);

    if (m === 'GET' && parts[2] === 'pending' && parts.length === 3) {
      const { results } = await env.DB.prepare(`SELECT * FROM items WHERE status = 'pending' ORDER BY created ASC LIMIT 100`).all();
      return json({ items: results.map(rowOut) });
    }
    if (m === 'POST' && parts.length === 4 && ['approve', 'reject', 'delete'].includes(parts[3])) {
      const id = parts[2], action = parts[3];
      const q = action === 'delete'
        ? env.DB.prepare(`DELETE FROM items WHERE id = ?1`).bind(id)
        : env.DB.prepare(`UPDATE items SET status = ?2, decided = ?3 WHERE id = ?1`).bind(id, action === 'approve' ? 'approved' : 'rejected', now());
      const r = await q.run();
      return r.meta.changes ? json({ ok: true }) : fail('not found', 404);
    }
  }
  return fail('not found', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // now and then, forget counters older than two days so the table stays small
    if (Math.random() < 0.02) ctx.waitUntil(env.DB.prepare(`DELETE FROM hits WHERE day < ?1`).bind(day() - 2).run().catch(() => {}));
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (e) { console.error(JSON.stringify({ msg: 'api error', path: url.pathname, error: String(e && e.message || e) })); return fail('server error', 500); }
    }
    if (url.pathname === '/') return Response.redirect('https://fake-lag-app.github.io/fake-lag/', 302);
    return fail('not found', 404);
  },
};
