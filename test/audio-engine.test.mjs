// Tests du noyau DSP (Node) : filtres, loudness, normalisation, limiteur, stereo, suggestions d'EQ
import * as D from '../www/js/dsp.js';
import { TruePeakLimiter } from '../www/js/limiter-core.js';
import { StereoProcessor } from '../www/js/stereo-core.js';

let failed = 0;
const check = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${x}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SR = 48000;
const sine = (f, db, n, ph = 0, sr = SR) => { const a = D.dbToLin(db); const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / sr + ph); return x; };
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;

// ---------- filtres ----------
{
  let stable = true, count = 0;
  for (const type of D.FILTER_TYPES) for (const fs of [8000, 44100, 48000, 96000])
    for (const f of [20, 31.5, 100, 1000, 5000, 12000, 20000]) for (const g of [-12, -3, 0, 3, 12]) for (const q of [0.2, 0.707, 1, 4, 10]) {
      count++;
      const c = D.biquadCoeffs(type, f, g, q, fs);
      if (!D.isStable(c) || ![c.b0, c.b1, c.b2, c.a1, c.a2].every(Number.isFinite)) stable = false;
    }
  check('Filtres : stables et finis sur toute la plage', stable, `(${count} combinaisons)`);
  const flat = D.biquadCoeffs('peaking', 1000, 0, 1, SR);
  check('Peaking 0 dB = identité exacte', flat.b0 === 1 && Math.abs(flat.b1 - flat.a1) < 1e-15 && Math.abs(flat.b2 - flat.a2) < 1e-15);
  const ls = D.biquadCoeffs('lowshelf', 100, 6, 0.7, SR);
  check('Low shelf +6 dB : +6 dB en grave, 0 dB en aigu', near(D.biquadMagDb(ls, 20, SR), 6, 0.3) && near(D.biquadMagDb(ls, 10000, SR), 0, 0.1), `${D.biquadMagDb(ls, 20, SR).toFixed(2)} / ${D.biquadMagDb(ls, 10000, SR).toFixed(2)}`);
  const hs = D.biquadCoeffs('highshelf', 8000, -3, 0.7, SR);
  check('High shelf -3 dB : -3 dB en aigu', near(D.biquadMagDb(hs, 18000, SR), -3, 0.3) && near(D.biquadMagDb(hs, 200, SR), 0, 0.1));
  const pk = D.biquadCoeffs('peaking', 3000, 4, 1, SR);
  check('Peaking +4 dB : gain exact au centre', near(D.biquadMagDb(pk, 3000, SR), 4, 0.01));
  const hp = D.biquadCoeffs('highpass', 100, 0, 0.7071, SR);
  check('Passe-haut Butterworth : -3 dB à la coupure', near(D.biquadMagDb(hp, 100, SR), -3.01, 0.1));
}

// ---------- presets ----------
{
  let ok = true;
  for (const [k, p] of Object.entries(D.EQ_PRESETS)) {
    const bands = D.bandsForPreset(k);
    if (bands.length !== 9) ok = false;
    bands.forEach((b) => { const c = D.clampBand(b); if (Math.abs(c.gain) > 4.01 || c.f !== b.f || c.q !== b.q) ok = false; });
    if (!p.name || !p.note) ok = false;
  }
  check('Presets : 9 bandes, gains discrets (≤ 4 dB), documentés', ok);
  const flat = D.bandsForPreset('flat');
  const r = D.eqResponseDb(flat, D.logFreqs(100), SR);
  check('Preset Flat : réponse 0 dB partout', r.every((v) => Math.abs(v) < 1e-9));
  check('Preset Flat : aucun gain ajouté', D.eqMaxBoostDb(flat, SR) < 1e-9);
  const bb = D.bandsForPreset('bassboost');
  const rb = D.eqResponseDb(bb, [30, 100, 1000, 10000], SR);
  check('Bass Boost : +4 dB en grave, neutre en aigu', rb[0] > 3 && rb[3] < 0.2 && rb[2] < 0.3, rb.map((v) => v.toFixed(1)).join(' / '));
  const tr = D.eqResponseDb(D.bandsForPreset('treblereduction'), [100, 15000], SR);
  check('Treble Reduction : coupe l\'aigu seulement', tr[1] < -2 && Math.abs(tr[0]) < 0.2);
  const el = D.bandsForPreset('electronic');
  check('Electronic : creux à 350 Hz, grave et aigu relevés', D.eqResponseDb(el, [350], SR)[0] < -0.8 && D.eqMaxBoostDb(el, SR) > 3);
}

