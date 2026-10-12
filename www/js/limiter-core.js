// SPOTI NOX - limiteur "true peak" avec anticipation (lookahead). Code pur, partage par l'AudioWorklet et les tests.
//
// Principe : la crete vraie est estimee par sur-echantillonnage x4 (sinc 12 points). Le gain requis
// g[n] = min(1, plafond / crete[n]) est lisse ainsi : minimum glissant sur Wm echantillons, puis moyenne glissante sur Wa,
// et le signal est retarde de D echantillons pour que le gain soit deja en place quand la crete arrive.
// Relachement : filtre a un pole (le gain ne remonte que lentement), toujours borne par le gain lisse.
// Quand rien ne depasse le plafond, le gain vaut exactement 1 : le signal n'est que retarde (aucune coloration).

const TAPS = 32;            // sinc fenetre a 32 points : estimation de la crete vraie plus fidele (proche des 48 points de la norme)
const HALF = TAPS / 2;

function interpTable() {
  const C = [];
  for (let p = 1; p <= 3; p++) {
    const f = p / 4;
    const c = new Float64Array(TAPS);
    let sum = 0;
    for (let j = 0; j < TAPS; j++) {
      const d = HALF - j - f;
      const sinc = Math.sin(Math.PI * d) / (Math.PI * d);
      const win = Math.abs(d) < HALF ? 0.5 * (1 + Math.cos(Math.PI * d / HALF)) : 0;
      c[j] = sinc * win;
      sum += c[j];
    }
    for (let j = 0; j < TAPS; j++) c[j] /= sum;
    C.push(c);
  }
  return C;
}

export class TruePeakLimiter {
  constructor(sampleRate, { lookaheadMs = 5, ceilingDb = -1, releaseMs = 100, enabled = true } = {}) {
    this.sr = sampleRate;
    this.W = Math.max(8, Math.round(lookaheadMs * sampleRate / 1000));
    this.Wa = this.W;
    this.Wm = this.W + 2;
    this.delay = this.Wa + HALF - 1;                 // latence en echantillons (annoncee a l'interface)
    this.interp = interpTable();
    this.hist = [new Float64Array(64), new Float64Array(64)];
    this.hpos = 0;
    this.dbuf = [new Float32Array(this.delay), new Float32Array(this.delay)];
    this.dpos = 0;
    // minimum glissant (file monotone) sur Wm valeurs de g
    this.qv = new Float64Array(this.Wm + 1);
    this.qi = new Int32Array(this.Wm + 1);
    this.qh = 0; this.qt = 0; this.qn = 0;
    // moyenne glissante sur Wa valeurs de gMin
    this.avg = new Float64Array(this.Wa);
    this.apos = 0;
    this.asum = this.Wa;                      // initialise a 1 * Wa
    this.avg.fill(1);
    this.idx = 0;
    this.gOut = 1;
    this.grMin = 1;
    this.setParams({ ceilingDb, releaseMs, enabled });
  }

  setParams({ ceilingDb, releaseMs, enabled }) {
    if (ceilingDb !== undefined) this.ceilingDb = Math.min(0, Math.max(-12, ceilingDb));
    // marge de 0,1 dB : l'estimateur x4 sous-estime tres legerement certaines cretes inter-echantillons
    if (ceilingDb !== undefined) this.ceilingLin = Math.pow(10, (this.ceilingDb - 0.1) / 20);
    if (releaseMs !== undefined) { this.releaseMs = Math.min(1000, Math.max(10, releaseMs)); this.alpha = 1 - Math.exp(-1 / (this.releaseMs * 0.001 * this.sr)); }
    if (enabled !== undefined) this.enabled = !!enabled;
  }

  get latencySamples() { return this.delay; }

  // Reinitialise l'etat (nouvelle source, seek...)
  reset() {
    this.hist.forEach((h) => h.fill(0));
    this.dbuf.forEach((b) => b.fill(0));
    this.qn = 0; this.qh = 0; this.qt = 0;
    this.avg.fill(1); this.asum = this.Wa;
    this.gOut = 1; this.grMin = 1; this.idx = 0;
  }

  // Gain minimum applique depuis le dernier appel (lineaire), puis remise a 1
  takeGain() { const g = this.grMin; this.grMin = 1; return g; }

  process(inL, inR, outL, outR, n) {
    const ins = [inL, inR || inL];
    const outs = [outL, outR || outL];
    const D = this.delay;
    const DL = D;
    for (let i = 0; i < n; i++) {
      const xs = [ins[0][i], ins[1][i]];
      // --- detection de crete vraie (x4) sur les deux canaux
      let peak = 0;
      for (let c = 0; c < 2; c++) {
        const h = this.hist[c];
        h[this.hpos] = xs[c];
        const ax = Math.abs(xs[c]);
        if (ax > peak) peak = ax;
      }
      this.hpos = (this.hpos + 1) & 63;
      for (let c = 0; c < 2; c++) {
        const h = this.hist[c];
        for (let p = 0; p < 3; p++) {
          const co = this.interp[p];
          let v = 0;
          for (let j = 0; j < TAPS; j++) v += h[(this.hpos - 1 - j) & 63] * co[j];
          const av = v < 0 ? -v : v;
          if (av > peak) peak = av;
        }
      }
      const g = this.enabled && peak > this.ceilingLin ? this.ceilingLin / peak : 1;

      // --- minimum glissant (file monotone croissante des valeurs)
      const idx = this.idx++;
      const cap = this.Wm + 1;
      while (this.qn > 0 && this.qv[(this.qt - 1 + cap) % cap] >= g) { this.qt = (this.qt - 1 + cap) % cap; this.qn--; }
      this.qv[this.qt] = g; this.qi[this.qt] = idx; this.qt = (this.qt + 1) % cap; this.qn++;
      while (this.qn > 0 && this.qi[this.qh] <= idx - this.Wm) { this.qh = (this.qh + 1) % cap; this.qn--; }
      const gMin = this.qv[this.qh];

      // --- moyenne glissante
      this.asum += gMin - this.avg[this.apos];
      this.avg[this.apos] = gMin;
      this.apos = (this.apos + 1) % this.Wa;
      let gAvg = this.asum / this.Wa;
      if (gAvg > 1) gAvg = 1;

      // --- relachement lent (le gain ne peut jamais depasser le gain lisse : la garantie de plafond est conservee)
      const rel = this.gOut + (1 - this.gOut) * this.alpha;
      this.gOut = gAvg < rel ? gAvg : rel;
      if (this.gOut < this.grMin) this.grMin = this.gOut;

      // --- signal retarde x gain
      for (let c = 0; c < 2; c++) {
        const b = this.dbuf[c];
        const d = b[this.dpos];            // echantillon vieux de D pas
        b[this.dpos] = xs[c];
        outs[c][i] = d * (this.enabled ? this.gOut : 1);
      }
      this.dpos = (this.dpos + 1) % DL;
    }
  }
}
