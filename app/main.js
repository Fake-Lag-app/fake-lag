// Fake Lag: main process. Owns settings, the two windows, global shortcuts and the phone remote server.
const { app, BrowserWindow, ipcMain, globalShortcut, session, shell } = require('electron');
const http = require('http'), os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const QR = require('qrcode');
const { createObs } = require('./obs.js');
const Deps = require('./deps.js');

const SELFTEST = process.argv.includes('--selftest');
const PORT = 5174;

// The camera window sits behind Zoom all lesson. By default Chromium stops painting a covered window,
// which OBS would see as a frozen picture, so keep it rendering.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const Schema = require('./renderer/schema.js');
// presets: the user's own lags and effects · slots: what Ctrl+Alt+Shift+7 / 8 play
const DEFAULTS = { lang: 'he', name: '', photo: '', camId: '', micId: '', outId: '', level: 0.4, setupDone: false,
  presets: [], slots: { 7: '', 8: '' }, nick: '', token: '', obsAuto: true, obsReady: false, chatUsed: false, zoomDone: false, depsAuto: false, announceOff: false };
// never settable from a window: the phone code, the admin key, the store address
const PRIVATE = ['token', 'adminKey', 'storeUrl', 'inst', 'obsPass'];
const STORE_URL_DEFAULT = 'https://fake-lag-store.pages.dev';
let S;
const storeUrl = () => (S.storeUrl || STORE_URL_DEFAULT).replace(/\/$/, '');
// what windows get: no secrets, just whether this copy is the admin's
function publicSettings() {
  const o = { ...S }; for (const k of PRIVATE) delete o[k];
  o.isAdmin = !!S.adminKey; o.storeReady = !!storeUrl();
  return o;
}
function camSettings() {
  const { camId, micId, outId, name, photo, lang, level, fakeCam } = S;
  return { camId, micId, outId, name, photo, lang, level, fakeCam };
}
function cleanPresets(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).map(p => {
    const v = Schema.validate(p); if (!v.ok) return null;
    const id = typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : crypto.randomBytes(6).toString('hex');
    return { ...v.value, id, from: p.from === 'store' ? 'store' : 'mine', sid: typeof p.sid === 'string' ? p.sid.slice(0, 40) : undefined };
  }).filter(Boolean);
}
function loadSettings() {
  try { S = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { S = { ...DEFAULTS }; }
  if (!S.token) { S.token = crypto.randomBytes(12).toString('base64url'); saveSettings(); }
  // a random id for this install, sent only when sharing to the store, so the admin can block a spammer
  if (!S.inst) { S.inst = crypto.randomUUID(); saveSettings(); }
  // password for OBS's remote control, used only if we are the ones who turn it on
  if (!S.obsPass) { S.obsPass = crypto.randomBytes(18).toString('base64url'); saveSettings(); }
}
function saveSettings() { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(S, null, 1)); }

// ---------- windows ----------
let cam = null, ctl = null;
let state = { mode: 'live', fx: 'live', level: 0.4, camOk: false, micOk: false, outName: '' };
const alive = w => w && !w.isDestroyed();

const RENDERER = path.join(__dirname, 'renderer');
const PREFS = { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true, sandbox: true,
  nodeIntegration: false, webSecurity: true, spellcheck: false };

