// The "לאגים" tab (my lags + store + editor) and the admin tab.
// All text from users or the store is put on screen with textContent only, never as HTML.
(function () {
  const SC = window.FLSchema, fl = window.fl;
  let S = {}, state = {}, lang = 'he', storeKind = 'effect', storeSort = 'new', sub = 'mine';

  const TX = {
    he: {
      mine: 'שלי', store: 'חנות', newEffect: '+ אפקט חדש', newLag: '+ לאג חדש', builtin: 'מובנה', effect: 'אפקט', lag: 'לאג',
      play: '▶ נגן', edit: 'עריכה', copy: 'עותק לעריכה', del: 'מחיקה', share: 'שתף לכולם', slotTip: 'על קיצור Ctrl+Alt+Shift+',
      back: '→ חזרה', name: 'שם', namePh: 'למשל: וויפיי של סבתא', save: 'שמירה', saved: 'נשמר ✓',
      previewHint: 'תצוגה מקדימה, רק אצלך. הקול נשמע רק כשמנגנים על המצלמה.', playOnCam: '▶ נגן על המצלמה (זום יראה!)',
      video: 'תמונה', audio: 'קול', addLayer: '+ שכבה', none: 'אין שכבות', steps: 'שלבים', step: 'שלב', addStep: '+ שלב',
      secs: 'שניות', forever: 'עד הסוף', loadFrom: 'טען שכבות מ…', endHold: 'בסוף: להישאר כך', endLive: 'בסוף: לחזור לרגיל',
      confirmDel: 'למחוק את "%s"?', shareTitle: 'שיתוף לכולם', nick: 'כינוי (מה שיופיע בחנות)', nickPh: 'כינוי, לא שם אמיתי',
      send: 'שליחה', cancel: 'ביטול', sent: 'נשלח! הוא יופיע בחנות אחרי אישור.', storeOffline: 'החנות עוד לא באוויר. בקרוב!',
      network: 'אין חיבור לחנות כרגע.', rate: 'שלחת הרבה היום. נסה מחר.', effects: 'אפקטים', lags: 'לאגים', newest: 'חדשים', top: 'פופולריים',
      by: 'מאת', anon: 'אנונימי', add: '+ הוסף לשלי', added: 'נוסף ✓', try: '▶ נסה', empty: 'עוד אין כאן כלום.', loading: 'טוען…',
      pending: 'ממתינים לאישור', approve: '✓ אשר', reject: '✕ דחה', remove: '🗑 מחק מהחנות', refresh: 'רענון', nothingPending: 'אין מה לאשר 🎉',
      adminPreview: 'לחץ "▶ תצוגה" על פריט כדי לראות אותו על המצלמה שלך', err: 'שגיאה: ',
      report: '🚩', reportTip: 'דווח על תוכן לא מתאים', reported: 'תודה, דווח ✓', featured: '⭐ מומלץ',
      paused: 'השיתוף סגור כרגע. נסה שוב בהמשך.', word: 'יש בשם או בטקסט מילה שאסור להשתמש בה.',
    },
    en: {
      mine: 'Mine', store: 'Store', newEffect: '+ New effect', newLag: '+ New lag', builtin: 'Built-in', effect: 'Effect', lag: 'Lag',
      play: '▶ Play', edit: 'Edit', copy: 'Copy to edit', del: 'Delete', share: 'Share', slotTip: 'On shortcut Ctrl+Alt+Shift+',
      back: '← Back', name: 'Name', namePh: 'e.g. Grandma’s Wi-Fi', save: 'Save', saved: 'Saved ✓',
      previewHint: 'Preview, only you see it. Sound plays only when you play it on the camera.', playOnCam: '▶ Play on camera (Zoom will see it!)',
      video: 'Picture', audio: 'Sound', addLayer: '+ Layer', none: 'No layers', steps: 'Steps', step: 'Step', addStep: '+ Step',
      secs: 'seconds', forever: 'Until the end', loadFrom: 'Load layers from…', endHold: 'At the end: stay like this', endLive: 'At the end: back to normal',
      confirmDel: 'Delete "%s"?', shareTitle: 'Share with everyone', nick: 'Nickname (shown in the store)', nickPh: 'A nickname, not your real name',
      send: 'Send', cancel: 'Cancel', sent: 'Sent! It shows up in the store once approved.', storeOffline: 'The store isn’t online yet. Soon!',
      network: 'Can’t reach the store right now.', rate: 'You sent a lot today. Try tomorrow.', effects: 'Effects', lags: 'Lags', newest: 'Newest', top: 'Popular',
      by: 'by', anon: 'anonymous', add: '+ Add to mine', added: 'Added ✓', try: '▶ Try', empty: 'Nothing here yet.', loading: 'Loading…',
      pending: 'Waiting for approval', approve: '✓ Approve', reject: '✕ Reject', remove: '🗑 Remove from store', refresh: 'Refresh', nothingPending: 'Nothing to approve 🎉',
      adminPreview: 'Press "▶ Preview" on an item to see it on your camera', err: 'Error: ',
      report: '🚩', reportTip: 'Report inappropriate content', reported: 'Thanks, reported ✓', featured: '⭐ Featured',
      paused: 'Sharing is closed right now. Try again later.', word: 'The name or text has a word that isn’t allowed.',
    },
  };
  const t = k => (TX[lang] || TX.he)[k] ?? k;
  const mt = k => window.T(lang)(k);
  const blockLabel = (defs, b) => (defs[b] ? defs[b][lang] || defs[b].he : b);

  // tiny DOM builder: text always goes in as text
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const errText = e => ['offline', 'network', 'rate', 'paused', 'word'].includes(e) ? t(e === 'offline' ? 'storeOffline' : e) : t('err') + e;

  // ---------- preview: our own copy of the camera, never sent anywhere ----------
  let pv = null, pvGen = 0;
  async function startPreview(canvas) {
    stopPreview();
    const gen = ++pvGen;   // a newer preview (or a stop) while we wait for the camera wins
    const video = document.createElement('video'); video.muted = true; video.playsInline = true;
    let stream = null;
    if (!S.fakeCam) try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: S.camId ? { exact: S.camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (gen !== pvGen) { stream.getTracks().forEach(x => x.stop()); return null; }
      video.srcObject = stream; await video.play();
    } catch {}
    if (gen !== pvGen) { if (stream) stream.getTracks().forEach(x => x.stop()); return null; }
    const engine = FLEffects.createEngine({ W: 640, H: 360, out: canvas, env: { name: S.name || '', lang },
      drawSource: (c, W, H) => {
        if (stream && video.readyState >= 2) {
          const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh);
          c.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
        } else {
          // no camera (or the self-test): a moving test pattern
          const t = performance.now() / 1000, g = c.createLinearGradient(0, 0, W, H);
          g.addColorStop(0, '#2b4c7e'); g.addColorStop(1, '#7e2b5c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(W / 2 + Math.sin(t) * W * 0.25, H / 2, H * 0.14, 0, 7); c.fill();
        }
      } });
    engine.setLevel(S.level ?? 0.4);
    const timer = setInterval(() => engine.frame(performance.now()), 1000 / 30);
    pv = { engine, stream, timer };
    return engine;
  }
  function stopPreview() { pvGen++; if (!pv) return; clearInterval(pv.timer); if (pv.stream) pv.stream.getTracks().forEach(x => x.stop()); pv = null; }
  function previewPlay(p) { if (!pv) return; const v = SC.validate({ ...p, name: p.name || 'x' }); pv.engine.play(v.ok ? v.value : 'live'); }

  // ---------- presets ----------
  const builtinPreset = id => SC.BUILTIN_LAGS[id]
    ? { kind: 'lag', name: mt('m_' + id), steps: JSON.parse(JSON.stringify(SC.BUILTIN_LAGS[id].steps)), end: SC.BUILTIN_LAGS[id].end }
    : { kind: 'effect', name: mt('m_' + id), ...JSON.parse(JSON.stringify(SC.BUILTIN_EFFECTS[id])) };
  const playOnCam = (p, id) => SC.BUILTIN_IDS.includes(id) ? fl.cmd({ t: 'mode', mode: id }) : fl.cmd({ t: 'play', preset: p, id });
  async function savePresets(list) { S = await fl.setSettings({ presets: list }); }
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- page: mine ----------
  function slotButtons(id) {
    return h('span', { class: 'slots' }, ['7', '8'].map(k => h('button', {
      class: 'slot' + (S.slots && S.slots[k] === id ? ' on' : ''), title: t('slotTip') + k, text: k,
      onclick: async () => { const slots = { ...S.slots, [k]: S.slots && S.slots[k] === id ? '' : id }; S = await fl.setSettings({ slots }); render(); },
    })));
  }
  function card(p, id, { builtin } = {}) {
    const on = state.mode === id;
    return h('div', { class: 'lcard' + (on ? ' on' : '') },
      h('div', { class: 'lhead' },
        h('b', { text: p.name }),
        h('span', { class: 'badge', text: builtin ? t('builtin') : t(p.kind) }),
        p.from === 'store' && p.by ? h('small', { text: `${t('by')} ${p.by}` }) : null),
      h('div', { class: 'lbtns' },
        h('button', { class: 'ghost', text: t('play'), onclick: () => playOnCam(p, id) }),
        builtin
          ? h('button', { class: 'ghost', text: t('copy'), onclick: () => openEditor({ ...builtinPreset(id), name: p.name + ' 2' }) })
          : h('button', { class: 'ghost', text: t('edit'), onclick: () => openEditor(p) }),
        !builtin ? h('button', { class: 'ghost', text: t('share'), onclick: () => openShare(p) }) : null,
        !builtin ? h('button', { class: 'ghost danger', text: t('del'), onclick: async () => {
          if (!confirm(t('confirmDel').replace('%s', p.name))) return;
          await savePresets(S.presets.filter(x => x.id !== id));
          const slots = { ...S.slots }; for (const k of ['7', '8']) if (slots[k] === id) slots[k] = '';
          S = await fl.setSettings({ slots }); render();
        } }) : null,
        slotButtons(id)));
  }
  function renderMine(root) {
    root.append(h('div', { class: 'row' },
      h('button', { class: 'primary', text: t('newEffect'), onclick: () => openEditor({ kind: 'effect', name: '', video: [{ b: 'pixelate', size: 10, smooth: 0 }], audio: [{ b: 'robot', a: 0.4 }] }) }),
      h('button', { class: 'primary', text: t('newLag'), onclick: () => openEditor({ kind: 'lag', name: '', end: 'hold', steps: [
        { ms: 3000, ...JSON.parse(JSON.stringify(SC.BUILTIN_EFFECTS.lag)) }, { ms: 0, ...JSON.parse(JSON.stringify(SC.BUILTIN_EFFECTS.freeze)) }] }) })));
    for (const p of S.presets || []) root.append(card(p, p.id));
    for (const id of SC.BUILTIN_IDS) root.append(card({ name: mt('m_' + id), kind: SC.BUILTIN_LAGS[id] ? 'lag' : 'effect' }, id, { builtin: true }));
  }

  // ---------- page: store ----------
  async function renderStore(root) {
    const canvas = h('canvas', { class: 'pv', width: 640, height: 360 });
    root.append(h('div', { class: 'pvwrap' }, canvas, h('small', { text: t('previewHint') })));
    startPreview(canvas);
    const seg = (cur, opts, set) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: cur === v ? 'on' : '', text: l, onclick: () => { set(v); render(); } })));
    root.append(h('div', { class: 'row' },
      seg(storeKind, [['effect', t('effects')], ['lag', t('lags')]], v => { storeKind = v; }),
      seg(storeSort, [['new', t('newest')], ['top', t('top')]], v => { storeSort = v; })));
    if (!S.storeReady) { root.append(h('p', { class: 'note', text: t('storeOffline') })); return; }
    const list = h('div', { class: 'list' }, h('p', { class: 'note', text: t('loading') }));
    root.append(list);
    const r = await fl.storeList({ kind: storeKind, sort: storeSort });
    list.textContent = '';
    if (!r.ok) { list.append(h('p', { class: 'note warn', text: errText(r.error) })); return; }
    if (!r.items.length) { list.append(h('p', { class: 'note', text: t('empty') })); return; }
    for (const it of r.items) {
      const p = it.data, have = (S.presets || []).some(x => x.sid === it.id);
      const likeBtn = h('button', { class: 'ghost', text: `♥ ${it.likes}`, onclick: async () => {
        const x = await fl.storeLike(it.id); if (x.ok) likeBtn.textContent = `♥ ${x.likes ?? it.likes + 1}`;
      } });
      const reportBtn = h('button', { class: 'ghost', text: t('report'), title: t('reportTip'), onclick: async () => {
        if (!confirm(t('reportTip') + '?')) return;
        const x = await fl.storeReport(it.id); if (x.ok) { reportBtn.textContent = t('reported'); reportBtn.disabled = true; } else alert(errText(x.error));
      } });
      list.append(h('div', { class: 'lcard' + (it.featured ? ' feat' : '') },
        h('div', { class: 'lhead' }, h('b', { text: p.name }), h('span', { class: 'badge', text: t(p.kind) }),
          it.featured ? h('span', { class: 'badge gold', text: t('featured') }) : null, h('small', { text: `${t('by')} ${p.by || t('anon')}` })),
        h('div', { class: 'lbtns' },
          h('button', { class: 'ghost', text: t('try'), onclick: () => previewPlay(p) }),
          h('button', { class: 'ghost', text: have ? t('added') : t('add'), disabled: have, onclick: async e => {
            await savePresets([...(S.presets || []), { ...p, id: newId(), from: 'store', sid: it.id }]); e.target.textContent = t('added'); e.target.disabled = true;
          } }),
          likeBtn, reportBtn,
          S.isAdmin ? h('button', { class: 'ghost danger', text: t('remove'), onclick: async () => {
            if (!confirm(t('confirmDel').replace('%s', p.name))) return;
            const x = await fl.adminCall(`/api/admin/${it.id}/delete`, 'POST'); if (x.status === 200) render(); else alert(errText(x.error || x.status));
          } }) : null)));
    }
  }

  // ---------- editor ----------
  let draft = null, pvTimer = 0;
  function openEditor(p) { draft = JSON.parse(JSON.stringify(p)); sub = 'editor'; render(); }
  function changed() { clearTimeout(pvTimer); pvTimer = setTimeout(() => previewPlay(draft), 120); }

  function slider(obj, key, spec, label) {
    const [min, max, def, step] = spec;
    if (obj[key] == null) obj[key] = def;
    const val = h('span', { class: 'val', text: String(obj[key]) });
    return h('label', { class: 'sl' }, h('span', { text: label }), val,
      h('input', { type: 'range', min, max, step, value: obj[key], oninput: e => { obj[key] = +e.target.value; val.textContent = e.target.value; changed(); } }));
  }
  const PARAM_LABELS = { he: { fps: 'פריימים בשנייה', jitter: 'חוסר יציבות', size: 'גודל', smooth: 'חלק (0/1)', px: 'פיקסלים', block: 'גודל קובייה', keep: 'כמה נתקע', smear: 'מריחה', a: 'עוצמה', sat: 'רוויה', bright: 'בהירות', contrast: 'ניגודיות', count: 'כמות', gray: 'אפור', name: 'להציג שם (0/1)', text: 'טקסט', ms: 'השהיה (ms)' },
    en: { fps: 'Frames per second', jitter: 'Unsteadiness', size: 'Size', smooth: 'Smooth (0/1)', px: 'Pixels', block: 'Block size', keep: 'How stuck', smear: 'Smear', a: 'Strength', sat: 'Saturation', bright: 'Brightness', contrast: 'Contrast', count: 'Count', gray: 'Gray', name: 'Show name (0/1)', text: 'Text', ms: 'Delay (ms)' } };
  const pl = k => (PARAM_LABELS[lang] || PARAM_LABELS.he)[k] || k;

  function layerList(target, key, defs, max) {
    const list = target[key] = target[key] || [];
    const box = h('div', { class: 'layers' });
    const redraw = () => { box.replaceWith(layerList(target, key, defs, max)); changed(); };
    if (!list.length) box.append(h('p', { class: 'note', text: t('none') }));
    list.forEach((blk, i) => {
      const def = defs[blk.b];
      const params = Object.entries(def.p).map(([k, spec]) => Array.isArray(spec)
        ? slider(blk, k, spec, pl(k))
        : h('label', { class: 'sl' }, h('span', { text: pl(k) }), h('input', { maxlength: spec.text, value: blk[k] || '', oninput: e => { blk[k] = e.target.value; changed(); } })));
      box.append(h('div', { class: 'layer' },
        h('div', { class: 'lhead' }, h('b', { text: blockLabel(defs, blk.b) }),
          h('span', { class: 'tools' },
            h('button', { class: 'icon', text: '↑', disabled: i === 0, onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); redraw(); } }),
            h('button', { class: 'icon', text: '↓', disabled: i === list.length - 1, onclick: () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); redraw(); } }),
            h('button', { class: 'icon', text: '✕', onclick: () => { list.splice(i, 1); redraw(); } }))),
        params));
    });
    if (list.length < max) {
      const sel = h('select', { onchange: e => { if (!e.target.value) return; list.push({ b: e.target.value }); redraw(); } },
        h('option', { value: '', text: t('addLayer') }),
        Object.keys(defs).map(b => h('option', { value: b, text: blockLabel(defs, b) })));
      box.append(sel);
    }
    return box;
  }
  function layersFor(target) {
    return h('div', { class: 'two' },
      h('div', {}, h('h4', { text: t('video') }), layerList(target, 'video', SC.VIDEO, SC.LIMITS.videoBlocks)),
      h('div', {}, h('h4', { text: t('audio') }), layerList(target, 'audio', SC.AUDIO, SC.LIMITS.audioBlocks)));
  }
  // effects you can copy layers from: built-ins and your own effects
  function effectSources() {
    return [...['lag', 'low', 'mosh', 'freeze', 'black'].map(id => [id, mt('m_' + id), SC.BUILTIN_EFFECTS[id]]),
      ...(S.presets || []).filter(p => p.kind === 'effect').map(p => [p.id, p.name, p])];
  }
  function stepsEditor() {
    const box = h('div', { class: 'steps' });
    const redraw = () => { box.replaceWith(stepsEditor()); changed(); };
    draft.steps.forEach((st, i) => {
      const last = i === draft.steps.length - 1;
      const secs = h('input', { type: 'number', min: 0.1, max: 60, step: 0.1, value: st.ms ? st.ms / 1000 : 3, disabled: last && st.ms === 0,
        oninput: e => { st.ms = Math.round(Math.max(0.1, Math.min(60, +e.target.value || 0.1)) * 1000); changed(); } });
      const forever = last ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.ms === 0 || null,
        onchange: e => { st.ms = e.target.checked ? 0 : 3000; redraw(); } }), t('forever')) : null;
      const load = h('select', { onchange: e => {
        const src = effectSources().find(x => x[0] === e.target.value); if (!src) return;
        st.video = JSON.parse(JSON.stringify(src[2].video || [])); st.audio = JSON.parse(JSON.stringify(src[2].audio || [])); redraw();
      } }, h('option', { value: '', text: t('loadFrom') }), effectSources().map(([v, l]) => h('option', { value: v, text: l })));
      box.append(h('details', { class: 'stepbox', open: draft.steps.length <= 2 || null },
        h('summary', {},
          h('b', { text: `${t('step')} ${i + 1}` }), ' ',
          h('small', { text: (st.video || []).map(b => blockLabel(SC.VIDEO, b.b)).join(' + ') || mt('m_live') }),
          h('span', { class: 'tools' },
            h('button', { class: 'icon', text: '↑', disabled: i === 0, onclick: e => { e.preventDefault(); draft.steps.splice(i - 1, 0, draft.steps.splice(i, 1)[0]); fixForever(); redraw(); } }),
            h('button', { class: 'icon', text: '↓', disabled: last, onclick: e => { e.preventDefault(); draft.steps.splice(i + 1, 0, draft.steps.splice(i, 1)[0]); fixForever(); redraw(); } }),
            h('button', { class: 'icon', text: '✕', disabled: draft.steps.length === 1, onclick: e => { e.preventDefault(); draft.steps.splice(i, 1); fixForever(); redraw(); } }))),
        h('div', { class: 'row' }, h('label', { class: 'inl' }, secs, ' ', t('secs')), forever, load),
        layersFor(st)));
    });
    if (draft.steps.length < SC.LIMITS.steps) box.append(h('button', { class: 'ghost', text: t('addStep'), onclick: () => {
      const lastSt = draft.steps[draft.steps.length - 1]; if (lastSt.ms === 0) lastSt.ms = 3000;
      draft.steps.push({ ms: 3000, video: [{ b: 'dropFrames', fps: 3, jitter: 0.5 }], audio: [{ b: 'loss', a: 0.2 }] }); redraw();
    } }));
    return box;
  }
  // only the last step may last forever
  function fixForever() { draft.steps.forEach((s, i) => { if (s.ms === 0 && i !== draft.steps.length - 1) s.ms = 3000; }); }

  function renderEditor(root) {
    const canvas = h('canvas', { class: 'pv', width: 640, height: 360 });
    const msg = h('p', { class: 'note' });
    root.append(
      h('div', { class: 'row' }, h('button', { class: 'ghost', text: t('back'), onclick: () => { draft = null; sub = 'mine'; render(); } }),
        h('span', { class: 'badge', text: t(draft.kind) })),
      h('label', { class: 'sl' }, h('span', { text: t('name') }),
        h('input', { maxlength: SC.LIMITS.name, value: draft.name, placeholder: t('namePh'), oninput: e => { draft.name = e.target.value; } })),
      h('div', { class: 'pvwrap' }, canvas, h('small', { text: t('previewHint') })),
      ...(draft.kind === 'effect' ? [layersFor(draft)] : [
        h('h4', { text: t('steps') }), stepsEditor(),
        h('select', { onchange: e => { draft.end = e.target.value; } },
          h('option', { value: 'hold', text: t('endHold'), selected: draft.end !== 'live' || null }),
          h('option', { value: 'live', text: t('endLive'), selected: draft.end === 'live' || null }))]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', text: t('save'), onclick: async () => {
          const v = SC.validate(draft);
          if (!v.ok) { msg.className = 'note warn'; msg.textContent = t('err') + v.error; return; }
          const id = draft.id || newId();
          const list = (S.presets || []).filter(x => x.id !== id);
          const keep = (S.presets || []).find(x => x.id === id);
          list.unshift({ ...v.value, id, from: keep ? keep.from : 'mine', sid: keep ? keep.sid : undefined });
          await savePresets(list); draft.id = id; msg.className = 'note ok'; msg.textContent = t('saved');
        } }),
        h('button', { class: 'ghost', text: t('playOnCam'), onclick: () => { const v = SC.validate({ ...draft, name: draft.name || 'x' }); if (v.ok) playOnCam(v.value, draft.id || 'custom'); } })),
      msg);
    startPreview(canvas).then(() => previewPlay(draft));
  }

  // ---------- share ----------
  function openShare(p) {
    const dlg = h('dialog', { class: 'dlg' });
    const nick = h('input', { maxlength: SC.LIMITS.by, value: S.nick || '', placeholder: t('nickPh') });
    const msg = h('p', { class: 'note' });
    fl.getAnnounce().then(a => { if (a && a.submitOpen === false) { msg.className = 'note warn'; msg.textContent = t('paused'); send.disabled = true; } });
    const send = h('button', { class: 'primary', text: t('send'), onclick: async () => {
      send.disabled = true;
      await fl.setSettings({ nick: nick.value.trim() });
      const { id, from, sid, ...clean } = p;
      const r = await fl.storeSubmit({ ...clean, by: nick.value.trim() });
      msg.className = 'note ' + (r.ok ? 'ok' : 'warn'); msg.textContent = r.ok ? t('sent') : errText(r.error);
      send.disabled = r.ok;
    } });
    dlg.append(h('h3', { text: t('shareTitle') }), h('p', { text: p.name }), h('label', { class: 'sl' }, h('span', { text: t('nick') }), nick), msg,
      h('div', { class: 'row' }, send, h('button', { class: 'ghost', text: t('cancel'), onclick: () => { dlg.close(); dlg.remove(); } })));
    document.body.append(dlg); dlg.showModal();
  }

  // ---------- admin: the same panel as the admin web page (admin-ui.js), talking through main ----------
  function renderAdmin(root) {
    const canvas = h('canvas', { class: 'pv', width: 640, height: 360 });
    root.append(h('div', { class: 'pvwrap' }, canvas, h('small', { text: t('adminPreview') })));
    startPreview(canvas);
    const panel = h('div');
    root.append(panel);
    window.FLAdminUI.mount(panel, { call: (path, method, body) => fl.adminCall(path, method, body), preview: p => previewPlay(p) });
  }

  // ---------- render ----------
  let currentTab = '';
  function render() {
    stopPreview();
    const lagsRoot = document.getElementById('lagsRoot'), adminRoot = document.getElementById('adminRoot');
    if (currentTab === 'lags' && lagsRoot) {
      lagsRoot.textContent = '';
      if (sub !== 'editor') lagsRoot.append(h('div', { class: 'seg big' },
        h('button', { class: sub === 'mine' ? 'on' : '', text: t('mine'), onclick: () => { sub = 'mine'; render(); } }),
        h('button', { class: sub === 'store' ? 'on' : '', text: t('store'), onclick: () => { sub = 'store'; render(); } })));
      if (sub === 'editor' && draft) renderEditor(lagsRoot);
      else if (sub === 'store') renderStore(lagsRoot);
      else renderMine(lagsRoot);
    }
    if (currentTab === 'admin' && adminRoot) { adminRoot.textContent = ''; renderAdmin(adminRoot); }
  }

  window.LagsUI = {
    onTab(name) { const prev = currentTab; currentTab = name; if (name === 'lags' || name === 'admin') { if (prev !== name || !document.getElementById(name === 'lags' ? 'lagsRoot' : 'adminRoot').childElementCount) render(); } else stopPreview(); },
    setSettings(s) { const langChanged = s.lang !== lang; S = s; lang = s.lang || 'he'; document.querySelector('[data-tab=admin]').hidden = !S.isAdmin; if (langChanged && sub !== 'editor') render(); },
    setState(s) { const changed = s.mode !== state.mode; state = s; if (changed && currentTab === 'lags' && sub === 'mine') render(); },
  };
})();
