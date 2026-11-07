// Runs the real sound engine (renderer/lag-worklet.js) offline on a recorded voice, one layer at a time.
// Checks every layer for broken output (NaN, clipping, silence where there shouldn't be) and writes
// one WAV per layer so you can listen.   usage: node test/audio-blocks.mjs <voice.f32 mono 48k> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const Schema = createRequire(import.meta.url)('../renderer/schema.js');

let Proc;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null }; } };
globalThis.registerProcessor = (name, C) => { Proc = C; };
new Function(readFileSync(join(here, '..', 'renderer', 'lag-worklet.js'), 'utf8'))();

const [, , input, outDir] = process.argv;
const buf = readFileSync(input);
const voice = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
mkdirSync(outDir, { recursive: true });

function run(blocks) {
  const p = new Proc(); p.port.onmessage({ data: { blocks } });
  const out = new Float32Array(voice.length);
  for (let i = 0; i < voice.length; i += 128) {
    const inp = voice.subarray(i, i + 128), o = new Float32Array(inp.length);
    p.process([[inp]], [[o]]); out.set(o, i);
  }
  return out;
}
function wav(samples, file) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  writeFileSync(file, b);
}
const stats = s => {
  let sum = 0, peak = 0, bad = 0, silent = 0;
  for (let i = 0; i < s.length; i += 960) {
    let e = 0; for (let k = i; k < Math.min(i + 960, s.length); k++) { const v = s[k]; if (!Number.isFinite(v)) bad++; e += v * v; peak = Math.max(peak, Math.abs(v)); }
    if (e / 960 < 1e-7) silent++; sum += e;
  }
  return { rms: Math.sqrt(sum / s.length), peak, bad, silentPct: Math.round(100 * silent / Math.ceil(s.length / 960)) };
};
// how different the output is from the clean voice (0 = identical)
const diff = s => { let d = 0, e = 0; for (let i = 960; i < s.length; i++) { const x = s[i] - voice[i - 960]; d += x * x; e += voice[i - 960] ** 2; } return Math.sqrt(d / e); };

const cases = [['clean', []], ...Object.keys(Schema.AUDIO).map(b => [b, [{ b, ...Object.fromEntries(Object.entries(Schema.AUDIO[b].p).map(([k, s]) => [k, Array.isArray(s) ? (k === 'ms' ? s[2] : 0.7) : ''])) }]]),
  ['builtin lag', Schema.BUILTIN_EFFECTS.lag.audio], ['builtin mosh', Schema.BUILTIN_EFFECTS.mosh.audio],
  ['everything', Object.keys(Schema.AUDIO).filter(b => b !== 'mute').map(b => ({ b, a: 0.6, ms: 180 }))]];
let failed = 0;
const base = stats(voice);
console.log('layer'.padEnd(14), 'rms   peak  silent%  change  verdict');
for (const [name, blocks] of cases) {
  const out = run(blocks), s = stats(out), d = diff(out);
  const expectSilent = name === 'mute';
  const problems = [];
  if (s.bad) problems.push('NaN');
  if (s.peak > 1) problems.push('clipping');
  if (expectSilent ? s.silentPct < 99 : s.rms < base.rms * 0.15) problems.push(expectSilent ? 'not silent' : 'too quiet');
  if (name !== 'clean' && !expectSilent && d < 0.05) problems.push('no audible change');
  if (name === 'clean' && d > 1e-6) problems.push('clean is not clean');
  if (problems.length) failed++;
  console.log(name.padEnd(14), s.rms.toFixed(3), s.peak.toFixed(2).padStart(5), String(s.silentPct).padStart(7), d.toFixed(2).padStart(7), ' ', problems.join(', ') || 'ok');
  wav(out, join(outDir, `${name.replace(/\s+/g, '-')}.wav`));
}
console.log(failed ? `\n${failed} layer(s) with problems` : '\nall layers ok');
process.exit(failed ? 1 : 0);
