// SPOTI NOX - reglages audio : format versionne, validation au chargement, valeurs par defaut.
import { bandsForPreset, clampBand, defaultBands, EQ_PRESETS, NORM_MODES } from './dsp.js';

export const AUDIO_VERSION = 1;

export function defaultAudio() {
  return {
    v: AUDIO_VERSION,
    eq: { on: true, preset: 'flat', bands: bandsForPreset('flat'), user: {} },
    norm: { mode: 'normal', targets: { normal: -14, quiet: -19, loud: -11 }, album: false, budgetDb: 2 },
    limiter: { on: true, ceiling: -1, release: 100 },
    stereo: { width: 1, balance: 0, mono: false },
    adaptive: { mode: 'off', maxDb: 2 },
    ab: { match: true },
    output: { sinkId: '' },
    display: { scope: true }
  };
}

const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const oneOf = (v, list, def) => (list.includes(v) ? v : def);

function cleanBands(raw) {
  const base = defaultBands();
  if (!Array.isArray(raw) || raw.length !== base.length) return base;
  return base.map((b, i) => {
    const r = raw[i] || {};
    return clampBand({ ...b, ...r, id: b.id });
  });
}

// Valide / complete des reglages d'origine inconnue (fichier importe, ancienne version...)
export function validateAudio(raw) {
  const d = defaultAudio();
  const r = raw && typeof raw === 'object' ? raw : {};
  const eq = r.eq && typeof r.eq === 'object' ? r.eq : {};
  const user = {};
  if (eq.user && typeof eq.user === 'object') {
    Object.keys(eq.user).slice(0, 20).forEach((k) => { user[String(k).slice(0, 40)] = cleanBands(eq.user[k]); });
  }
  const presetOk = (p) => p === 'custom' || EQ_PRESETS[p] || user[p];
  const norm = r.norm && typeof r.norm === 'object' ? r.norm : {};
  const t = norm.targets && typeof norm.targets === 'object' ? norm.targets : {};
  const lim = r.limiter && typeof r.limiter === 'object' ? r.limiter : {};
  const st = r.stereo && typeof r.stereo === 'object' ? r.stereo : {};
  const ad = r.adaptive && typeof r.adaptive === 'object' ? r.adaptive : {};
  return {
    v: AUDIO_VERSION,
    eq: {
      on: eq.on !== false,
      preset: presetOk(eq.preset) ? eq.preset : 'flat',
      bands: cleanBands(eq.bands),
      user
    },
    norm: {
      mode: oneOf(norm.mode, ['off', ...Object.keys(NORM_MODES)], d.norm.mode),
      targets: {
        normal: num(t.normal, -30, -5, -14), quiet: num(t.quiet, -30, -5, -19), loud: num(t.loud, -30, -5, -11)
      },
      album: !!norm.album,
      budgetDb: num(norm.budgetDb, 0, 6, 2)
    },
    limiter: { on: lim.on !== false, ceiling: num(lim.ceiling, -12, 0, -1), release: num(lim.release, 10, 1000, 100) },
    stereo: { width: num(st.width, 0, 2, 1), balance: num(st.balance, -1, 1, 0), mono: !!st.mono },
    adaptive: { mode: oneOf(ad.mode, ['off', 'suggest', 'adaptive'], 'off'), maxDb: num(ad.maxDb, 0.5, 4, 2) },
    ab: { match: (r.ab && r.ab.match) !== false },
    output: { sinkId: typeof (r.output && r.output.sinkId) === 'string' ? r.output.sinkId.slice(0, 200) : '' },
    display: { scope: (r.display && r.display.scope) !== false }
  };
}

// Reglages courants d'un preset (y compris ceux de l'utilisateur)
export function presetBands(audio, key) {
  if (audio.eq.user[key]) return audio.eq.user[key].map((b) => ({ ...b }));
  return bandsForPreset(key);
}
