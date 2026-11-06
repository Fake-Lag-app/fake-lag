// Fake Lag: main process. Owns settings, the two windows, global shortcuts and the phone remote server.
const { app, BrowserWindow, ipcMain, globalShortcut, session, shell } = require('electron');
const http = require('http'), os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const QR = require('qrcode');

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
const DEFAULTS = { lang: 'he', name: '', photo: '', camId: '', micId: '', outId: '', level: 0.4, setupDone: false, token: '' };
let S;
function loadSettings() {
  try { S = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { S = { ...DEFAULTS }; }
  if (!S.token) { S.token = crypto.randomBytes(12).toString('base64url'); saveSettings(); }
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
ipcMain.handle('settings:get', () => S);
ipcMain.handle('settings:set', (e, patch) => {
  const allowed = Object.keys(DEFAULTS).filter(k => k !== 'token');
  for (const k of Object.keys(patch)) if (allowed.includes(k)) S[k] = patch[k];
  saveSettings();
  for (const w of [cam, ctl]) if (alive(w)) w.webContents.send('settings', S);
  return S;
});
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
function pushRemote() { const line = `data: ${JSON.stringify({ mode: state.mode, fx: state.fx, level: state.level })}\n\n`; for (const c of sseClients) c.write(line); }
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
  for (const tab of ['remote', 'settings', 'help']) {
    ctl.webContents.send('selftestTab', tab); await wait(700);
    fs.writeFileSync(path.join(out, `ctl-${tab}.png`), (await ctl.webContents.capturePage()).toPNG());
  }
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
  if (SELFTEST) { S.setupDone = true; S.name = 'Yonatan'; }
  // camera and mic only for our own pages, nothing else
  const ownFrame = wc => !!wc && isOwnPage(wc.getURL());
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && ownFrame(wc)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && ownFrame(wc));
  createWindows();
  registerShortcuts();
  startServer(SELFTEST ? '127.0.0.1' : '0.0.0.0');   // self-test stays local: no firewall prompt
  if (SELFTEST) selfTest();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
