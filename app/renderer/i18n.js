// Strings for every screen, Hebrew and English. window.T(lang) returns a lookup; applyI18n fills [data-i18n] elements.
(function () {
  const D = {
    he: {
      dir: 'rtl', app: 'לאג מזויף',
      tab_remote: 'שלט', tab_settings: 'הגדרות', tab_help: 'חיבור ל-OBS וזום',
      m_live: 'רגיל', d_live: 'הכל תקין',
      m_lag: 'לאג', d_lag: 'התמונה מקרטעת',
      m_low: 'איכות גרועה', d_low: 'מטושטש',
      m_mosh: 'קוביות', d_mosh: 'ריבועים נמרחים',
      m_freeze: 'קפיאה', d_freeze: 'התמונה והקול נתקעים',
      m_black: 'מצלמה נכבית', d_black: 'מסך שחור עם השם שלך',
      m_auto: 'ניתוק אוטומטי', d_auto: 'מתדרדר תוך 10 שניות ונופל',
      m_reconnect: 'התחברתי מחדש', d_reconnect: 'חוזר בהדרגה',
      level: 'כמה גרוע',
      phone: 'שלט בטלפון', phone_hint: 'סורקים עם המצלמה של הטלפון. הטלפון והמחשב צריכים להיות באותה רשת Wi-Fi.',
      phone_wait: 'מכין את השלט…', no_net: 'המחשב לא מחובר לרשת, אז השלט בטלפון לא זמין.',
      keys: 'קיצורי מקלדת. עובדים גם כשזום פתוח מלפנים',
      show_cam: 'הצג / הסתר את חלון המצלמה', preview: 'מה המורה רואה', copy: 'העתקה', copied: 'הועתק ✓',
      st_cam_ok: 'מצלמה פועלת', st_cam_err: 'אין גישה למצלמה', st_cam_closed: 'חלון המצלמה סגור',
      st_cam_busy: 'המצלמה תפוסה. כנראה OBS או זום משתמשים בה ישירות. ב-OBS צריך למחוק את המקור Video Capture Device, ובזום לבחור OBS Virtual Camera. מנסה שוב לבד…',
      st_out: 'הקול נשלח אל', st_out_none: 'הקול לא עובר דרך האפליקציה. רק התמונה',
      s_profile: 'מה רואים כשהמצלמה "נכבית"',
      s_name: 'השם שלך, כמו שהוא מופיע בזום', s_name_ph: 'למשל: יונתן כהן',
      s_photo: 'תמונת פרופיל (לא חובה)', s_photo_pick: 'בחירת תמונה', s_photo_clear: 'הסרה',
      s_devices: 'מצלמה וקול',
      s_cam: 'מצלמה', s_mic: 'מיקרופון', s_out: 'לאן לשלוח את הקול', s_out_none: 'לא לשלוח (רק תמונה)', s_default: 'ברירת מחדל',
      s_cable_missing: 'לא מצאתי VB-Cable. בלעדיו הקול לא ייקטע, רק התמונה.',
      s_cable_get: 'להורדת VB-Cable (חינם)',
      s_cable_ok: 'VB-Cable נמצא. בזום בוחרים מיקרופון: CABLE Output',
      s_lang: 'שפה',
      w_step: 'שלב', w_of: 'מתוך', w_next: 'הבא', w_back: 'חזרה', w_done: 'סיימתי',
      w_t1: 'ברוך הבא', w_s1: 'קודם, מה המורה יראה כשהמצלמה שלך "תיפול".',
      w_t2: 'מצלמה וקול', w_s2: 'בוחרים את המצלמה והמיקרופון האמיתיים שלך.',
      w_t3: 'חיבור ל-OBS', w_s3: 'פעם אחת, וזהו.',
      w_t4: 'בזום / במיט', w_s4: 'בוחרים את המצלמה והמיקרופון של OBS ו-VB-Cable.',
      h_obs: `<ol>
        <li>ב-OBS, בתיבה <b>מקורות</b> לוחצים <b>+</b> ובוחרים <b>דפדפן</b> ← <b>אישור</b>.</li>
        <li>בשדה <b>כתובת URL</b> מדביקים את הכתובת שלמעלה (כפתור "העתקה").</li>
        <li><b>רוחב</b> 1280, <b>גובה</b> 720 ← <b>אישור</b>.</li>
        <li>לחיצה ימנית על המקור ← <b>התמרה</b> ← <b>התאם למסך</b>.</li>
        <li>לוחצים <b>הפעלת מצלמה וירטואלית</b> בצד ימין למטה.</li>
      </ol>
      <p class="note">את המצלמה עצמה לא מוסיפים ל-OBS. אם יש מקור "התקן הקלטת וידאו", מוחקים אותו, אחרת המצלמה תפוסה בשביל האפליקציה.</p>
      <p class="note">אין צורך בחלון של האפליקציה על המסך. מספיק שהיא פתוחה, אפילו ממוזערת. הכתובת עובדת רק מהמחשב הזה.</p>`,
      h_zoom: `<ol>
        <li><b>זום:</b> הגדרות ← Video ← Camera: <b>OBS Virtual Camera</b>. מכבים <b>Mirror my video</b>.</li>
        <li><b>זום:</b> הגדרות ← Audio ← Microphone: <b>CABLE Output</b>. ב-Background noise בוחרים <b>Low</b>, אחרת זום מחליק את הקיטועים.</li>
        <li><b>מיט:</b> ⋮ ← הגדרות ← וידאו: <b>OBS Virtual Camera</b>. אודיו ← מיקרופון: <b>CABLE Output</b>.</li>
        <li>בודקים: מצטרפים לאותה שיחה מהטלפון, ורואים ושומעים בדיוק מה שהמורה יקבל.</li>
      </ol>
      <p class="note">טיפ: מתחילים ב"לאג" כמה שניות לפני השאלה, ורק אז "ניתוק אוטומטי". נפילה פתאומית נראית חשודה.</p>`,
      r_port: 'השלט בטלפון לא זמין: תוכנה אחרת תופסת את הפורט 5174.', new_code: 'קוד חדש (הקוד הישן מפסיק לעבוד)',
      st_keys_failed: 'קיצורים שתוכנה אחרת כבר תופסת:',
      r_title: 'שלט', r_lost: 'החיבור למחשב נפל. בודק שוב…',
    },
    en: {
      dir: 'ltr', app: 'Fake Lag',
      tab_remote: 'Remote', tab_settings: 'Settings', tab_help: 'OBS & Zoom setup',
      m_live: 'Normal', d_live: 'All good',
      m_lag: 'Lag', d_lag: 'Choppy picture',
      m_low: 'Low quality', d_low: 'Blurry',
      m_mosh: 'Blocks', d_mosh: 'Smeared squares',
      m_freeze: 'Freeze', d_freeze: 'Picture and sound stop',
      m_black: 'Camera drop', d_black: 'Black screen with your name',
      m_auto: 'Auto disconnect', d_auto: 'Falls apart over 10 s, then drops',
      m_reconnect: 'Reconnect', d_reconnect: 'Comes back gradually',
      level: 'How bad',
      phone: 'Phone remote', phone_hint: 'Scan with your phone camera. Phone and computer must be on the same Wi-Fi.',
      phone_wait: 'Getting the remote ready…', no_net: 'This computer is not on a network, so the phone remote is unavailable.',
      keys: 'Keyboard shortcuts. They work while Zoom is in front',
      show_cam: 'Show / hide the camera window', preview: 'What the teacher sees', copy: 'Copy', copied: 'Copied ✓',
      st_cam_ok: 'Camera on', st_cam_err: 'No camera access', st_cam_closed: 'Camera window is closed',
      st_cam_busy: 'The camera is busy. OBS or Zoom is probably using it directly. In OBS remove the Video Capture Device source; in Zoom pick OBS Virtual Camera. Retrying…',
      st_out: 'Sound goes to', st_out_none: 'Sound is not going through the app. Picture only',
      s_profile: 'What people see when the camera "drops"',
      s_name: 'Your name, as shown in Zoom', s_name_ph: 'e.g. Jordan Smith',
      s_photo: 'Profile photo (optional)', s_photo_pick: 'Choose photo', s_photo_clear: 'Remove',
      s_devices: 'Camera and sound',
      s_cam: 'Camera', s_mic: 'Microphone', s_out: 'Send sound to', s_out_none: 'Don’t send (picture only)', s_default: 'Default',
      s_cable_missing: 'VB-Cable not found. Without it only the picture glitches, not the sound.',
      s_cable_get: 'Get VB-Cable (free)',
      s_cable_ok: 'VB-Cable found. In Zoom pick the microphone: CABLE Output',
      s_lang: 'Language',
      w_step: 'Step', w_of: 'of', w_next: 'Next', w_back: 'Back', w_done: 'Done',
      w_t1: 'Welcome', w_s1: 'First, what your teacher sees when your camera "drops".',
      w_t2: 'Camera and sound', w_s2: 'Pick your real camera and microphone.',
      w_t3: 'Connect OBS', w_s3: 'Once, and you’re set.',
      w_t4: 'In Zoom / Meet', w_s4: 'Pick the OBS camera and the VB-Cable microphone.',
      h_obs: `<ol>
        <li>In OBS, under <b>Sources</b>, click <b>+</b> and choose <b>Browser</b> → <b>OK</b>.</li>
        <li>In <b>URL</b> paste the address above (the "Copy" button).</li>
        <li><b>Width</b> 1280, <b>Height</b> 720 → <b>OK</b>.</li>
        <li>Right-click the source → <b>Transform</b> → <b>Fit to screen</b>.</li>
        <li>Click <b>Start Virtual Camera</b> at the bottom right.</li>
      </ol>
      <p class="note">Don’t add the camera itself to OBS. If there is a Video Capture Device source, delete it, or the app can’t get the camera.</p>
      <p class="note">No app window needs to be on screen. It just has to be running, even minimized. The address only works from this computer.</p>`,
      h_zoom: `<ol>
        <li><b>Zoom:</b> Settings → Video → Camera: <b>OBS Virtual Camera</b>. Turn off <b>Mirror my video</b>.</li>
        <li><b>Zoom:</b> Settings → Audio → Microphone: <b>CABLE Output</b>. Set Background noise to <b>Low</b>, or Zoom smooths out the cuts.</li>
        <li><b>Meet:</b> ⋮ → Settings → Video: <b>OBS Virtual Camera</b>. Audio → Microphone: <b>CABLE Output</b>.</li>
        <li>Test: join the same call from your phone and you see and hear exactly what the teacher gets.</li>
      </ol>
      <p class="note">Tip: start with "Lag" a few seconds before the question, then "Auto disconnect". A sudden drop looks suspicious.</p>`,
      r_port: 'Phone remote unavailable: another program is using port 5174.', new_code: 'New code (the old one stops working)',
      st_keys_failed: 'Shortcuts another program already uses:',
      r_title: 'Remote', r_lost: 'Lost the computer. Retrying…',
    },
  };
  window.T = lang => key => (D[lang] || D.he)[key] ?? D.he[key] ?? key;
  window.applyI18n = (lang, root = document) => {
    const t = window.T(lang);
    document.documentElement.lang = lang; document.documentElement.dir = t('dir');
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  };
})();
