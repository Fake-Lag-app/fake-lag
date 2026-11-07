// Admin page: approve or reject what people shared, preview each one on your own camera.
// The key comes from the link (#k=...) or the box, lives only in this tab, and goes out only as a header.
(function () {
  const $ = s => document.querySelector(s);
  let key = '', view = 'pending', engine = null;

  // take the key from the link once, then wipe it from the address bar
  const m = location.hash.match(/k=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname); }
  try { key = key || sessionStorage.getItem('flk') || ''; } catch {}

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  async function call(path, method = 'GET') {
    try {
      const r = await fetch('/api' + path, { method, headers: key ? { authorization: 'Bearer ' + key } : {} });
      const data = await r.json().catch(() => ({}));
      return { status: r.status, ...data };
    } catch { return { status: 0, error: 'אין חיבור. נסה שוב.' }; }
  }

  // ---------- preview on the phone/computer camera, test pattern if there is none ----------
  async function startPreview() {
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    let ok = false;
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); video.srcObject = s; await video.play(); ok = true; } catch {}
    $('#pvNote').textContent = ok ? 'תצוגה מקדימה על המצלמה שלך. לחץ "▶ תצוגה" על פריט.' : 'אין מצלמה, מוצגת תמונת בדיקה.';
    engine = FLEffects.createEngine({ W: 640, H: 360, out: $('#pv'), env: { name: 'Admin', lang: 'he' }, drawSource: (c, W, H) => {
      if (ok && video.readyState >= 2) { const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh); c.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); return; }
      const t = performance.now() / 1000, g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b4c7e'); g.addColorStop(1, '#7e2b5c');
      c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(W / 2 + Math.sin(t) * 180, H / 2, 50, 0, 7); c.fill();
    } });
    setInterval(() => engine.frame(performance.now()), 1000 / 30);
  }
  const preview = p => { const v = FLSchema.validate(p); engine && engine.play(v.ok ? v.value : 'live'); };

  // ---------- lists ----------
  async function render() {
    const list = $('#list'); list.textContent = '';
    list.append(h('p', { class: 'note', text: 'טוען…' }));
    const r = view === 'pending' ? await call('/admin/pending') : await call(`/items?kind=${view}&sort=new`);
    list.textContent = '';
    if (r.status === 401 || r.status === 429) { logout(r.status === 429 ? 'יותר מדי ניסיונות היום.' : 'הקוד לא נכון.'); return; }
    if (r.error) { list.append(h('p', { class: 'note', text: 'שגיאה: ' + r.error })); return; }
    if (!r.items.length) { list.append(h('p', { class: 'note', text: view === 'pending' ? 'אין מה לאשר 🎉' : 'ריק.' })); return; }
    for (const it of r.items) {
      const v = FLSchema.validate(it.data); if (!v.ok) continue;
      const p = v.value;
      const row = h('div', { class: 'card' },
        h('div', { class: 'head' }, h('b', { text: p.name }), h('span', { class: 'badge', text: p.kind === 'lag' ? 'לאג' : 'אפקט' }),
          h('small', { text: `מאת ${p.by || 'אנונימי'} · ${new Date(it.created * 1000).toLocaleString('he-IL')}${view !== 'pending' ? ` · ♥ ${it.likes}` : ''}` })),
        h('div', { class: 'btns' },
          h('button', { text: '▶ תצוגה', onclick: () => preview(p) }),
          view === 'pending' ? h('button', { class: 'ok', text: '✓ אשר', onclick: () => act(it.id, 'approve', row) }) : null,
          view === 'pending' ? h('button', { class: 'no', text: '✕ דחה', onclick: () => act(it.id, 'reject', row) }) : null,
          view !== 'pending' ? h('button', { class: 'no', text: '🗑 מחק מהחנות', onclick: () => confirm('למחוק?') && act(it.id, 'delete', row) }) : null));
      list.append(row);
    }
  }
  async function act(id, action, row) {
    const r = await call(`/admin/${id}/${action}`, 'POST');
    if (r.ok) row.remove(); else alert('שגיאה: ' + (r.error || r.status));
  }

  // ---------- login ----------
  function logout(msg) {
    key = ''; try { sessionStorage.removeItem('flk'); } catch {}
    $('#app').style.display = 'none'; $('#login').style.display = 'block'; $('#loginMsg').textContent = msg || '';
  }
  async function login() {
    const r = await call('/admin/pending');
    if (r.status !== 200) return logout(r.status === 0 ? r.error : r.status === 429 ? 'יותר מדי ניסיונות היום.' : key ? 'הקוד לא נכון.' : '');
    try { sessionStorage.setItem('flk', key); } catch {}
    $('#login').style.display = 'none'; $('#app').style.display = 'block';
    if (!engine) startPreview();
    render();
  }
  $('#go').onclick = () => { key = $('#key').value.trim(); login(); };
  $('#key').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
  $('#logout').onclick = () => logout('');
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    view = b.dataset.v; document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); render();
  });
  if (key) login(); else logout('');
})();