// ---------- loudness ----------
{
  const N = SR * 10;
  const an = (L, R) => { const a = new D.LoudnessAnalyzer(SR); for (let i = 0; i < L.length; i += 4800) a.push(L.subarray(i, i + 4800), R && R.subarray(i, i + 4800)); return a.result(); };
  // sinus 997 Hz stereo (L=R) a -20 dBFS : reference EBU = -20 LUFS
  const s = sine(997, -20, N);
  let r = an(s, s);
  check('LUFS : sinus 997 Hz -20 dBFS stéréo = -20,0 LUFS', near(r.integrated, -20, 0.1), r.integrated.toFixed(2));
  r = an(s, null);
  check('LUFS : mono traité comme double mono (-20,0)', near(r.integrated, -20, 0.1), r.integrated.toFixed(2));
  const left = new Float32Array(N);
  r = an(s, left);
  check('LUFS : un seul canal = -3 LU de moins', near(r.integrated, -23.01, 0.1), r.integrated.toFixed(2));
  const s6 = sine(997, -26, N);
  r = an(s6, s6);
  check('LUFS : -6 dB sur le signal = -6 LU', near(r.integrated, -26, 0.1), r.integrated.toFixed(2));
  // porte absolue : silence + signal
  const gated = new Float32Array(N * 2); gated.set(s, 0);
  r = an(gated, gated);
  check('LUFS : le silence est écarté par la porte (-20 LUFS)', near(r.integrated, -20, 0.15), r.integrated.toFixed(2));
  // porte relative : 10 s a -20 puis 10 s a -40 (> 10 LU en dessous : exclu)
  const two = new Float32Array(N * 2); two.set(sine(997, -20, N), 0); two.set(sine(997, -40, N), N);
  r = an(two, two);
  check('LUFS : porte relative -10 LU', near(r.integrated, -20, 0.2), r.integrated.toFixed(2));
  check('LRA : mesuré sur 20 dB d\'écart (≈ 20 LU)', near(r.lra, 20, 2), r.lra.toFixed(1));
  const steady = an(s, s);
  check('LRA : signal constant ≈ 0 LU', steady.lra < 0.3, steady.lra.toFixed(2));
  // True Peak : sinus fs/4 phase 45° => échantillons a 0,707 de l'amplitude, vraie crete = 1
  const ip = sine(SR / 4, 0, SR, Math.PI / 4);
  r = an(ip, ip);
  check('Crête échantillon vs True Peak (inter-échantillon)', near(r.samplePeakDb, -3.01, 0.05) && r.truePeakDb > -0.4, `${r.samplePeakDb.toFixed(2)} / ${r.truePeakDb.toFixed(2)} dBTP`);
}

