// SPOTI NOX - noyau DSP pur (aucune dependance navigateur : testable sous Node).
// Contenu : coefficients de filtres (Audio EQ Cookbook, memes formules que Web Audio), reponse de l'EQ,
// mesure de loudness hors-ligne (ITU-R BS.1770 / EBU R128 : K-weighting, portes, LRA, True Peak),
// calcul du gain de normalisation, mode album, caracteristiques spectrales et suggestions d'EQ.

export const dbToLin = (d) => Math.pow(10, d / 20);
export const linToDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// ---------------------------------------------------------------------------------------------
// 1. Filtres biquad (cookbook de Robert Bristow-Johnson)
// ---------------------------------------------------------------------------------------------
export const FILTER_TYPES = ['lowshelf', 'peaking', 'highshelf', 'highpass', 'lowpass', 'notch'];
export const hasGain = (type) => type === 'lowshelf' || type === 'highshelf' || type === 'peaking';
// Web Audio ignore Q pour les shelves (pente fixe S = 1) : on ne propose donc pas de Q pour eux.
export const hasQ = (type) => type !== 'lowshelf' && type !== 'highshelf';

// Coefficients normalises (a0 = 1). Q lineaire pour tous les types (pour highpass/lowpass, Web Audio prend du dB :
// le moteur convertit avec 20*log10(Q)).
export function biquadCoeffs(type, f, gainDb, q, fs) {
  const w0 = 2 * Math.PI * Math.min(f, fs * 0.499) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') {
    const al = sin / (2 * q);
    b0 = 1 + al * A; b1 = -2 * cos; b2 = 1 - al * A;
    a0 = 1 + al / A; a1 = -2 * cos; a2 = 1 - al / A;
  } else if (type === 'lowshelf' || type === 'highshelf') {
    const al = sin / 2 * Math.SQRT2;           // S = 1
    const sq = 2 * Math.sqrt(A) * al;
    if (type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * cos + sq);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - sq);
      a0 = (A + 1) + (A - 1) * cos + sq;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - sq;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cos + sq);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - sq);
      a0 = (A + 1) - (A - 1) * cos + sq;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - sq;
    }
  } else if (type === 'lowpass') {
    const al = sin / (2 * q);
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    a0 = 1 + al; a1 = -2 * cos; a2 = 1 - al;
  } else if (type === 'highpass') {
    const al = sin / (2 * q);
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    a0 = 1 + al; a1 = -2 * cos; a2 = 1 - al;
  } else if (type === 'notch') {
    const al = sin / (2 * q);
    b0 = 1; b1 = -2 * cos; b2 = 1;
    a0 = 1 + al; a1 = -2 * cos; a2 = 1 - al;
  } else {
    return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// Stable si les deux poles sont dans le cercle unite
export const isStable = (c) => Math.abs(c.a2) < 1 && Math.abs(c.a1) < 1 + c.a2;

export function biquadMagDb(c, f, fs) {
  const w = 2 * Math.PI * f / fs;
  const cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * c2, ni = -(c.b1 * sw + c.b2 * s2);
  const dr = 1 + c.a1 * cw + c.a2 * c2, di = -(c.a1 * sw + c.a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-30);
}

// ---------------------------------------------------------------------------------------------
// 2. Bandes d'EQ : 9 bandes (passe-haut, 7 regions, passe-bas) + presets
// ---------------------------------------------------------------------------------------------
export const EQ_LIMITS = { gain: [-12, 12], q: [0.2, 10], f: [20, 20000] };

// Regions musicales de reference (interface simplifiee : un curseur par region)
export const REGIONS = [
  { key: 'sub', name: 'Sub-bass', from: 20, to: 60, f: 45 },
  { key: 'bass', name: 'Bass', from: 60, to: 150, f: 100 },
  { key: 'lowmid', name: 'Low mids', from: 150, to: 500, f: 300 },
  { key: 'mid', name: 'Midrange', from: 500, to: 2000, f: 1000 },
  { key: 'presence', name: 'Presence', from: 2000, to: 6000, f: 3500 },
  { key: 'treble', name: 'Treble', from: 6000, to: 12000, f: 8000 },
  { key: 'air', name: 'Air', from: 12000, to: 20000, f: 14000 }
];

// index 0 = passe-haut, 1..7 = regions, 8 = passe-bas
export function defaultBands() {
  return [
    { id: 'hp', on: false, type: 'highpass', f: 30, gain: 0, q: 0.707 },
    { id: 'sub', on: true, type: 'lowshelf', f: 45, gain: 0, q: 0.707 },
    { id: 'bass', on: true, type: 'peaking', f: 100, gain: 0, q: 1.0 },
    { id: 'lowmid', on: true, type: 'peaking', f: 300, gain: 0, q: 1.0 },
    { id: 'mid', on: true, type: 'peaking', f: 1000, gain: 0, q: 0.9 },
    { id: 'presence', on: true, type: 'peaking', f: 3500, gain: 0, q: 1.0 },
    { id: 'treble', on: true, type: 'peaking', f: 8000, gain: 0, q: 0.9 },
    { id: 'air', on: true, type: 'highshelf', f: 14000, gain: 0, q: 0.707 },
    { id: 'lp', on: false, type: 'lowpass', f: 18000, gain: 0, q: 0.707 }
  ];
}

// Presets : valeurs documentees (README). Chaque entree modifie quelques bandes ; les autres restent a 0 dB.
// Les courbes par defaut restent volontairement discretes (|gain| <= 4 dB).
export const EQ_PRESETS = {
  flat: { name: 'Flat', note: 'Tous les gains à 0 dB : signal inchangé.', set: {} },
  bassboost: { name: 'Bass Boost', note: 'Low shelf +4 dB à 100 Hz.', set: { sub: { f: 100, gain: 4 } } },
  bassreduction: { name: 'Bass Reduction', note: 'Low shelf -4 dB à 100 Hz.', set: { sub: { f: 100, gain: -4 } } },
  vocal: { name: 'Vocal Clarity', note: 'Présence +2 dB à 3 kHz (Q 0,8), -1 dB à 7 kHz contre la sibilance.',
    set: { presence: { f: 3000, gain: 2, q: 0.8 }, treble: { f: 7000, gain: -1, q: 1.2 } } },
  treblereduction: { name: 'Treble Reduction', note: 'High shelf -3 dB à 8 kHz.', set: { air: { f: 8000, gain: -3 } } },
  bright: { name: 'Bright', note: 'High shelf +2,5 dB à 8 kHz.', set: { air: { f: 8000, gain: 2.5 } } },
  warm: { name: 'Warm', note: 'Low shelf +1,5 dB à 150 Hz, -1 dB à 350 Hz (pas de boue), high shelf -1,5 dB à 9 kHz.',
    set: { sub: { f: 150, gain: 1.5 }, lowmid: { f: 350, gain: -1, q: 1.0 }, air: { f: 9000, gain: -1.5 } } },
  electronic: { name: 'Electronic', note: 'Low shelf +3,5 dB à 90 Hz, -1,5 dB à 350 Hz, high shelf +2,5 dB à 9 kHz.',
    set: { sub: { f: 90, gain: 3.5 }, lowmid: { f: 350, gain: -1.5, q: 1.0 }, air: { f: 9000, gain: 2.5 } } },
  acoustic: { name: 'Acoustic', note: 'Low shelf +1 dB à 100 Hz, présence +1 dB à 3 kHz, high shelf +1,5 dB à 10 kHz.',
    set: { sub: { f: 100, gain: 1 }, presence: { f: 3000, gain: 1, q: 0.9 }, air: { f: 10000, gain: 1.5 } } }
};

export function bandsForPreset(key) {
  const bands = defaultBands();
  const p = EQ_PRESETS[key];
  if (!p) return bands;
  bands.forEach((b) => { if (p.set[b.id]) Object.assign(b, p.set[b.id]); });
  return bands;
}

export const clampBand = (b) => ({
  id: b.id,
  on: !!b.on,
  type: FILTER_TYPES.includes(b.type) ? b.type : 'peaking',
  f: Math.min(EQ_LIMITS.f[1], Math.max(EQ_LIMITS.f[0], Number(b.f) || 1000)),
  gain: Math.min(EQ_LIMITS.gain[1], Math.max(EQ_LIMITS.gain[0], Number(b.gain) || 0)),
  q: Math.min(EQ_LIMITS.q[1], Math.max(EQ_LIMITS.q[0], Number(b.q) || 0.707))
});

// Reponse combinee (dB) de toutes les bandes actives (+ decalages adaptatifs facultatifs, par id de bande)
export function eqResponseDb(bands, freqs, fs, offsets = null) {
  const cs = bands.filter((b) => b.on).map((b) => {
    const g = hasGain(b.type) ? b.gain + ((offsets && offsets[b.id]) || 0) : 0;
    return biquadCoeffs(b.type, b.f, g, b.q, fs);
  });
  return freqs.map((f) => cs.reduce((a, c) => a + biquadMagDb(c, f, fs), 0));
}

export function logFreqs(n = 200, lo = 20, hi = 20000) {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)));
}

