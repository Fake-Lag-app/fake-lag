// What a lag / effect is: the building blocks, their sliders, the built-ins, and validation.
// Shared by the app, the store server and the admin page, so all three agree on what is allowed.
// A preset is plain data (names and numbers); nothing in it ever runs as code.
(function (root) {
  // ---------- building blocks ----------
  // each param: [min, max, default, step] for numbers, or { text: maxLength }.
  // scale: how the "how bad" slider affects it (1 = stronger when higher, -1 = stronger when lower)
  const VIDEO = {
    dropFrames:   { he: 'דילוג פריימים', en: 'Drop frames', p: { fps: [0.5, 30, 3, 0.5], jitter: [0, 1, 0.5, 0.05] }, scale: { fps: -1 } },
    freeze:       { he: 'קפיאה', en: 'Freeze', p: {} },
    pixelate:     { he: 'פיקסלים', en: 'Pixelate', p: { size: [2, 64, 8, 1], smooth: [0, 1, 1, 1] }, scale: { size: 1 } },
    blur:         { he: 'טשטוש', en: 'Blur', p: { px: [0, 30, 4, 1] }, scale: { px: 1 } },
    mosh:         { he: 'קוביות נמרחות', en: 'Smeared blocks', p: { block: [16, 64, 22, 2], keep: [0, 0.95, 0.36, 0.01], smear: [0, 0.3, 0.012, 0.002] }, scale: { keep: 1, smear: 1 } },
    jpeg:         { he: 'דחיסה', en: 'Compression', p: { a: [0, 1, 0.4, 0.05] }, scale: { a: 1 } },
    noise:        { he: 'רעש', en: 'Noise', p: { a: [0, 1, 0.25, 0.05] }, scale: { a: 1 } },
    colorBreak:   { he: 'צבע שנשבר', en: 'Broken color', p: { a: [0, 1, 0.35, 0.05] }, scale: { a: 1 } },
    rgbSplit:     { he: 'הזזת צבעים', en: 'RGB split', p: { px: [0, 40, 6, 1] }, scale: { px: 1 } },
    color:        { he: 'צבע ובהירות', en: 'Color & brightness', p: { sat: [0, 3, 1, 0.05], bright: [0.2, 2, 1, 0.05], contrast: [0.2, 3, 1, 0.05] } },
    bands:        { he: 'פסים זזים', en: 'Shifting bands', p: { a: [0, 1, 0.3, 0.05], count: [1, 20, 5, 1] }, scale: { a: 1 } },
    slices:       { he: 'שורות שבורות', en: 'Sliced rows', p: { count: [2, 40, 12, 1], px: [0, 80, 18, 1] }, scale: { px: 1 } },
    shake:        { he: 'רעידה', en: 'Shake', p: { px: [0, 40, 5, 1] }, scale: { px: 1 } },
    ghost:        { he: 'רוח רפאים', en: 'Ghosting', p: { a: [0, 0.95, 0.5, 0.05] }, scale: { a: 1 } },
    black:        { he: 'מצלמה כבויה', en: 'Camera off', p: { gray: [0, 0.4, 0.1, 0.01], name: [0, 1, 1, 1] } },
    reconnecting: { he: 'מתחבר מחדש…', en: 'Reconnecting…', p: {} },
    caption:      { he: 'כיתוב', en: 'Caption', p: { text: { text: 40 }, size: [16, 96, 40, 2] } },
  };
  const AUDIO = {
    loss:    { he: 'קיטועים', en: 'Dropouts', p: { a: [0, 1, 0.2, 0.05] }, scale: { a: 1 } },
    robot:   { he: 'רובוטי', en: 'Robotic', p: { a: [0, 1, 0.5, 0.05] }, scale: { a: 1 } },
    lowq:    { he: 'איכות נמוכה', en: 'Low quality', p: { a: [0, 1, 0.5, 0.05] }, scale: { a: 1 } },
    echo:    { he: 'הד', en: 'Echo', p: { a: [0, 1, 0.4, 0.05], ms: [30, 500, 180, 10] } },
    stutter: { he: 'גמגום', en: 'Stutter', p: { a: [0, 1, 0.3, 0.05] }, scale: { a: 1 } },
    noise:   { he: 'רעש רקע', en: 'Static', p: { a: [0, 1, 0.2, 0.05] }, scale: { a: 1 } },
    beep:    { he: 'צפצופים', en: 'Beeps', p: { a: [0, 1, 0.2, 0.05] } },
    mute:    { he: 'שקט', en: 'Mute', p: {} },
  };

  // heavy layers (per-block work every frame) are limited so a shared effect can't stall the camera
  const HEAVY = { mosh: 2, slices: 2, bands: 3, blur: 2, rgbSplit: 2 };
  const LIMITS = { name: 40, by: 24, videoBlocks: 8, audioBlocks: 6, steps: 30, stepMs: 60000, totalMs: 120000, bytes: 8000 };

  // ---------- built-ins ----------
  const fx = (video, audio) => ({ video, audio });
  const BUILTIN_EFFECTS = {
    live:   fx([], []),
    lag:    fx([{ b: 'dropFrames', fps: 2.5, jitter: 0.6 }], [{ b: 'loss', a: 0.07 }]),
    low:    fx([{ b: 'dropFrames', fps: 5, jitter: 0.4 }, { b: 'pixelate', size: 7, smooth: 1 }], [{ b: 'loss', a: 0.18 }, { b: 'lowq', a: 0.5 }]),
    mosh:   fx([{ b: 'dropFrames', fps: 7, jitter: 0.4 }, { b: 'mosh', block: 22, keep: 0.36, smear: 0.012 }], [{ b: 'loss', a: 0.3 }, { b: 'lowq', a: 0.6 }]),
    freeze: fx([{ b: 'freeze' }], [{ b: 'mute' }]),
    black:  fx([{ b: 'black', gray: 0.1, name: 1 }], [{ b: 'mute' }]),
  };
  const step = (ms, id, over) => ({ ms, ...structuredCloneSafe(BUILTIN_EFFECTS[id]), ...(over || {}) });
  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
  const BUILTIN_LAGS = {
    auto: { kind: 'lag', end: 'hold', steps: [
      step(2500, 'lag'),
      { ms: 2500, video: [{ b: 'dropFrames', fps: 4.5, jitter: 0.4 }, { b: 'pixelate', size: 8, smooth: 1 }], audio: [{ b: 'loss', a: 0.2 }, { b: 'lowq', a: 0.5 }] },
      { ms: 2500, video: [{ b: 'dropFrames', fps: 6, jitter: 0.4 }, { b: 'mosh', block: 24, keep: 0.4, smear: 0.015 }], audio: [{ b: 'loss', a: 0.35 }, { b: 'lowq', a: 0.6 }] },
      { ms: 1500, video: [{ b: 'dropFrames', fps: 4, jitter: 0.4 }, { b: 'pixelate', size: 9, smooth: 0 }], audio: [{ b: 'loss', a: 0.45 }, { b: 'lowq', a: 0.7 }] },
      { ms: 1500, video: [{ b: 'dropFrames', fps: 5, jitter: 0.4 }, { b: 'mosh', block: 26, keep: 0.45, smear: 0.018 }], audio: [{ b: 'loss', a: 0.5 }, { b: 'robot', a: 0.6 }] },
      step(3000, 'freeze'),
      step(0, 'black'),
    ] },
    reconnect: { kind: 'lag', end: 'live', steps: [
      { ms: 900, video: [{ b: 'dropFrames', fps: 7, jitter: 0.4 }, { b: 'mosh', block: 20, keep: 0.3, smear: 0.01 }], audio: [{ b: 'loss', a: 0.25 }] },
      { ms: 1200, video: [{ b: 'dropFrames', fps: 6, jitter: 0.4 }, { b: 'pixelate', size: 6, smooth: 1 }], audio: [{ b: 'loss', a: 0.12 }] },
      { ms: 1100, video: [{ b: 'dropFrames', fps: 4, jitter: 0.5 }], audio: [{ b: 'loss', a: 0.05 }] },
    ] },
  };
  const BUILTIN_IDS = ['live', 'lag', 'low', 'mosh', 'freeze', 'black', 'auto', 'reconnect'];

  // a built-in id, or a preset object, as something the engine can play: { steps, end }
  function toPlayable(p) {
    if (typeof p === 'string') {
      if (BUILTIN_LAGS[p]) return BUILTIN_LAGS[p];
      if (BUILTIN_EFFECTS[p]) return { steps: [{ ms: 0, ...BUILTIN_EFFECTS[p] }], end: 'hold' };
      return { steps: [{ ms: 0, video: [], audio: [] }], end: 'hold' };
    }
    if (p.kind === 'effect') return { steps: [{ ms: 0, video: p.video, audio: p.audio }], end: 'hold' };
    return { steps: p.steps, end: p.end || 'hold' };
  }

  // ---------- validation ----------
  // returns { ok, value, error }. value is a clean copy: only known fields, numbers clamped.
  const isStr = v => typeof v === 'string';
  const BAD_TEXT = /[<>]|https?:|www\.|‮|\u0000/i;
  function cleanText(v, max, field, required) {
    if (v == null || v === '') { if (required) throw field + ' missing'; return ''; }
    if (!isStr(v)) throw field + ' not text';
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) throw field + ' missing';
    if (s.length > max) throw field + ' too long';
    if (BAD_TEXT.test(s)) throw field + ' has links or markup';
    return s;
  }
  function cleanBlocks(list, defs, max, kindName) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw kindName + ' not a list';
    if (list.length > max) throw 'too many ' + kindName + ' layers';
    const seen = {};
    for (const raw of list) {
      const b = raw && raw.b;
      if (Object.prototype.hasOwnProperty.call(HEAVY, b) && (seen[b] = (seen[b] || 0) + 1) > HEAVY[b]) throw 'too many ' + b + ' layers';
    }
    return list.map(raw => {
      if (!raw || typeof raw !== 'object') throw 'bad layer';
      const def = defs[raw.b];
      if (!def || !Object.prototype.hasOwnProperty.call(defs, raw.b)) throw 'unknown layer ' + String(raw.b).slice(0, 20);
      const out = { b: raw.b };
      for (const [k, spec] of Object.entries(def.p)) {
        const v = raw[k];
        if (Array.isArray(spec)) {
          const n = v == null ? spec[2] : Number(v);
          if (!Number.isFinite(n)) throw k + ' not a number';
          out[k] = Math.min(spec[1], Math.max(spec[0], n));
        } else if (spec.text) {
          out[k] = cleanText(v, spec.text, k, false);
        }
      }
      return out;
    });
  }
  function validate(input) {
    try {
      if (!input || typeof input !== 'object') throw 'not an object';
      if (JSON.stringify(input).length > LIMITS.bytes) throw 'too big';
      const kind = input.kind;
      if (kind !== 'effect' && kind !== 'lag') throw 'kind must be effect or lag';
      const value = { v: 1, kind, name: cleanText(input.name, LIMITS.name, 'name', true), by: cleanText(input.by, LIMITS.by, 'nickname', false) };
      if (kind === 'effect') {
        value.video = cleanBlocks(input.video, VIDEO, LIMITS.videoBlocks, 'picture');
        value.audio = cleanBlocks(input.audio, AUDIO, LIMITS.audioBlocks, 'sound');
        if (!value.video.length && !value.audio.length) throw 'empty effect';
      } else {
        if (!Array.isArray(input.steps) || !input.steps.length) throw 'no steps';
        if (input.steps.length > LIMITS.steps) throw 'too many steps';
        let total = 0;
        value.steps = input.steps.map((s, i) => {
          if (!s || typeof s !== 'object') throw 'bad step';
          const ms = Math.round(Number(s.ms));
          if (!Number.isFinite(ms) || ms < 0 || ms > LIMITS.stepMs) throw 'step time out of range';
          if (ms === 0 && i !== input.steps.length - 1) throw 'only the last step can last forever';
          total += ms;
          return { ms, video: cleanBlocks(s.video, VIDEO, LIMITS.videoBlocks, 'picture'), audio: cleanBlocks(s.audio, AUDIO, LIMITS.audioBlocks, 'sound') };
        });
        if (total > LIMITS.totalMs) throw 'too long';
        value.end = input.end === 'live' ? 'live' : 'hold';
      }
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: typeof e === 'string' ? e : 'invalid' };
    }
  }

  const api = { VIDEO, AUDIO, LIMITS, BUILTIN_EFFECTS, BUILTIN_LAGS, BUILTIN_IDS, toPlayable, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FLSchema = api;
})(typeof self !== 'undefined' ? self : this);
