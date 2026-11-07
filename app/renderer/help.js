// The "Help" tab: an AI helper that sees what works on this computer (✓/✗ from the Connect tab),
// and a way to write to a real person (the admin), whose answers show up here.
// Everything is put on screen with textContent only.
(function () {
  const TX = {
    he: {
      ai: '🤖 העוזר', human: '👤 לדבר עם בן אדם', hello: 'היי! אני העוזר של Fake Lag. ספר לי מה לא עובד, ואני רואה גם מה מחובר אצלך במחשב.',
      ph: 'מה לא עובד? למשל: בזום רואים מסך שחור', send: 'שלח', thinking: 'חושב…',
      humanHello: 'כתוב כאן ומי שבנה את האפליקציה יענה לך, בדרך כלל תוך יום. התשובה תופיע כאן.',
      humanPh: 'מה קרה? כמה שיותר פרטים', sent: 'נשלח ✓', you: 'אתה', admin: 'צוות Fake Lag',
      sends: 'נשלח יחד עם ההודעה: מה מחובר אצלך (✓/✗) והכינוי שלך, בלי שום פרט מזהה.',
      aiSends: 'השיחה עם העוזר לא נשמרת. נשלח רק מה שכתבת ומה מחובר אצלך (✓/✗).',
      err: { timeout: 'העוזר לקח יותר מדי זמן. נסה שוב.', rate: 'הגעת למגבלה היומית. נסה מחר, או כתוב לבן אדם.', network: 'אין חיבור לאינטרנט כרגע.', offline: 'העזרה לא זמינה כרגע.', 'ai busy': 'העוזר עמוס, נסה שוב עוד רגע.', 'ai offline': 'העוזר לא זמין כרגע. אפשר לכתוב לבן אדם.' },
      actions: { 'obs-install': 'התקן OBS', 'obs-connect': 'חבר את OBS', 'cable-install': 'התקן VB-Cable', 'audio-fix': 'סדר לי את הקול', devices: 'בחירת מצלמה ומיקרופון', 'zoom-help': 'מסך החיבור', human: 'לדבר עם בן אדם' },
      reset: 'שיחה חדשה',
    },
    en: {
      ai: '🤖 Helper', human: '👤 Talk to a person', hello: 'Hi! I’m the Fake Lag helper. Tell me what isn’t working; I can also see what’s connected on your computer.',
      ph: 'What isn’t working? e.g. Zoom shows a black screen', send: 'Send', thinking: 'Thinking…',
      humanHello: 'Write here and the person who made the app will answer, usually within a day. The answer shows up here.',
      humanPh: 'What happened? As many details as you can', sent: 'Sent ✓', you: 'You', admin: 'Fake Lag team',
      sends: 'Sent with your message: what’s connected (✓/✗) and your nickname, nothing that identifies you.',
      aiSends: 'The helper chat isn’t saved. Only what you write and what’s connected (✓/✗) is sent.',
      err: { timeout: 'The helper took too long. Try again.', rate: 'You reached today’s limit. Try tomorrow, or write to a person.', network: 'No internet right now.', offline: 'Help isn’t available right now.', 'ai busy': 'The helper is busy, try again in a moment.', 'ai offline': 'The helper isn’t available. You can write to a person.' },
      actions: { 'obs-install': 'Install OBS', 'obs-connect': 'Connect OBS', 'cable-install': 'Install VB-Cable', 'audio-fix': 'Fix my sound', devices: 'Choose camera & mic', 'zoom-help': 'Connect screen', human: 'Talk to a person' },
      reset: 'New chat',
    },
  };
  let lang = 'he', mode = 'ai', root = null, aiLog = [], humanLog = [], waiting = false, poll = null, info = {};
  const t = k => (TX[lang] || TX.he)[k] ?? k;
  const SEEN = 'helpSeen';
  const seen = () => { try { return Number(localStorage.getItem(SEEN) || 0); } catch { return 0; } };
  const markSeen = id => { try { localStorage.setItem(SEEN, String(id)); } catch {} };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const diag = () => ({ ...(window.FLSetup ? window.FLSetup.diag() : {}), app: info.version || '', os: info.os || '' });
  const errText = e => t('err')[e] || (t('err').offline + (e ? ` (${e})` : ''));

  function doAction(a) {
    if (a === 'human') { mode = 'human'; return render(); }
    if (a === 'devices') return window.FLSetupGo && window.FLSetupGo('settings');
    window.FLSetupGo && window.FLSetupGo('help');
    if (a !== 'zoom-help' && window.FLSetup) window.FLSetup.act(a);
  }

  function render() {
    if (!root) return;
    root.textContent = '';
    root.append(h('div', { class: 'seg big' },
      h('button', { class: mode === 'ai' ? 'on' : '', text: t('ai'), onclick: () => { mode = 'ai'; render(); } }),
      h('button', { class: mode === 'human' ? 'on' : '', text: t('human'), onclick: () => { mode = 'human'; render(); loadThread(); } })));
    const log = h('div', { class: 'chat' });
    if (mode === 'ai') {
      log.append(h('div', { class: 'cmsg bot', text: t('hello') }));
      for (const m of aiLog) log.append(h('div', { class: 'cmsg ' + (m.role === 'user' ? 'me' : 'bot') }, h('div', { text: m.content }),
        m.actions && m.actions.length ? h('div', { class: 'cacts' }, m.actions.map(a => h('button', { class: a === 'human' ? 'ghost' : 'primary', text: t('actions')[a] || a, onclick: () => doAction(a) }))) : null));
    } else {
      log.append(h('div', { class: 'cmsg bot', text: t('humanHello') }));
      for (const m of humanLog) log.append(h('div', { class: 'cmsg ' + (m.who === 'admin' ? 'bot' : 'me') },
        h('small', { text: m.who === 'admin' ? t('admin') : t('you') }), h('div', { text: m.text })));
    }
    if (waiting) log.append(h('div', { class: 'cmsg bot wait', text: t('thinking') }));
    root.append(log);
    const box = h('textarea', { rows: 2, maxlength: 1000, placeholder: t(mode === 'ai' ? 'ph' : 'humanPh') });
    const sendBtn = h('button', { class: 'primary', text: t('send'), disabled: waiting, onclick: () => send(box) });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(box); } });
    root.append(h('div', { class: 'cinput' }, box, sendBtn),
      h('small', { class: 'note', text: t(mode === 'ai' ? 'aiSends' : 'sends') }),
      mode === 'ai' && aiLog.length ? h('button', { class: 'ghost small', text: t('reset'), onclick: () => { aiLog = []; render(); } }) : null);
    log.scrollTop = log.scrollHeight;
    if (!waiting) box.focus();
  }

  async function send(box) {
    const text = box.value.trim();
    if (!text || waiting) return;
    if (mode === 'ai') {
      aiLog.push({ role: 'user', content: text });
      waiting = true; render();
      const r = await window.fl.helpAI(aiLog.map(m => ({ role: m.role, content: m.content })), diag(), lang);
      waiting = false;
      if (r.ok) aiLog.push({ role: 'assistant', content: String(r.reply || ''), actions: Array.isArray(r.actions) ? r.actions.slice(0, 2) : [] });
      else aiLog.push({ role: 'assistant', content: errText(r.error), actions: ['human'] });
      render();
    } else {
      waiting = true; render();
      const r = await window.fl.helpSend(text, diag());
      waiting = false;
      if (r.ok) { box.value = ''; await loadThread(); }
      else { render(); alert(errText(r.error)); }
    }
  }

  async function loadThread() {
    const r = await window.fl.helpThread();
    if (!r.ok) return;
    humanLog = r.msgs;
    const lastAdmin = humanLog.filter(m => m.who === 'admin').reduce((a, m) => Math.max(a, m.id), 0);
    if (isOpen() && mode === 'human') markSeen(lastAdmin);
    badge(lastAdmin > seen() ? 1 : 0);
    if (mode === 'human') render();
  }
  const isOpen = () => !!(root && root.closest('section') && root.closest('section').classList.contains('on'));
  function badge(n) {
    const b = document.querySelector('nav button[data-tab=chat]');
    if (!b) return;
    b.classList.toggle('dot', n > 0);
    if (n > 0 && !isOpen()) mode = 'human';
  }

  window.FLHelp = {
    mount(el) { root = el; window.fl.appInfo().then(i => { info = i; }); render(); loadThread(); poll = setInterval(loadThread, 5 * 60 * 1000); },
    setLang(l) { if (l !== lang) { lang = l; render(); } },
    onTab(name) { if (name === 'chat') { render(); loadThread(); } },
  };
})();