// Gain maximal que l'EQ peut ajouter (pire cas : un signal pile a la frequence du pic)
export function eqMaxBoostDb(bands, fs = 48000, offsets = null) {
  return Math.max(0, ...eqResponseDb(bands, logFreqs(400), fs, offsets));
}

// ---------------------------------------------------------------------------------------------
// 3. Mesure de loudness hors-ligne (BS.1770-4 / EBU R128)
// ---------------------------------------------------------------------------------------------
export function kWeightCoeffs(fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  const f1 = 38.13547087602444, Q2 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q2 + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [s1, s2];
}

// Interpolateur sinc fenetre (Hann) 12 points, 3 phases (x4) pour le True Peak
export function buildInterp() {
  const C = [];
  for (let p = 1; p <= 3; p++) {
    const f = p / 4;
    const c = new Float64Array(12);
    let sum = 0;
    for (let j = 0; j < 12; j++) {
      const d = 6 - j - f;
      const sinc = Math.sin(Math.PI * d) / (Math.PI * d);
      const win = Math.abs(d) < 6 ? 0.5 * (1 + Math.cos(Math.PI * d / 6)) : 0;
      c[j] = sinc * win;
      sum += c[j];
    }
    for (let j = 0; j < 12; j++) c[j] /= sum;
    C.push(c);
  }
  return C;
}

