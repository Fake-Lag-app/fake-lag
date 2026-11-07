// Fake Lag store: people share lags and effects, the admin approves them.
// Public:  GET /api/items  GET /api/announce  POST /api/submit  POST /api/like/:id  POST /api/report/:id
//          POST /api/ai (setup helper)  POST /api/chat/send  POST /api/chat/thread (talk to the admin)
// Admin (Authorization: Bearer ADMIN_KEY):
//   GET  /api/admin/(pending|items|stats|config|blocks|log|threads)  GET /api/admin/thread/:k  POST /api/admin/thread/:k/(reply|close)
//   POST /api/admin/(config|bulk|unblock)  POST /api/admin/:id/(approve|reject|delete|unpublish|feature|unfeature|clearReports|block|edit)
// Everything else is served from ./public (the admin page).
import Schema from '../../app/renderer/schema.js';
import { askAI, cleanDiag, cleanHistory } from './help.js';

const LIMITS = { submitsPerDay: 5, likesPerItemPerDay: 1, adminFailsPerDay: 20, maxPending: 500, bodyBytes: 10000,
  chatPerDay: 20, aiPerDay: 40, chatText: 1000, maxOpenThreads: 2000 };
const THREAD = /^[0-9a-f]{32}$/;
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

const rowOut = r => ({ id: r.id, likes: r.likes, created: r.created, status: r.status, featured: !!r.featured, data: JSON.parse(r.data) });
const adminRow = r => ({ ...rowOut(r), reports: r.reports | 0, decided: r.decided, sender: (r.sender || r.ipk || '').slice(0, 8) });

// ---------- settings the admin can change ----------
const CONFIG_DEFAULTS = { paused: false, submitsPerDay: LIMITS.submitsPerDay, autoHide: 5, banned: [], announce: null };
async function loadConfig(env) {
  const { results } = await env.DB.prepare(`SELECT k, v FROM config`).all();
  const c = { ...CONFIG_DEFAULTS };
  for (const r of results) { try { if (r.k in c) c[r.k] = JSON.parse(r.v); } catch {} }
  return c;
}
const plain = (s, max) => String(s == null ? '' : s).replace(/[<>\u0000‮]/g, '').trim().slice(0, max);
// whatever the admin sends is checked and clamped like anything else
function cleanConfig(input, cur) {
  const c = { ...cur }, i = input && typeof input === 'object' ? input : {};
  if ('paused' in i) c.paused = !!i.paused;
  if ('submitsPerDay' in i) c.submitsPerDay = Math.max(0, Math.min(50, Math.round(Number(i.submitsPerDay)) || 0));
  if ('autoHide' in i) c.autoHide = Math.max(0, Math.min(100, Math.round(Number(i.autoHide)) || 0));
  if ('banned' in i) c.banned = [...new Set((Array.isArray(i.banned) ? i.banned : []).map(w => plain(w, 30).toLowerCase()).filter(Boolean))].slice(0, 200);
  if ('announce' in i) {
    const a = i.announce;
    const he = plain(a && a.he, 200), en = plain(a && a.en, 200);
    c.announce = he || en ? { he, en, level: a.level === 'warn' ? 'warn' : 'info', until: Math.max(0, Number(a.until) | 0), id: Date.now().toString(36) } : null;
  }
  return c;
}
const liveAnnounce = c => (c.announce && (!c.announce.until || c.announce.until > now()) ? c.announce : null);
const hasBanned = (value, banned) => { const s = JSON.stringify(value).toLowerCase(); return banned.find(w => s.includes(w)); };

const stableKey = async (env, kind, raw) => hex(await sha256(`${env.HASH_SALT || 'dev-salt'}|${kind}|${raw}`)).slice(0, 32);
const INST = /^[0-9a-f-]{16,40}$/i;

