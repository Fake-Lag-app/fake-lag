// The camera window: real camera in, broken-looking picture out (captured by OBS),
// real mic in, broken-sounding audio out (to VB-Cable).
const W = 1280, H = 720;
const out = document.getElementById('out');
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
  if (S.fakeCam) { camOk = true; camErr = ''; report(); return; }   // self-test: test pattern, never the real camera
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
    micOk = true; lagNode.port.postMessage({ blocks: audioBlocks });
  } catch (e) { console.warn('audio', e); }
  report();
}

function testPattern(c, W, H) {
  const t = performance.now() / 1000, g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2b4c7e'); g.addColorStop(1, '#7e2b5c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(W / 2 + Math.sin(t) * W * 0.25, H / 2, H * 0.14, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = `bold ${H / 9 | 0}px sans-serif`; c.textAlign = 'center'; c.fillText(new Date().toLocaleTimeString('he-IL'), W / 2, H * 0.18);
}
function grab(c) {
  if (S.fakeCam) { testPattern(c, W, H); return true; }
  if (camOk && video.readyState >= 2) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    c.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return true;
  }
  c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
  return false;
}

// ---------- the engine: plays built-in and custom lags (effects.js) ----------
let mode = 'live', level = 0.4, lastFx = '', audioBlocks = [];
const engine = FLEffects.createEngine({ W, H, out, drawSource: grab });
const fxLabel = st => (st.video.map(b => b.b).join('+') || 'live');
function onStep(i, st) {
  lastFx = fxLabel(st); audioBlocks = st.audio;
  if (lagNode) lagNode.port.postMessage({ blocks: audioBlocks });
  report();
}
function play(what, id) {
  mode = id;
  engine.play(what, { onStep, onEnd: () => { mode = 'live'; report(); } });
  report();
}

function setMode(m) {
  if (!FLSchema.BUILTIN_IDS.includes(m)) return;
  // reconnecting from "normal" makes no sense: just stay normal
  if (m === 'reconnect' && (mode === 'live' || mode === 'reconnect')) m = 'live';
  play(m, m);
}
function playPreset(p, id) {
  const v = FLSchema.validate(p);   // never trust a preset, even our own
  if (v.ok) play(v.value, id || 'custom');
}
function setLevel(v) {
  level = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  engine.setLevel(level);
  report();
  // save once the slider stops moving, not on every tick
  clearTimeout(levelSave); levelSave = setTimeout(() => window.fl.setSettings({ level }), 500);
}
let levelSave = 0;
function report() { window.fl.sendState({ mode, fx: lastFx || mode, level, camOk, micOk, outName, camErr }); }

window.fl.onCmd(c => {
  if (c.t === 'mode') setMode(c.mode);
  else if (c.t === 'play' && c.preset) playPreset(c.preset, c.id);
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
  if (!S.photo) { photo = null; engine.setEnv({ photo: null }); return; }
  const img = new Image(); img.onload = () => { photo = img; engine.setEnv({ photo: img }); }; img.src = S.photo;
}

async function applySettings(next) {
  const prev = S; S = next; level = S.level ?? level; engine.setLevel(level);
  engine.setEnv({ name: S.name || '', lang: S.lang || 'he' });
  if (prev.photo !== S.photo) loadPhoto();
  if (prev.camId !== S.camId || !camStream) await setupCam();
  if (prev.micId !== S.micId || prev.outId !== S.outId || (!actx && S.outId)) await setupAudio();
}
window.fl.onSettings(applySettings);

(async () => {
  await applySettings(await window.fl.getSettings());
  // a timer, not requestAnimationFrame: rAF stops when the window is covered (by Zoom, all lesson long)
  window.__frames = 0; window.__sent = 0;
  play('live', 'live');
  setInterval(() => { engine.frame(performance.now()); window.__frames++; sendFrame(); }, 1000 / 30);
})();
