// Fake VoIP packet loss on the microphone, in 20 ms packets (960 samples at 48 kHz).
// A lost packet repeats the last good one a few times (the robotic buzz), then goes silent.
// The output is one packet behind the input, which is what makes the repeat possible.
const LOSS = { live: 0, lag: 0.07, low: 0.18, mosh: 0.3 };

class LagProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.P = 960;
    this.cur = new Float32Array(this.P);
    this.out = new Float32Array(this.P);
    this.last = new Float32Array(this.P);
    this.i = 0; this.run = 0; this.fx = 'live'; this.a = 0.4;
    this.port.onmessage = e => { this.fx = e.data.fx; this.a = e.data.a ?? this.a; };
  }
  packet() {
    const { fx, P } = this;
    if (fx === 'freeze' || fx === 'black') { this.out.fill(0); this.run = 0; return; }
    // badness scales the loss around the default level of 0.4
    const pl = Math.min(0.9, (LOSS[fx] || 0) * (0.4 + this.a * 1.5));
    const lost = Math.random() < (this.run ? pl * 2.2 : pl);
    if (lost) {
      this.run++;
      if (this.run <= 3) { const g = 0.8 ** this.run; for (let k = 0; k < P; k++) this.out[k] = this.last[k] * g; }
      else this.out.fill(0);
    } else {
      this.run = 0; this.last.set(this.cur); this.out.set(this.cur);
    }
    if (fx === 'low' || fx === 'mosh') {
      // starved codec: hold every third sample, a cheap drop in sample rate
      for (let k = 0; k < P; k += 3) { const v = this.out[k]; this.out[k + 1] = v; this.out[k + 2] = v; }
    }
  }
  process(inputs, outputs) {
    const x = inputs[0] && inputs[0][0], outs = outputs[0], y = outs[0];
    for (let k = 0; k < y.length; k++) {
      y[k] = this.out[this.i];
      this.cur[this.i] = x ? x[k] : 0;
      if (++this.i === this.P) { this.i = 0; this.packet(); }
    }
    for (let c = 1; c < outs.length; c++) outs[c].set(y);
    return true;
  }
}
registerProcessor('lag-processor', LagProcessor);