async function audit(env, action, item, note) {
  await env.DB.prepare(`INSERT INTO log (t, action, item, note) VALUES (?1, ?2, ?3, ?4)`).bind(now(), action, item || null, note ? String(note).slice(0, 200) : null).run();
}

// download counts of the app, straight from the public GitHub releases
async function downloads() {
  try {
    const r = await fetch('https://api.github.com/repos/Fake-Lag-app/fake-lag/releases?per_page=30', {
      headers: { 'user-agent': 'fake-lag-store', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000), cf: { cacheTtl: 600 } });
    if (!r.ok) return null;
    const rel = await r.json();
    const list = rel.map(x => ({ tag: String(x.tag_name).slice(0, 20), n: (x.assets || []).reduce((s, a) => s + (a.download_count | 0), 0) }));
    return { total: list.reduce((s, x) => s + x.n, 0), releases: list.slice(0, 10) };
  } catch { return null; }
}

const ITEM_ACTIONS = ['approve', 'reject', 'delete', 'unpublish', 'feature', 'unfeature', 'clearReports', 'block'];
async function itemAction(env, id, action) {
  if (action === 'block') {
    const it = await env.DB.prepare(`SELECT sender, ipk FROM items WHERE id = ?1`).bind(id).first();
    if (!it) return false;
    for (const k of [it.sender, it.ipk].filter(Boolean)) {
      await env.DB.prepare(`INSERT OR IGNORE INTO blocks (k, created, note) VALUES (?1, ?2, ?3)`).bind(k, now(), id.slice(0, 8)).run();
    }
    // everything this sender has in the store or waiting goes away with them
    await env.DB.prepare(`UPDATE items SET status = 'rejected', decided = ?3, featured = 0 WHERE (?1 IS NOT NULL AND sender = ?1) OR (?2 IS NOT NULL AND ipk = ?2) OR id = ?4`)
      .bind(it.sender || null, it.ipk || null, now(), id).run();
    return true;
  }
  const q = {
    approve: [`UPDATE items SET status = 'approved', decided = ?2, reports = 0 WHERE id = ?1`, true],
    reject: [`UPDATE items SET status = 'rejected', decided = ?2, featured = 0 WHERE id = ?1`, true],
    unpublish: [`UPDATE items SET status = 'pending', decided = ?2, featured = 0 WHERE id = ?1`, true],
    delete: [`DELETE FROM items WHERE id = ?1`, false],
    feature: [`UPDATE items SET featured = 1 WHERE id = ?1 AND status = 'approved'`, false],
    unfeature: [`UPDATE items SET featured = 0 WHERE id = ?1`, false],
    clearReports: [`UPDATE items SET reports = 0 WHERE id = ?1`, false],
  }[action];
  const st = env.DB.prepare(q[0]);
  const r = await (q[1] ? st.bind(id, now()) : st.bind(id)).run();
  return r.meta.changes > 0;
}

