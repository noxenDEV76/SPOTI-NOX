// SPOTI NOX - traitement stereo (largeur, balance, ecoute mono) et mesures (correlation, mid/side).
// Code pur, partage par l'AudioWorklet et les tests.
//   Mid = (L + R) / 2     Side = (L - R) / 2     L' = Mid + Side*largeur     R' = Mid - Side*largeur
// A largeur 1, balance 0 et sans mono, le signal est recopie tel quel (aucun calcul, donc aucune alteration).

export class StereoProcessor {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.target = { width: 1, balance: 0, mono: false, enabled: true };
    this.cur = { width: 1, balance: 0 };
    this.k = 1 - Math.exp(-1 / (0.02 * sampleRate));   // lissage ~20 ms : pas de clic quand on bouge un curseur
    this.resetMeters();
  }

  setParams(p) { Object.assign(this.target, p); }

  resetMeters() {
    this.m = { n: 0, llI: 0, rrI: 0, lrI: 0, mI: 0, sI: 0, llO: 0, rrO: 0, lrO: 0, mO: 0, sO: 0 };
  }

  get neutral() {
    const t = this.target;
    return !t.enabled || (!t.mono && t.width === 1 && t.balance === 0 && Math.abs(this.cur.width - 1) < 1e-6 && Math.abs(this.cur.balance) < 1e-6);
  }

  process(inL, inR, outL, outR, n) {
    const t = this.target;
    const m = this.m;
    const neutral = this.neutral;
    for (let i = 0; i < n; i++) {
      const l = inL[i], r = inR[i];
      m.llI += l * l; m.rrI += r * r; m.lrI += l * r;
      const mid = (l + r) * 0.5, side = (l - r) * 0.5;
      m.mI += mid * mid; m.sI += side * side;
      let ol = l, or = r;
      if (!neutral) {
        this.cur.width += (t.width - this.cur.width) * this.k;
        this.cur.balance += (t.balance - this.cur.balance) * this.k;
        if (t.mono) { ol = mid; or = mid; }
        else {
          const w = this.cur.width;
          ol = mid + side * w; or = mid - side * w;
        }
        const b = this.cur.balance;
        if (b > 0) ol *= 1 - b; else if (b < 0) or *= 1 + b;
      }
      outL[i] = ol; outR[i] = or;
      m.llO += ol * ol; m.rrO += or * or; m.lrO += ol * or;
      const mo = (ol + or) * 0.5, so = (ol - or) * 0.5;
      m.mO += mo * mo; m.sO += so * so;
    }
    m.n += n;
  }

  // Mesures de la derniere periode (puis remise a zero)
  takeMeters() {
    const m = this.m;
    const corr = (lr, ll, rr) => (ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1);
    const db = (x) => 10 * Math.log10(Math.max(x, 1e-14));
    const out = {
      corrIn: corr(m.lrI, m.llI, m.rrI), corrOut: corr(m.lrO, m.llO, m.rrO),
      midDbIn: db(m.mI / (m.n || 1)), sideDbIn: db(m.sI / (m.n || 1)),
      midDbOut: db(m.mO / (m.n || 1)), sideDbOut: db(m.sO / (m.n || 1)),
      widthIn: m.mI + m.sI > 0 ? Math.sqrt(m.sI) / (Math.sqrt(m.mI) + Math.sqrt(m.sI)) : 0,
      widthOut: m.mO + m.sO > 0 ? Math.sqrt(m.sO) / (Math.sqrt(m.mO) + Math.sqrt(m.sO)) : 0,
      n: m.n
    };
    this.resetMeters();
    return out;
  }
}
