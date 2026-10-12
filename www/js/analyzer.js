// SPOTI NOX - moteur audio (Web Audio) : graphe de traitement, mesures en direct, normalisation, A/B.
//
// Flux du signal (voir README, « Chaine audio ») :
//
//   source ─┬─► [retard = latence du limiteur] ─► dry ─────────────────────────────────┐
//           │                                                                           ├─► master ─► sortie
//           └─► EQ parametrique (9 filtres) ─► stereo ─► gain de normalisation ─► limiteur true peak ─► wet ─┘
//
//   Mesures (AudioWorklet K-weighting + True Peak) : entree (source), apres traitement (wet) et sortie (master).
//   Analyseurs FFT : entree (pour l'EQ intelligent) et sortie (spectre, forme d'onde).
//
// Tout est en flottant 32 bits (Web Audio). Aucune conversion entiere avant la sortie.
import { LufsMeter } from './lufs.js';
import * as D from './dsp.js';
import { TruePeakLimiter } from './limiter-core.js';
import { defaultAudio, validateAudio } from './audio-settings.js';

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

const SMOOTH = 0.02;   // s : lissage des changements de parametres (pas de clic)

// ---------------------------------------------------------------------------------------------
// Construction du graphe (utilisable avec un AudioContext reel ou OfflineAudioContext, pour les tests)
// ---------------------------------------------------------------------------------------------
export async function buildGraph(ctx, source, { base = 'js/', initial = {} } = {}) {
  const g = { ctx, degraded: [] };
  const sr = ctx.sampleRate;
  const load = async (file) => {
    try { await ctx.audioWorklet.addModule(base + file); return true; } catch (e) { g.degraded.push(file + ' : ' + ((e && e.message) || e)); return false; }
  };
  const okLoud = await load('loudness-worklet.js');
  const okStereo = await load('stereo-worklet.js');
  const okLim = await load('limiter-worklet.js');
  const wnode = (name, opts = {}) => new AudioWorkletNode(ctx, name, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2], ...opts });

  g.in = ctx.createGain();
  source.connect(g.in);

  // EQ : un biquad par bande (une bande a 0 dB = identite exacte)
  g.eq = D.defaultBands().map((b) => { const f = ctx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = b.f; f.gain.value = 0; f.Q.value = 1; return f; });
  g.eq.reduce((a, b) => { a.connect(b); return b; });
  g.in.connect(g.eq[0]);

  // stereo
  if (okStereo) { g.stereo = wnode('nox-stereo', { processorOptions: initial.stereo || {} }); g.stereoKind = 'worklet'; } else { g.stereo = ctx.createGain(); g.stereoKind = 'none'; }
  g.eq[g.eq.length - 1].connect(g.stereo);

  // gain de normalisation
  g.norm = ctx.createGain();
  g.stereo.connect(g.norm);

  // limiteur
  let limIn;
  if (okLim) {
    g.limiter = wnode('nox-limiter', { processorOptions: initial.limiter || {} });
    g.limiterKind = 'worklet';
    g.latency = new TruePeakLimiter(sr).latencySamples;
    limIn = g.limiter;
  } else {
    // repli : compresseur + ecreteur doux (limite la crete echantillon, pas la crete vraie)
    const c = ctx.createDynamicsCompressor(); c.threshold.value = -8; c.ratio.value = 12; c.knee.value = 3; c.attack.value = 0.002; c.release.value = 0.12;
    const s = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) { const x = (i / 4096) * 2 - 1, a = Math.abs(x); curve[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.15 * Math.tanh((a - 0.8) / 0.15)); }
    s.curve = curve; c.connect(s);
    g.limiter = s;
    g.limiterKind = 'fallback';
    g.latency = 0;
    limIn = c;
  }
  g.norm.connect(limIn);

  // voies wet / dry (la voie dry est retardee de la latence du limiteur : A/B parfaitement alignes)
  g.wet = ctx.createGain();
  g.dry = ctx.createGain();
  g.dryDelay = ctx.createDelay(1);
  g.dryDelay.delayTime.value = g.latency / sr;
  g.dry.gain.value = 0;
  g.limiter.connect(g.wet);
  g.in.connect(g.dryDelay); g.dryDelay.connect(g.dry);
  g.master = ctx.createGain();
  g.wet.connect(g.master); g.dry.connect(g.master);

  // analyseurs FFT
  const an = () => { const a = ctx.createAnalyser(); a.fftSize = 8192; a.smoothingTimeConstant = 0.6; a.minDecibels = -110; a.maxDecibels = 0; return a; };
  g.anIn = an(); g.anIn.smoothingTimeConstant = 0;
  g.anOut = an();
  g.in.connect(g.anIn);
  g.master.connect(g.anOut);

  // mesures K-weighting / True Peak
  if (okLoud) {
    const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
    const meter = (from) => { const n = wnode('nox-loudness'); from.connect(n); n.connect(sink); return n; };
    g.mIn = meter(g.in);
    g.mWet = meter(g.wet);
    g.mOut = meter(g.master);
  }
  g.master.connect(ctx.destination);
  return g;
}