// ---------- normalisation ----------
{
  let p = D.normalizationPlan({ measured: { integrated: -20, truePeakDb: -6 }, target: -14, ceilingDb: -1, limiterOn: false });
  check('Gain = cible - mesuré (-20 → -14 = +6 dB)', near(p.requestedDb, 6, 1e-9) && near(p.appliedDb, 5, 1e-9) && p.limited, JSON.stringify({ r: p.requestedDb, a: p.appliedDb }));
  p = D.normalizationPlan({ measured: { integrated: -20, truePeakDb: -9 }, target: -14, ceilingDb: -1, limiterOn: false });
  check('Gain +6 dB appliqué quand la marge de crête suffit', near(p.appliedDb, 6, 1e-9) && !p.limited);
  p = D.normalizationPlan({ measured: { integrated: -20, truePeakDb: -2 }, target: -14, ceilingDb: -1, limiterOn: false });
  check('Cible inatteignable : gain borné par la crête + signalé', near(p.appliedDb, 1, 1e-9) && p.limited && p.reason === 'peak-limited');
  p = D.normalizationPlan({ measured: { integrated: -20, truePeakDb: -2 }, target: -14, ceilingDb: -1, limiterOn: true, limiterBudgetDb: 2 });
  check('Avec limiteur : budget de réduction de 2 dB', near(p.appliedDb, 3, 1e-9) && p.limiterWorks);
  p = D.normalizationPlan({ measured: { integrated: -20, truePeakDb: -9 }, target: -14, ceilingDb: -1, eqBoostDb: 5, limiterOn: false });
  check('Le gain de l\'EQ est compté dans la marge de crête', near(p.appliedDb, 3, 1e-9) && p.limited, p.appliedDb.toFixed(2));
  p = D.normalizationPlan({ measured: { integrated: -8, truePeakDb: -0.2 }, target: -14, ceilingDb: -1 });
  check('Titre trop fort : atténué (-6 dB)', near(p.appliedDb, -6, 1e-9));
  p = D.normalizationPlan({ measured: null, target: -14 });
  check('Sans mesure : gain nul', p.appliedDb === 0 && p.reason === 'no-measurement');
  const A = D.albumPlan({ tracks: [{ integrated: -10, truePeakDb: -3, duration: 200 }, { integrated: -16, truePeakDb: -5, duration: 200 }], target: -14, limiterOn: false });
  check('Album : gain commun (LUFS album ≈ -12,2 → -1,8 dB)', near(A.albumLufs, -12.2, 0.2) && near(A.sharedDb, -1.8, 0.2), `${A.albumLufs.toFixed(2)} / ${A.sharedDb.toFixed(2)}`);
  const g1 = D.normalizationPlan({ measured: { integrated: -10, truePeakDb: -3 }, target: -14, limiterOn: false }).appliedDb;
  const g2 = D.normalizationPlan({ measured: { integrated: -16, truePeakDb: -5 }, target: -14, limiterOn: false }).appliedDb;
  check('Album : écart relatif entre titres conservé (6 LU) ; titre à titre il serait effacé', near((-10 + A.sharedDb) - (-16 + A.sharedDb), 6, 1e-9) && near((-10 + g1) - (-16 + g2), 0, 1e-9));
  check('Modes : Normal -14 / Quiet -19 / Loud -11', D.NORM_MODES.normal.target === -14 && D.NORM_MODES.quiet.target === -19 && D.NORM_MODES.loud.target === -11);
}

