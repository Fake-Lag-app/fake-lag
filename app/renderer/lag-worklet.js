// The sound engine: mic in, broken-sounding voice out, built from layers (see schema.js AUDIO).
// Works in 20 ms packets (960 samples at 48 kHz). The output runs one packet behind the input,
// which is what lets a lost packet repeat the previous one (the robotic VoIP buzz).
const P = 960;

class LagProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cur = new Float32Array(P); this.out = new Float32Array(P); this.last = new Float32Array(P);
    this.i = 0; this.run = 0; this.blocks = [];
    this.echo = new Float32Array(48000); this.echoPos = 0;      // 1 s delay line
    this.hist = new Float32Array(P * 8); this.histPos = 0;     // last 160 ms, for stutters
    this.stutterLeft = 0; this.stutterFrom = 0;
    this.beepLeft = 0; this.phase = 0;
    this.port.onmessage = e => { if (Array.isArray(e.data.blocks)) this.blocks = e.data.blocks; };
  }
  get(b) { return this.blocks.find(x => x.b === b); }

  packet() {
    const out = this.out, cur = this.cur;
    out.set(cur);
    if (this.get('mute')) { out.fill(0); this.run = 0; return; }

    // remember clean input for stutters
    this.hist.set(cur, this.histPos); this.histPos = (this.histPos + P) % this.hist.length;

    const loss = this.get('loss'), robot = this.get('robot');
    if (loss) {
      const pl = Math.min(0.9, loss.a * 0.75);
      const lost = Math.random() < (this.run ? Math.min(0.95, pl * 2.2) : pl);
      if (lost) {
        this.run++;
        // robotic: lost packets repeat the last good one for longer before going silent
        const maxRepeat = robot ? 3 + Math.round(robot.a * 6) : 3;
        if (this.run <= maxRepeat) { const g = 0.82 ** this.run; for (let k = 0; k < P; k++) out[k] = this.last[k] * g; }
        else out.fill(0);
      } else { this.run = 0; this.last.set(cur); }
    } else this.last.set(cur);

    if (robot && robot.a > 0) {
      // ring modulation gives the metallic "bad connection" voice
      const f = 40 + robot.a * 60, mix = robot.a * 0.8;
      for (let k = 0; k < P; k++) { this.phase += f / 48000; out[k] = out[k] * (1 - mix) + out[k] * Math.sin(2 * Math.PI * this.phase) * mix * 1.6; }
      this.phase %= 1;
    }

    const st = this.get('stutter');
    if (st) {
      if (!this.stutterLeft && Math.random() < st.a * 0.04) { this.stutterLeft = 2 + (Math.random() * 3 | 0); this.stutterFrom = (this.histPos - P * 3 + this.hist.length) % this.hist.length; }
      if (this.stutterLeft) {
        for (let k = 0; k < P; k++) out[k] = this.hist[(this.stutterFrom + (k % (P * 3 / 2 | 0))) % this.hist.length];
        this.stutterLeft--;
      }
    }

    const lq = this.get('lowq');
    if (lq && lq.a > 0) {
      const hold = 1 + Math.round(lq.a * 6);
      for (let k = 0; k < P; k += hold) { const v = out[k]; for (let j = 1; j < hold && k + j < P; j++) out[k + j] = v; }
      const bits = 16 - Math.round(lq.a * 10), q = 2 ** bits;
      for (let k = 0; k < P; k++) out[k] = Math.round(out[k] * q) / q;
    }

    const ec = this.get('echo');
    if (ec && ec.a > 0) {
      const d = Math.min(this.echo.length - 1, Math.round(ec.ms * 48)), fb = ec.a * 0.6;
      for (let k = 0; k < P; k++) {
        const rp = (this.echoPos - d + this.echo.length) % this.echo.length;
        const y = out[k] + this.echo[rp] * fb;
        this.echo[this.echoPos] = y; this.echoPos = (this.echoPos + 1) % this.echo.length; out[k] = y;
      }
    }

    const nz = this.get('noise');
    if (nz && nz.a > 0) for (let k = 0; k < P; k++) out[k] += (Math.random() * 2 - 1) * nz.a * 0.04;

    const bp = this.get('beep');
    if (bp && bp.a > 0) {
      if (!this.beepLeft && Math.random() < bp.a * 0.01) this.beepLeft = 6 + (Math.random() * 10 | 0);
      if (this.beepLeft) { for (let k = 0; k < P; k++) out[k] = out[k] * 0.3 + Math.sin(2 * Math.PI * 1000 * ((this.beepLeft * P + k) / 48000)) * 0.15; this.beepLeft--; }
    }

    for (let k = 0; k < P; k++) out[k] = Math.max(-1, Math.min(1, out[k]));
  }

  process(inputs, outputs) {
    const x = inputs[0] && inputs[0][0], outs = outputs[0], y = outs[0];
    for (let k = 0; k < y.length; k++) {
      y[k] = this.out[this.i];
      this.cur[this.i] = x ? x[k] : 0;
      if (++this.i === P) { this.i = 0; this.packet(); }
    }
    for (let c = 1; c < outs.length; c++) outs[c].set(y);
    return true;
  }
}
registerProcessor('lag-processor', LagProcessor);
