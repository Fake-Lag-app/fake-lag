// Store server tests against a local `wrangler dev` (npm run dev). usage: node test/run.mjs [baseUrl]
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const KEY = process.env.ADMIN_KEY || 'local-test-admin-key-0123456789abcdef';
let pass = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

const req = async (path, { method = 'GET', body, key, ip, raw, type = 'application/json' } = {}) => {
  const headers = {};
  if (body !== undefined || raw !== undefined) headers['content-type'] = type;
  if (key) headers.authorization = 'Bearer ' + key;
  if (ip) headers['cf-connecting-ip'] = ip;     // honoured by the local dev server only
  const r = await fetch(BASE + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' });
  let data = {}; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
};
const effect = (name, extra = {}) => ({ kind: 'effect', name, by: 'tester', video: [{ b: 'pixelate', size: 12 }], audio: [{ b: 'robot', a: 0.4 }], ...extra });

// ----- submitting -----
let r = await req('/api/submit', { method: 'POST', body: effect('בדיקה 1'), ip: '10.0.0.1' });
ok('valid effect is accepted as pending', r.status === 201 && r.data.status === 'pending', JSON.stringify(r));
const firstId = r.data.id;
r = await req('/api/items?kind=effect');
ok('pending item is not public yet', r.status === 200 && !r.data.items.some(i => i.id === firstId));

ok('unknown layer rejected', (await req('/api/submit', { method: 'POST', body: effect('x', { video: [{ b: 'evalJs' }] }), ip: '10.0.0.2' })).status === 400);
ok('markup in name rejected', (await req('/api/submit', { method: 'POST', body: effect('<img src=x onerror=alert(1)>'), ip: '10.0.0.2' })).status === 400);
ok('link in caption rejected', (await req('/api/submit', { method: 'POST', body: effect('x', { video: [{ b: 'caption', text: 'https://evil.example' }] }), ip: '10.0.0.2' })).status === 400);
ok('non-JSON body rejected', (await req('/api/submit', { method: 'POST', raw: 'kind=effect', type: 'application/x-www-form-urlencoded', ip: '10.0.0.2' })).status === 415);
ok('huge body rejected', (await req('/api/submit', { method: 'POST', raw: JSON.stringify(effect('x', { pad: 'a'.repeat(20000) })), ip: '10.0.0.2' })).status === 413);
{
  // a big body with no Content-Length (chunked) must be cut off, not buffered
  const big = new ReadableStream({ start(c) { for (let i = 0; i < 50; i++) c.enqueue(new TextEncoder().encode('x'.repeat(1000))); c.close(); } });
  const res = await fetch(BASE + '/api/submit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.4' }, body: big, duplex: 'half' });
  ok('huge chunked body rejected', res.status === 413, String(res.status));
}
ok('heavy layers are limited', (await req('/api/submit', { method: 'POST', body: effect('x', { video: [{ b: 'mosh' }, { b: 'mosh' }, { b: 'mosh' }] }), ip: '10.0.0.2' })).status === 400);
ok('broken JSON rejected', (await req('/api/submit', { method: 'POST', raw: '{"kind":', ip: '10.0.0.2' })).status === 400);
r = await req('/api/submit', { method: 'POST', body: effect('clamp', { video: [{ b: 'blur', px: 1e9, evil: 'x' }] }), ip: '10.0.0.3' });
ok('out-of-range values are clamped, extra fields dropped', r.status === 201);
const clampId = r.data.id;

// ----- rate limit -----
let codes = [];
const spamIp = `10.9.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;   // fresh visitor every run
for (let i = 0; i < 6; i++) codes.push((await req('/api/submit', { method: 'POST', body: effect('spam ' + i), ip: spamIp })).status);
ok('6th submit in a day is refused', codes.slice(0, 5).every(c => c === 201) && codes[5] === 429, codes.join(','));

// ----- admin -----
ok('pending list needs the key', (await req('/api/admin/pending', { ip: '10.1.1.1' })).status === 401);
ok('wrong key refused', (await req('/api/admin/pending', { key: 'wrong-key-wrong-key-wrong-key', ip: '10.1.1.1' })).status === 401);
r = await req('/api/admin/pending', { key: KEY, ip: '10.1.1.2' });
ok('admin sees pending items', r.status === 200 && r.data.items.some(i => i.id === firstId));
const clamped = r.data.items.find(i => i.id === clampId);
ok('stored copy is the clean one', clamped && clamped.data.video[0].px === 30 && !('evil' in clamped.data.video[0]), JSON.stringify(clamped && clamped.data));
ok('approve without key refused', (await req(`/api/admin/${firstId}/approve`, { method: 'POST', ip: '10.1.1.3' })).status === 401);
ok('admin approves', (await req(`/api/admin/${firstId}/approve`, { method: 'POST', key: KEY, ip: '10.1.1.2' })).status === 200);
r = await req('/api/items?kind=effect');
ok('approved item is public', r.data.items.some(i => i.id === firstId));
ok('bad id format refused', (await req('/api/admin/not-an-id/approve', { method: 'POST', key: KEY, ip: '10.1.1.2' })).status === 404);
ok('sql-ish id refused', (await req(`/api/admin/${encodeURIComponent("x' OR 1=1 --")}/delete`, { method: 'POST', key: KEY, ip: '10.1.1.2' })).status === 404);

// ----- likes -----
r = await req(`/api/like/${firstId}`, { method: 'POST', ip: '10.2.2.2' });
ok('like counts', r.status === 200 && r.data.likes === 1, JSON.stringify(r.data));
r = await req(`/api/like/${firstId}`, { method: 'POST', ip: '10.2.2.2' });
ok('second like from same visitor does not count', r.data.likes === 1 && r.data.already);
ok('cannot like a pending item', (await req(`/api/like/${clampId}`, { method: 'POST', ip: '10.2.2.3' })).status === 404);

// ----- brute force lock -----
for (let i = 0; i < 20; i++) await req('/api/admin/pending', { key: 'guess-guess-guess-guess-' + i, ip: '10.6.6.6' });
ok('after 20 wrong keys even the right key is locked out for that visitor', (await req('/api/admin/pending', { key: KEY, ip: '10.6.6.6' })).status === 429);

// ----- reject & delete -----
ok('admin rejects', (await req(`/api/admin/${clampId}/reject`, { method: 'POST', key: KEY, ip: '10.1.1.2' })).status === 200);
r = await req('/api/items?kind=effect');
ok('rejected item stays private', !r.data.items.some(i => i.id === clampId));
ok('admin deletes', (await req(`/api/admin/${firstId}/delete`, { method: 'POST', key: KEY, ip: '10.1.1.2' })).status === 200);
r = await req('/api/items?kind=effect');
ok('deleted item is gone', !r.data.items.some(i => i.id === firstId));

// ----- admin page -----
r = await fetch(BASE + '/admin');
const csp = r.headers.get('content-security-policy') || '';
ok('admin page served with a strict CSP', r.status === 200 && csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'"), r.status + ' ' + csp);
ok('engine files served for the preview', (await fetch(BASE + '/effects.js')).status === 200 && (await fetch(BASE + '/schema.js')).status === 200);

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