// ---------- limiteur true peak ----------
// crete vraie "de reference" : sur-echantillonnage x16 par sinc long
function refTruePeak(x, over = 16, half = 32) {
  let pk = 0;
  for (let n = half; n < x.length - half; n++) {
    for (let p = 0; p < over; p++) {
      const f = p / over;
      let v = 0;
      for (let k = -half + 1; k <= half; k++) {
        const d = k - f; const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        v += x[n + k] * sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / half));
      }
      if (Math.abs(v) > pk) pk = Math.abs(v);
    }
  }
  return D.linToDb(pk);
}
function runLimiter(x, opts) {
  const lim = new TruePeakLimiter(SR, opts);
  const out = new Float32Array(x.length);
  const o2 = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 128) lim.process(x.subarray(i, i + 128), x.subarray(i, i + 128), out.subarray(i, i + 128), o2.subarray(i, i + 128), Math.min(128, x.length - i));
  return { out, lim };
}
{
  const N = SR;
  // 1) signal sous le plafond : identique (seulement retardé)
  const quiet = sine(440, -12, N);
  let { out, lim } = runLimiter(quiet, { ceilingDb: -1 });
  const d = lim.latencySamples;
  let maxDiff = 0;
  for (let i = d + 10; i < N; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - quiet[i - d]));
  check('Limiteur inactif : signal inchangé (retard seul)', maxDiff === 0, `diff max ${maxDiff}`);
  check('Latence annoncée (5 ms + 15 éch.)', d === Math.round(0.005 * SR) + 15, `${d} éch. = ${(d / SR * 1000).toFixed(2)} ms`);
  // 2) sinus fort : plafond tenu
  const hot = sine(1000, 6, N);
  ({ out } = runLimiter(hot, { ceilingDb: -1 }));
  let tp = refTruePeak(out.subarray(2400));
  check('Limiteur : sinus +6 dBFS → crête vraie ≤ -1 dBTP', tp <= -0.95, tp.toFixed(3) + ' dBTP');
  // 3) pic inter-echantillon : sample peak -3 dB mais vraie crete +3 dB
  const isp = sine(SR / 4, 3, N, Math.PI / 4);
  ({ out } = runLimiter(isp, { ceilingDb: -1 }));
  tp = refTruePeak(out.subarray(2400));
  check('Limiteur : pic inter-échantillon maîtrisé', tp <= -0.9, tp.toFixed(3) + ' dBTP');
  // 4) bruit fort
  const noise = new Float32Array(N); for (let i = 0; i < N; i++) noise[i] = Math.max(-2, Math.min(2, rnd() * 1.6));
  ({ out } = runLimiter(noise, { ceilingDb: -1 }));
  tp = refTruePeak(out.subarray(2400, 2400 + 12000));
  check('Limiteur : pire cas (bruit blanc écrêté à +4 dBFS) → dépassement < 1 dB (estimation x4)', tp <= 0, tp.toFixed(3) + ' dBTP');
  // signal "musical" : bruit passe-bas (2 filtres 1 pole) tres fort
  const musical = new Float32Array(N); { let y1 = 0, y2 = 0; for (let i = 0; i < N; i++) { y1 += 0.45 * (noise[i] - y1); y2 += 0.45 * (y1 - y2); musical[i] = y2 * 5; } }
  ({ out } = runLimiter(musical, { ceilingDb: -1 }));
  tp = refTruePeak(out.subarray(2400, 2400 + 12000));
  check('Limiteur : signal large bande très fort (+16 dBFS) → crête vraie ≤ -1 dBTP (+0,1)', tp <= -0.9, tp.toFixed(3) + ' dBTP');
  // 5) autre plafond
  ({ out } = runLimiter(hot, { ceilingDb: -3 }));
  tp = refTruePeak(out.subarray(2400));
  check('Limiteur : plafond réglable (-3 dBTP)', tp <= -2.9 && tp > -3.6, tp.toFixed(3));
  // 6) pas d'écrasement inutile : le niveau reste proche de la cible
  const rms = (a) => 20 * Math.log10(Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length));
  ({ out } = runLimiter(sine(1000, -0.5, N), { ceilingDb: -1 }));
  check('Limiteur : réduction minimale (≈ 0,5 dB pour un dépassement de 0,5 dB)', near(rms(out.subarray(4800)) - rms(sine(1000, -0.5, N).subarray(4800)), -0.6, 0.4), (rms(out.subarray(4800)) - rms(sine(1000, -0.5, N).subarray(4800))).toFixed(2));
  // 7) désactivé = pas de réduction
  ({ out, lim } = runLimiter(hot, { ceilingDb: -1, enabled: false }));
  let mx = 0; for (let i = 5000; i < N; i++) mx = Math.max(mx, Math.abs(out[i]));
  check('Limiteur désactivé : aucune réduction', mx > 1.9, mx.toFixed(2));
  // 8) pas de discontinuité (clic) : variation maximale d'un échantillon a l'autre
  ({ out } = runLimiter(hot, { ceilingDb: -1 }));
  let jump = 0; for (let i = 3000; i < N; i++) jump = Math.max(jump, Math.abs(out[i] - out[i - 1]));
  check('Limiteur : pas de saut brusque (gain lissé)', jump < 0.2, jump.toFixed(3));
}

