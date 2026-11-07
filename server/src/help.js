// Help for people who get stuck: an AI helper that knows the setup, and a chat with the admin.
// Nothing from the AI chat is stored. Messages to the admin are stored per install (salted hash, no IP).

const AI_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/qwen/qwen3.8-27b'];

// what the helper may suggest: the app turns these into buttons
export const AI_ACTIONS = ['obs-install', 'obs-connect', 'cable-install', 'audio-fix', 'devices', 'zoom-help', 'human'];

const KNOW_HE = `אתה "העוזר של Fake Lag", בתוך האפליקציה Fake Lag לווינדוס. התפקיד שלך: לעזור למשתמש לחבר את האפליקציה לזום / גוגל מיט / טימס ולפתור תקלות. לא נושאים אחרים.

איך זה עובד:
- האפליקציה לוקחת את המצלמה והמיקרופון האמיתיים, מוסיפה "לאג" (קפיאה, פיקסלים, מסך שחור, קול רובוטי) ושולחת:
  - את התמונה ל-OBS, ש-מוציא אותה כמצלמה בשם "OBS Virtual Camera".
  - את הקול ל-VB-Cable, שמופיע כמיקרופון בשם "CABLE Output (VB-Audio Virtual Cable)".
- באפליקציה יש מסך "התחלה" עם בדיקות ✓/✗ וכפתורים שעושים הכל לבד: "התקן OBS", "חבר את OBS אוטומטית" (יוצר סצנה ומדליק מצלמה וירטואלית, בלי לפתוח את OBS), "התקן VB-Cable" (צריך ללחוץ "כן" בחלון של ווינדוס, ולפעמים להפעיל מחדש את המחשב).
- בזום: הגדרות ← וידאו ← מצלמה: "OBS Virtual Camera". הגדרות ← אודיו ← מיקרופון: "CABLE Output". מומלץ לכבות "Mirror my video" ולהוריד את דיכוי הרעשים ל"נמוך" כדי שהקול הרובוטי יישמע.
- בגוגל מיט: שלוש נקודות ← הגדרות ← וידאו / אודיו, אותן בחירות. בטימס: הגדרות ← מכשירים.
- שליטה: כפתורים באפליקציה, שלט בטלפון דרך QR (אותה רשת Wi-Fi), וקיצורים Ctrl+Alt+Shift+1..8.

תקלות נפוצות:
- מסך שחור בזום: OBS לא פתוח או המצלמה הווירטואלית כבויה → "חבר את OBS אוטומטית". או שבזום נבחרה מצלמה אחרת.
- "המצלמה בשימוש": תוכנה אחרת (זום עצמו, OBS עם מקור מצלמה, טימס, דפדפן) תופסת את המצלמה האמיתית. בזום חייבים לבחור OBS Virtual Camera ולא את המצלמה האמיתית. לסגור תוכנות אחרות.
- לא שומעים אותי: בזום לא נבחר CABLE Output, או שבאפליקציה לא נבחר מיקרופון אמיתי. במסך ההגדרות באפליקציה: מיקרופון = המיקרופון האמיתי, יציאה = CABLE Input.
- שומעים הד / אני שומע את עצמי: היציאה באפליקציה צריכה להיות CABLE Input ולא הרמקולים.
- הקול הרובוטי לא נשמע: דיכוי הרעשים של זום מנקה אותו → להוריד ל"נמוך".
- ווינדוס מזהיר "Windows protected your PC": לוחצים "More info" ואז "Run anyway". זה כי אין חתימה דיגיטלית בתשלום, הקוד פתוח.
- מק / טלפון: לא נתמך, רק ווינדוס 10/11.

כללים:
- ענה בעברית פשוטה וקצרה (עד 6 שורות), צעד אחד או שניים בכל פעם. בלי Markdown כבד, אפשר רשימה קצרה.
- תסתכל על "מצב המחשב" ותתחיל ממה שבאמת לא עובד.
- אם יש כפתור באפליקציה שפותר את זה, הוסף בסוף שורה נפרדת: [[do:פעולה]] כשהפעולה אחת מאלה (מקסימום שתיים):
  obs-install (OBS לא מותקן), obs-connect (מצלמה וירטואלית כבויה / OBS לא מחובר), cable-install (VB-Cable לא מותקן),
  audio-fix (outIsCable: false, כלומר הקול של האפליקציה לא יוצא ל-CABLE), devices (בחירת מצלמה/מיקרופון), zoom-help (מה לבחור בזום).
- תמיד תבדוק קודם את מצב המחשב: אם משהו שם false, זה כנראה הפתרון, ותציע את הכפתור שלו.
- אם אתה לא יודע, או שזה נמשך יותר מ-3 ניסיונות, הצע לדבר עם בן אדם והוסף [[do:human]].
- אל תמציא הגדרות או כפתורים שלא כתובים כאן. אל תבקש סיסמאות או פרטים אישיים.`;

