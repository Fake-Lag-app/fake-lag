// OBS, set up for the user: find or install it, turn on its built-in remote control (obs-websocket),
// make a "Fake Lag" scene collection with our picture in it, and start the virtual camera.
// The user never has to open OBS. Runs in the main process only.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLLECTION = 'Fake Lag', SCENE = 'Fake Lag', SOURCE = 'Fake Lag Camera';
const appData = () => process.env.APPDATA || '';
const wsConfigFile = () => path.join(appData(), 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
const run = (file, args, opts = {}) => new Promise(res => execFile(file, args, { windowsHide: true, timeout: opts.timeout || 15000, ...opts },
  (err, stdout, stderr) => res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || ''), err: String(stderr || '') })));
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- find / install ----------
async function findExe() {
  const roots = [];
  const r = await run('reg', ['query', 'HKLM\\SOFTWARE\\OBS Studio', '/ve']);
  const m = r.out.match(/REG_SZ\s+(.+)/);
  if (m) roots.push(m[1].trim());
  roots.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'obs-studio'));
  for (const root of roots) {
    const exe = path.join(root, 'bin', '64bit', 'obs64.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}
async function isRunning() {
  const r = await run('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH', '/FO', 'CSV']);
  return /obs64\.exe/i.test(r.out);
}
// one click: Windows' own package manager installs the official OBS (the user approves the admin prompt)
async function install() {
  const has = await run('winget', ['--version']);
  if (has.code !== 0) return { ok: false, error: 'no-winget' };
  const r = await run('winget', ['install', '--id', 'OBSProject.OBSStudio', '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { timeout: 15 * 60 * 1000 });
  const exe = await findExe();
  return exe ? { ok: true } : { ok: false, error: 'install-failed', detail: (r.out + r.err).slice(-300) };
}

// ---------- obs-websocket settings ----------
// If the user already uses the remote control, keep theirs. If it is off, turn it on with our own password.
// OBS reads this file when it starts and rewrites it when it closes, so it is only changed while OBS is closed.
function readWsConfig() { try { return JSON.parse(fs.readFileSync(wsConfigFile(), 'utf8')); } catch { return null; } }
function ensureWsConfig(ourPass) {
  const cur = readWsConfig() || {};
  if (cur.server_enabled) return { changed: false, port: cur.server_port || 4455, pass: cur.auth_required ? cur.server_password || '' : '' };
  const next = { alerts_enabled: false, first_load: false, server_port: 4455, ...cur, server_enabled: true, auth_required: true, server_password: ourPass };
  fs.mkdirSync(path.dirname(wsConfigFile()), { recursive: true });
  fs.writeFileSync(wsConfigFile(), JSON.stringify(next, null, 4));
  return { changed: true, port: next.server_port, pass: ourPass };
}

// ---------- a tiny obs-websocket v5 client ----------
function connect(port, pass, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let ws, done = false, nextId = 1;
    const pending = new Map();
    const fail = e => { if (!done) { done = true; try { ws && ws.close(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); } };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);
    try { ws = new WebSocket(`ws://127.0.0.1:${port}`, 'obswebsocket.json'); } catch (e) { clearTimeout(timer); return reject(e); }
    ws.onerror = () => fail(new Error('no-connection'));
    // 4009 = wrong password
    ws.onclose = ev => { fail(new Error(ev.code === 4009 ? 'bad-password' : 'closed')); for (const p of pending.values()) p.reject(new Error('closed')); pending.clear(); };
    ws.onmessage = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === 0) {
        const d = { rpcVersion: 1, eventSubscriptions: 0 };
        const a = msg.d && msg.d.authentication;
        if (a) {
          const secret = crypto.createHash('sha256').update(pass + a.salt).digest('base64');
          d.authentication = crypto.createHash('sha256').update(secret + a.challenge).digest('base64');
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        done = true; clearTimeout(timer);
        resolve({
          request(requestType, requestData) {
            return new Promise((res, rej) => {
              const requestId = String(nextId++);
              const t = setTimeout(() => { pending.delete(requestId); rej(new Error('timeout ' + requestType)); }, 8000);
              pending.set(requestId, { resolve: v => { clearTimeout(t); res(v); }, reject: e => { clearTimeout(t); rej(e); } });
              ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
            });
          },
          close() { try { ws.close(); } catch {} },
        });
      } else if (msg.op === 7) {
        const p = pending.get(msg.d.requestId); if (!p) return;
        pending.delete(msg.d.requestId);
        if (msg.d.requestStatus && msg.d.requestStatus.result) p.resolve(msg.d.responseData || {});
        else p.reject(new Error((msg.d.requestStatus && (msg.d.requestStatus.comment || msg.d.requestStatus.code)) || 'failed'));
      }
    };
  });
}