// Only our own bundled pages may load in a window. Anything else (a link, a dropped file)
// opens in the real browser for https, or is blocked.
const isOwnPage = url => { try { const u = new URL(url); return u.protocol === 'file:' && path.normalize(decodeURIComponent(u.pathname.replace(/^\//, ''))).startsWith(RENDERER); } catch { return false; } };
function lockDown(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!isOwnPage(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  w.webContents.on('will-attach-webview', e => e.preventDefault());
}

let quitting = false;
app.on('before-quit', () => { quitting = true; });

function createCam() {
  // The camera window does the work but nobody needs to see it: OBS gets the picture from /obs,
  // and the remote shows a preview. It starts hidden; closing it only hides it again.
  cam = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, title: 'Fake Lag Camera', backgroundColor: '#000000',
    autoHideMenuBar: true, show: SELFTEST, webPreferences: PREFS });
  lockDown(cam);
  cam.loadFile(path.join(RENDERER, 'cam.html'));
  cam.on('page-title-updated', e => e.preventDefault());
  cam.on('close', e => { if (!quitting && !SELFTEST) { e.preventDefault(); cam.hide(); } });
  cam.webContents.on('did-finish-load', streamCount);
  cam.on('closed', () => { cam = null; if (alive(ctl)) ctl.webContents.send('camClosed'); });
}

function createWindows() {
  createCam();
  ctl = new BrowserWindow({ width: 460, height: 860, minWidth: 380, title: 'Fake Lag', backgroundColor: '#101216',
    autoHideMenuBar: true, webPreferences: PREFS });
  lockDown(ctl);
  ctl.loadFile(path.join(RENDERER, 'control.html'));
  // closing the remote closes the app
  ctl.on('closed', () => { quitting = true; if (alive(cam)) cam.destroy(); });
}

// ---------- picture for OBS: MJPEG on localhost ----------
const mjpeg = new Set();
function streamCount() { if (alive(cam)) cam.webContents.send('stream', mjpeg.size); }
ipcMain.on('frame', (e, data) => {
  if (!mjpeg.size || !alive(cam) || e.sender !== cam.webContents) return;
  const b = Buffer.from(data);
  const head = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${b.length}\r\n\r\n`;
  // a viewer that can't keep up skips frames instead of piling them up in memory
  for (const res of mjpeg) if (res.writableLength < 2e6) { res.write(head); res.write(b); res.write('\r\n'); }
});

function sendCmd(c) { if (alive(cam)) cam.webContents.send('cmd', c); }

// ---------- ipc ----------
ipcMain.on('state', (e, s) => { state = { ...state, ...s }; if (alive(ctl)) ctl.webContents.send('state', state); pushRemote(); });
ipcMain.on('cmd', (e, c) => sendCmd(c));
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('settings:set', (e, patch) => {
  const allowed = Object.keys(DEFAULTS).filter(k => !PRIVATE.includes(k));
  for (const k of Object.keys(patch || {})) {
    if (!allowed.includes(k)) continue;
    if (k === 'presets') S.presets = cleanPresets(patch.presets);
    else if (k === 'slots') S.slots = { 7: String(patch.slots?.[7] || '').slice(0, 40), 8: String(patch.slots?.[8] || '').slice(0, 40) };
    else S[k] = patch[k];
  }
  saveSettings();
  const pub = publicSettings();
  if (alive(ctl)) ctl.webContents.send('settings', pub);
  // the camera only needs devices, name, photo, language and level, not the whole preset library
  const touchesCam = ['camId', 'micId', 'outId', 'name', 'photo', 'lang', 'level'].some(k => k in (patch || {}));
  if (touchesCam && alive(cam)) cam.webContents.send('settings', camSettings());
  pushRemote();   // slot names may have changed
  return pub;
});

// ---------- the store: every call goes through here, never straight from a window ----------
async function storeFetch(pathname, { method = 'GET', body, admin, timeout = 10000 } = {}) {
  const base = storeUrl();
  if (!base) return { ok: false, error: 'offline' };
  const headers = { 'content-type': 'application/json' };
  if (admin) { if (!S.adminKey) return { ok: false, error: 'not admin' }; headers.authorization = 'Bearer ' + S.adminKey; }
  try {
    const r = await fetch(base + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...data } : { ok: false, error: data.error || 'http ' + r.status };
  } catch (e) { return { ok: false, error: e && e.name === 'TimeoutError' ? 'timeout' : 'network' }; }
}
// anything that comes back from the server is checked again before a window sees it
const cleanItems = items => (Array.isArray(items) ? items : []).slice(0, 200).map(it => {
  const v = Schema.validate(it && it.data); if (!v.ok) return null;
  return { id: String(it.id).slice(0, 40), likes: Math.max(0, it.likes | 0), status: String(it.status || ''), featured: !!it.featured, created: it.created | 0, data: v.value };
}).filter(Boolean);
ipcMain.handle('store:list', async (e, { kind, sort } = {}) => {
  const r = await storeFetch(`/api/items?kind=${kind === 'lag' ? 'lag' : 'effect'}&sort=${sort === 'top' ? 'top' : 'new'}`);
  return r.ok ? { ok: true, items: cleanItems(r.items) } : r;
});
ipcMain.handle('store:submit', async (e, item) => {
  const v = Schema.validate(item); if (!v.ok) return { ok: false, error: v.error };
  return storeFetch('/api/submit', { method: 'POST', body: { ...v.value, inst: S.inst } });
});
const storeId = id => encodeURIComponent(String(id).slice(0, 40));
ipcMain.handle('store:like', (e, id) => storeFetch(`/api/like/${storeId(id)}`, { method: 'POST' }));
ipcMain.handle('store:report', (e, id) => storeFetch(`/api/report/${storeId(id)}`, { method: 'POST' }));

// the admin panel talks to /api/admin/* only, and only through here: the key never reaches a window
const ADMIN_PATH = /^\/api\/admin(\/[a-zA-Z0-9-]+){1,3}(\?[a-zA-Z0-9=&%._-]*)?$/;
ipcMain.handle('admin:call', async (e, { path: p, method, body } = {}) => {
  if (!alive(ctl) || e.sender !== ctl.webContents) return { status: 403, error: 'forbidden' };
  if (typeof p !== 'string' || p.length > 300 || !ADMIN_PATH.test(p)) return { status: 400, error: 'bad path' };
  if (!['GET', 'POST'].includes(method)) return { status: 400, error: 'bad method' };
  if (body !== undefined && JSON.stringify(body).length > 10000) return { status: 413, error: 'too big' };
  const base = storeUrl();
  if (!base) return { status: 0, error: 'offline' };
  if (!S.adminKey) return { status: 401, error: 'not admin' };
  const headers = { authorization: 'Bearer ' + S.adminKey };
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    const data = await r.json().catch(() => ({}));
    return { ...(data && typeof data === 'object' ? data : {}), status: r.status };
  } catch { return { status: 0, error: 'network' }; }
});

// the admin's announcement and whether sharing is open, checked now and then
let announce = { announce: null, submitOpen: true };
async function checkAnnounce() {
  if (S.announceOff) return;   // the user turned off the automatic check (Settings → Privacy)
  const r = await storeFetch('/api/announce');
  if (!r.ok) return;
  const a = r.announce && typeof r.announce === 'object' ? r.announce : null;
  const clip = (x, n) => String(x || '').slice(0, n);
  announce = { submitOpen: r.submitOpen !== false,
    announce: a ? { id: clip(a.id, 20), he: clip(a.he, 200), en: clip(a.en, 200), level: a.level === 'warn' ? 'warn' : 'info' } : null };
  if (alive(ctl)) ctl.webContents.send('announce', announce);
}
ipcMain.handle('announce:get', () => announce);

// ---------- OBS and VB-Cable, set up by the app ----------
const obs = createObs({ getPass: () => S.obsPass, url: `http://127.0.0.1:${PORT}/obs`, log: m => console.log('[obs]', m) });
const fromCtl = e => alive(ctl) && e.sender === ctl.webContents;
ipcMain.handle('obs:status', e => fromCtl(e) ? obs.status() : null);
ipcMain.handle('obs:start', async (e, { restart } = {}) => {
  if (!fromCtl(e)) return null;
  const st = await obs.start({ restart: !!restart });
  if (st.virtualCam && !S.obsReady) { S.obsReady = true; saveSettings(); }
  return st;
});
ipcMain.handle('obs:install', e => fromCtl(e) ? obs.install() : null);
// OBS and/or VB-Cable from the official sources, one Windows permission prompt for both
let depsBusy = false;
ipcMain.handle('deps:install', async (e, { obs: wantObs, cable: wantCable } = {}) => {
  if (!fromCtl(e) || depsBusy) return { ok: false, error: 'busy' };
  depsBusy = true;
  try {
    return await Deps.installAll({ obs: !!wantObs, cable: !!wantCable, dry: SELFTEST,
      onProgress: p => alive(ctl) && ctl.webContents.send('deps', p), log: m => console.log('[deps]', m) });
  } finally { depsBusy = false; }
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), os: `Windows ${os.release()}` }));

// ---------- help: the AI helper and messages to the admin ----------
ipcMain.handle('help:ai', async (e, { messages, diag, lang } = {}) => {
  if (!fromCtl(e)) return { ok: false, error: 'forbidden' };
  // the AI can take 5-20 seconds to answer
  return storeFetch('/api/ai', { method: 'POST', body: { messages, diag, lang }, timeout: 45000 });
});
ipcMain.handle('help:send', async (e, { text, diag } = {}) => {
  if (!fromCtl(e)) return { ok: false, error: 'forbidden' };
  const r = await storeFetch('/api/chat/send', { method: 'POST', body: { inst: S.inst, text: String(text || '').slice(0, 1000), nick: S.nick || '', diag } });
  if (r.ok && !S.chatUsed) { S.chatUsed = true; saveSettings(); }
  return r;
});
ipcMain.handle('help:thread', async e => {
  if (!fromCtl(e)) return { ok: false, error: 'forbidden' };
  if (!S.chatUsed) return { ok: true, msgs: [] };
  const r = await storeFetch('/api/chat/thread', { method: 'POST', body: { inst: S.inst } });
  if (!r.ok) return r;
  const msgs = (Array.isArray(r.msgs) ? r.msgs : []).slice(-100).map(m => ({ id: m.id | 0, t: m.t | 0, who: m.who === 'admin' ? 'admin' : 'user', text: String(m.text || '').slice(0, 2000) }));
  return { ok: true, msgs };
});

// ---------- the 7 / 8 slots: a saved lag on a shortcut or the phone ----------
function playSlot(k) {
  const id = S.slots && S.slots[k]; if (!id) return;
  if (Schema.BUILTIN_IDS.includes(id)) return sendCmd({ t: 'mode', mode: id });
  const p = (S.presets || []).find(x => x.id === id);
  if (p) sendCmd({ t: 'play', preset: p, id: p.id });
}
ipcMain.handle('remote:info', async () => {
  const url = remoteUrl();
  return { url, qr: url ? await QR.toDataURL(url, { margin: 1, width: 240 }) : null };
});
ipcMain.handle('cam:show', () => { if (!alive(cam)) createCam(); else if (cam.isVisible()) cam.hide(); else { cam.show(); cam.focus(); } });
// a new phone code: the old QR stops working and phones connected with it are dropped
ipcMain.handle('remote:newToken', async () => {
  S.token = crypto.randomBytes(12).toString('base64url'); saveSettings();
  for (const c of sseClients) c.end(); sseClients.clear();
  const url = remoteUrl();
  return { url, qr: url ? await QR.toDataURL(url, { margin: 1, width: 240 }) : null };
});

// ---------- global shortcuts ----------
// Ctrl+Alt+Shift: plain Ctrl+Alt is AltGr on Hebrew and European keyboards (AltGr+4 types ₪).
const KEYS = { '1': 'live', '2': 'lag', '3': 'low', '4': 'mosh', '5': 'freeze', '6': 'black', '0': 'auto', '9': 'reconnect' };
const MOD = 'CommandOrControl+Alt+Shift';
function registerShortcuts() {
  const failed = [];
  const reg = (acc, fn) => { if (!globalShortcut.register(acc, fn)) failed.push(acc); };
  for (const [k, mode] of Object.entries(KEYS)) reg(`${MOD}+${k}`, () => sendCmd({ t: 'mode', mode }));
  for (const k of ['7', '8']) reg(`${MOD}+${k}`, () => playSlot(k));
  reg(`${MOD}+Up`, () => sendCmd({ t: 'level', delta: 0.1 }));
  reg(`${MOD}+Down`, () => sendCmd({ t: 'level', delta: -0.1 }));
  // another app already owns these: tell the user instead of failing silently
  state.keysFailed = failed;
}

// ---------- phone remote (same Wi-Fi) ----------
function lanIp() {
  const all = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);
  const pick = all.find(i => /^192\.168\./.test(i.address)) || all.find(i => /^10\./.test(i.address)) || all.find(i => /^172\.(1[6-9]|2\d|3[01])\./.test(i.address));
  return pick ? pick.address : null;
}
let serverUp = false;
const remoteUrl = () => { const ip = lanIp(); return serverUp && ip ? `http://${ip}:${PORT}/r?k=${S.token}` : null; };

const sseClients = new Set();
function slotName(k) {
  const id = S.slots && S.slots[k]; if (!id) return '';
  if (Schema.BUILTIN_IDS.includes(id)) return '#' + id;
  const p = (S.presets || []).find(x => x.id === id); return p ? p.name : '';
}
function pushRemote() {
  const line = `data: ${JSON.stringify({ mode: state.mode, fx: state.fx, level: state.level, slots: { 7: slotName('7'), 8: slotName('8') } })}\n\n`;
  for (const c of sseClients) c.write(line);
}
function tokenOk(k) {
  const a = Buffer.from(String(k || '')), b = Buffer.from(S.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const isLoopback = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
const isLocalHost = h => new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`, 'i').test(h || '');
// what OBS's browser source shows: just the stream, filling the frame, reconnecting if the app restarts
const OBS_PAGE = `<!doctype html><meta charset="utf-8"><title>Fake Lag</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}img{width:100vw;height:100vh;object-fit:cover;display:block}</style>
<img id="v" alt="">
<script>
const v = document.getElementById('v');
const go = () => { v.src = '/stream.mjpg?t=' + Date.now(); };
v.onerror = () => setTimeout(go, 1000);
go();
</script>`;
function startServer(host = '0.0.0.0') {
  const remoteHtml = () => fs.readFileSync(path.join(__dirname, 'renderer', 'remote.html'), 'utf8')
    .replace('__LANG__', S.lang === 'en' ? 'en' : 'he');
  const i18n = () => fs.readFileSync(path.join(__dirname, 'renderer', 'i18n.js'));
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/i18n.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(i18n()); }
    // The camera picture for OBS: this computer only. The socket must come from loopback, and the Host
    // header must be loopback too, so a website can't reach it through DNS rebinding.
    if (url.pathname === '/obs' || url.pathname === '/stream.mjpg') {
      if (!isLoopback(req.socket.remoteAddress) || !isLocalHost(req.headers.host)) { res.writeHead(403); return res.end(); }
      if (url.pathname === '/obs') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(OBS_PAGE); }
      res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame', 'cache-control': 'no-store', connection: 'close' });
      mjpeg.add(res); streamCount();
      req.on('close', () => { mjpeg.delete(res); streamCount(); });
      return;
    }
    if (!tokenOk(url.searchParams.get('k'))) { res.writeHead(403); return res.end(); }
    if (url.pathname === '/r') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(remoteHtml()); }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      sseClients.add(res); req.on('close', () => sseClients.delete(res)); pushRemote(); return;
    }
    if (url.pathname === '/cmd' && req.method === 'POST' && (req.headers['content-type'] || '').startsWith('application/json')) {
      let body = ''; req.on('data', d => { body += d; if (body.length > 500) req.destroy(); });
      req.on('end', () => {
        try {
          const c = JSON.parse(body);
          if (c.t === 'mode' && Object.values(KEYS).includes(c.mode)) sendCmd({ t: 'mode', mode: c.mode });
          else if (c.t === 'slot' && (c.k === '7' || c.k === '8')) playSlot(c.k);
          else if (c.t === 'level' && typeof c.level === 'number') sendCmd({ t: 'level', level: c.level });
          res.writeHead(204);
        } catch { res.writeHead(400); }
        res.end();
      }); return;
    }
    res.writeHead(404); res.end();
  });
  srv.on('error', e => { console.error('remote server:', e.message); state.remoteFailed = true; if (alive(ctl)) ctl.webContents.send('state', state); });
  srv.listen(PORT, host, () => { serverUp = true; if (alive(ctl)) ctl.webContents.send('remoteReady'); });
}

// ---------- self-test: cycle every mode and save screenshots ----------
async function selfTest() {
  const out = path.join(__dirname, 'selftest'); fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(3500);
  // screenshots of the remote at its normal size, for the landing page
  if (process.env.FL_SHOTS) {
    ctl.setContentSize(460, 860); await wait(500);
    for (const tab of ['remote', 'lags']) {
      ctl.webContents.send('selftestTab', tab); await wait(1200);
      fs.writeFileSync(path.join(out, `shot-${tab}.png`), (await ctl.webContents.capturePage()).toPNG());
    }
    ctl.webContents.send('selftestTab', 'lags'); await wait(300);
    await ctl.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('#lagsRoot button')].find(x => x.textContent.includes('לאג חדש')); b && b.click(); })()`); await wait(1800);
    fs.writeFileSync(path.join(out, 'shot-editor.png'), (await ctl.webContents.capturePage()).toPNG());
    ctl.webContents.send('selftestTab', 'remote');
  }
  // put the remote on top of the camera window, the way Zoom covers it during a lesson
  ctl.setBounds(cam.getBounds()); ctl.focus();
  const log = [];
  for (const mode of ['live', 'lag', 'low', 'mosh', 'freeze', 'black', 'reconnect', 'auto']) {
    sendCmd({ t: 'mode', mode }); await wait(mode === 'auto' ? 11500 : 1800);
    const img = await cam.webContents.capturePage(); fs.writeFileSync(path.join(out, `cam-${mode}.png`), img.toPNG());
    log.push({ mode, frames: await cam.webContents.executeJavaScript('window.__frames'), state: { ...state } });
  }
  sendCmd({ t: 'mode', mode: 'live' }); await wait(500);
  // the phone remote, served the same way the phone would get it
  try {
    const page = await (await fetch(`http://127.0.0.1:${PORT}/r?k=${S.token}`)).text();
    const denied = (await fetch(`http://127.0.0.1:${PORT}/r?k=wrong`)).status;
    const cmd = await fetch(`http://127.0.0.1:${PORT}/cmd?k=${S.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"t":"mode","mode":"lag"}' });
    await wait(300);
    log.push({ remote: { pageOk: page.includes('lvl'), wrongTokenStatus: denied, cmdStatus: cmd.status, modeAfter: state.mode } });
    sendCmd({ t: 'mode', mode: 'live' }); await wait(300);
  } catch (e) { log.push({ remoteError: String(e) }); }
  // the OBS stream with the camera window hidden, as in real use
  try {
    cam.hide(); sendCmd({ t: 'mode', mode: 'lag' }); await wait(1500);
    const f0 = await cam.webContents.executeJavaScript('window.__frames');
    const r = await fetch(`http://127.0.0.1:${PORT}/stream.mjpg`);
    const reader = r.body.getReader(); let bytes = Buffer.alloc(0); const t0 = Date.now();
    while (Date.now() - t0 < 3000) { const { value, done } = await reader.read(); if (done) break; bytes = Buffer.concat([bytes, Buffer.from(value)]); }
    reader.cancel();
    const frames = bytes.toString('latin1').split('--frame').length - 1;
    const s = bytes.indexOf(Buffer.from([0xff, 0xd8])), e = bytes.indexOf(Buffer.from([0xff, 0xd9]), s);
    if (s >= 0 && e > s) fs.writeFileSync(path.join(out, 'stream-frame.jpg'), bytes.subarray(s, e + 2));
    const f1 = await cam.webContents.executeJavaScript('window.__frames');
    // DNS-rebinding guard: a foreign Host header must be refused
    const spoof = await new Promise(res => http.get({ host: '127.0.0.1', port: PORT, path: '/stream.mjpg', headers: { host: 'evil.example:5174' } }, x => { res(x.statusCode); x.destroy(); }).on('error', () => res('err')));
    log.push({ obsStream: { camVisible: cam.isVisible(), renderFpsWhileHidden: Math.round((f1 - f0) / 4.5), streamFps: Math.round(frames / 3), mb: +(bytes.length / 1e6).toFixed(1), spoofedHostStatus: spoof, obsPageStatus: (await fetch(`http://127.0.0.1:${PORT}/obs`)).status } });
    sendCmd({ t: 'mode', mode: 'live' }); cam.show(); await wait(500);
  } catch (e) { log.push({ obsStreamError: String(e) }); }
  for (const tab of ['remote', 'settings', 'help', 'chat', 'lags']) {
    ctl.webContents.send('selftestTab', tab); await wait(tab === 'help' ? 2500 : 900);
    fs.writeFileSync(path.join(out, `ctl-${tab}.png`), (await ctl.webContents.capturePage()).toPNG());
  }
  // the Connect tab checks everything (read-only here: it never starts or changes OBS in a self-test)
  try {
    ctl.webContents.send('selftestTab', 'help'); await wait(2500);
    const rows = await ctl.webContents.executeJavaScript(`[...document.querySelectorAll('#setupRoot .srow')].map(r => r.className.replace('srow ', '') + ': ' + r.querySelector('b').textContent)`);
    const diag = await ctl.webContents.executeJavaScript('window.FLSetup.diag()');
    // the help chat answers (or explains why not) and offers buttons
    ctl.webContents.send('selftestTab', 'chat'); await wait(500);
    const chat = await ctl.webContents.executeJavaScript(`(async () => {
      const box = document.querySelector('#chatRoot textarea'); box.value = 'בזום רואים מסך שחור';
      [...document.querySelectorAll('#chatRoot button')].find(b => b.textContent === 'שלח').click();
      for (let i = 0; i < 60 && document.querySelector('#chatRoot .cmsg.wait'); i++) await new Promise(r => setTimeout(r, 500));
      const msgs = [...document.querySelectorAll('#chatRoot .cmsg')];
      return { last: msgs[msgs.length - 1].innerText.slice(0, 200), buttons: [...msgs[msgs.length - 1].querySelectorAll('button')].map(b => b.textContent) };
    })()`);
    fs.writeFileSync(path.join(out, 'ctl-chat-answer.png'), (await ctl.webContents.capturePage()).toPNG());
    // the one-click install, dry (downloads VB-Cable, checks its signature, runs nothing)
    const deps = await ctl.webContents.executeJavaScript(`fl.depsInstall(false, true)`);
    log.push({ setup: { rows, diag, chat, deps } });
  } catch (e) { log.push({ setupError: String(e) }); }
  ctl.webContents.send('selftestTab', 'lags'); await wait(1200);
  // the editor: open a new effect, save it, put it on slot 7 and play it from the shortcut path
  try {
    const click = txt => ctl.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('#lagsRoot button')].find(x => x.textContent.includes(${JSON.stringify(txt)})); if (b) b.click(); return !!b; })()`);
    await click('אפקט חדש'); await wait(1500);
    await ctl.webContents.executeJavaScript(`(() => { const i = document.querySelector('#lagsRoot input[maxlength="40"]'); i.value = 'בדיקה'; i.dispatchEvent(new Event('input')); })()`);
    fs.writeFileSync(path.join(out, 'ctl-editor.png'), (await ctl.webContents.capturePage()).toPNG());
    await click('שמירה'); await wait(600);
    const saved = (S.presets || []).find(p => p.name === 'בדיקה');
    if (saved) { S.slots = { 7: saved.id, 8: '' }; playSlot('7'); await wait(800); }
    log.push({ editor: { saved: !!saved, kind: saved && saved.kind, layers: saved && saved.video.map(b => b.b), slotPlayedMode: state.mode, slotFx: state.fx } });
    // a preset with bad data must never be stored
    const before = S.presets.length; S.presets = cleanPresets([...S.presets, { kind: 'effect', name: '<script>', video: [{ b: 'blur' }] }, { kind: 'effect', name: 'x', video: [{ b: 'eval' }] }]);
    log.push({ badPresetsRejected: S.presets.length === before });
    await click('→ חזרה'); await wait(300);
    // every picture layer alone on the test pattern, timed; plus the heaviest effect the rules allow
    const blocks = await ctl.webContents.executeJavaScript(`(async () => {
      const cases = Object.keys(FLSchema.VIDEO).map(b => [b, [{ b, ...(b === 'caption' ? { text: 'בדיקה 123' } : {}) }]]);
      cases.push(['HEAVIEST', [{ b: 'mosh', block: 16, keep: 0.1, smear: 0.3 }, { b: 'blur', px: 30 }, { b: 'rgbSplit', px: 40 }, { b: 'slices', count: 40, px: 80 }, { b: 'slices', count: 40, px: 80 }, { b: 'bands', a: 1, count: 20 }, { b: 'bands', a: 1, count: 20 }, { b: 'bands', a: 1, count: 20 }]]);
      cases.push(['TOO_HEAVY', [{ b: 'mosh' }, { b: 'mosh' }]]);
      const out = [];
      for (const [name, video] of cases) {
        const v = FLSchema.validate({ kind: 'effect', name: 'x', video });
        const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
        const e = FLEffects.createEngine({ W: 1280, H: 720, out: c, env: { name: 'Yonatan', lang: 'he' }, drawSource: (g, W, H) => {
          const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2b4c7e'); gr.addColorStop(1, '#7e2b5c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
          g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(W / 2, H / 2, 100, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 80px sans-serif'; g.textAlign = 'center'; g.fillText('TEST', W / 2, 130); } });
        e.play(v.ok ? v.value : 'live', { t: 0 });
        const t0 = performance.now(); let n = 0;
        for (let t = 0; t < 2000; t += 33) { e.frame(t + 100000); n++; }
        const ms = (performance.now() - t0) / n;
        out.push({ name, ok: v.ok, err: v.error, ms: Math.round(ms * 10) / 10, img: c.toDataURL('image/jpeg', 0.6) });
      }
      return out;
    })()`);
    const sheet = path.join(out, 'blocks'); fs.mkdirSync(sheet, { recursive: true });
    for (const b of blocks) fs.writeFileSync(path.join(sheet, b.name + '.jpg'), Buffer.from(b.img.split(',')[1], 'base64'));
    log.push({ videoBlocks: blocks.map(({ name, ok, err, ms }) => ({ name, ok, err, ms })) });
    // the store, end to end, through the same IPC the windows use
    if (saved && process.env.FL_TEST_STORE) {
      const sub = await storeFetch('/api/submit', { method: 'POST', body: { ...saved, by: 'בודק' } });
      const pend = await storeFetch('/api/admin/pending', { admin: true });
      const inPending = pend.ok && pend.items.some(i => i.id === sub.id);
      const appr = await storeFetch(`/api/admin/${sub.id}/approve`, { method: 'POST', admin: true });
      const list = await storeFetch('/api/items?kind=effect&sort=new');
      const visible = list.ok && cleanItems(list.items).some(i => i.id === sub.id && i.data.name === 'בדיקה');
      const removed = await storeFetch(`/api/admin/${sub.id}/delete`, { method: 'POST', admin: true });
      const noKey = await (async () => { const k = S.adminKey; S.adminKey = ''; const r = await storeFetch('/api/admin/pending', { admin: true }); S.adminKey = k; return r; })();
      log.push({ store: { submitted: !!sub.id, inPending, approved: appr.ok, visibleInStore: visible, removed: removed.ok, adminWithoutKey: noKey.error, settingsLeakKey: JSON.stringify(publicSettings()).includes(S.adminKey) } });
      ctl.webContents.send('selftestTab', 'admin'); await wait(1500);
      fs.writeFileSync(path.join(out, 'ctl-admin.png'), (await ctl.webContents.capturePage()).toPNG());
      // every admin section opens without an error, through the same IPC the panel uses
      const sections = await ctl.webContents.executeJavaScript(`(async () => {
        const out = {};
        for (const b of [...document.querySelectorAll('#adminRoot .fla-tabs button')]) {
          b.click(); await new Promise(r => setTimeout(r, 1500));
          const body = document.querySelector('#adminRoot .fla-body');
          out[b.textContent] = { warn: [...body.querySelectorAll('.warn')].map(x => x.textContent).join(' | '), len: body.innerText.length };
        }
        document.querySelector('#adminRoot .fla-tabs button').click();
        return out;
      })()`);
      const badPath = await ctl.webContents.executeJavaScript(`fl.adminCall('/api/items?kind=effect', 'GET').then(r => r.status)`);
      // an announcement reaches the app and shows on top
      await storeFetch('/api/admin/config', { method: 'POST', admin: true, body: { announce: { he: 'בדיקת הודעה', en: 'test notice', level: 'warn' } } });
      await checkAnnounce(); await wait(300);
      const banner = await ctl.webContents.executeJavaScript(`(() => { const b = document.getElementById('announce'); return b.hidden ? '' : b.textContent; })()`);
      fs.writeFileSync(path.join(out, 'ctl-announce.png'), (await ctl.webContents.capturePage()).toPNG());
      await storeFetch('/api/admin/config', { method: 'POST', admin: true, body: { announce: null } });
      await checkAnnounce(); await wait(300);
      const bannerGone = await ctl.webContents.executeJavaScript(`document.getElementById('announce').hidden`);
      log.push({ admin: { sections, nonAdminPathRefused: badPath === 400, banner, bannerGone } });
      ctl.webContents.send('selftestTab', 'lags');
      await ctl.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('#lagsRoot button')].find(x => x.textContent === 'חנות'); b && b.click(); })()`); await wait(1800);
      fs.writeFileSync(path.join(out, 'ctl-store.png'), (await ctl.webContents.capturePage()).toPNG());
    }
    await click('→ חזרה'); await wait(300);
  } catch (e) { log.push({ editorError: String(e) }); }
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  app.quit();
}

// ---------- boot ----------
// the self-test never touches the real settings
if (SELFTEST) app.setPath('userData', path.join(__dirname, 'selftest', 'userdata'));

// one copy only: a second launch would fight over the camera, the port and the shortcuts
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (alive(ctl)) { if (ctl.isMinimized()) ctl.restore(); ctl.focus(); } });

