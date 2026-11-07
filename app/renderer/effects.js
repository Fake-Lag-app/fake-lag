// The picture engine: plays a lag (steps of video layers) on a camera image.
// Used by the camera window, the editor preview and the admin page, so all three look the same.
// Needs schema.js loaded first (FLSchema).
(function (root) {
  const S = root.FLSchema;
  const rnd = Math.random;

  function createEngine({ W = 1280, H = 720, out, drawSource, env = {} }) {
    const mk = () => { const c = new OffscreenCanvas(W, H); return [c, c.getContext('2d')]; };
    out = out || new OffscreenCanvas(W, H);
    const octx = out.getContext('2d');
    const [src, sctx] = mk(), [work, wctx] = mk(), [prev, pctx] = mk(), [tmpB, bctx] = mk(), [tmpC, cctx] = mk();
    const small = new OffscreenCanvas(W, H), smctx = small.getContext('2d');
    // a tile of grain, reused with random offsets
    const grain = new OffscreenCanvas(256, 256);
    { const g = grain.getContext('2d'), d = g.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0); }
    const grainPattern = wctx.createPattern(grain, 'repeat');

    let playable = S.toPlayable('live'), opts = {}, t0 = 0, idx = -1, nextUpdate = 0, cache = null, level = 0.4, slicesSeed = [], slicesAt = 0;
    octx.fillStyle = '#111'; octx.fillRect(0, 0, W, H);

    function scaleBlock(blk, defs) {
      const def = defs[blk.b]; if (!def || !def.scale) return blk;
      const f = 0.5 + level * 1.25, o = { ...blk };
      for (const [k, dir] of Object.entries(def.scale)) {
        const spec = def.p[k]; if (!Array.isArray(spec) || typeof o[k] !== 'number') continue;
        o[k] = Math.min(spec[1], Math.max(spec[0], dir > 0 ? o[k] * f : o[k] / f));
      }
      return o;
    }
    function scaledStep(st) {
      return { ms: st.ms, video: (st.video || []).map(b => scaleBlock(b, S.VIDEO)), audio: (st.audio || []).map(b => scaleBlock(b, S.AUDIO)) };
    }

    function play(p, o = {}) {
      playable = S.toPlayable(p); opts = o; t0 = o.t != null ? o.t : performance.now(); idx = -1; nextUpdate = 0;
    }
    function setLevel(v) { level = v; if (idx >= 0) { cache = scaledStep(playable.steps[idx]); opts.onStep && opts.onStep(idx, cache); } }

    function stepAt(t) {
      let el = t - t0, i = 0;
      const st = playable.steps;
      for (; i < st.length; i++) {
        if (st[i].ms === 0 || el < st[i].ms) return i;
        el -= st[i].ms;
      }
      return -1;   // ran past the end
    }

    // ---------- layers ----------
    function copy(dstCtx, from) { dstCtx.globalAlpha = 1; dstCtx.globalCompositeOperation = 'source-over'; dstCtx.filter = 'none'; dstCtx.drawImage(from, 0, 0); }
    const L = {
      pixelate(p) {
        const sw = Math.max(8, W / p.size | 0), sh = Math.max(4, H / p.size | 0);
        smctx.imageSmoothingEnabled = true; smctx.clearRect(0, 0, W, H); smctx.drawImage(work, 0, 0, sw, sh);
        wctx.imageSmoothingEnabled = p.smooth >= 0.5; wctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H); wctx.imageSmoothingEnabled = true;
      },
      blur(p) { if (!p.px) return; bctx.filter = `blur(${p.px}px)`; bctx.drawImage(work, 0, 0); bctx.filter = 'none'; copy(wctx, tmpB); },
      mosh(p) {
        // start from the last output and only refresh some blocks, like a starved video codec
        const B = Math.round(p.block), f = 3, sw = W / f | 0, sh = H / f | 0;
        smctx.imageSmoothingEnabled = true; smctx.drawImage(work, 0, 0, sw, sh);
        copy(bctx, prev); bctx.imageSmoothingEnabled = false;
        const upd = 1 - p.keep;
        for (let y = 0; y < H; y += B) for (let x = 0; x < W; x += B) {
          const r = rnd();
          if (r < upd) bctx.drawImage(small, x / f, y / f, B / f, B / f, x, y, B, B);
          else if (r < upd + p.smear) bctx.drawImage(tmpB, x, y, B, B, x, y + B * (rnd() < .5 ? 1 : 0.5), B, B);
        }
        bctx.imageSmoothingEnabled = true; copy(wctx, tmpB);
      },
      jpeg(p) {
        const sw = W / 8 | 0, sh = H / 8 | 0;
        smctx.imageSmoothingEnabled = true; smctx.drawImage(work, 0, 0, sw, sh);
        wctx.globalAlpha = p.a; wctx.imageSmoothingEnabled = false; wctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H);
        wctx.globalAlpha = 1; wctx.imageSmoothingEnabled = true;
      },
      noise(p) {
        if (!p.a) return;
        wctx.save(); wctx.globalCompositeOperation = 'overlay'; wctx.globalAlpha = Math.min(1, p.a * 0.9);
        wctx.translate(-rnd() * 256, -rnd() * 256); wctx.fillStyle = grainPattern; wctx.fillRect(0, 0, W + 256, H + 256); wctx.restore();
      },
      colorBreak(p) {
        if (!p.a) return;
        wctx.save(); wctx.globalCompositeOperation = 'color';
        const n = 1 + (rnd() * 3 | 0);
        for (let i = 0; i < n; i++) {
          const h = 20 + rnd() * 140, y = rnd() * (H - h);
          wctx.globalAlpha = p.a * (0.5 + rnd() * 0.5); wctx.fillStyle = rnd() < 0.5 ? '#35ff35' : '#ff2fd0';
          wctx.fillRect(0, y, W, h);
        }
        wctx.restore();
      },
      rgbSplit(p) {
        if (!p.px) return;
        const red = (c, color) => { c.globalCompositeOperation = 'source-over'; c.drawImage(work, 0, 0); c.globalCompositeOperation = 'multiply'; c.fillStyle = color; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; };
        red(bctx, '#ff0000'); red(cctx, '#00ffff');
        wctx.fillStyle = '#000'; wctx.fillRect(0, 0, W, H);
        wctx.globalCompositeOperation = 'lighter'; wctx.drawImage(tmpB, -p.px, 0); wctx.drawImage(tmpC, p.px, 0); wctx.globalCompositeOperation = 'source-over';
      },
      color(p) { bctx.filter = `saturate(${p.sat}) brightness(${p.bright}) contrast(${p.contrast})`; bctx.drawImage(work, 0, 0); bctx.filter = 'none'; copy(wctx, tmpB); },
      bands(p) {
        if (!p.a) return;
        copy(bctx, work);
        const bh = H / (p.count * 2);
        for (let i = 0; i < p.count; i++) {
          if (rnd() > 0.6) continue;
          const y = rnd() * (H - bh), dx = (rnd() * 2 - 1) * p.a * W * 0.15;
          wctx.drawImage(tmpB, 0, y, W, bh, dx, y, W, bh);
        }
      },
      slices(p, t) {
        if (!p.px) return;
        const n = Math.round(p.count);
        if (t - slicesAt > 180 || slicesSeed.length !== n) { slicesAt = t; slicesSeed = Array.from({ length: n }, () => rnd() * 2 - 1); }
        copy(bctx, work); wctx.fillStyle = '#000'; wctx.fillRect(0, 0, W, H);
        const h = H / n;
        for (let i = 0; i < n; i++) wctx.drawImage(tmpB, 0, i * h, W, h + 1, slicesSeed[i] * p.px, i * h, W, h + 1);
      },
      shake(p) {
        if (!p.px) return;
        copy(bctx, work); wctx.fillStyle = '#000'; wctx.fillRect(0, 0, W, H);
        wctx.drawImage(tmpB, (rnd() * 2 - 1) * p.px, (rnd() * 2 - 1) * p.px);
      },
      ghost(p) { if (!p.a) return; wctx.globalAlpha = p.a; wctx.drawImage(prev, 0, 0); wctx.globalAlpha = 1; },
      black(p) {
        const g = Math.round(p.gray * 255); wctx.fillStyle = `rgb(${g},${g},${g})`; wctx.fillRect(0, 0, W, H);
        if (p.name < 0.5) return;
        const name = (env.name || '').trim(), photo = env.photo;
        wctx.textAlign = 'center'; wctx.textBaseline = 'middle'; wctx.fillStyle = '#fff';
        if (photo) {
          const r = 120, cx = W / 2, cy = H / 2 - 40;
          wctx.save(); wctx.beginPath(); wctx.arc(cx, cy, r, 0, Math.PI * 2); wctx.clip();
          const s = Math.max(2 * r / photo.width, 2 * r / photo.height);
          wctx.drawImage(photo, cx - photo.width * s / 2, cy - photo.height * s / 2, photo.width * s, photo.height * s); wctx.restore();
          if (name) { wctx.font = '600 40px "Segoe UI", Arial, sans-serif'; wctx.fillText(name, cx, cy + r + 50); }
        } else if (name) { wctx.font = '600 72px "Segoe UI", Arial, sans-serif'; wctx.fillText(name, W / 2, H / 2); }
      },
      reconnecting(p, t) {
        wctx.fillStyle = 'rgba(0,0,0,0.6)'; wctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2 - 30, a = (t / 160) % (Math.PI * 2);
        wctx.strokeStyle = '#fff'; wctx.lineWidth = 7; wctx.lineCap = 'round';
        wctx.beginPath(); wctx.arc(cx, cy, 34, a, a + Math.PI * 1.4); wctx.stroke();
        wctx.fillStyle = '#fff'; wctx.font = '500 34px "Segoe UI", Arial, sans-serif'; wctx.textAlign = 'center'; wctx.textBaseline = 'middle';
        wctx.fillText(env.lang === 'en' ? 'Reconnecting…' : 'מתחבר מחדש…', cx, cy + 80);
      },
      caption(p) {
        if (!p.text) return;
        wctx.font = `600 ${p.size}px "Segoe UI", Arial, sans-serif`; wctx.textAlign = 'center'; wctx.textBaseline = 'bottom';
        wctx.lineWidth = Math.max(3, p.size / 8); wctx.strokeStyle = 'rgba(0,0,0,0.85)'; wctx.fillStyle = '#fff';
        wctx.strokeText(p.text, W / 2, H - 30); wctx.fillText(p.text, W / 2, H - 30);
      },
    };

    // ---------- one frame ----------
    function frame(t) {
      let i = stepAt(t);
      if (i < 0) {
        if (playable.end === 'live') { const cb = opts.onEnd; play('live', { onStep: opts.onStep }); cb && cb(); i = 0; }
        else i = playable.steps.length - 1;
      }
      if (i !== idx) { idx = i; nextUpdate = 0; cache = scaledStep(playable.steps[i]); opts.onStep && opts.onStep(i, cache); }
      const vid = cache.video;
      if (vid.some(b => b.b === 'freeze')) return false;
      const drop = vid.find(b => b.b === 'dropFrames');
      if (drop) {
        if (t < nextUpdate) return false;
        const base = 1000 / drop.fps;
        nextUpdate = t + (rnd() < 0.15 * drop.jitter ? base * 2.5 : base * (1 + drop.jitter * (rnd() * 2 - 1) * 0.6));
      }
      drawSource(sctx, W, H);
      copy(wctx, src);
      for (const b of vid) { const fn = L[b.b]; if (fn) { wctx.save(); fn(b, t); wctx.restore(); } }
      octx.drawImage(work, 0, 0);
      copy(pctx, work);   // remembered for the next frame's smears and ghosts
      return true;
    }

    return { out, play, frame, setLevel, setEnv: e => Object.assign(env, e), get step() { return cache; }, get index() { return idx; } };
  }

  root.FLEffects = { createEngine };
})(typeof self !== 'undefined' ? self : this);