// Applique des bandes d'EQ (et decalages adaptatifs) sur les biquads
export function applyBands(g, bands, eqOn = true, offsets = null) {
  const now = g.ctx.currentTime;
  bands.forEach((b, i) => {
    const f = g.eq[i];
    const active = eqOn && b.on;
    const type = active ? b.type : 'peaking';
    if (f.type !== type) f.type = type;
    const gain = active && D.hasGain(b.type) ? b.gain + ((offsets && offsets[b.id]) || 0) : 0;
    f.frequency.setTargetAtTime(b.f, now, SMOOTH);
    f.gain.setTargetAtTime(gain, now, SMOOTH);
    // Web Audio : Q de highpass/lowpass en dB (resonance) ; peaking/notch en lineaire ; shelves : Q ignore
    const q = b.type === 'highpass' || b.type === 'lowpass' ? 20 * Math.log10(b.q) : b.q;
    f.Q.setTargetAtTime(active ? q : 1, now, SMOOTH);
  });
}

// ---------------------------------------------------------------------------------------------
// Moteur utilise par l'application
// ---------------------------------------------------------------------------------------------
export class Analyzer {
  constructor(audioEl) {
    this.el = audioEl;
    this.ctx = null;
    this.g = null;
    this.meter = new LufsMeter();      // sortie (ce que tu entends)
    this.inMeter = new LufsMeter();    // source
    this.wetMeter = new LufsMeter();   // apres traitement, avant le mixage A/B
    this.active = true;                // false quand la source n'autorise pas l'analyse (pas de CORS)
    this.power = new Float64Array(BANDS.length);
    this.error = null;
    this.audio = defaultAudio();
    this.mix = { bypass: false, ab: 'B', matchDb: 0 };
    this.stereoMeters = null;
    this.grDb = 0;
    this.offsets = {};                 // decalages de l'EQ adaptatif (dB par bande)
    this.spec = null; this.specSeconds = 0;
    this.trackKey = null;
    this.cache = {};                   // mesures de loudness : cle -> resultat (reference partagee avec le store)
    this.norm = { status: 'off', plan: null, measured: null, appliedDb: 0 };
    this.albumKeys = [];
    this.onNorm = () => {};
  }