app.whenReady().then(() => {
  loadSettings();
  // the self-test never opens the real camera: it draws a test pattern instead
  if (SELFTEST) {
    S.setupDone = true; S.name = 'Yonatan'; S.fakeCam = true;
    // optional: run the store flow against a local test server
    if (process.env.FL_TEST_STORE) { S.storeUrl = process.env.FL_TEST_STORE; S.adminKey = process.env.FL_TEST_ADMIN || ''; }
    else { delete S.storeUrl; delete S.adminKey; }   // a test server from an earlier run is not remembered
  }
  // camera and mic only for our own pages, nothing else
  const ownFrame = wc => !!wc && isOwnPage(wc.getURL());
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && ownFrame(wc)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && ownFrame(wc));
  createWindows();
  registerShortcuts();
  startServer(SELFTEST ? '127.0.0.1' : '0.0.0.0');   // self-test stays local: no firewall prompt
  if (!SELFTEST || process.env.FL_TEST_STORE) { checkAnnounce(); setInterval(checkAnnounce, 15 * 60 * 1000); }
  // once OBS was set up, bring it up hidden every time the app opens
  if (!SELFTEST && S.obsAuto && S.obsReady) setTimeout(() => obs.start().then(st => alive(ctl) && ctl.webContents.send('obs', st)), 1500);
  if (SELFTEST) {
    // record why a window goes away during a self-test
    const dbg = m => { try { fs.appendFileSync(path.join(__dirname, 'selftest', 'debug.txt'), new Date().toISOString() + ' ' + m + '\n'); } catch {} };
    try { fs.mkdirSync(path.join(__dirname, 'selftest'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'selftest', 'debug.txt'), ''); } catch {}
    app.on('render-process-gone', (e, wc, d) => dbg(`renderer gone ${wc.getURL().split('/').pop()} ${d.reason} ${d.exitCode}`));
    app.on('child-process-gone', (e, d) => dbg(`child gone ${d.type} ${d.reason} ${d.exitCode} ${d.name || ''}`));
    for (const [n, w] of [['cam', cam], ['ctl', ctl]]) w && w.on('closed', () => dbg(n + ' closed'));
    process.on('uncaughtException', e => dbg('uncaught ' + (e && e.stack || e)));
    process.on('unhandledRejection', e => dbg('unhandled ' + (e && e.stack || e)));
    app.on('before-quit', () => dbg('before-quit ' + new Error().stack.split('\n').slice(1, 4).join(' | ')));
    selfTest().catch(e => dbg('selftest threw ' + (e && e.stack || e)));
  }
});
// close OBS properly before quitting (a forced close makes OBS ask about "safe mode" next time)
let obsClosed = false;
app.on('will-quit', e => {
  globalShortcut.unregisterAll();
  if (obsClosed) return;
  e.preventDefault();
  // app.quit() a second time is ignored once quitting has started, so leave with exit() (cleanup is done by then)
  Promise.race([obs.shutdown(), new Promise(r => setTimeout(r, 10000))]).finally(() => { obsClosed = true; app.exit(0); });
});
app.on('window-all-closed', () => app.quit());
