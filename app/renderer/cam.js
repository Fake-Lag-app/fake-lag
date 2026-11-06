// The camera window: real camera in, broken-looking picture out (captured by OBS),
// real mic in, broken-sounding audio out (to VB-Cable).
const W = 1280, H = 720;
const out = document.getElementById('out'), ctx = out.getContext('2d');
const cur = new OffscreenCanvas(W, H), cctx = cur.getContext('2d');
const small = new OffscreenCanvas(W, H), sctx = small.getContext('2d');
const video = document.getElementById('v');

let S = {};                       // settings
let camOk = false, micOk = false, outName = '', camErr = '', camRetry = 0;
let camStream = null, micStream = null, actx = null, lagNode = null;
let photo = null;                 // Image for the camera-off screen

// ---------- camera ----------
let camGen = 0;   // only the newest setupCam call may keep its stream
async function setupCam() {
  const gen = ++camGen;
  clearTimeout(camRetry);
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null; camOk = false;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: S.camId ? { exact: S.camId } : undefined, width: { ideal: W }, height: { ideal: H } }, audio: false });
    // a newer call (settings change, retry) started meanwhile: drop this stream instead of leaking it
    if (gen !== camGen) { s.getTracks().forEach(t => t.stop()); return; }
    camStream = s; video.srcObject = s; await video.play(); camOk = true;
  } catch (e) {
    if (gen !== camGen) return;
    console.warn('camera', e); camErr = e.name === 'NotReadableError' ? 'busy' : `${e.name}: ${e.message}`;
    // a camera picked earlier may be unplugged: fall back to the default one
    if (S.camId && e.name === 'OverconstrainedError') { S = { ...S, camId: '' }; return setupCam(); }
    // busy (OBS or Zoom holding it): keep trying until it is free
    clearTimeout(camRetry); camRetry = setTimeout(setupCam, 3000);
  }
  if (camOk) camErr = '';
  report();
}

// ---------- microphone → packet loss → VB-Cable ----------
async function setupAudio() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (actx) { try { await actx.close(); } catch {} }
  micStream = actx = lagNode = null; micOk = false; outName = '';
  // without an output device the app only does the picture; never play the mic to the speakers
  if (!S.outId) return report();
  try {
    // "default" may be VB-Cable itself (its installer makes it the Windows default):
    // that would feed our own output back in, so fall back to the first real microphone
    let micId = S.micId;
    const ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const isVirtual = d => /CABLE|VB-Audio|Voicemeeter|Virtual/i.test(d.label);
    const chosen = ins.find(d => d.deviceId === (micId || 'default'));
    if (!chosen || isVirtual(chosen)) {
      const real = ins.find(d => d.deviceId !== 'default' && d.deviceId !== 'communications' && !isVirtual(d));
      micId = real ? real.deviceId : micId;
    }
    micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
      deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    actx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    await actx.audioWorklet.addModule('lag-worklet.js');
    lagNode = new AudioWorkletNode(actx, 'lag-processor', { outputChannelCount: [2] });
    actx.createMediaStreamSource(micStream).connect(lagNode);
    // only ever play into a virtual cable: a saved speaker choice (older version) would echo the mic into the room
    const outs = await navigator.mediaDevices.enumerateDevices();
    outName = (outs.find(d => d.kind === 'audiooutput' && d.deviceId === S.outId) || {}).label || '';
    if (!/CABLE Input|VB-Audio|Voicemeeter|Virtual/i.test(outName)) throw new Error('output is not a virtual cable: ' + outName);
    await actx.setSinkId(S.outId);
    lagNode.connect(actx.destination);
    micOk = true; lastFx = '';
  } catch (e) { console.warn('audio', e); }
  report();
}

function grab() {
  if (camOk && video.readyState >= 2) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    cctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return true;
  }
  cctx.fillStyle = '#111'; cctx.fillRect(0, 0, W, H);
  return false;
}

// ---------- picture effects (same as the demo video) ----------
function drawLow(a) {
  const f = 3 + Math.round(a * 10);
  const sw = Math.max(16, W / f | 0), sh = Math.max(9, H / f | 0);
  sctx.imageSmoothingEnabled = true; sctx.drawImage(cur, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = a < 0.5;
  ctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
}
function drawMosh(a) {
  const B = 16 + Math.round(a * 16), pUpdate = 0.8 - a * 0.4;
  const f = 2 + Math.round(a * 4), sw = W / f | 0, sh = H / f | 0;
  sctx.imageSmoothingEnabled = true; sctx.drawImage(cur, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y += B) for (let x = 0; x < W; x += B) {
    const r = Math.random();
    if (r < pUpdate) ctx.drawImage(small, x / f, y / f, B / f, B / f, x, y, B, B);
    else if (r < pUpdate + a * 0.03) ctx.drawImage(out, x, y, B, B, x, y + B * (Math.random() < .5 ? 1 : 0.5), B, B);
  }
  ctx.imageSmoothingEnabled = true;
}
function drawBlack() {
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, W, H);
  const name = (S.name || '').trim();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'inherit';
  if (photo) {
    const r = 120, cx = W / 2, cy = H / 2 - 40;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const s = Math.max(2 * r / photo.width, 2 * r / photo.height);
    ctx.drawImage(photo, cx - photo.width * s / 2, cy - photo.height * s / 2, photo.width * s, photo.height * s); ctx.restore();
    if (name) { ctx.fillStyle = '#fff'; ctx.font = '600 40px "Segoe UI", Arial, sans-serif'; ctx.fillText(name, cx, cy + r + 50); }
  } else if (name) {
    ctx.fillStyle = '#fff'; ctx.font = '600 72px "Segoe UI", Arial, sans-serif'; ctx.fillText(name, W / 2, H / 2);
  }
}