// ---------- stéréo ----------
{
  const N = 48000;
  const L = sine(300, -10, N), R = sine(500, -12, N, 0.7);
  const run = (params, l = L, r = R) => { const sp = new StereoProcessor(SR); sp.setParams(params); const oL = new Float32Array(N), oR = new Float32Array(N); for (let i = 0; i < N; i += 128) sp.process(l.subarray(i, i + 128), r.subarray(i, i + 128), oL.subarray(i, i + 128), oR.subarray(i, i + 128), Math.min(128, N - i)); return { oL, oR, sp }; };
  let { oL, oR } = run({});
  check('Stéréo neutre : recopie exacte', oL.every((v, i) => v === L[i]) && oR.every((v, i) => v === R[i]));
  {
    // on élargit puis on revient à 1 : après stabilisation, le signal d'origine est reconstruit exactement
    const sp = new StereoProcessor(SR); const oL2 = new Float32Array(N), oR2 = new Float32Array(N);
    sp.setParams({ width: 1.5 });
    for (let i = 0; i < N; i += 128) sp.process(L.subarray(i, i + 128), R.subarray(i, i + 128), oL2.subarray(i, i + 128), oR2.subarray(i, i + 128), 128);
    sp.setParams({ width: 1 });
    for (let i = 0; i < N; i += 128) sp.process(L.subarray(i, i + 128), R.subarray(i, i + 128), oL2.subarray(i, i + 128), oR2.subarray(i, i + 128), 128);
    check('Retour à la largeur 1 : reconstruction exacte de l\'original', oL2.slice(24000).every((v, i) => v === L[24000 + i]) && oR2.slice(24000).every((v, i) => v === R[24000 + i]));
    sp.setParams({ width: 1.0001 });
    const t0 = new Float32Array(N), t1 = new Float32Array(N);
    sp.process(L, R, t0, t1, N);
    let e = 0; for (let i = 24000; i < N; i++) e = Math.max(e, Math.abs(t0[i] - L[i]));
    check('Largeur ≈ 1 (M/S) : erreur de reconstruction négligeable (< -80 dB)', e < 1e-4, e.toExponential(1));
  }
  ({ oL, oR } = run({ width: 0 }));
  let dm = 0; for (let i = 24000; i < N; i++) dm = Math.max(dm, Math.abs(oL[i] - oR[i]), Math.abs(oL[i] - (L[i] + R[i]) / 2));
  check('Largeur 0 : mono = (L+R)/2', dm < 1e-6, dm.toExponential(1));
  ({ oL, oR } = run({ mono: true }));
  dm = 0; for (let i = 100; i < N; i++) dm = Math.max(dm, Math.abs(oL[i] - oR[i]), Math.abs(oL[i] - (L[i] + R[i]) / 2));
  check('Écoute mono : L = R = (L+R)/2', dm < 1e-6);
  ({ oL, oR } = run({ width: 1.5 }));
  const side = (a, b) => a.map((v, i) => (v - b[i]) / 2);
  const rmsA = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const ratio = rmsA(side(oL, oR).slice(30000)) / rmsA(side(L, R).slice(30000));
  check('Largeur 1,5 : Side × 1,5, Mid inchangé', near(ratio, 1.5, 0.01) && near(rmsA(oL.map((v, i) => (v + oR[i]) / 2).slice(30000)), rmsA(L.map((v, i) => (v + R[i]) / 2).slice(30000)), 1e-4), ratio.toFixed(3));
  ({ oL, oR } = run({ balance: 0.5 }));
  check('Balance +0,5 : gauche -6 dB, droite inchangée', near(rmsA(oL.slice(30000)) / rmsA(L.slice(30000)), 0.5, 0.005) && near(rmsA(oR.slice(30000)) / rmsA(R.slice(30000)), 1, 1e-4));
  ({ oL, oR } = run({ balance: -1 }));
  check('Balance -1 : droite coupée', rmsA(oR.slice(30000)) < 1e-6 && rmsA(oL.slice(30000)) > 0.1);
  // corrélation avec des signaux connus
  const m1 = run({}, L, L).sp.takeMeters();
  check('Corrélation : L = R → +1', near(m1.corrIn, 1, 1e-6) && m1.widthIn < 1e-6);
  const inv = L.map((v) => -v);
  const m2 = run({}, L, inv).sp.takeMeters();
  check('Corrélation : R = -L → -1', near(m2.corrIn, -1, 1e-6));
  const a = sine(1000, -6, N), b = sine(1000, -6, N, Math.PI / 2);
  const m3 = run({}, a, b).sp.takeMeters();
  check('Corrélation : quadrature → 0', near(m3.corrIn, 0, 0.01), m3.corrIn.toFixed(3));
  {
    const sp = new StereoProcessor(SR); sp.setParams({ width: 0 });
    const a1 = new Float32Array(N), a2 = new Float32Array(N);
    sp.process(L, R, a1, a2, N); sp.takeMeters();              // période de lissage écartée
    sp.process(L, R, a1, a2, N);
    const m4 = sp.takeMeters();
    check('Largeur 0 : corrélation de sortie = +1', near(m4.corrOut, 1, 1e-6));
  }
}