const toLufs = (e) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity);
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export class LoudnessAnalyzer {
  constructor(fs) {
    this.fs = fs;
    this.coef = kWeightCoeffs(fs);
    this.interp = buildInterp();
    this.block = Math.round(fs * 0.1);
    this.st = [0, 1].map(() => ({ z: [[0, 0], [0, 0]], hist: new Float64Array(16), pos: 0 }));
    this.sum = [0, 0];
    this.cnt = 0;
    this.blocks = [];          // energie (L+R) par bloc de 100 ms
    this.peak = 0;
    this.tp = 0;
    this.samples = 0;
  }

  // R peut etre omis (mono = double mono : L et R identiques, comme a l'ecoute)
  push(L, R) {
    const ch = [L, R || L];
    const n = L.length;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) {
        const x = ch[c][i];
        const s = this.st[c];
        let y = x;
        for (let k = 0; k < 2; k++) {
          const q = this.coef[k], z = s.z[k];
          const o = q.b0 * y + z[0];
          z[0] = q.b1 * y - q.a1 * o + z[1];
          z[1] = q.b2 * y - q.a2 * o;
          y = o;
        }
        this.sum[c] += y * y;
        const ax = Math.abs(x);
        if (ax > this.peak) this.peak = ax;
        if (ax > this.tp) this.tp = ax;
        s.hist[s.pos] = x;
        s.pos = (s.pos + 1) & 15;
        for (let p = 0; p < 3; p++) {
          const co = this.interp[p];
          let v = 0;
          for (let j = 0; j < 12; j++) v += s.hist[(s.pos - 1 - j) & 15] * co[j];
          const av = Math.abs(v);
          if (av > this.tp) this.tp = av;
        }
      }
      if (++this.cnt >= this.block) {
        this.blocks.push((this.sum[0] + this.sum[1]) / this.cnt);
        this.sum = [0, 0];
        this.cnt = 0;
      }
    }
    this.samples += n;
  }

  result() {
    const B = this.blocks;
    const win = (len, hop) => {
      const out = [];
      for (let i = 0; i + len <= B.length; i += hop) out.push(meanOf(B.slice(i, i + len)));
      return out;
    };
    const mom = win(4, 1);
    // integre : portes absolue -70 LUFS puis relative -10 LU
    const abs = mom.filter((e) => toLufs(e) > -70);
    let integrated = -Infinity;
    if (abs.length) {
      const rel = toLufs(meanOf(abs)) - 10;
      const kept = abs.filter((e) => toLufs(e) > rel);
      if (kept.length) integrated = toLufs(meanOf(kept));
    }
    // LRA (EBU Tech 3342) : fenetres de 3 s tous les 1 s, portes -70 puis -20 LU, percentiles 10 et 95
    const shortT = win(30, 10);
    let lra = 0;
    const sa = shortT.filter((e) => toLufs(e) > -70);
    if (sa.length > 1) {
      const rel = toLufs(meanOf(sa)) - 20;
      const v = sa.filter((e) => toLufs(e) > rel).map(toLufs).sort((a, b) => a - b);
      if (v.length > 1) {
        const pct = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
        lra = pct(0.95) - pct(0.10);
      }
    }
    return {
      integrated,
      momentaryMax: mom.length ? Math.max(...mom.map(toLufs)) : -Infinity,
      shortTermMax: shortT.length ? Math.max(...shortT.map(toLufs)) : -Infinity,
      lra,
      samplePeakDb: linToDb(this.peak),
      truePeakDb: linToDb(this.tp),
      duration: this.samples / this.fs
    };
  }
}