// ---------- the scene ----------
async function setupScene(c, url) {
  // our own profile, so the picture size is right without touching the user's other OBS settings
  const profs = await c.request('GetProfileList');
  if (!profs.profiles.includes(COLLECTION)) { await c.request('CreateProfile', { profileName: COLLECTION }); await wait(1000); }
  else if (profs.currentProfileName !== COLLECTION) { await c.request('SetCurrentProfile', { profileName: COLLECTION }); await wait(1000); }
  let v = await c.request('GetVideoSettings');
  if (v.baseWidth !== 1280 || v.baseHeight !== 720 || v.outputWidth !== 1280 || v.outputHeight !== 720) {
    const vc0 = await c.request('GetVirtualCamStatus');
    if (vc0.outputActive) { await c.request('StopVirtualCam'); await wait(800); }
    await c.request('SetVideoSettings', { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720, fpsNumerator: 30, fpsDenominator: 1 });
    v = await c.request('GetVideoSettings');
  }
  const cols = await c.request('GetSceneCollectionList');
  if (!cols.sceneCollections.includes(COLLECTION)) { await c.request('CreateSceneCollection', { sceneCollectionName: COLLECTION }); await wait(1500); }
  else if (cols.currentSceneCollectionName !== COLLECTION) { await c.request('SetCurrentSceneCollection', { sceneCollectionName: COLLECTION }); await wait(1500); }
  const scenes = await c.request('GetSceneList');
  if (!scenes.scenes.some(s => s.sceneName === SCENE)) await c.request('CreateScene', { sceneName: SCENE });
  const settings = { url, width: 1280, height: 720, fps_custom: true, fps: 30, reroute_audio: false, restart_when_active: false, shutdown: false };
  const inputs = await c.request('GetInputList', { inputKind: 'browser_source' });
  if (!inputs.inputs.some(i => i.inputName === SOURCE)) {
    await c.request('CreateInput', { sceneName: SCENE, inputName: SOURCE, inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
  } else {
    await c.request('SetInputSettings', { inputName: SOURCE, inputSettings: settings, overlay: true });
    const items = await c.request('GetSceneItemList', { sceneName: SCENE });
    if (!items.sceneItems.some(i => i.sourceName === SOURCE)) await c.request('CreateSceneItem', { sceneName: SCENE, sourceName: SOURCE, sceneItemEnabled: true });
  }
  // fill the whole OBS picture
  const { sceneItemId } = await c.request('GetSceneItemId', { sceneName: SCENE, sourceName: SOURCE });
  await c.request('SetSceneItemTransform', { sceneName: SCENE, sceneItemId, sceneItemTransform: {
    positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: v.baseWidth, boundsHeight: v.baseHeight } });
  await c.request('SetCurrentProgramScene', { sceneName: SCENE });
  const vc = await c.request('GetVirtualCamStatus');
  if (!vc.outputActive) await c.request('StartVirtualCam');
  return { virtualCam: true, size: `${v.baseWidth}x${v.baseHeight}` };
}

// ---------- the whole thing ----------
function createObs({ getPass, url, log = () => {} }) {
  let child = null, conn = null, last = { installed: false, running: false, connected: false, virtualCam: false, err: '' };

  async function tryConnect(port, pass, ms) {
    const until = Date.now() + ms;
    let err;
    while (Date.now() < until) {
      try { return await connect(port, pass); } catch (e) { err = e; if (e.message === 'bad-password') break; await wait(800); }
    }
    throw err || new Error('timeout');
  }
  function launch(exe) {
    child = spawn(exe, ['--minimize-to-tray', '--disable-shutdown-check', '--disable-missing-files-check'], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: true });
    child.on('exit', () => { child = null; conn = null; last.connected = false; last.virtualCam = false; });
    child.unref();
  }

  async function status() {
    const exe = await findExe();
    last.installed = !!exe;
    last.running = exe ? await isRunning() : false;
    // OBS already up with its remote control on (e.g. started earlier): look, without changing anything
    if (!conn && last.running) {
      const cfg = readWsConfig();
      if (cfg && cfg.server_enabled) { try { conn = await connect(cfg.server_port || 4455, cfg.auth_required ? cfg.server_password || '' : '', 1500); } catch { conn = null; } }
    }
    if (conn) {
      try { const vc = await conn.request('GetVirtualCamStatus'); last.connected = true; last.virtualCam = !!vc.outputActive; }
      catch { conn = null; last.connected = false; last.virtualCam = false; }
    } else { last.connected = false; last.virtualCam = false; }
    return { ...last };
  }

  // connect, starting OBS hidden if it is closed. restart: allowed to close a running OBS first.
  async function start({ restart = false } = {}) {
    last.err = '';
    const exe = await findExe();
    if (!exe) { last.err = 'not-installed'; return status(); }
    let running = await isRunning();
    const cfg = readWsConfig();
    // OBS is open but its remote control is off: it has to be closed once so the setting takes
    if (running && !(cfg && cfg.server_enabled)) {
      if (!restart) { last.err = 'needs-restart'; return status(); }
      await closeObs();
      running = false;
    }
    let ws;
    try { ws = ensureWsConfig(getPass()); } catch (e) { last.err = 'config'; log('obs config ' + e.message); return status(); }
    if (!running) launch(exe);
    try {
      if (conn) conn.close();
      conn = await tryConnect(ws.port, ws.pass, running ? 6000 : 30000);
      await setupScene(conn, url);
    } catch (e) {
      log('obs ' + e.message);
      last.err = e.message === 'bad-password' ? 'bad-password' : 'no-connection';
      conn = null;
    }
    return status();
  }

  async function closeObs() {
    await run('taskkill', ['/IM', 'obs64.exe']);
    for (let i = 0; i < 20 && await isRunning(); i++) await wait(500);
    if (await isRunning()) await run('taskkill', ['/IM', 'obs64.exe', '/F']);
    conn = null;
  }

  // when the app closes: if we started OBS, stop the camera and close it again
  async function shutdown() {
    try { if (conn) await conn.request('StopVirtualCam'); } catch {}
    try { if (conn) conn.close(); } catch {}
    if (child && child.pid) { try { process.kill(child.pid); } catch {} }
  }

  return { status, start, install, shutdown, closeObs };
}

module.exports = { createObs, findExe };
