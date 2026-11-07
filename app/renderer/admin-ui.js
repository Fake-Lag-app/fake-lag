// The admin panel, shared by the app's admin tab and the admin web page.
// The page that mounts it supplies call(path, method, body) -> { status, ...json } and preview(preset).
// Everything that came from users is put on screen with textContent only, never as HTML.
(function (root) {
  let section = 'pending';
  const sel = new Set();
  let opts = null, host = null;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const when = s => new Date(s * 1000).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  const note = (text, cls) => h('p', { class: 'fla-note ' + (cls || ''), text });
  const ERR = { unauthorized: 'הקוד לא נכון.', 'locked for today': 'יותר מדי ניסיונות היום.', network: 'אין חיבור לחנות.', offline: 'החנות לא מחוברת.', 'not admin': 'אין קוד אדמין.' };
  const errText = r => 'שגיאה: ' + (ERR[r.error] || r.error || r.status);
  async function call(path, method, body) {
    const r = await opts.call(path, method || 'GET', body);
    if (r.status === 401 || r.status === 429) opts.onAuthFail && opts.onAuthFail(r);
    return r;
  }

  const SECTIONS = [
    ['pending', 'ממתינים'], ['approved', 'בחנות'], ['reported', 'דיווחים'], ['rejected', 'נדחו'],
    ['stats', 'סטטיסטיקה'], ['settings', 'הגדרות והודעה'], ['blocks', 'חסומים'], ['log', 'יומן'],
  ];

  function render() {
    host.textContent = '';
    host.append(h('div', { class: 'fla-tabs' }, SECTIONS.map(([id, label]) =>
      h('button', { class: section === id ? 'on' : '', text: label, onclick: () => { section = id; sel.clear(); render(); } }))));
    const body = h('div', { class: 'fla-body' });
    host.append(body);
    ({ pending: items, approved: items, reported: items, rejected: items, stats, settings, blocks, log })[section](body);
  }

  // ---------- item lists ----------
  let q = '', kind = '';
  async function items(body) {
    const bar = h('div', { class: 'fla-bar' },
      h('input', { type: 'search', placeholder: 'חיפוש בשם, כינוי או טקסט', value: q, oninput: e => { q = e.target.value; clearTimeout(items.t); items.t = setTimeout(render, 350); } }),
      h('select', { onchange: e => { kind = e.target.value; render(); } },
        [['', 'הכל'], ['effect', 'אפקטים'], ['lag', 'לאגים']].map(([v, l]) => h('option', { value: v, text: l, selected: kind === v ? 'selected' : null }))),
      h('button', { text: '↻ רענון', onclick: render }));
    body.append(bar);
    const list = h('div', {}, note('טוען…'));
    body.append(list);
    const r = await call(`/api/admin/items?status=${section}&kind=${kind}&q=${encodeURIComponent(q)}`);
    list.textContent = '';
    if (r.status !== 200) { list.append(note(errText(r), 'warn')); return; }
    const rows = r.items.map(it => ({ it, v: FLSchema.validate(it.data) })).filter(x => x.v.ok);
    if (!rows.length) { list.append(note(section === 'pending' ? 'אין מה לאשר 🎉' : section === 'reported' ? 'אין דיווחים 🎉' : 'אין כאן כלום.')); return; }
    if (section === 'pending' || section === 'rejected') {
      const count = h('span', { class: 'fla-note', text: '' });
      const upd = () => { count.textContent = sel.size ? `${sel.size} נבחרו` : ''; };
      const bulk = async action => {
        if (!sel.size) return;
        if (action === 'delete' && !confirm(`למחוק ${sel.size} פריטים לתמיד?`)) return;
        const x = await call('/api/admin/bulk', 'POST', { ids: [...sel], action });
        if (x.status !== 200) return alert(errText(x));
        sel.clear(); render();
      };
      list.append(h('div', { class: 'fla-bar' },
        h('label', { class: 'fla-check' }, h('input', { type: 'checkbox', onchange: e => {
          rows.forEach(({ it }) => e.target.checked ? sel.add(it.id) : sel.delete(it.id));
          list.querySelectorAll('input[data-id]').forEach(c => { c.checked = e.target.checked; }); upd();
        } }), 'בחר הכל'),
        section === 'pending' ? h('button', { class: 'ok', text: '✓ אשר נבחרים', onclick: () => bulk('approve') }) : null,
        section === 'pending' ? h('button', { class: 'no', text: '✕ דחה נבחרים', onclick: () => bulk('reject') }) : h('button', { class: 'no', text: '🗑 מחק נבחרים', onclick: () => bulk('delete') }),
        count));
      list.upd = upd;
    }
    for (const { it, v } of rows) list.append(card(it, v.value, list));
  }

  function card(it, p, list) {
    const act = async (action, ask) => {
      if (ask && !confirm(ask)) return;
      const x = await call(`/api/admin/${it.id}/${action}`, 'POST');
      if (x.status !== 200) return alert(errText(x));
      render();
    };
    const B = (text, action, cls, ask) => h('button', { class: cls || '', text, onclick: () => act(action, ask) });
    const meta = [`מאת ${p.by || 'אנונימי'}`, when(it.created), `♥ ${it.likes}`];
    if (it.reports) meta.push(`🚩 ${it.reports}`);
    if (it.sender) meta.push(`שולח #${it.sender}`);
    const el = h('div', { class: 'fla-card' + (it.featured ? ' feat' : '') },
      h('div', { class: 'fla-head' },
        section === 'pending' || section === 'rejected'
          ? h('input', { type: 'checkbox', 'data-id': it.id, checked: sel.has(it.id), onchange: e => { e.target.checked ? sel.add(it.id) : sel.delete(it.id); list.upd && list.upd(); } }) : null,
        h('b', { text: p.name }), h('span', { class: 'fla-badge', text: p.kind === 'lag' ? 'לאג' : 'אפקט' }),
        it.featured ? h('span', { class: 'fla-badge gold', text: '⭐ מומלץ' }) : null,
        it.status !== section && section === 'reported' ? h('span', { class: 'fla-badge', text: it.status === 'pending' ? 'הוסתר אוטומטית' : it.status }) : null),
      h('small', { class: 'fla-note', text: meta.join(' · ') }),
      h('div', { class: 'fla-btns' },
        h('button', { text: '▶ תצוגה', onclick: () => opts.preview(p) }),
        section === 'pending' ? [B('✓ אשר', 'approve', 'ok'), B('✕ דחה', 'reject', 'no')] : null,
        section === 'approved' ? [it.featured ? B('☆ בטל מומלץ', 'unfeature') : B('⭐ מומלץ', 'feature'), B('↩ הורד מהחנות', 'unpublish')] : null,
        section === 'reported' ? [it.status === 'approved' ? B('✓ זה בסדר, נקה דיווחים', 'clearReports', 'ok') : B('✓ החזר לחנות', 'approve', 'ok'), it.status === 'approved' ? B('↩ הורד מהחנות', 'unpublish') : null] : null,
        section === 'rejected' ? B('✓ אשר בכל זאת', 'approve', 'ok') : null,
        h('button', { text: '✎ ערוך', onclick: () => edit(el, it, p) }),
        B('⛔ חסום שולח', 'block', 'no', 'לחסום את מי ששלח את זה? כל מה שהוא שלח יורד, ומה שישלח מעכשיו ייעלם בשקט.'),
        B('🗑 מחק', 'delete', 'no', `למחוק את "${p.name}" לתמיד?`)));
    return el;
  }

  function edit(el, it, p) {
    if (el.querySelector('.fla-edit')) return;
    const name = h('input', { value: p.name, maxlength: 40 }), by = h('input', { value: p.by || '', maxlength: 24, placeholder: 'כינוי' });
    const msg = h('small', { class: 'fla-note warn' });
    el.append(h('div', { class: 'fla-edit' }, h('label', { text: 'שם' }), name, h('label', { text: 'כינוי' }), by, msg,
      h('div', { class: 'fla-btns' },
        h('button', { class: 'ok', text: 'שמור', onclick: async () => {
          const x = await call(`/api/admin/${it.id}/edit`, 'POST', { name: name.value, by: by.value });
          if (x.status !== 200) { msg.textContent = errText(x); return; }
          render();
        } }),
        h('button', { text: 'ביטול', onclick: e => e.target.closest('.fla-edit').remove() }))));
  }

  // ---------- stats ----------
  async function stats(body) {
    body.append(note('טוען…'));
    const r = await call('/api/admin/stats');
    body.textContent = '';
    if (r.status !== 200) { body.append(note(errText(r), 'warn')); return; }
    const n = (status, k) => r.byStatus.filter(x => x.status === status && (!k || x.kind === k)).reduce((s, x) => s + x.n, 0);
    const tile = (label, value, sub) => h('div', { class: 'fla-tile' }, h('small', { text: label }), h('b', { text: String(value) }), sub ? h('small', { text: sub }) : null);
    body.append(h('div', { class: 'fla-tiles' },
      tile('הורדות של האפליקציה', r.downloads ? r.downloads.total : '—', r.downloads ? r.downloads.releases.slice(0, 3).map(x => `${x.tag}: ${x.n}`).join(' · ') : 'GitHub לא ענה'),
      tile('בחנות', n('approved'), `${n('approved', 'effect')} אפקטים · ${n('approved', 'lag')} לאגים`),
      tile('ממתינים', n('pending')),
      tile('נדחו', n('rejected')),
      tile('לייקים', r.likes),
      tile('מומלצים', r.featured),
      tile('עם דיווחים', r.reported),
      tile('שולחים שונים', r.senders),
      tile('חסומים', r.blocks)));
    // shares per day, last 14 days
    const today = Math.floor(Date.now() / 86400000), byDay = new Map(r.perDay.map(x => [x.d, x.n]));
    const days = Array.from({ length: 14 }, (_, i) => today - 13 + i), max = Math.max(1, ...days.map(d => byDay.get(d) || 0));
    body.append(h('h4', { text: 'שיתופים ב-14 הימים האחרונים' }),
      h('div', { class: 'fla-chart' }, days.map(d => {
        const v = byDay.get(d) || 0;
        return h('div', { class: 'fla-col', title: `${new Date(d * 86400000).toLocaleDateString('he-IL')}: ${v}` },
          h('span', { text: v ? String(v) : '' }), h('i', { style: `height:${Math.round(v / max * 100)}%` }),
          h('small', { text: new Date(d * 86400000).getDate() + '' }));
      })));
    body.append(h('h4', { text: 'הכי אהובים' }));
    if (!r.top.length) body.append(note('עוד אין.'));
    for (const it of r.top) { const v = FLSchema.validate(it.data); if (v.ok) body.append(h('div', { class: 'fla-line' }, h('span', { text: `♥ ${it.likes}` }), h('b', { text: v.value.name }), h('small', { class: 'fla-note', text: v.value.by || '' }), h('button', { text: '▶', onclick: () => opts.preview(v.value) }))); }
  }

  // ---------- settings + announcement ----------
  async function settings(body) {
    body.append(note('טוען…'));
    const r = await call('/api/admin/config');
    body.textContent = '';
    if (r.status !== 200) { body.append(note(errText(r), 'warn')); return; }
    const c = r.config, a = c.announce || {};
    const he = h('textarea', { rows: 2, maxlength: 200, placeholder: 'למשל: גרסה חדשה יצאה! תורידו מהאתר', value: a.he || '' });
    const en = h('textarea', { rows: 2, maxlength: 200, placeholder: 'English (optional)', value: a.en || '' });
    const level = h('select', {}, [['info', 'רגילה'], ['warn', 'חשובה (בולטת)']].map(([v, l]) => h('option', { value: v, text: l, selected: a.level === v ? 'selected' : null })));
    const dur = h('select', {}, [['0', 'עד שאמחק'], ['1', 'יום'], ['3', '3 ימים'], ['7', 'שבוע']].map(([v, l]) => h('option', { value: v, text: l })));
    const amsg = h('small', { class: 'fla-note' });
    const live = a.he || a.en ? `עכשיו מוצגת: "${a.he || a.en}"${a.until ? ` עד ${when(a.until)}` : ''}` : 'אין הודעה כרגע.';
    const save = async (patch, msg) => {
      const x = await call('/api/admin/config', 'POST', patch);
      msg.textContent = x.status === 200 ? '✓ נשמר' : errText(x);
      if (x.status === 200) setTimeout(render, 700);
    };
    body.append(h('div', { class: 'fla-card' },
      h('h4', { text: '📣 הודעה לכל המשתמשים' }),
      note('מופיעה בראש האפליקציה אצל כולם (תוך כמה דקות). רק טקסט, בלי קישורים לחיצים.'),
      note(live),
      h('label', { text: 'עברית' }), he, h('label', { text: 'English' }), en,
      h('div', { class: 'fla-bar' }, h('label', { text: 'סוג' }), level, h('label', { text: 'כמה זמן' }), dur),
      h('div', { class: 'fla-btns' },
        h('button', { class: 'ok', text: 'פרסם הודעה', onclick: () => {
          const d = Number(dur.value);
          save({ announce: { he: he.value, en: en.value, level: level.value, until: d ? Math.floor(Date.now() / 1000) + d * 86400 : 0 } }, amsg);
        } }),
        h('button', { class: 'no', text: 'הסר הודעה', onclick: () => save({ announce: null }, amsg) }), amsg)));

    const paused = h('input', { type: 'checkbox', checked: c.paused });
    const perDay = h('input', { type: 'number', min: 0, max: 50, value: c.submitsPerDay });
    const autoHide = h('input', { type: 'number', min: 0, max: 100, value: c.autoHide });
    const banned = h('textarea', { rows: 3, placeholder: 'מילה בכל שורה, או מופרדות בפסיק', value: c.banned.join('\n') });
    const smsg = h('small', { class: 'fla-note' });
    body.append(h('div', { class: 'fla-card' },
      h('h4', { text: '🛡 חנות וספאם' }),
      h('label', { class: 'fla-check' }, paused, 'לעצור שיתופים חדשים (החנות עצמה נשארת פתוחה)'),
      h('label', { text: 'כמה שיתופים מותר לאדם ביום' }), perDay,
      h('label', { text: 'אחרי כמה דיווחים להוריד פריט אוטומטית מהחנות לבדיקה (0 = אף פעם)' }), autoHide,
      h('label', { text: 'מילים אסורות (שיתוף שמכיל אותן ייחסם)' }), banned,
      h('div', { class: 'fla-btns' }, h('button', { class: 'ok', text: 'שמור', onclick: () =>
        save({ paused: paused.checked, submitsPerDay: Number(perDay.value), autoHide: Number(autoHide.value), banned: banned.value.split(/[\n,]+/) }, smsg) }), smsg)));
  }

  // ---------- blocks ----------
  async function blocks(body) {
    body.append(note('מי שחסום יכול להמשיך לשלוח, אבל זה נעלם בשקט. שמור כקוד מוצפן בלבד, לא כתובת אמיתית.'));
    const r = await call('/api/admin/blocks');
    if (r.status !== 200) { body.append(note(errText(r), 'warn')); return; }
    if (!r.blocks.length) { body.append(note('אף אחד לא חסום.')); return; }
    for (const b of r.blocks) body.append(h('div', { class: 'fla-line' },
      h('b', { text: '#' + b.k.slice(0, 8) }), h('small', { class: 'fla-note', text: `${when(b.created)}${b.note ? ` · בגלל פריט ${b.note}` : ''}` }),
      h('button', { text: 'בטל חסימה', onclick: async () => { const x = await call('/api/admin/unblock', 'POST', { k: b.k }); x.status === 200 ? render() : alert(errText(x)); } })));
  }

  // ---------- log ----------
  const ACT = { approve: 'אישר', reject: 'דחה', delete: 'מחק', unpublish: 'הוריד מהחנות', feature: 'סימן מומלץ', unfeature: 'ביטל מומלץ', clearReports: 'ניקה דיווחים',
    block: 'חסם שולח', unblock: 'ביטל חסימה', edit: 'ערך', config: 'שינה הגדרות', autoHide: 'הוסתר אוטומטית (דיווחים)', 'bulk:approve': 'אישר כמה', 'bulk:reject': 'דחה כמה', 'bulk:delete': 'מחק כמה' };
  async function log(body) {
    const r = await call('/api/admin/log');
    if (r.status !== 200) { body.append(note(errText(r), 'warn')); return; }
    if (!r.log.length) { body.append(note('עוד לא קרה כלום.')); return; }
    for (const l of r.log) body.append(h('div', { class: 'fla-line' },
      h('small', { class: 'fla-note', text: when(l.t) }), h('b', { text: ACT[l.action] || l.action }),
      h('small', { class: 'fla-note', text: [l.item ? '#' + l.item.slice(0, 8) : '', l.note || ''].filter(Boolean).join(' · ') })));
  }

  root.FLAdminUI = {
    mount(el, o) { host = el; opts = o; host.classList.add('fla'); render(); },
    refresh() { if (host) render(); },
  };
})(typeof self !== 'undefined' ? self : this);