// Analyse d'un AudioBuffer (ou objet equivalent), par morceaux pour ne pas bloquer l'interface
export async function analyzeBuffer(buf, { chunk = 1 << 17, yieldFn } = {}) {
  const an = new LoudnessAnalyzer(buf.sampleRate);
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  let sinceYield = 0;
  for (let i = 0; i < L.length; i += chunk) {
    an.push(L.subarray(i, i + chunk), R ? R.subarray(i, i + chunk) : null);
    sinceYield += chunk;
    if (sinceYield >= buf.sampleRate * 2) {
      sinceYield = 0;
      await (yieldFn ? yieldFn() : new Promise((r) => setTimeout(r, 0)));
    }
  }
  return an.result();
}

// ---------------------------------------------------------------------------------------------
// 4. Normalisation : gain = cible - loudness integre, borne par la marge de crete
// ---------------------------------------------------------------------------------------------
export const NORM_MODES = {
  normal: { name: 'Normal', target: -14 },
  quiet: { name: 'Quiet', target: -19 },
  loud: { name: 'Loud', target: -11 }
};

// measured : { integrated, truePeakDb }.  Renvoie le gain a appliquer et pourquoi il est eventuellement limite.
export function normalizationPlan({ measured, target, ceilingDb = -1, eqBoostDb = 0, limiterOn = true, limiterBudgetDb = 2 }) {
  if (!measured || !Number.isFinite(measured.integrated)) {
    return { requestedDb: 0, appliedDb: 0, maxSafeDb: Infinity, limited: false, limiterWorks: false, reason: 'no-measurement' };
  }
  const requestedDb = target - measured.integrated;
  const peakEff = (Number.isFinite(measured.truePeakDb) ? measured.truePeakDb : 0) + Math.max(0, eqBoostDb);
  const strictMax = ceilingDb - peakEff;
  const maxSafeDb = limiterOn ? strictMax + limiterBudgetDb : strictMax;
  const appliedDb = Math.max(-40, Math.min(requestedDb, maxSafeDb));
  return {
    requestedDb, appliedDb, maxSafeDb,
    limited: requestedDb > maxSafeDb + 1e-9,
    limiterWorks: limiterOn && appliedDb > strictMax + 1e-9,
    reason: requestedDb > maxSafeDb + 1e-9 ? 'peak-limited' : 'ok'
  };
}

