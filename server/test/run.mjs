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

// ----- admin tools (0.3) -----
const A = { key: KEY, ip: '10.1.1.2' };
const rnd = () => `10.${20 + (Math.random() * 200 | 0)}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;
const inst = () => crypto.randomUUID();
// start from known settings
await req('/api/admin/config', { method: 'POST', body: { paused: false, submitsPerDay: 5, autoHide: 3, banned: [], announce: null }, ...A });

r = await req('/api/admin/config', { method: 'POST', body: { submitsPerDay: 9999, autoHide: -4, banned: ['  BadWord ', '<x>', ''], announce: { he: '<b>שלום</b>', en: 'hi', level: 'evil', until: 0 } }, ...A });
ok('config values are clamped and cleaned', r.status === 200 && r.data.config.submitsPerDay === 50 && r.data.config.autoHide === 0
  && r.data.config.banned.join() === 'badword,x' && r.data.config.announce.he === 'bשלום/b' && r.data.config.announce.level === 'info', JSON.stringify(r.data));
ok('config needs the key', (await req('/api/admin/config', { method: 'POST', body: { paused: true }, ip: '10.1.1.9' })).status === 401);
r = await req('/api/announce');
ok('announcement is public', r.status === 200 && r.data.announce && r.data.announce.en === 'hi' && r.data.submitOpen === true, JSON.stringify(r.data));
await req('/api/admin/config', { method: 'POST', body: { announce: { he: 'ישן', until: Math.floor(Date.now() / 1000) - 10 } }, ...A });
ok('expired announcement is hidden', (await req('/api/announce')).data.announce === null);

r = await req('/api/submit', { method: 'POST', body: effect('this has BADWORD inside'), ip: rnd() });
ok('banned word refused', r.status === 400 && r.data.error === 'word', JSON.stringify(r.data));
r = await req('/api/submit', { method: 'POST', body: effect('x', { by: 'badword99' }), ip: rnd() });
ok('banned word in nickname refused', r.status === 400);

await req('/api/admin/config', { method: 'POST', body: { paused: true }, ...A });
ok('paused store refuses submits', (await req('/api/submit', { method: 'POST', body: effect('p'), ip: rnd() })).status === 503);
ok('paused shows in announce', (await req('/api/announce')).data.submitOpen === false);
await req('/api/admin/config', { method: 'POST', body: { paused: false, submitsPerDay: 1, autoHide: 3, banned: [] }, ...A });
const ipL = rnd();
codes = [];
for (let i = 0; i < 2; i++) codes.push((await req('/api/submit', { method: 'POST', body: effect('lim' + i), ip: ipL })).status);
ok('daily limit follows the setting', codes.join() === '201,429', codes.join());
await req('/api/admin/config', { method: 'POST', body: { submitsPerDay: 5 }, ...A });

// manage: approve, feature, edit, list by status
const spamInst = inst(), spamIp2 = rnd();
const s1 = (await req('/api/submit', { method: 'POST', body: { ...effect('ספאם 1'), inst: spamInst }, ip: spamIp2 })).data.id;
const s2 = (await req('/api/submit', { method: 'POST', body: { ...effect('ספאם 2'), inst: spamInst }, ip: rnd() })).data.id;
const good = (await req('/api/submit', { method: 'POST', body: { ...effect('טוב'), inst: inst() }, ip: rnd() })).data.id;
r = await req('/api/admin/bulk', { method: 'POST', body: { ids: [s1, good], action: 'approve' }, ...A });
ok('bulk approve', r.status === 200 && r.data.n === 2, JSON.stringify(r.data));
ok('bulk refuses bad ids', (await req('/api/admin/bulk', { method: 'POST', body: { ids: ["x' --"], action: 'approve' }, ...A })).status === 400);
ok('bulk refuses unknown action', (await req('/api/admin/bulk', { method: 'POST', body: { ids: [good], action: 'drop' }, ...A })).status === 400);
ok('feature', (await req(`/api/admin/${good}/feature`, { method: 'POST', ...A })).status === 200);
r = await req('/api/items?kind=effect&sort=new');
ok('featured comes first in the store', r.data.items[0] && r.data.items[0].id === good && r.data.items[0].featured === true, JSON.stringify(r.data.items[0]));
r = await req(`/api/admin/${good}/edit`, { method: 'POST', body: { name: 'שם חדש', by: 'כינוי' }, ...A });
ok('edit name and nickname', r.status === 200 && r.data.data.name === 'שם חדש' && r.data.data.by === 'כינוי', JSON.stringify(r.data));
ok('edit is validated', (await req(`/api/admin/${good}/edit`, { method: 'POST', body: { name: 'see https://x.y' }, ...A })).status === 400);
r = await req('/api/admin/items?status=approved&q=' + encodeURIComponent('שם חדש'), A);
ok('search approved items', r.status === 200 && r.data.items.length >= 1 && r.data.items.every(i => i.status === 'approved'), JSON.stringify(r.data).slice(0, 200));
r = await req('/api/admin/items?status=featured', A);
ok('list featured', r.data.items.some(i => i.id === good));
ok('unpublish sends it back to the queue', (await req(`/api/admin/${good}/unpublish`, { method: 'POST', ...A })).status === 200
  && (await req('/api/admin/pending', A)).data.items.some(i => i.id === good && !i.featured));

// reports: 3 different people report -> back to the queue
await req(`/api/admin/${good}/approve`, { method: 'POST', ...A });
const rep = [];
for (let i = 0; i < 3; i++) rep.push((await req(`/api/report/${good}`, { method: 'POST', ip: rnd() })).status);
ok('reports accepted', rep.every(c => c === 200), rep.join());
r = await req('/api/admin/items?status=reported', A);
ok('reported list shows count', r.data.items.some(i => i.id === good && i.reports === 3), JSON.stringify(r.data.items.map(i => [i.id.slice(0, 4), i.reports])));
ok('3 reports hide it from the store', !(await req('/api/items?kind=effect')).data.items.some(i => i.id === good));
const repIp = rnd();
await req(`/api/admin/${good}/approve`, { method: 'POST', ...A });
await req(`/api/report/${good}`, { method: 'POST', ip: repIp });
r = await req(`/api/report/${good}`, { method: 'POST', ip: repIp });
ok('same person reports only once a day', r.data.already === true);
ok('clear reports', (await req(`/api/admin/${good}/clearReports`, { method: 'POST', ...A })).status === 200);

// block: everything from that sender goes, and new submits vanish quietly
ok('block sender', (await req(`/api/admin/${s1}/block`, { method: 'POST', ...A })).status === 200);
r = await req('/api/items?kind=effect');
ok('blocked sender is out of the store', !r.data.items.some(i => i.id === s1));
ok('their other waiting item is rejected too', !(await req('/api/admin/pending', A)).data.items.some(i => i.id === s2));
r = await req('/api/submit', { method: 'POST', body: { ...effect('again'), inst: spamInst }, ip: rnd() });
ok('blocked install looks accepted', r.status === 201);
ok('but nothing reaches the queue', !(await req('/api/admin/pending', A)).data.items.some(i => i.id === r.data.id));
r = await req('/api/submit', { method: 'POST', body: effect('same ip, new install'), ip: spamIp2 });
ok('blocked IP is also caught', r.status === 201 && !(await req('/api/admin/pending', A)).data.items.some(i => i.id === r.data.id));
r = await req('/api/admin/blocks', A);
ok('blocks are listed (hashes, no IPs)', r.status === 200 && r.data.blocks.length >= 2 && r.data.blocks.every(b => /^[0-9a-f]{32}$/.test(b.k)) && !JSON.stringify(r.data).includes(spamIp2));
for (const b of r.data.blocks.filter(b => b.note === s1.slice(0, 8))) await req('/api/admin/unblock', { method: 'POST', body: { k: b.k }, ...A });
r = await req('/api/submit', { method: 'POST', body: { ...effect('after unblock'), inst: spamInst }, ip: rnd() });
ok('unblock lets them back', (await req('/api/admin/pending', A)).data.items.some(i => i.id === r.data.id));
ok('unblock refuses junk', (await req('/api/admin/unblock', { method: 'POST', body: { k: "' OR 1=1" }, ...A })).status === 404);

// stats and log
r = await req('/api/admin/stats', A);
ok('stats', r.status === 200 && Array.isArray(r.data.byStatus) && typeof r.data.likes === 'number' && Array.isArray(r.data.perDay) && 'downloads' in r.data, JSON.stringify(r.data).slice(0, 300));
ok('stats need the key', (await req('/api/admin/stats', { ip: '10.1.1.9' })).status === 401);
r = await req('/api/admin/log', A);
ok('action log records what happened', r.status === 200 && ['block', 'feature', 'edit', 'autoHide'].every(a => r.data.log.some(l => l.action === a)), JSON.stringify(r.data.log.slice(0, 5)));
ok('public items never show sender hashes', !JSON.stringify((await req('/api/items?kind=effect')).data).match(/sender|ipk|reports/));
await req('/api/admin/config', { method: 'POST', body: { announce: null }, ...A });

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
