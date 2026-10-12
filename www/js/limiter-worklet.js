// SPOTI NOX - AudioWorklet : limiteur true peak a anticipation (voir limiter-core.js)
import { TruePeakLimiter } from './limiter-core.js';

class NoxLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.lim = new TruePeakLimiter(sampleRate, (options && options.processorOptions) || {});
    this.since = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.reset) this.lim.reset();
      else this.lim.setParams(e.data || {});
    };
    this.port.postMessage({ latency: this.lim.latencySamples, sampleRate });
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length || !out || !out.length) return true;
    const n = out[0].length;
    const inL = inp[0], inR = inp[1] || inp[0];
    const outR = out[1] || out[0];
    this.lim.process(inL, inR, out[0], outR, n);
    this.since += n;
    if (this.since >= sampleRate * 0.05) {
      this.since = 0;
      const g = this.lim.takeGain();
      this.port.postMessage({ gr: g < 1 ? 20 * Math.log10(g) : 0 });
    }
    return true;
  }
}
registerProcessor('nox-limiter', NoxLimiter);
