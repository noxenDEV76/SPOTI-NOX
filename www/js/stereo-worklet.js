// SPOTI NOX - AudioWorklet : largeur, balance, ecoute mono + mesures stereo (voir stereo-core.js)
import { StereoProcessor } from './stereo-core.js';

class NoxStereo extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sp = new StereoProcessor(sampleRate);
    if (options && options.processorOptions) this.sp.setParams(options.processorOptions);
    this.since = 0;
    this.port.onmessage = (e) => this.sp.setParams(e.data || {});
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length || !out || !out.length) return true;
    const n = out[0].length;
    const outR = out[1] || out[0];
    this.sp.process(inp[0], inp[1] || inp[0], out[0], outR, n);
    this.since += n;
    if (this.since >= sampleRate * 0.1) {
      this.since = 0;
      this.port.postMessage(this.sp.takeMeters());
    }
    return true;
  }
}
registerProcessor('nox-stereo', NoxStereo);