async function api(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean);   // ['api', ...]
  const m = request.method;

  if (m === 'GET' && parts[1] === 'items' && parts.length === 2) {
    const kind = url.searchParams.get('kind') === 'lag' ? 'lag' : 'effect';
    const order = url.searchParams.get('sort') === 'top' ? 'likes DESC, created DESC' : 'created DESC';
    const { results } = await env.DB.prepare(`SELECT * FROM items WHERE status = 'approved' AND kind = ?1 ORDER BY featured DESC, ${order} LIMIT 100`).bind(kind).all();
    return json({ items: results.map(rowOut) });
  }

  // what the app shows at the top: the admin's announcement, and whether sharing is open
  if (m === 'GET' && parts[1] === 'announce' && parts.length === 2) {
    const c = await loadConfig(env);
    return new Response(JSON.stringify({ announce: liveAnnounce(c), submitOpen: !c.paused }), { headers: { ...HEADERS, 'cache-control': 'public, max-age=60' } });
  }

  if (m === 'POST' && parts[1] === 'submit' && parts.length === 2) {
    const body = await readJson(request);
    if (body.error) return fail(body.error, body.status);
    const inst = body.value && typeof body.value.inst === 'string' && INST.test(body.value.inst) ? body.value.inst : '';
    const v = Schema.validate(body.value);
    if (!v.ok) return fail(v.error, 400);
    const c = await loadConfig(env);
    if (c.paused) return fail('paused', 503);
    if (hasBanned(v.value, c.banned)) return fail('word', 400);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `sub:${who}`, c.submitsPerDay))) return fail('rate', 429);
    const ipk = await stableKey(env, 'ip', request.headers.get('cf-connecting-ip') || 'local');
    const sender = inst ? await stableKey(env, 'inst', inst) : null;
    const blocked = await env.DB.prepare(`SELECT 1 FROM blocks WHERE k = ?1 OR k = ?2 LIMIT 1`).bind(ipk, sender || ipk).first();
    // a blocked sender is told it worked, so they have no reason to try another way
    if (blocked) return json({ id: crypto.randomUUID(), status: 'pending' }, 201);
    const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM items WHERE status = 'pending'`).first();
    if (pending.n >= LIMITS.maxPending) return fail('queue full', 503);
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO items (id, kind, data, created, sender, ipk) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(id, v.value.kind, JSON.stringify(v.value), now(), sender, ipk).run();
    return json({ id, status: 'pending' }, 201);
  }

  if (m === 'POST' && (parts[1] === 'like' || parts[1] === 'report') && parts.length === 3) {
    const id = parts[2], like = parts[1] === 'like';
    if (!ID.test(id)) return fail('not found', 404);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `${parts[1]}:${who}:${id}`, 1))) {
      const r = await env.DB.prepare(`SELECT likes FROM items WHERE id = ?1 AND status = 'approved'`).bind(id).first();
      return r ? json(like ? { likes: r.likes, already: true } : { ok: true, already: true }) : fail('not found', 404);
    }
    if (like) {
      const r = await env.DB.prepare(`UPDATE items SET likes = likes + 1 WHERE id = ?1 AND status = 'approved' RETURNING likes`).bind(id).first();
      return r ? json({ likes: r.likes }) : fail('not found', 404);
    }
    const r = await env.DB.prepare(`UPDATE items SET reports = reports + 1 WHERE id = ?1 AND status = 'approved' RETURNING reports, featured`).bind(id).first();
    if (!r) return fail('not found', 404);
    const c = await loadConfig(env);
    // enough people complained: off the store and back to the admin's queue until it is looked at
    if (c.autoHide && r.reports >= c.autoHide && !r.featured) {
      await env.DB.prepare(`UPDATE items SET status = 'pending' WHERE id = ?1`).bind(id).run();
      await audit(env, 'autoHide', id, `${r.reports} reports`);
    }
    return json({ ok: true });
  }

  // ---------- help: the AI helper (nothing stored) ----------
  if (m === 'POST' && parts[1] === 'ai' && parts.length === 2) {
    const body = await readJson(request);
    if (body.error) return fail(body.error, body.status);
    const b = body.value || {};
    const messages = cleanHistory(b.messages);
    if (!messages) return fail('bad request', 400);
    if (!env.AI) return fail('ai offline', 503);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `ai:${who}`, LIMITS.aiPerDay))) return fail('rate', 429);
    try {
      const out = await askAI(env, { messages, diag: cleanDiag(b.diag), lang: b.lang === 'en' ? 'en' : 'he' });
      return json(out);
    } catch (e) {
      console.error(JSON.stringify({ msg: 'ai error', error: String(e && e.message || e) }));
      return fail('ai busy', 503);
    }
  }

  // ---------- help: messages to the admin, one thread per install ----------
  if (m === 'POST' && parts[1] === 'chat' && parts.length === 3 && (parts[2] === 'send' || parts[2] === 'thread')) {
    const body = await readJson(request);
    if (body.error) return fail(body.error, body.status);
    const b = body.value || {};
    if (typeof b.inst !== 'string' || !INST.test(b.inst)) return fail('bad request', 400);
    const k = await stableKey(env, 'inst', b.inst);

    if (parts[2] === 'thread') {
      const { results } = await env.DB.prepare(`SELECT id, t, who, text FROM msgs WHERE k = ?1 ORDER BY id DESC LIMIT 100`).bind(k).all();
      await env.DB.prepare(`UPDATE threads SET unread_user = 0 WHERE k = ?1 AND unread_user > 0`).bind(k).run();
      return json({ msgs: results.reverse() });
    }

    const text = plain(b.text, LIMITS.chatText);
    if (!text) return fail('empty', 400);
    const who = await visitor(request, env);
    if (!(await underLimit(env, `chat:${who}`, LIMITS.chatPerDay))) return fail('rate', 429);
    const ipk = await stableKey(env, 'ip', request.headers.get('cf-connecting-ip') || 'local');
    const blocked = await env.DB.prepare(`SELECT 1 FROM blocks WHERE k = ?1 OR k = ?2 LIMIT 1`).bind(ipk, k).first();
    if (blocked) return json({ ok: true });     // looks sent, goes nowhere
    const exists = await env.DB.prepare(`SELECT 1 FROM threads WHERE k = ?1`).bind(k).first();
    if (!exists) {
      const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM threads WHERE status = 'open'`).first();
      if (open.n >= LIMITS.maxOpenThreads) return fail('busy', 503);
    }
    const diag = JSON.stringify(cleanDiag(b.diag)), nick = plain(b.nick, 24) || null, t = now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO threads (k, created, updated, unread_admin, nick, diag) VALUES (?1, ?2, ?2, 1, ?3, ?4)
        ON CONFLICT(k) DO UPDATE SET updated = ?2, unread_admin = unread_admin + 1, status = 'open', nick = COALESCE(?3, nick), diag = ?4`).bind(k, t, nick, diag),
      env.DB.prepare(`INSERT INTO msgs (k, t, who, text) VALUES (?1, ?2, 'user', ?3)`).bind(k, t, text),
    ]);
    return json({ ok: true });
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
    const p2 = parts[2] || '';

    if (m === 'GET' && p2 === 'pending' && parts.length === 3) {
      const { results } = await env.DB.prepare(`SELECT * FROM items WHERE status = 'pending' ORDER BY created ASC LIMIT 100`).all();
      return json({ items: results.map(adminRow) });
    }

    if (m === 'GET' && p2 === 'items' && parts.length === 3) {
      const sp = url.searchParams;
      const status = ['pending', 'approved', 'rejected', 'reported', 'featured'].includes(sp.get('status')) ? sp.get('status') : 'approved';
      const kind = ['effect', 'lag'].includes(sp.get('kind')) ? sp.get('kind') : null;
      const q = plain(sp.get('q'), 40).toLowerCase();
      const where = status === 'reported' ? `reports > 0` : status === 'featured' ? `featured = 1` : `status = ?1`;
      const order = status === 'reported' ? 'reports DESC, created DESC' : status === 'pending' ? 'created ASC' : 'featured DESC, created DESC';
      const { results } = await env.DB.prepare(
        `SELECT * FROM items WHERE ${where} AND (?2 IS NULL OR kind = ?2) AND (?3 = '' OR instr(lower(data), ?3) > 0) ORDER BY ${order} LIMIT 200`)
        .bind(status, kind, q).all();
      return json({ items: results.map(adminRow) });
    }

    if (m === 'GET' && p2 === 'stats' && parts.length === 3) {
      const since = now() - 14 * 86400;
      const [byStatus, totals, top, perDay, blocks, dl] = await Promise.all([
        env.DB.prepare(`SELECT status, kind, COUNT(*) AS n FROM items GROUP BY status, kind`).all(),
        env.DB.prepare(`SELECT COALESCE(SUM(likes),0) AS likes, COALESCE(SUM(reports > 0),0) AS reported, COALESCE(SUM(featured),0) AS featured, COUNT(DISTINCT COALESCE(sender, ipk)) AS senders FROM items`).first(),
        env.DB.prepare(`SELECT * FROM items WHERE status = 'approved' ORDER BY likes DESC LIMIT 5`).all(),
        env.DB.prepare(`SELECT created / 86400 AS d, COUNT(*) AS n FROM items WHERE created >= ?1 GROUP BY d ORDER BY d`).bind(since).all(),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM blocks`).first(),
        downloads(),
      ]);
      const chat = await env.DB.prepare(`SELECT COUNT(*) AS threads, COALESCE(SUM(unread_admin), 0) AS unread FROM threads WHERE status = 'open'`).first();
      return json({ byStatus: byStatus.results, ...totals, blocks: blocks.n, top: top.results.map(rowOut), perDay: perDay.results, downloads: dl, chat });
    }

    if (p2 === 'config' && parts.length === 3 && (m === 'GET' || m === 'POST')) {
      const cur = await loadConfig(env);
      if (m === 'GET') return json({ config: cur });
      const body = await readJson(request);
      if (body.error) return fail(body.error, body.status);
      const next = cleanConfig(body.value, cur);
      await env.DB.batch(Object.keys(CONFIG_DEFAULTS).map(k =>
        env.DB.prepare(`INSERT INTO config (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2`).bind(k, JSON.stringify(next[k]))));
      await audit(env, 'config', null, Object.keys(body.value || {}).filter(k => k in CONFIG_DEFAULTS).join(','));
      return json({ config: next });
    }

    if (m === 'GET' && p2 === 'blocks' && parts.length === 3) {
      const { results } = await env.DB.prepare(`SELECT k, created, note FROM blocks ORDER BY created DESC LIMIT 200`).all();
      return json({ blocks: results });
    }
    if (m === 'POST' && p2 === 'unblock' && parts.length === 3) {
      const body = await readJson(request);
      if (body.error) return fail(body.error, body.status);
      const k = String(body.value && body.value.k || '');
      if (!/^[0-9a-f]{32}$/.test(k)) return fail('not found', 404);
      const r = await env.DB.prepare(`DELETE FROM blocks WHERE k = ?1`).bind(k).run();
      if (r.meta.changes) await audit(env, 'unblock', null, k.slice(0, 8));
      return r.meta.changes ? json({ ok: true }) : fail('not found', 404);
    }

    if (m === 'GET' && p2 === 'log' && parts.length === 3) {
      const { results } = await env.DB.prepare(`SELECT t, action, item, note FROM log ORDER BY id DESC LIMIT 100`).all();
      return json({ log: results });
    }

    if (m === 'POST' && p2 === 'bulk' && parts.length === 3) {
      const body = await readJson(request);
      if (body.error) return fail(body.error, body.status);
      const { ids, action } = body.value || {};
      if (!['approve', 'reject', 'delete'].includes(action) || !Array.isArray(ids) || ids.length > 100 || !ids.every(i => typeof i === 'string' && ID.test(i))) return fail('bad request', 400);
      let n = 0;
      for (const id of ids) if (await itemAction(env, id, action)) n++;
      await audit(env, 'bulk:' + action, null, `${n} items`);
      return json({ ok: true, n });
    }

    // ---------- support inbox ----------
    if (m === 'GET' && p2 === 'threads' && parts.length === 3) {
      const status = url.searchParams.get('status') === 'closed' ? 'closed' : 'open';
      const { results } = await env.DB.prepare(
        `SELECT th.k, th.updated, th.unread_admin, th.status, th.nick, th.diag,
           (SELECT text FROM msgs WHERE msgs.k = th.k ORDER BY id DESC LIMIT 1) AS last,
           (SELECT who FROM msgs WHERE msgs.k = th.k ORDER BY id DESC LIMIT 1) AS lastWho
         FROM threads th WHERE th.status = ?1 ORDER BY th.unread_admin > 0 DESC, th.updated DESC LIMIT 200`).bind(status).all();
      const unread = await env.DB.prepare(`SELECT COALESCE(SUM(unread_admin), 0) AS n FROM threads`).first();
      return json({ threads: results.map(r => ({ ...r, diag: JSON.parse(r.diag || '{}') })), unread: unread.n });
    }
    if (p2 === 'thread' && THREAD.test(parts[3] || '')) {
      const k = parts[3];
      const th = await env.DB.prepare(`SELECT * FROM threads WHERE k = ?1`).bind(k).first();
      if (!th) return fail('not found', 404);
      if (m === 'GET' && parts.length === 4) {
        const { results } = await env.DB.prepare(`SELECT id, t, who, text FROM msgs WHERE k = ?1 ORDER BY id DESC LIMIT 200`).bind(k).all();
        await env.DB.prepare(`UPDATE threads SET unread_admin = 0 WHERE k = ?1`).bind(k).run();
        return json({ thread: { ...th, diag: JSON.parse(th.diag || '{}') }, msgs: results.reverse() });
      }
      if (m === 'POST' && parts.length === 5 && parts[4] === 'reply') {
        const body = await readJson(request);
        if (body.error) return fail(body.error, body.status);
        const text = plain(body.value && body.value.text, 2000);
        if (!text) return fail('empty', 400);
        const t = now();
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO msgs (k, t, who, text) VALUES (?1, ?2, 'admin', ?3)`).bind(k, t, text),
          env.DB.prepare(`UPDATE threads SET updated = ?2, unread_user = unread_user + 1, unread_admin = 0 WHERE k = ?1`).bind(k, t),
        ]);
        await audit(env, 'reply', null, k.slice(0, 8));
        return json({ ok: true });
      }
      if (m === 'POST' && parts.length === 5 && (parts[4] === 'close' || parts[4] === 'reopen' || parts[4] === 'block')) {
        if (parts[4] === 'block') {
          await env.DB.prepare(`INSERT OR IGNORE INTO blocks (k, created, note) VALUES (?1, ?2, ?3)`).bind(k, now(), 'chat').run();
        }
        await env.DB.prepare(`UPDATE threads SET status = ?2, unread_admin = 0 WHERE k = ?1`).bind(k, parts[4] === 'reopen' ? 'open' : 'closed').run();
        await audit(env, 'chat:' + parts[4], null, k.slice(0, 8));
        return json({ ok: true });
      }
      return fail('not found', 404);
    }

    if (!ID.test(p2)) return fail('not found', 404);
    const id = p2;

    if (m === 'POST' && parts.length === 4 && parts[3] === 'edit') {
      const body = await readJson(request);
      if (body.error) return fail(body.error, body.status);
      const row = await env.DB.prepare(`SELECT data FROM items WHERE id = ?1`).bind(id).first();
      if (!row) return fail('not found', 404);
      const cur = JSON.parse(row.data), b = body.value || {};
      const v = Schema.validate({ ...cur, name: 'name' in b ? b.name : cur.name, by: 'by' in b ? b.by : cur.by });
      if (!v.ok) return fail(v.error, 400);
      await env.DB.prepare(`UPDATE items SET data = ?2 WHERE id = ?1`).bind(id, JSON.stringify(v.value)).run();
      await audit(env, 'edit', id, v.value.name);
      return json({ ok: true, data: v.value });
    }
    if (m === 'POST' && parts.length === 4 && ITEM_ACTIONS.includes(parts[3])) {
      const done = await itemAction(env, id, parts[3]);
      if (done) await audit(env, parts[3], id);
      return done ? json({ ok: true }) : fail('not found', 404);
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