const KNOW_EN_NOTE = 'The user writes in English: answer in simple short English, same rules. Button names in the app are in English when the app language is English.';

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000‮]/g, '').slice(0, n);

// the app's own snapshot of what works on this computer, kept small and boring
export function cleanDiag(d) {
  if (!d || typeof d !== 'object') return {};
  const out = {};
  const bools = ['camOk', 'micOk', 'obsInstalled', 'obsRunning', 'obsConnected', 'virtualCam', 'cableInstalled', 'outIsCable', 'setupDone'];
  for (const k of bools) if (k in d) out[k] = !!d[k];
  for (const k of ['camErr', 'obsErr', 'mode', 'app', 'os', 'lang', 'outName', 'micName']) if (d[k] != null) out[k] = clip(d[k], 80);
  return out;
}
const diagText = d => Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ') || 'unknown';
// what is broken, in plain words, with the button that fixes it: the model starts from facts, not guesses
function problems(d) {
  const p = [];
  if (d.obsInstalled === false) p.push('OBS לא מותקן → [[do:obs-install]]');
  else if (d.virtualCam === false) p.push('המצלמה הווירטואלית כבויה / OBS לא מחובר → [[do:obs-connect]]');
  if (d.cableInstalled === false) p.push('VB-Cable לא מותקן → [[do:cable-install]]');
  else if (d.outIsCable === false) p.push('הקול של האפליקציה לא יוצא ל-CABLE (ולכן לא שומעים בזום) → [[do:audio-fix]]');
  if (d.camOk === false) p.push(d.camErr === 'busy' ? 'המצלמה האמיתית תפוסה ע"י תוכנה אחרת' : 'לא נמצאה מצלמה → [[do:devices]]');
  if (d.micOk === false) p.push('לא נמצא מיקרופון → [[do:devices]]');
  return p.length ? p.join('\n') : 'הכל מחובר באפליקציה. אם יש בעיה, היא כנראה בבחירה בתוך זום/מיט → [[do:zoom-help]]';
}

export async function askAI(env, { messages, diag, lang }) {
  const sys = KNOW_HE + (lang === 'en' ? '\n\n' + KNOW_EN_NOTE : '') + `\n\nמצב המחשב עכשיו (האפליקציה בדקה): ${diagText(diag)}\nמה שלא עובד לפי הבדיקה:\n${problems(diag)}\n/no_think`;   // short answers, no long hidden reasoning
  const msgs = [{ role: 'system', content: sys }, ...messages];
  let lastErr = null;
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: msgs, max_tokens: 700, temperature: 0.3 });
      let text = r && (r.response ?? (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content));
      if (typeof text !== 'string') continue;
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!text) continue;
      const actions = [];
      text = text.replace(/\[\[\s*do\s*:\s*([a-z-]+)\s*\]\]/gi, (m, a) => { if (AI_ACTIONS.includes(a) && !actions.includes(a) && actions.length < 2) actions.push(a); return ''; })
        .replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      return { reply: clip(text, 1500), actions };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no answer');
}

// a chat history from the app: only user/assistant turns, short, and ending with the user
export function cleanHistory(list) {
  if (!Array.isArray(list)) return null;
  const out = list.slice(-12).map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: clip(m && m.content, 800).trim() })).filter(m => m.content);
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}