// ---------- modes ----------
// manual: live lag low mosh freeze black · scripted: auto reconnect
let mode = 'live', level = 0.4, t0 = 0, nextUpdate = 0, lastFx = '';
const AUTO = [
  { until: 2500, fx: 'lag', a: 0.3 }, { until: 5000, fx: 'low', a: 0.45 }, { until: 7500, fx: 'mosh', a: 0.5 },
  { until: 9000, fx: 'low', a: 0.6 }, { until: 10500, fx: 'mosh', a: 0.6 }, { until: 13500, fx: 'freeze' }, { until: Infinity, fx: 'black' },
];
const RECONNECT = [
  { until: 900, fx: 'mosh', a: 0.35 }, { until: 2100, fx: 'low', a: 0.3 }, { until: 3200, fx: 'lag', a: 0.2 }, { until: Infinity, fx: 'live' },
];
const scale = a => Math.min(1, a * (level / 0.4));   // the "how bad" slider scales the script too

function current(t) {
  if (mode !== 'auto' && mode !== 'reconnect') return { fx: mode, a: level };
  const step = (mode === 'auto' ? AUTO : RECONNECT).find(s => t - t0 < s.until);
  if (mode === 'reconnect' && step.fx === 'live') { setMode('live'); return { fx: 'live', a: level }; }
  return { fx: step.fx, a: scale(step.a ?? level) };
}

function lagReady(t, lo, hi) {
  if (t < nextUpdate) return false;
  nextUpdate = t + (Math.random() < 0.15 ? hi * 2.5 : lo + Math.random() * (hi - lo));
  return true;
}

function render(t) {
  const { fx, a } = current(t);
  if (fx !== lastFx) { lastFx = fx; if (lagNode) lagNode.port.postMessage({ fx, a }); report(); }
  if (fx === 'freeze') return;
  if (fx === 'black') return drawBlack();
  grab();
  if (fx === 'live') return ctx.drawImage(cur, 0, 0);
  if (fx === 'lag' && lagReady(t, 120 + a * 300, 300 + a * 900)) ctx.drawImage(cur, 0, 0);
  else if (fx === 'low' && lagReady(t, 60 + a * 200, 150 + a * 500)) drawLow(a);
  else if (fx === 'mosh' && lagReady(t, 50 + a * 150, 120 + a * 400)) drawMosh(a);
}

function setMode(m) {
  // reconnecting from "normal" makes no sense: just stay normal
  if (m === 'reconnect' && (mode === 'live' || mode === 'reconnect')) m = 'live';
  mode = m; t0 = performance.now(); nextUpdate = 0; report();
}
function setLevel(v) {
  level = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  if (lagNode) lagNode.port.postMessage({ fx: lastFx, a: level });
  report();
  // save once the slider stops moving, not on every tick
  clearTimeout(levelSave); levelSave = setTimeout(() => window.fl.setSettings({ level }), 500);
}
let levelSave = 0;
function report() { window.fl.sendState({ mode, fx: lastFx || mode, level, camOk, micOk, outName, camErr }); }

window.fl.onCmd(c => {
  if (c.t === 'mode') setMode(c.mode);
  else if (c.t === 'level') setLevel(c.level ?? level + (c.delta || 0));
});

// keys work when this window is focused too (the global ones live in main.js)
const KEYS = { '1': 'live', '2': 'lag', '3': 'low', '4': 'mosh', '5': 'freeze', '6': 'black', '0': 'auto', '9': 'reconnect' };
addEventListener('keydown', e => { if (KEYS[e.key]) setMode(KEYS[e.key]); else if (e.key === ' ') setMode(mode === 'freeze' ? 'live' : 'freeze'); });

// ---------- picture out to OBS and the remote's preview ----------
// frames are encoded in a worker, only while someone is watching, at most two in flight
let viewers = 0, inFlight = 0;
const encoder = new Worker('encoder.js');
encoder.onmessage = e => { inFlight--; window.fl.frame(new Uint8Array(e.data)); window.__sent++; };
encoder.onerror = () => { inFlight = Math.max(0, inFlight - 1); };
window.fl.onStream(n => { viewers = n; });
function sendFrame() {
  if (!viewers || inFlight >= 2) return;
  inFlight++;
  createImageBitmap(out).then(bmp => encoder.postMessage(bmp, [bmp])).catch(() => { inFlight--; });
}

function loadPhoto() {
  if (!S.photo) { photo = null; return; }
  const img = new Image(); img.onload = () => { photo = img; }; img.src = S.photo;
}

async function applySettings(next) {
  const prev = S; S = next; level = S.level ?? level;
  if (prev.photo !== S.photo) loadPhoto();
  if (prev.camId !== S.camId || !camStream) await setupCam();
  if (prev.micId !== S.micId || prev.outId !== S.outId || (!actx && S.outId)) await setupAudio();
}
window.fl.onSettings(applySettings);

(async () => {
  await applySettings(await window.fl.getSettings());
  // a timer, not requestAnimationFrame: rAF stops when the window is covered (by Zoom, all lesson long)
  window.__frames = 0; window.__sent = 0;
  setInterval(() => { render(performance.now()); window.__frames++; sendFrame(); }, 1000 / 30);
})();
