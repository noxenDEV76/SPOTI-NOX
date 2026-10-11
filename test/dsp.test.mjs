// Test du loudness / True Peak sur des signaux de reference
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LufsMeter } from '../www/js/lufs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../www/js/loudness-worklet.js'), 'utf8');

function makeProcessor(fs_) {
  const messages = [];
  let Ctor;
  const ctx = {
    sampleRate: fs_,
    AudioWorkletProcessor: class {
      constructor() { this.port = { postMessage: (m) => messages.push(m) }; }
    },
    registerProcessor: (_n, c) => { Ctor = c; },
    Math, Float64Array, Float32Array
  };
  vm.runInNewContext(src, ctx);
  return { proc: new Ctor(), messages };
}

function run(fn, seconds, fs_ = 48000) {
  const { proc, messages } = makeProcessor(fs_);
  const total = Math.floor(seconds * fs_);
  const N = 128;
  for (let i = 0; i < total; i += N) {
    const L = new Float32Array(N), R = new Float32Array(N);
    for (let k = 0; k < N; k++) { const [l, r] = fn(i + k); L[k] = l; R[k] = r; }
    proc.process([[L, R]]);
  }
  const m = new LufsMeter();
  messages.forEach((x) => m.push(x));
  return m.snapshot();
}

let failed = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${got.toFixed(2)} (attendu ${want} +/- ${tol})`);
}

const fs48 = 48000;
const sine = (f, a, ph = 0) => (n) => { const v = a * Math.sin(2 * Math.PI * f * n / fs48 + ph); return [v, v]; };

let s = run(sine(997, 1.0), 8);
check('Sinus 997 Hz pleine echelle stereo (L=R) -> LUFS integre', s.integrated, 0.0, 0.15);
check('  momentane', s.momentary, 0.0, 0.15);

s = run(sine(997, 0.5), 8);
check('Sinus 997 Hz a -6 dBFS stereo -> LUFS integre', s.integrated, -6.02, 0.15);

s = run(sine(997, 0.1), 8);
check('Sinus 997 Hz a -20 dBFS stereo -> LUFS integre (ref EBU: -23 dBFS = -23 LUFS)', s.integrated, -20.0, 0.15);

// Silence puis signal : la porte absolue doit ignorer le silence
s = run((n) => (n < 4 * fs48 ? [0, 0] : sine(997, 0.5)(n)), 10);
check('Silence 4 s + sinus -6 dBFS -> integre (porte)', s.integrated, -6.02, 0.25);

// True Peak : sinus a fs/4 avec phase 45 deg -> echantillons a +-0.7071 mais vraie crete = 1.0
s = run(sine(12000, 1.0, Math.PI / 4), 2);
check('Crete echantillon fs/4 @45deg (dB)', s.peakMax, -3.01, 0.1);
check('True Peak fs/4 @45deg (dBTP, vrai = 0)', s.truePeakMax, 0.0, 0.7);

// True Peak d'un sinus basse frequence = sa crete
s = run(sine(1000, 0.5), 2);
check('True Peak sinus 1 kHz -6 dBFS', s.truePeakMax, -6.02, 0.15);

if (failed) {
  console.error(`\n${failed} test(s) en echec`);
  process.exit(1);
}
console.log('\nTous les tests DSP passent.');
