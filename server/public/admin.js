// Admin page: the shared admin panel (admin-ui.js) over fetch, with a preview that shows a test pattern
// unless you turn the camera on yourself.
// The key comes from the link (#k=...) or the box, lives only in this tab, and goes out only as a header.
(function () {
  const $ = s => document.querySelector(s);
  let key = '', engine = null, video = null, stream = null;

  // take the key from the link once, then wipe it from the address bar
  const m = location.hash.match(/k=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname); }
  try { key = key || sessionStorage.getItem('flk') || ''; } catch {}

  async function call(path, method = 'GET', body) {
    try {
      const headers = key ? { authorization: 'Bearer ' + key } : {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const data = await r.json().catch(() => ({}));
      return { status: r.status, ...data };
    } catch { return { status: 0, error: 'network' }; }
  }

  // ---------- preview: test pattern, or your camera only after you press the button ----------
  function startPreview() {
    engine = FLEffects.createEngine({ W: 640, H: 360, out: $('#pv'), env: { name: 'Admin', lang: 'he' }, drawSource: (c, W, H) => {
      if (video && video.readyState >= 2) { const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh); c.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); return; }
      const t = performance.now() / 1000, g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b4c7e'); g.addColorStop(1, '#7e2b5c');
      c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(W / 2 + Math.sin(t) * 180, H / 2, 50, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 28px system-ui'; c.textAlign = 'center'; c.fillText('תמונת בדיקה', W / 2, H - 30);
    } });
    setInterval(() => engine.frame(performance.now()), 1000 / 30);
  }
  async function toggleCam() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video = null; $('#cam').textContent = '📷 להשתמש במצלמה'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play();
      $('#cam').textContent = '📷 לכבות מצלמה';
    } catch { $('#pvNote').textContent = 'אין גישה למצלמה, נשארים עם תמונת בדיקה.'; }
  }
  const preview = p => { const v = FLSchema.validate(p); engine && engine.play(v.ok ? v.value : 'live'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ---------- login ----------
  function logout(msg) {
    key = ''; try { sessionStorage.removeItem('flk'); } catch {}
    if (stream) toggleCam();
    $('#app').style.display = 'none'; $('#login').style.display = 'block'; $('#loginMsg').textContent = msg || '';
  }
  async function login() {
    const r = await call('/api/admin/config');
    if (r.status !== 200) return logout(r.status === 0 ? 'אין חיבור. נסה שוב.' : r.status === 429 ? 'יותר מדי ניסיונות היום.' : key ? 'הקוד לא נכון.' : '');
    try { sessionStorage.setItem('flk', key); } catch {}
    $('#login').style.display = 'none'; $('#app').style.display = 'block';
    if (!engine) startPreview();
    FLAdminUI.mount($('#panel'), { call, preview, onAuthFail: r => logout(r.status === 429 ? 'יותר מדי ניסיונות היום.' : 'הקוד לא נכון.') });
  }
  $('#go').onclick = () => { key = $('#key').value.trim(); login(); };
  $('#key').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
  $('#logout').onclick = () => logout('');
  $('#cam').onclick = toggleCam;
  if (key) login(); else logout('');
})();
