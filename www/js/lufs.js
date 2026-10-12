// SPOTI NOX - agregation des blocs de 100 ms en LUFS momentane / court terme / integre + True Peak

const toLufs = (e) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity);
const toDb = (a) => (a > 0 ? 20 * Math.log10(a) : -Infinity);

export class LufsMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.blocks = [];   // energie (L+R) de chaque bloc de 100 ms
    this.windows = [];  // energie de chaque fenetre de 400 ms (pas de 100 ms = 75 % de recouvrement)
    this.tpNow = -Infinity;
    this.peakNow = -Infinity;
    this.tpMax = -Infinity;
    this.peakMax = -Infinity;
    this.dirty = false;
    this._integrated = -Infinity;
  }

  push(msg) {
    const e = msg.ms[0] + msg.ms[1];
    this.blocks.push(e);
    if (this.blocks.length > 4) this.blocks.shift();
    this._short = this._short || [];
    this._short.push(e);
    if (this._short.length > 30) this._short.shift();

    if (this.blocks.length === 4) {
      this.windows.push((this.blocks[0] + this.blocks[1] + this.blocks[2] + this.blocks[3]) / 4);
      this.dirty = true;
    }
    this.tpNow = toDb(msg.tp);
    if (this.tpNow > this.tpMax) this.tpMax = this.tpNow;
    const pk = toDb(msg.peak);
    this.peakNow = pk;
    if (pk > this.peakMax) this.peakMax = pk;
  }

  get momentary() {
    if (this.blocks.length < 4) return -Infinity;
    return toLufs((this.blocks[0] + this.blocks[1] + this.blocks[2] + this.blocks[3]) / 4);
  }

  get shortTerm() {
    const s = this._short || [];
    if (s.length < 10) return -Infinity;
    return toLufs(s.reduce((a, b) => a + b, 0) / s.length);
  }

  // Loudness integre avec porte absolue (-70 LUFS) puis relative (-10 LU)
  get integrated() {
    if (!this.dirty) return this._integrated;
    this.dirty = false;
    const abs = this.windows.filter((e) => toLufs(e) > -70);
    if (!abs.length) {
      this._integrated = -Infinity;
      return this._integrated;
    }
    const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
    const rel = toLufs(meanAbs) - 10;
    const kept = abs.filter((e) => toLufs(e) > rel);
    if (!kept.length) {
      this._integrated = -Infinity;
      return this._integrated;
    }
    this._integrated = toLufs(kept.reduce((a, b) => a + b, 0) / kept.length);
    return this._integrated;
  }

  snapshot() {
    return {
      momentary: this.momentary,
      shortTerm: this.shortTerm,
      integrated: this.integrated,
      truePeak: this.tpNow,
      peakNow: this.peakNow,
      truePeakMax: this.tpMax,
      peakMax: this.peakMax
    };
  }
}