// Mode album : un gain commun pour tout l'album (les ecarts voulus entre titres sont conserves)
export function albumPlan({ tracks, target, ceilingDb = -1, eqBoostDb = 0, limiterOn = true, limiterBudgetDb = 2 }) {
  const ok = (tracks || []).filter((t) => t && Number.isFinite(t.integrated) && t.duration > 0);
  if (!ok.length) return { sharedDb: 0, albumLufs: -Infinity, limited: false, reason: 'no-measurement' };
  const totalDur = ok.reduce((a, t) => a + t.duration, 0);
  const energy = ok.reduce((a, t) => a + t.duration * Math.pow(10, t.integrated / 10), 0) / totalDur;
  const albumLufs = 10 * Math.log10(energy);
  const requestedDb = target - albumLufs;
  let maxSafe = Infinity;
  ok.forEach((t) => {
    const p = normalizationPlan({ measured: { integrated: albumLufs, truePeakDb: t.truePeakDb }, target, ceilingDb, eqBoostDb, limiterOn, limiterBudgetDb });
    maxSafe = Math.min(maxSafe, p.maxSafeDb);
  });
  const sharedDb = Math.max(-40, Math.min(requestedDb, maxSafe));
  return { sharedDb, albumLufs, requestedDb, limited: requestedDb > maxSafe + 1e-9, reason: requestedDb > maxSafe + 1e-9 ? 'peak-limited' : 'ok' };
}

// ---------------------------------------------------------------------------------------------
// 5. Caracteristiques spectrales et suggestions d'EQ (mesure uniquement, jamais d'effet cache)
// ---------------------------------------------------------------------------------------------
// power : puissance lineaire moyenne par bin FFT (0..fs/2), binHz : largeur d'un bin
export function regionLevels(power, binHz) {
  return REGIONS.map((r) => {
    const lo = Math.max(1, Math.floor(r.from / binHz));
    const hi = Math.min(power.length - 1, Math.ceil(r.to / binHz));
    let s = 0;
    for (let k = lo; k <= hi; k++) s += power[k];
    const oct = Math.log2(r.to / r.from);
    return 10 * Math.log10(Math.max(s, 1e-14) / oct);
  });
}

