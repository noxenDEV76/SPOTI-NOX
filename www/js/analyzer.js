// SPOTI NOX - analyse en direct : loudness (LUFS), True Peak, spectre et 4 zones de frequences
import { LufsMeter } from './lufs.js';

export const BANDS = [
  { key: 'low', name: 'Low', from: 20, to: 250 },
  { key: 'lowmid', name: 'Low Mid', from: 250, to: 2000 },
  { key: 'highmid', name: 'High Mid', from: 2000, to: 6000 },
  { key: 'high', name: 'High', from: 6000, to: 20000 }
];

// Cible indicative : pente d'environ -4,5 dB/octave (courbe de reference courante pour juger l'equilibre d'un mix)
const octaves = (b) => Math.log2(b.to / b.from);
const centre = (b) => Math.sqrt(b.from * b.to);
const TARGET = BANDS.map((b) => -4.5 * Math.log2(centre(b) / 1000));
const TARGET_MEAN = TARGET.reduce((a, b) => a + b, 0) / TARGET.length;

// ---------- egaliseur : lows qui rebondissent, bas-medium degage (anti "muddy"), brillance ----------
export const EQ_PRESETS = {
  bounce: { bass: 4.5, mud: -3.5, bright: 4 },   // equilibre : graves pleins, mediums propres, aigus ouverts
  flat: { bass: 0, mud: 0, bright: 0 },
  bass: { bass: 8, mud: -2.5, bright: 2 },
  bright: { bass: 2, mud: -3, bright: 7 }
};
export const DEFAULT_EQ = { on: true, preset: 'bounce', ...EQ_PRESETS.bounce };

// Convertit les 3 reglages (dB) en parametres de filtres ; fonction pure (testee)
export function eqParams(cfg) {
  const c = cfg && cfg.on !== false ? cfg : { bass: 0, mud: 0, bright: 0, off: true };
  const bass = Math.max(-12, Math.min(12, Number(c.bass) || 0));
  const mud = Math.max(-12, Math.min(6, Number(c.mud) || 0));
  const bright = Math.max(-12, Math.min(12, Number(c.bright) || 0));
  // marge de securite : on baisse le niveau d'entree de ce que les boosts ajoutent
  const headroom = c.off ? 0 : Math.max(0, bass) * 0.35 + Math.max(0, bright) * 0.2;
  return {
    pre: Math.pow(10, -headroom / 20),
    hp: c.off ? 10 : 24,
    bass, mud, presence: bright * 0.35, bright,
    limit: !c.off
  };
}

// Construit la chaine de filtres ; renvoie { input, pre, hp, ls, mud, pres, hs, lim } (lim = sortie)
export function buildToneChain(ctx) {
  const bq = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; };
  const lim = ctx.createDynamicsCompressor();
  lim.knee.value = 3; lim.attack.value = 0.002; lim.release.value = 0.12;
  const sat = ctx.createWaveShaper();   // filet de securite : jamais au-dessus de ~ -0,45 dBFS
  const eq = { pre: ctx.createGain(), hp: bq('highpass', 24, 0.7), ls: bq('lowshelf', 95), mud: bq('peaking', 320, 0.9),
    pres: bq('peaking', 3500, 0.8), hs: bq('highshelf', 9000), lim, sat, out: sat };
  eq.input = eq.pre;
  [eq.pre, eq.hp, eq.ls, eq.mud, eq.pres, eq.hs, lim, sat].reduce((x, y) => { x.connect(y); return y; });
  return eq;
}

