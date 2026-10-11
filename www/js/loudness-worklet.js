// SPOTI NOX - AudioWorklet : mesure K-weighted (ITU-R BS.1770) + True Peak (sur-echantillonnage x4)
// Envoie un message toutes les 100 ms : { ms:[gauche,droite], peak, tp }
//   ms   = energie moyenne ponderee K par canal sur le bloc de 100 ms
//   peak = crete echantillon (lineaire)
//   tp   = crete vraie estimee (lineaire)

function kWeightCoeffs(fs) {
  // Etage 1 : high-shelf (effet de tete)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = {
    b0: (Vh + Vb * K / Q + K * K) / a0,
    b1: 2 * (K * K - Vh) / a0,
    b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0
  };
  // Etage 2 : filtre passe-haut RLB
  const f1 = 38.13547087602444, Q2 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q2 + K * K;
  const s2 = {
    b0: 1, b1: -2, b2: 1,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q2 + K * K) / a0
  };
  return [s1, s2];
}

// Interpolateur sinc fenetre (Hann) 12 points, 3 phases intermediaires (x4)
function buildInterp() {
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

class NoxLoudness extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = Math.round(sampleRate * 0.1);
    this.coef = kWeightCoeffs(sampleRate);
    this.interp = buildInterp();
    this.ch = [0, 1].map(() => ({
      z: [[0, 0], [0, 0]],
      hist: new Float64Array(16),
      pos: 0
    }));
    this.resetBlock();
  }

  resetBlock() {
    this.count = 0;
    this.sumSq = [0, 0];
    this.peak = 0;
    this.tp = 0;
  }

  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const chans = [inp[0], inp[1] || inp[0]];
    const n = chans[0].length;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) {
        const x = chans[c][i];
        const st = this.ch[c];

        // K-weighting (2 biquads, forme transposee II)
        let y = x;
        for (let s = 0; s < 2; s++) {
          const k = this.coef[s];
          const z = st.z[s];
          const out = k.b0 * y + z[0];
          z[0] = k.b1 * y - k.a1 * out + z[1];
          z[1] = k.b2 * y - k.a2 * out;
          y = out;
        }
        this.sumSq[c] += y * y;

        // Peak et True Peak
        const ax = Math.abs(x);
        if (ax > this.peak) this.peak = ax;
        if (ax > this.tp) this.tp = ax;
        st.hist[st.pos] = x;
        st.pos = (st.pos + 1) & 15;
        for (let p = 0; p < 3; p++) {
          const co = this.interp[p];
          let v = 0;
          for (let j = 0; j < 12; j++) v += st.hist[(st.pos - 1 - j) & 15] * co[j];
          const av = Math.abs(v);
          if (av > this.tp) this.tp = av;
        }
      }
      this.count++;
      if (this.count >= this.blockSize) {
        this.port.postMessage({
          ms: [this.sumSq[0] / this.count, this.sumSq[1] / this.count],
          peak: this.peak,
          tp: this.tp
        });
        this.resetBlock();
      }
    }
    return true;
  }
}

registerProcessor('nox-loudness', NoxLoudness);