export function spectralFeatures(power, binHz) {
  const n = power.length;
  let tot = 0, wsum = 0;
  for (let k = 1; k < n; k++) { tot += power[k]; wsum += power[k] * k * binHz; }
  const centroidHz = tot > 0 ? wsum / tot : 0;
  let acc = 0, rolloffHz = 0;
  for (let k = 1; k < n; k++) { acc += power[k]; if (acc >= 0.85 * tot) { rolloffHz = k * binHz; break; } }
  // planeite spectrale (moyenne geometrique / arithmetique) entre 100 Hz et 16 kHz
  const lo = Math.max(1, Math.floor(100 / binHz)), hi = Math.min(n - 1, Math.floor(16000 / binHz));
  let lg = 0, ar = 0, c = 0;
  for (let k = lo; k <= hi; k++) { const p = Math.max(power[k], 1e-14); lg += Math.log(p); ar += p; c++; }
  const flatness = c ? Math.exp(lg / c) / (ar / c) : 0;
  const levels = regionLevels(power, binHz);
  const maxLevel = Math.max(...levels);
  // coupure passe-bas typique d'un fichier avec perte : cherche la frequence la plus haute dont la puissance
  // reste a moins de 60 dB de la puissance moyenne par bin entre 1 et 4 kHz
  const kLo = Math.max(1, Math.floor(1000 / binHz)), kHi = Math.min(n - 1, Math.floor(4000 / binHz));
  let ref = 0; for (let k = kLo; k <= kHi; k++) ref += power[k];
  ref /= Math.max(1, kHi - kLo + 1);
  let cutoffHz = 0;
  for (let k = n - 1; k > kHi; k--) if (power[k] > ref * 1e-6) { cutoffHz = k * binHz; break; }
  const usableMaxHz = cutoffHz || 20000;
  // creux avant 20 kHz : (16-20 kHz) tres en dessous de (8-12 kHz)
  const band = (a, b) => { let s = 0, c = 0; for (let k = Math.floor(a / binHz); k <= Math.min(n - 1, Math.floor(b / binHz)); k++) { s += power[k]; c++; } return c ? s / c : 0; };
  const lossyLowpass = band(16000, 20000) < band(8000, 12000) * Math.pow(10, -4.5);
  return { levels, maxLevel, centroidHz, rolloffHz, flatness, usableMaxHz, lossyLowpass, valid: tot > 1e-12 };
}

// Courbe de reference indicative : -4,5 dB par octave
export const REF_SLOPE = -4.5;

export function suggestEQ(features, { maxDb = 3, deadband = 2, strength = 0.5, seconds = 0, minSeconds = 8 } = {}) {
  const none = (note) => ({ confident: false, recommend: false, bands: REGIONS.map((r) => ({ key: r.key, f: r.f, gainDb: 0 })), notes: [note] });
  if (!features || !features.valid) return none('no-signal');
  if (seconds < minSeconds) return none('too-short');
  const notes = [];
  const T = REGIONS.map((r) => REF_SLOPE * Math.log2(Math.sqrt(r.from * r.to) / 1000));
  const meanT = meanOf(T), meanL = meanOf(features.levels);
  const bands = REGIONS.map((r, i) => {
    const dev = (features.levels[i] - meanL) - (T[i] - meanT);
    let g = Math.abs(dev) > deadband ? -strength * dev : 0;
    g = Math.max(-maxDb, Math.min(maxDb, g));
    // garde-fous : pas de boost dans un creux profond, au-dessus de la coupure utile, ni sous la plage utile
    if (g > 0 && features.levels[i] < features.maxLevel - 55) { g = 0; notes.push('null-' + r.key); }
    if (g > 0 && (r.from >= features.usableMaxHz || features.usableMaxHz < r.to * 0.85)) { g = 0; notes.push('rolloff-' + r.key); }
    if (g > 0 && r.key === 'air' && features.lossyLowpass) { g = 0; notes.push('lossy-air'); }
    if (g > 0 && r.key === 'sub' && features.levels[i] < features.maxLevel - 40) { g = 0; notes.push('weak-sub'); }
    return { key: r.key, f: r.f, gainDb: Math.round(g * 10) / 10, dev };
  });
  const recommend = bands.some((b) => Math.abs(b.gainDb) >= 0.5);
  if (!recommend) notes.push('balanced');
  return { confident: true, recommend, bands, notes };
}

// Pas d'adaptation lent : rapproche les decalages de la cible, limite en vitesse (dB/s) et en amplitude
export function adaptStep(current, target, dt, { maxDb = 2, rateDbPerS = 0.15 } = {}) {
  const step = rateDbPerS * dt;
  return current.map((c, i) => {
    const t = Math.max(-maxDb, Math.min(maxDb, target[i] || 0));
    const d = t - c;
    return Math.abs(d) <= step ? t : c + Math.sign(d) * step;
  });
}
