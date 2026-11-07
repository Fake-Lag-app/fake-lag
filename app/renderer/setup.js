// The "Connect" tab: every piece the app needs, checked live, each with a ✓/✗ and a button that fixes it.
// Replaces reading instructions: OBS and VB-Cable are installed and set up by the app itself.
(function () {
  const TX = {
    he: {
      title: 'חיבור לזום / מיט', sub: 'כל שורה מתחברת לבד. לוחצים על הכפתור הכתום, וזהו.',
      nameT: 'השם שלך', nameD: 'מופיע כשהמצלמה "נופלת" למסך שחור', namePh: 'למשל: דני',
      camT: 'מצלמה ומיקרופון', camOk: 'עובדים', camBusy: 'המצלמה תפוסה ע"י תוכנה אחרת (אולי זום או OBS עם מצלמה). סגור אותה, או בחר בזום את OBS Virtual Camera.',
      camErr: 'לא מצאתי מצלמה', micErr: 'לא מצאתי מיקרופון', pick: 'בחירה',
      obsT: 'OBS (מעביר את התמונה לזום)', obsMissing: 'לא מותקן', install: 'התקן לי', installing: 'מתקין… ווינדוס יבקש אישור, לחץ "כן". זה לוקח דקה-שתיים.',
      obsInstalled: 'מותקן', noWinget: 'לא הצלחתי להתקין לבד. הורד מהאתר הרשמי:', installFail: 'ההתקנה לא הצליחה. נסה שוב, או הורד מהאתר הרשמי:',
      vcT: 'מצלמה וירטואלית', vcOk: 'פועלת. בזום תבחר "OBS Virtual Camera"', connect: 'חבר לי', connecting: 'מחבר את OBS… (פותח אותו ברקע)',
      vcOff: 'כבויה', needsRestart: 'OBS פתוח כרגע. צריך לסגור ולפתוח אותו פעם אחת.', restart: 'סגור ופתח מחדש',
      badPass: 'ב-OBS כבר מוגדרת סיסמה אחרת לשליטה מרחוק. אפשר לחבר ידנית (למטה), או לכבות שם: כלים ← הגדרות שרת WebSocket.',
      noConn: 'לא הצלחתי להתחבר ל-OBS. נסה שוב, או פתח את העזרה 💬.', needObs: 'קודם צריך OBS',
      cableT: 'VB-Cable (מעביר את הקול לזום)', cableOk: 'מותקן', cableMissing: 'לא מותקן',
      cableRun: 'מוריד ופותח את ההתקנה… ווינדוס יבקש אישור, ואז לוחצים "Install Driver".',
      cableAfter: 'אם עדיין לא מופיע ✓, צריך להפעיל מחדש את המחשב (רק הפעם).',
      cableErr: { download: 'ההורדה נכשלה. בדוק אינטרנט ונסה שוב.', signature: 'הקובץ שהורד לא חתום כמו שצריך, לא הפעלתי אותו.', cancelled: 'ההתקנה בוטלה.', unzip: 'לא הצלחתי לפתוח את הקובץ.' },
      audioT: 'הקול שלך → זום', audioOk: 'הקול יוצא ל-CABLE. בזום תבחר מיקרופון "CABLE Output"', audioFix: 'סדר לי',
      audioBad: 'הקול לא יוצא ל-VB-Cable', needCable: 'קודם צריך VB-Cable',
      zoomT: 'בזום / במיט', zoomD: 'הגדרות ← וידאו: מצלמה "OBS Virtual Camera".\nהגדרות ← אודיו: מיקרופון "CABLE Output".\nמומלץ: לכבות "Mirror my video" ולהוריד דיכוי רעשים ל"נמוך".', zoomDone: 'עשיתי ✓',
      done: 'הכל מוכן! לשלט ←', stuck: 'נתקעת? 💬 העוזר יעזור לך', manual: 'הגדרה ידנית (למתקדמים)', recheck: 'בדוק שוב',
      autoT: 'להפעיל את OBS ברקע כל פעם שפותחים את Fake Lag', officialObs: 'obsproject.com',
      allT: 'להתקין הכל בלחיצה אחת', allD: 'מתקין את OBS ואת VB-Cable מהאתרים הרשמיים, ומחבר הכל. ווינדוס ישאל פעם אחת "לאפשר שינויים?" ← לוחצים "כן".',
      allBtn: 'התקן וחבר הכל', allRunning: 'מתקין… אפשר לחכות פה, זה לוקח 2-5 דקות',
      p: { 'download-obs': 'מוריד את OBS', 'download-cable': 'מוריד את VB-Cable', install: 'ווינדוס שואל "לאפשר שינויים?" ← לחץ "כן". אחרי זה ההתקנה רצה לבד',
           'obs:running': 'מתקין את OBS…', 'cable:running': 'מתקין את VB-Cable… אם קופץ חלון "להתקין את תוכנת ההתקן?" ← לחץ "התקן"', done: 'מחבר הכל…' },
      depsErr: { cancelled: 'לא אישרת את ההתקנה בחלון של ווינדוס. אפשר לנסות שוב.', download: 'ההורדה נכשלה. בדוק אינטרנט ונסה שוב.',
           signature: 'קובץ שהורד לא היה חתום כמו שצריך, אז לא הפעלתי אותו.', install: 'ההתקנה לא הצליחה. נסה שוב, או כתוב לנו בעזרה 💬', unzip: 'לא הצלחתי לפתוח את קובץ ההתקנה.', busy: 'כבר מתקין…' },
      restartPc: 'VB-Cable הותקן, אבל ווינדוס צריך הפעלה מחדש כדי שיופיע. תפעיל מחדש את המחשב ותפתח שוב את Fake Lag.',
    },
    en: {
      title: 'Connect to Zoom / Meet', sub: 'Every row connects itself. Press the orange button, that’s it.',
      nameT: 'Your name', nameD: 'Shown when your camera “drops” to a black screen', namePh: 'e.g. Danny',
      camT: 'Camera and microphone', camOk: 'Working', camBusy: 'Another program is using the camera (maybe Zoom, or OBS with a camera). Close it, or pick OBS Virtual Camera in Zoom.',
      camErr: 'No camera found', micErr: 'No microphone found', pick: 'Choose',
      obsT: 'OBS (carries the picture to Zoom)', obsMissing: 'Not installed', install: 'Install it', installing: 'Installing… Windows will ask for permission, press “Yes”. It takes a minute or two.',
      obsInstalled: 'Installed', noWinget: 'Couldn’t install it automatically. Get it from the official site:', installFail: 'Install didn’t work. Try again, or get it from the official site:',
      vcT: 'Virtual camera', vcOk: 'On. In Zoom pick “OBS Virtual Camera”', connect: 'Connect', connecting: 'Connecting OBS… (opening it in the background)',
      vcOff: 'Off', needsRestart: 'OBS is open right now. It has to close and reopen once.', restart: 'Close and reopen',
      badPass: 'OBS already has a different remote-control password. Connect manually (below), or turn it off in OBS: Tools → WebSocket Server Settings.',
      noConn: 'Couldn’t connect to OBS. Try again, or open Help 💬.', needObs: 'Needs OBS first',
      cableT: 'VB-Cable (carries the sound to Zoom)', cableOk: 'Installed', cableMissing: 'Not installed',
      cableRun: 'Downloading and opening the installer… Windows asks for permission, then press “Install Driver”.',
      cableAfter: 'If it still isn’t ✓, restart the computer (just this once).',
      cableErr: { download: 'Download failed. Check the internet and try again.', signature: 'The downloaded file isn’t properly signed, so I didn’t run it.', cancelled: 'Install was cancelled.', unzip: 'Couldn’t open the file.' },
      audioT: 'Your voice → Zoom', audioOk: 'Sound goes to CABLE. In Zoom pick the “CABLE Output” microphone', audioFix: 'Fix it',
      audioBad: 'Sound isn’t going to VB-Cable', needCable: 'Needs VB-Cable first',
      zoomT: 'In Zoom / Meet', zoomD: 'Settings → Video: camera “OBS Virtual Camera”.\nSettings → Audio: microphone “CABLE Output”.\nTip: turn off “Mirror my video” and set noise suppression to “Low”.', zoomDone: 'Done ✓',
      done: 'All set! Go to the remote →', stuck: 'Stuck? 💬 The helper will help', manual: 'Manual setup (advanced)', recheck: 'Check again',
      autoT: 'Start OBS in the background whenever Fake Lag opens', officialObs: 'obsproject.com',
      allT: 'Install everything in one click', allD: 'Installs OBS and VB-Cable from their official sites and connects it all. Windows asks once “Allow changes?” → press “Yes”.',
      allBtn: 'Install & connect everything', allRunning: 'Installing… you can wait here, it takes 2-5 minutes',
      p: { 'download-obs': 'Downloading OBS', 'download-cable': 'Downloading VB-Cable', install: 'Windows asks “Allow changes?” → press “Yes”. Then it installs by itself',
           'obs:running': 'Installing OBS…', 'cable:running': 'Installing VB-Cable… if a “Install this device software?” window pops up → press “Install”', done: 'Connecting everything…' },
      depsErr: { cancelled: 'The Windows permission window was not approved. You can try again.', download: 'Download failed. Check the internet and try again.',
           signature: 'A downloaded file wasn’t properly signed, so I didn’t run it.', install: 'Install didn’t work. Try again, or write to us in Help 💬', unzip: 'Couldn’t open the installer file.', busy: 'Already installing…' },
      restartPc: 'VB-Cable is installed, but Windows needs a restart for it to show up. Restart the computer and open Fake Lag again.',
    },
  };
  let S = {}, state = {}, lang = 'he', obs = null, devices = { cable: false, cableOut: null }, busy = {}, msg = {}, root = null, prog = null, scanned = false;
  window.fl.onDeps(p => { prog = p; render(); });
  const t = k => (TX[lang] || TX.he)[k] ?? k;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  async function scanDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cableOut = list.find(d => d.kind === 'audiooutput' && /cable input/i.test(d.label));
      devices = { cable: list.some(d => /vb-audio|cable (input|output)/i.test(d.label)), cableOut: cableOut ? cableOut.deviceId : null };
      scanned = true;
    } catch {}
  }
  async function refresh() {
    obs = await window.fl.obsStatus();
    await scanDevices();
    render();
    // the first time the app opens after installing: set everything up without being asked
    if (!S.setupDone && !S.depsAuto && obs && (!obs.installed || !devices.cable) && scanned) {
      await window.fl.setSettings({ depsAuto: true });
      act('all');
    }
  }
  // VB-Cable shows up a few seconds after its installer ends; wait for it, then send the sound there
  async function waitCable(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) { await scanDevices(); if (devices.cable) return true; await new Promise(r => setTimeout(r, 1500)); }
    return false;
  }

  const outIsCable = () => /cable/i.test(state.outName || '');
  function diag() {
    return {
      camOk: !!state.camOk, micOk: !!state.micOk, camErr: state.camErr || '', outName: state.outName || '', outIsCable: outIsCable(),
      obsInstalled: !!(obs && obs.installed), obsRunning: !!(obs && obs.running), obsConnected: !!(obs && obs.connected),
      virtualCam: !!(obs && obs.virtualCam), obsErr: (obs && obs.err) || '', cableInstalled: devices.cable, setupDone: !!S.setupDone,
      lang, mode: state.mode || '',
    };
  }

  // ---------- actions (also used by the help chat's buttons) ----------
  async function act(name) {
    if (busy[name]) return;
    busy[name] = true; msg[name] = ''; render();
    try {
      if (name === 'all' || name === 'obs-install' || name === 'cable-install') {
        const wantObs = name !== 'cable-install' && !(obs && obs.installed), wantCable = name !== 'obs-install' && !devices.cable;
        prog = null;
        const r = await window.fl.depsInstall(wantObs, wantCable);
        prog = null;
        if (!r.ok) msg[name] = 'E:' + (r.error || 'install');
        else {
          obs = await window.fl.obsStatus();
          if (obs.installed && name !== 'cable-install') { busy[name] = false; await act('obs-connect'); busy[name] = true; }
          if (wantCable && !(await waitCable(20000))) msg[name] = 'restartPc';
          if (devices.cableOut) await window.fl.setSettings({ outId: devices.cableOut });
        }
      } else if (name === 'obs-connect' || name === 'obs-restart') {
        obs = await window.fl.obsStart(name === 'obs-restart');
        msg['obs-connect'] = obs.err || '';
      } else if (name === 'audio-fix') {
        await scanDevices();
        if (devices.cableOut) await window.fl.setSettings({ outId: devices.cableOut });
      }
    } finally { busy[name] = false; }
    await refresh();
  }

  // ---------- render ----------
  function row(ok, title, desc, ...extra) {
    const icon = ok === true ? '✓' : ok === 'wait' ? '…' : ok === 'off' ? '·' : '✗';
    return h('div', { class: 'srow ' + (ok === true ? 'ok' : ok === 'wait' ? 'wait' : ok === 'off' ? 'off' : 'bad') },
      h('span', { class: 'sicon', text: icon }),
      h('div', { class: 'sbody' }, h('b', { text: title }), desc ? h('small', { text: desc }) : null, ...extra));
  }
  const btn = (text, onclick, cls = 'primary') => h('button', { class: cls, text, onclick });
  const link = (text, url) => h('a', { href: url, target: '_blank', rel: 'noopener', text });

  function render() {
    if (!root) return;
    root.textContent = '';
    root.append(h('h2', { class: 'stitle', text: t('title') }), h('p', { class: 'note', text: t('sub') }));

    // everything in one click, while OBS or VB-Cable is missing
    const missing = obs && (!obs.installed || (scanned && !devices.cable));
    if (missing || busy.all || msg.all) {
      const p = prog && (prog.status && t('p')[prog.status] ? t('p')[prog.status] : t('p')[prog.step] ? t('p')[prog.step] + (prog.pct ? ` ${prog.pct}%` : '') : '');
      root.append(h('div', { class: 'sall' + (busy.all ? ' run' : '') },
        h('b', { text: t('allT') }), h('small', { text: busy.all ? (p || t('allRunning')) : t('allD') }),
        busy.all && prog && prog.pct ? h('div', { class: 'sbar' }, h('i', { style: `width:${prog.pct}%` })) : null,
        msg.all ? h('small', { class: 'warn', text: msg.all.startsWith('E:') ? (t('depsErr')[msg.all.slice(2)] || msg.all.slice(2)) : t(msg.all) }) : null,
        !busy.all && missing ? h('div', { class: 'sbtns' }, btn(t('allBtn'), () => act('all'))) : null));
    }

    // name
    const name = h('input', { maxlength: 40, value: S.name || '', placeholder: t('namePh'), onchange: e => window.fl.setSettings({ name: e.target.value.trim() }) });
    root.append(row(!!(S.name || '').trim(), t('nameT'), t('nameD'), name));

    // camera + mic
    const camOk = state.camOk && state.micOk;
    root.append(row(camOk ? true : state.camOk === undefined ? 'wait' : false, t('camT'),
      camOk ? t('camOk') : !state.camOk ? t(state.camErr === 'busy' ? 'camBusy' : 'camErr') : t('micErr'),
      camOk ? null : h('div', { class: 'sbtns' }, btn(t('pick'), () => window.FLSetupGo && window.FLSetupGo('settings'), 'ghost'))));

    // OBS installed
    const inst = obs && obs.installed;
    root.append(row(busy['obs-install'] || busy.all ? 'wait' : !!inst, t('obsT'),
      busy['obs-install'] || busy.all ? t('installing') : inst ? t('obsInstalled') : t('obsMissing'),
      !inst && !busy['obs-install'] && !busy.all ? h('div', { class: 'sbtns' }, btn(t('install'), () => act('obs-install'))) : null,
      msg['obs-install'] ? h('small', { class: 'warn' }, (t('depsErr')[msg['obs-install'].slice(2)] || t('installFail')) + ' ', link(t('officialObs'), 'https://obsproject.com/download')) : null));

    // virtual camera
    const vc = obs && obs.virtualCam, e = msg['obs-connect'] || (obs && obs.err) || '';
    const connecting = busy['obs-connect'] || busy['obs-restart'];
    root.append(row(connecting ? 'wait' : vc ? true : inst ? false : 'off', t('vcT'),
      connecting ? t('connecting') : vc ? t('vcOk') : !inst ? t('needObs') : e === 'needs-restart' ? t('needsRestart') : e === 'bad-password' ? t('badPass') : e ? t('noConn') : t('vcOff'),
      inst && !vc && !connecting ? h('div', { class: 'sbtns' },
        e === 'needs-restart' ? btn(t('restart'), () => act('obs-restart')) : btn(t('connect'), () => act('obs-connect'))) : null,
      inst ? h('label', { class: 'scheck' }, h('input', { type: 'checkbox', checked: S.obsAuto !== false, onchange: ev => window.fl.setSettings({ obsAuto: ev.target.checked }) }), t('autoT')) : null));

    // VB-Cable
    const cm = msg['cable-install'];
    root.append(row(busy['cable-install'] || busy.all ? 'wait' : devices.cable, t('cableT'),
      busy['cable-install'] || busy.all ? t('cableRun') : devices.cable ? t('cableOk') : t('cableMissing'),
      !devices.cable && !busy['cable-install'] && !busy.all ? h('div', { class: 'sbtns' }, btn(t('install'), () => act('cable-install'))) : null,
      cm && !devices.cable ? h('small', { class: 'warn', text: cm === 'restartPc' ? t('restartPc') : (t('depsErr')[cm.slice(2)] || cm) }) : null));

    // audio routed to the cable
    const aok = state.micOk && outIsCable();
    root.append(row(aok ? true : devices.cable ? false : 'off', t('audioT'), aok ? t('audioOk') : devices.cable ? t('audioBad') : t('needCable'),
      !aok && devices.cable ? h('div', { class: 'sbtns' }, btn(t('audioFix'), () => act('audio-fix'))) : null));

    // Zoom / Meet: the one thing only the user can do
    root.append(row(S.zoomDone ? true : false, t('zoomT'), t('zoomD'),
      !S.zoomDone ? h('div', { class: 'sbtns' }, btn(t('zoomDone'), () => window.fl.setSettings({ zoomDone: true }), 'ghost')) : null));

    const allOk = (S.name || '').trim() && camOk && vc && aok && S.zoomDone;
    root.append(h('div', { class: 'sbtns end' },
      btn(t('done'), async () => { await window.fl.setSettings({ setupDone: true }); window.FLSetupGo && window.FLSetupGo('remote'); }, allOk ? 'primary' : 'ghost'),
      btn(t('recheck'), refresh, 'ghost'),
      btn(t('stuck'), () => window.FLSetupGo && window.FLSetupGo('chat'), 'ghost')));
  }

  window.FLSetup = {
    mount(el) { root = el; refresh(); },
    setSettings(s) { const changed = s.lang !== lang; S = s; lang = s.lang || 'he'; render(); if (changed) render(); },
    setState(s) { const before = JSON.stringify([state.camOk, state.micOk, state.outName, state.camErr]); state = s;
      if (before !== JSON.stringify([s.camOk, s.micOk, s.outName, s.camErr])) render(); },
    setObs(o) { obs = o; render(); },
    refresh, act, diag,
  };
  navigator.mediaDevices.addEventListener('devicechange', () => scanDevices().then(render));
})();