// ---------- caractéristiques spectrales / EQ intelligent ----------
{
  const binHz = 48000 / 8192;
  const bins = 4096;
  // spectre de référence : -4,5 dB/oct (densité par octave) => puissance par bin ∝ f^(-1) * 10^(-4.5*log2(f/1000)/10)
  const mk = (fn) => Float64Array.from({ length: bins }, (_, k) => (k === 0 ? 0 : fn(k * binHz) / (k * binHz)));
  const ref = mk((f) => Math.pow(10, (D.REF_SLOPE * Math.log2(f / 1000)) / 10) * 1e-4);
  let ft = D.spectralFeatures(ref, binHz);
  let sug = D.suggestEQ(ft, { seconds: 30 });
  check('EQ intelligent : spectre de référence → aucun ajustement', sug.confident && !sug.recommend && sug.bands.every((b) => b.gainDb === 0), JSON.stringify(sug.bands.map((b) => b.gainDb)));
  const bassy = mk((f) => Math.pow(10, (D.REF_SLOPE * Math.log2(f / 1000) + (f < 150 ? 9 : 0)) / 10) * 1e-4);
  sug = D.suggestEQ(D.spectralFeatures(bassy, binHz), { seconds: 30 });
  const bb = sug.bands.find((b) => b.key === 'bass');
  check('EQ intelligent : excès de grave → suggestion de réduction limitée à 3 dB', sug.recommend && bb.gainDb < 0 && bb.gainDb >= -3, JSON.stringify(sug.bands.map((b) => b.gainDb)));
  const lossy = mk((f) => (f > 15500 ? 1e-16 : Math.pow(10, (D.REF_SLOPE * Math.log2(f / 1000)) / 10) * 1e-4));
  ft = D.spectralFeatures(lossy, binHz);
  sug = D.suggestEQ(ft, { seconds: 30 });
  check('EQ intelligent : source type MP3 coupée → aucun boost d\'aigus', ft.lossyLowpass && sug.bands.filter((b) => b.key === 'air' || b.key === 'treble').every((b) => b.gainDb <= 0), JSON.stringify(sug.bands.map((b) => b.gainDb)));
  sug = D.suggestEQ(ft, { seconds: 2 });
  check('EQ intelligent : trop peu de signal → aucun ajustement recommandé', !sug.confident && !sug.recommend);
  sug = D.suggestEQ(D.spectralFeatures(new Float64Array(bins), binHz), { seconds: 30 });
  check('EQ intelligent : silence → aucun ajustement', !sug.confident && !sug.recommend);
  const tone = new Float64Array(bins); tone[Math.round(1000 / binHz)] = 1;
  const white = new Float64Array(bins).fill(1); white[0] = 0;
  const ftT = D.spectralFeatures(tone, binHz), ftW = D.spectralFeatures(white, binHz);
  check('Caractéristiques : un ton pur à 1 kHz → centroïde ≈ 1 kHz, planéité ≈ 0', near(ftT.centroidHz, 1000, binHz) && near(ftT.rolloffHz, 1000, binHz) && ftT.flatness < 0.01, `${ftT.centroidHz.toFixed(0)} Hz / ${ftT.flatness.toFixed(3)}`);
  check('Caractéristiques : bruit blanc → centroïde ≈ 12 kHz, planéité ≈ 1', near(ftW.centroidHz, 12000, 100) && ftW.flatness > 0.95 && near(ftW.rolloffHz, 20400, 400), `${ftW.centroidHz.toFixed(0)} Hz / ${ftW.flatness.toFixed(2)} / ${ftW.rolloffHz.toFixed(0)} Hz`);
  const cur = [0, 0, 0];
  const nxt = D.adaptStep(cur, [3, -3, 0.01], 1, { maxDb: 2, rateDbPerS: 0.15 });
  check('Adaptatif : vitesse limitée (0,15 dB/s) et amplitude limitée (±2 dB)', near(nxt[0], 0.15, 1e-9) && near(nxt[1], -0.15, 1e-9) && near(nxt[2], 0.01, 1e-9));
  let st = [0]; for (let i = 0; i < 100; i++) st = D.adaptStep(st, [5], 1, { maxDb: 2 });
  check('Adaptatif : plafonné à ±2 dB', near(st[0], 2, 1e-9));
}

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests du moteur audio (noyau DSP) passent.');