const CURVE_LEN = 4097;
export function satCurve(on) {
  const c = new Float32Array(CURVE_LEN);
  for (let i = 0; i < CURVE_LEN; i++) {
    const x = (i / (CURVE_LEN - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = !on || a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.15 * Math.tanh((a - 0.8) / 0.15));
  }
  return c;
}

export function applyToneParams(ctx, eq, cfg) {
  const p = eqParams(cfg);
  eq.sat.curve = satCurve(p.limit);
  const t = ctx.currentTime;
  const set = (param, v) => param.setTargetAtTime(v, t, 0.03);
  set(eq.pre.gain, p.pre); set(eq.hp.frequency, p.hp); set(eq.ls.gain, p.bass); set(eq.mud.gain, p.mud);
  set(eq.pres.gain, p.presence); set(eq.hs.gain, p.bright);
  set(eq.lim.threshold, p.limit ? -8 : 0); set(eq.lim.ratio, p.limit ? 8 : 1);
}

export class Analyzer {
  constructor(audioEl) {
    this.el = audioEl;
    this.ctx = null;
    this.meter = new LufsMeter();
    this.active = true;      // false quand la source n'autorise pas l'analyse (pas de CORS)
    this.power = new Float64Array(BANDS.length);
    this.error = null;
    this.eqCfg = { ...DEFAULT_EQ };
  }

  setEQ(cfg) {
    this.eqCfg = { ...DEFAULT_EQ, ...(cfg || {}) };
    this.applyEQ();
  }

  applyEQ() {
    if (this.eq) applyToneParams(this.ctx, this.eq, this.eqCfg);
  }

  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'playback' });
    this.src = this.ctx.createMediaElementSource(this.el);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 8192;
    this.an.smoothingTimeConstant = 0.6;
    this.an.minDecibels = -110;
    this.an.maxDecibels = 0;
    this.freq = new Float32Array(this.an.frequencyBinCount);
    // chaine de tonalite : entree -> filtres -> limiteur ; l'analyse mesure ce que tu entends
    this.eq = buildToneChain(this.ctx);
    this.src.connect(this.eq.input);
    this.out = this.eq.out;
    this.applyEQ();
    this.out.connect(this.an);
    this.out.connect(this.ctx.destination);
    try {
      await this.ctx.audioWorklet.addModule('js/loudness-worklet.js');
      this.node = new AudioWorkletNode(this.ctx, 'nox-loudness', {
        numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2]
      });
      this.node.port.onmessage = (e) => { if (this.active) this.meter.push(e.data); };
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      this.out.connect(this.node);
      this.node.connect(sink);
      sink.connect(this.ctx.destination);
    } catch (e) {
      this.error = e;
    }
  }

  resume() {
    return this.ctx && this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  resetMeters() {
    this.meter.reset();
  }

  // Lit le spectre courant ; renvoie les niveaux par zone et le diagnostic d'equilibre
  readBands() {
    if (!this.an || !this.active) return null;
    this.an.getFloatFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.an.fftSize;
    const dens = BANDS.map((b, i) => {
      const lo = Math.max(1, Math.floor(b.from / binHz));
      const hi = Math.min(this.freq.length - 1, Math.ceil(b.to / binHz));
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += Math.pow(10, this.freq[k] / 10);
      // lissage temporel de la puissance
      this.power[i] = this.power[i] * 0.85 + sum * 0.15;
      return 10 * Math.log10(Math.max(this.power[i], 1e-12) / octaves(b));
    });
    const silent = dens.every((d) => d < -95);
    const mean = dens.reduce((a, b) => a + b, 0) / dens.length;
    const dev = dens.map((d, i) => (d - mean) - (TARGET[i] - TARGET_MEAN));
    return { dens, dev, silent };
  }

  verdict(dev) {
    if (!dev) return '';
    let worst = 0;
    dev.forEach((d, i) => { if (Math.abs(d) > Math.abs(dev[worst])) worst = i; });
    if (Math.abs(dev[worst]) <= 4) return 'Équilibré';
    const name = BANDS[worst].name;
    return dev[worst] > 0 ? `Trop de ${name}` : `Manque de ${name}`;
  }

  spectrum() {
    if (!this.an) return null;
    this.an.getFloatFrequencyData(this.freq);
    return { data: this.freq, binHz: this.ctx.sampleRate / this.an.fftSize };
  }
}
