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

export class Analyzer {
  constructor(audioEl) {
    this.el = audioEl;
    this.ctx = null;
    this.meter = new LufsMeter();
    this.active = true;      // false quand la source n'autorise pas l'analyse (pas de CORS)
    this.power = new Float64Array(BANDS.length);
    this.error = null;
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
    this.src.connect(this.an);
    this.src.connect(this.ctx.destination);
    try {
      await this.ctx.audioWorklet.addModule('js/loudness-worklet.js');
      this.node = new AudioWorkletNode(this.ctx, 'nox-loudness', {
        numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2]
      });
      this.node.port.onmessage = (e) => { if (this.active) this.meter.push(e.data); };
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      this.src.connect(this.node);
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