  // ----- initialisation du graphe -----
  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'playback' });
    this.src = this.ctx.createMediaElementSource(this.el);
    this.g = await buildGraph(this.ctx, this.src);
    if (this.g.mIn) {
      this.g.mIn.port.onmessage = (e) => this.inMeter.push(e.data);
      this.g.mWet.port.onmessage = (e) => this.wetMeter.push(e.data);
      this.g.mOut.port.onmessage = (e) => { if (this.active) this.meter.push(e.data); };
    } else this.error = new Error('loudness-worklet');
    if (this.g.limiterKind === 'worklet') {
      this.g.limiter.port.onmessage = (e) => { if (e.data && 'gr' in e.data) this.grDb = e.data.gr; };
    }
    if (this.g.stereoKind === 'worklet') this.g.stereo.port.onmessage = (e) => { this.stereoMeters = e.data; };
    this.freq = new Float32Array(this.g.anOut.frequencyBinCount);
    this.freqIn = new Float32Array(this.g.anIn.frequencyBinCount);
    this.time = new Float32Array(this.g.anOut.fftSize);
    this.applyAll();
    this.setSink(this.audio.output.sinkId).catch(() => {});
    if (this.ctx.addEventListener) this.ctx.addEventListener('statechange', () => this.onNorm());
    if (this.g.degraded.length) this.error = this.error || new Error(this.g.degraded.join(' | '));
  }

  resume() {
    return this.ctx && this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  resetMeters() {
    this.meter.reset(); this.inMeter.reset(); this.wetMeter.reset();
  }

  // ----- reglages -----
  setAudio(raw) {
    this.audio = validateAudio(raw);
    this.applyAll();
    return this.audio;
  }

  applyAll() {
    this.applyEQ(); this.applyStereo(); this.applyLimiter(); this.applyMix(); this.refreshPlan();
  }

  applyEQ() {
    if (!this.g) return;
    applyBands(this.g, this.audio.eq.bands, this.audio.eq.on, this.audio.adaptive.mode === 'adaptive' ? this.offsets : null);
  }

  applyStereo() {
    if (this.g && this.g.stereoKind === 'worklet') this.g.stereo.port.postMessage({ ...this.audio.stereo, enabled: true });
  }

  applyLimiter() {
    if (this.g && this.g.limiterKind === 'worklet') this.g.limiter.port.postMessage({ ceilingDb: this.audio.limiter.ceiling, releaseMs: this.audio.limiter.release, enabled: this.audio.limiter.on });
  }

  // A/B et bypass : fondu enchaine lineaire de ~30 ms entre la voie traitee et la voie d'origine
  applyMix() {
    if (!this.g) return;
    const now = this.ctx.currentTime;
    const original = this.mix.bypass || this.mix.ab === 'A';
    const matchDb = original && !this.mix.bypass && this.audio.ab.match ? this.mix.matchDb : 0;
    this.g.wet.gain.setTargetAtTime(original ? 0 : 1, now, 0.01);
    this.g.dry.gain.setTargetAtTime(original ? D.dbToLin(matchDb) : 0, now, 0.01);
    this.mix.activeMatchDb = matchDb;
  }

  setMix(p) { Object.assign(this.mix, p); this.applyMix(); }

  // Gain de comparaison : niveau court terme (3 s) traite - original, borne a +-12 dB. Ne touche jamais aux reglages sauvegardes.
  updateMatch() {
    const a = this.wetMeter.shortTerm, b = this.inMeter.shortTerm;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const t = Math.max(-12, Math.min(12, a - b));
      this.mix.matchDb += (t - this.mix.matchDb) * 0.2;
      if (this.mix.ab === 'A' && !this.mix.bypass) this.applyMix();
    }
  }

  // ----- normalisation -----
  static keyOf(t) { return t ? `${t.src}:${t.id}:${Math.round(t.duration || 0)}` : ''; }

  setTrack(track) {
    this.trackKey = Analyzer.keyOf(track);
    this.spec = null; this.specSeconds = 0;
    this.offsets = {};
    this.applyEQ();
    this.mix.matchDb = 0;
    this.refreshPlan();
  }

  get eqBoostDb() {
    if (!this.audio.eq.on) return 0;
    return D.eqMaxBoostDb(this.audio.eq.bands, this.ctx ? this.ctx.sampleRate : 48000, this.audio.adaptive.mode === 'adaptive' ? this.offsets : null);
  }

  // Recalcule le gain de normalisation pour le titre courant a partir des mesures disponibles
  refreshPlan() {
    const n = this.audio.norm;
    const out = { status: 'off', plan: null, measured: null, appliedDb: 0, target: null, album: false };
    if (n.mode === 'off') { out.status = 'off'; }
    else if (!this.active) { out.status = 'unavailable'; }
    else {
      const m = this.cache[this.trackKey];
      out.target = n.targets[n.mode];
      if (!m) out.status = this.measuring === this.trackKey ? 'measuring' : this.measureErrorKey === this.trackKey ? 'failed' : 'pending';
      else {
        out.measured = m; out.status = 'ready';
        const common = { target: out.target, ceilingDb: this.audio.limiter.ceiling, eqBoostDb: this.eqBoostDb, limiterOn: this.audio.limiter.on, limiterBudgetDb: n.budgetDb };
        if (n.album) {
          const tracks = this.albumKeys.map((k) => this.cache[k]).filter(Boolean);
          const a = D.albumPlan({ tracks: tracks.map((t) => ({ integrated: t.integrated, truePeakDb: t.truePeakDb, duration: t.duration })), ...common });
          out.album = true;
          out.plan = { requestedDb: a.requestedDb, appliedDb: a.sharedDb, limited: a.limited, reason: a.reason, albumLufs: a.albumLufs };
        } else out.plan = D.normalizationPlan({ measured: m, ...common });
        out.appliedDb = out.plan.appliedDb;
      }
    }
    this.norm = out;
    if (this.g) this.g.norm.gain.setTargetAtTime(D.dbToLin(out.appliedDb), this.ctx.currentTime, 0.05);
    this.onNorm();
    return out;
  }

  // Mesure un titre (decodage + BS.1770) puis applique le gain. loader() renvoie un ArrayBuffer encode (mp3, aac...).
  async measureTrack(track, loader) {
    if (!this.ctx) return null;
    const key = Analyzer.keyOf(track);
    if (this.cache[key]) { if (key === this.trackKey) this.refreshPlan(); return this.cache[key]; }
    if (this.measuring === key) return null;
    this.measuring = key;
    this.refreshPlan();
    try {
      const ab = await loader();
      if (!ab || ab.byteLength > 40e6) throw new Error('trop volumineux');
      const buf = await this.ctx.decodeAudioData(ab.slice(0));
      const r = await D.analyzeBuffer(buf);
      this.cache[key] = { integrated: r.integrated, truePeakDb: r.truePeakDb, samplePeakDb: r.samplePeakDb, lra: r.lra, duration: r.duration, scope: track.full ? 'full' : 'preview', at: Date.now() };
      const keys = Object.keys(this.cache);
      if (keys.length > 500) delete this.cache[keys[0]];
      if (this.onCache) this.onCache();
    } catch (e) {
      this.measureError = e; this.measureErrorKey = key;
    } finally {
      if (this.measuring === key) this.measuring = null;
      if (key === this.trackKey || this.audio.norm.album) this.refreshPlan();
    }
    return this.cache[key] || null;
  }

  // ----- EQ intelligent : mesure du spectre de la source (avant EQ), moyenne lissee -----
  sampleSpectrum(dt) {
    if (!this.g || !this.active) return;
    this.g.anIn.getFloatFrequencyData(this.freqIn);
    const n = this.freqIn.length;
    if (!this.spec) this.spec = new Float64Array(n);
    let tot = 0;
    const a = Math.min(1, dt / 8);
    for (let k = 0; k < n; k++) tot += Math.pow(10, this.freqIn[k] / 10);
    if (tot < 1e-9) return;               // silence : on n'apprend rien
    for (let k = 0; k < n; k++) {
      const p = Math.pow(10, this.freqIn[k] / 10);
      this.spec[k] = this.specSeconds ? this.spec[k] * (1 - a) + p * a : p;
    }
    this.specSeconds += dt;
  }

  suggestion() {
    if (!this.spec || !this.g) return D.suggestEQ(null);
    const ft = D.spectralFeatures(this.spec, this.ctx.sampleRate / this.g.anIn.fftSize);
    const s = D.suggestEQ(ft, { seconds: this.specSeconds, maxDb: this.audio.adaptive.maxDb });
    s.features = ft;
    return s;
  }

  // Mode adaptatif : rapproche lentement les decalages de la suggestion (0,15 dB/s, +-maxDb)
  adaptTick(dt) {
    const ad = this.audio.adaptive;
    if (!this.g) return;
    if (ad.mode !== 'adaptive') {
      if (Object.values(this.offsets).some((v) => v !== 0)) { this.offsets = {}; this.applyEQ(); this.refreshPlan(); }
      return;
    }
    const ids = D.REGIONS.map((r) => r.key);
    const sug = this.suggestion();
    const targets = ids.map((id) => (sug.confident && sug.recommend ? (sug.bands.find((b) => b.key === id) || {}).gainDb || 0 : 0));
    const cur = ids.map((id) => this.offsets[id] || 0);
    const next = D.adaptStep(cur, targets, dt, { maxDb: ad.maxDb, rateDbPerS: 0.15 });
    ids.forEach((id, i) => { this.offsets[id] = next[i]; });
    this.applyEQ();
    this.refreshPlan();
  }

  // ----- sortie audio -----
  async setSink(id) {
    if (!this.ctx || !this.ctx.setSinkId) return false;
    await this.ctx.setSinkId(id || '');
    return true;
  }

  outputInfo() {
    const c = this.ctx;
    if (!c) return null;
    const ua = (navigator.userAgent || '');
    return {
      backend: 'Web Audio (Chromium)',
      platform: /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '—',
      sampleRate: c.sampleRate,
      channels: c.destination.maxChannelCount,
      state: c.state,
      baseLatencyMs: (c.baseLatency || 0) * 1000,
      outputLatencyMs: (c.outputLatency || 0) * 1000,
      bufferFrames: c.baseLatency ? Math.round(c.baseLatency * c.sampleRate) : null,
      sinkId: c.sinkId && typeof c.sinkId === 'string' ? c.sinkId : '',
      canSelectDevice: !!c.setSinkId,
      processingLatencyMs: this.g ? this.g.latency / c.sampleRate * 1000 : 0,
      limiterKind: this.g ? this.g.limiterKind : null,
      degraded: this.g ? this.g.degraded : []
    };
  }

  // ----- gain staging -----
  stages() {
    const n = this.norm;
    return {
      eqBoostDb: this.eqBoostDb,
      normDb: n.appliedDb,
      limiterGrDb: this.grDb,
      limiterOn: this.audio.limiter.on,
      accumulatedDb: this.eqBoostDb + n.appliedDb,
      warning: this.eqBoostDb + n.appliedDb > 12
    };
  }

  // ----- lecture des mesures pour l'interface -----
  // Lit le spectre courant ; renvoie les niveaux par zone et le diagnostic d'equilibre
  readBands() {
    if (!this.g || !this.active) return null;
    this.g.anOut.getFloatFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.g.anOut.fftSize;
    const dens = BANDS.map((b, i) => {
      const lo = Math.max(1, Math.floor(b.from / binHz));
      const hi = Math.min(this.freq.length - 1, Math.ceil(b.to / binHz));
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += Math.pow(10, this.freq[k] / 10);
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
    if (!this.g) return null;
    this.g.anOut.getFloatFrequencyData(this.freq);
    return { data: this.freq, binHz: this.ctx.sampleRate / this.g.anOut.fftSize };
  }

  // Forme d'onde (dernier tampon de la sortie)
  waveform() {
    if (!this.g) return null;
    this.g.anOut.getFloatTimeDomainData(this.time);
    return this.time;
  }
}
