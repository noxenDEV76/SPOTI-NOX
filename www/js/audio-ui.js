// SPOTI NOX - ecran « Audio » : toutes les commandes sont reliees au moteur (analyzer.js), toutes les mesures sont reelles.
import * as D from './dsp.js';
import { presetBands } from './audio-settings.js';

let E = null;       // { engine, player, store, esc, toast, askText }
let root = null;
let sel = 3;        // bande selectionnee dans le graphe
let loop = { on: false, start: 0 };
let drag = null;

const fmt = (v, d = 1) => (Number.isFinite(v) ? (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d) : '−∞');
const fmtAbs = (v, d = 1) => (Number.isFinite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) : '−∞');
const hz = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + ' kHz' : Math.round(f) + ' Hz');
const $ = (s, r = root) => r.querySelector(s);
const $$ = (s, r = root) => [...r.querySelectorAll(s)];

export function initAudioUI(env) { E = env; }

const A = () => E.engine.audio;
function commit(opts = {}) {
  const e = E.engine;
  e.audio.eq.preset = opts.preset || e.audio.eq.preset;
  e.applyAll();
  E.store.s.settings.audio = e.audio;
  E.store.save();
}

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------
const TYPE_NAMES = { lowshelf: 'Low shelf', peaking: 'Bell', highshelf: 'High shelf', highpass: 'High-pass', lowpass: 'Low-pass', notch: 'Notch' };
const BAND_NAMES = { hp: 'High-pass', sub: 'Sub-bass', bass: 'Bass', lowmid: 'Low mids', mid: 'Midrange', presence: 'Presence', treble: 'Treble', air: 'Air', lp: 'Low-pass' };

function presetOptions() {
  const a = A();
  const std = Object.entries(D.EQ_PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  const user = Object.keys(a.eq.user).map((k) => `<option value="${E.esc(k)}">★ ${E.esc(k)}</option>`).join('');
  return `${std}${user}<option value="custom">Personnalisé</option>`;
}

export function audioHTML() {
  const regions = D.REGIONS.map((r, i) => `<div class="au-reg"><label>${r.name} <small>${hz(r.from)}–${hz(r.to)}</small></label><input type="range" min="-12" max="12" step="0.5" data-au="region" data-i="${i + 1}"><b data-au="regv" data-i="${i + 1}"></b></div>`).join('');
  const rows = D.defaultBands().map((b, i) => `<tr data-row="${i}">
    <td><input type="checkbox" data-au="band-on" data-i="${i}" title="Activer la bande"></td>
    <td>${BAND_NAMES[b.id]}</td>
    <td><select data-au="band-type" data-i="${i}">${D.FILTER_TYPES.map((t) => `<option value="${t}">${TYPE_NAMES[t]}</option>`).join('')}</select></td>
    <td><input type="number" data-au="band-f" data-i="${i}" min="20" max="20000" step="1"></td>
    <td><input type="number" data-au="band-g" data-i="${i}" min="-12" max="12" step="0.5"></td>
    <td><input type="number" data-au="band-q" data-i="${i}" min="0.2" max="10" step="0.05"></td></tr>`).join('');
  return `
  <h1>Audio</h1>
  <p class="muted">Moteur de traitement en virgule flottante 32 bits. Chaque réglage agit réellement sur le son ; chaque mesure vient du signal.</p>
  <div id="au-state" class="notice"></div>

  <div class="au-grid">
    <section class="au-card" id="au-chain">
      <h3>Chaîne et état</h3>
      <div class="au-flow">Source → EQ → Stéréo → Normalisation → Limiteur true-peak → Sortie</div>
      <div class="au-kv" id="au-stages"></div>
      <div class="au-row"><button class="btn" id="au-bypass">Contourner tout le traitement</button><button class="btn" id="au-reset-all">Réinitialiser l'audio</button></div>
    </section>

    <section class="au-card" id="au-ab">
      <h3>Comparaison A/B</h3>
      <div class="au-seg" id="au-ab-seg"><button data-au="ab" data-v="A">A · Original</button><button data-au="ab" data-v="B">B · Traité</button></div>
      <label class="chk"><input type="checkbox" id="au-match"> Égaliser le volume perçu (loudness)</label>
      <div class="au-kv"><span>Correction appliquée à l'original</span><b id="au-matchdb">—</b></div>
      <label class="chk"><input type="checkbox" id="au-loop"> Boucle d'écoute de 8 s (depuis la position actuelle)</label>
      <p class="hint">La correction n'est jamais enregistrée : elle ne modifie ni l'égaliseur ni les autres réglages.</p>
    </section>

    <section class="au-card" id="au-norm">
      <h3>Normalisation du volume</h3>
      <div class="au-seg" id="au-norm-seg">
        <button data-au="norm" data-v="off">Désactivée</button><button data-au="norm" data-v="quiet">Quiet</button><button data-au="norm" data-v="normal">Normal</button><button data-au="norm" data-v="loud">Loud</button>
      </div>
      <div class="au-targets">
        <label>Cible Quiet<input type="number" step="0.5" min="-30" max="-5" data-au="target" data-k="quiet"> LUFS</label>
        <label>Cible Normal<input type="number" step="0.5" min="-30" max="-5" data-au="target" data-k="normal"> LUFS</label>
        <label>Cible Loud<input type="number" step="0.5" min="-30" max="-5" data-au="target" data-k="loud"> LUFS</label>
      </div>
      <label class="chk"><input type="checkbox" id="au-album"> Mode album (un gain commun pour toute la file : les écarts voulus entre titres sont conservés)</label>
      <div class="au-kv" id="au-normkv"></div>
      <p class="hint" id="au-normnote"></p>
    </section>

    <section class="au-card au-wide" id="au-eq">
      <h3>Égaliseur paramétrique</h3>
      <div class="au-row">
        <label class="chk"><input type="checkbox" id="eq-on"> Activé</label>
        <select id="eq-preset"></select>
        <button class="btn" id="eq-save">Enregistrer le préréglage</button>
        <button class="btn" id="eq-del">Supprimer</button>
        <button class="btn" id="eq-flat">Remettre à plat</button>
      </div>
      <p class="hint" id="eq-note"></p>
      <canvas id="eq-canvas" height="230"></canvas>
      <div class="au-regs">${regions}</div>
      <details><summary>Réglage détaillé des bandes</summary>
        <table class="au-tab"><thead><tr><th></th><th>Bande</th><th>Type</th><th>Fréq. (Hz)</th><th>Gain (dB)</th><th>Q</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="hint">Le Q des filtres en plateau (shelf) n'existe pas dans Web Audio : il est donc grisé. Glisse un point sur le graphe pour changer sa fréquence et son gain ; la molette règle le Q.</p>
      </details>
    </section>

    <section class="au-card" id="au-int">
      <h3>EQ intelligent</h3>
      <div class="au-seg" id="au-int-seg"><button data-au="int" data-v="off">Désactivé</button><button data-au="int" data-v="suggest">Suggestions</button><button data-au="int" data-v="adaptive">Adaptatif</button></div>
      <label>Correction maximale <b id="au-maxdb-v"></b><input type="range" id="au-maxdb" min="0.5" max="4" step="0.5"></label>
      <div class="au-kv" id="au-intkv"></div>
      <div id="au-sug"></div>
      <div class="au-row"><button class="btn" id="au-apply-sug">Appliquer la suggestion à l'EQ</button></div>
      <p class="hint">Mesure uniquement : aucune correction n'est appliquée tant que le mode adaptatif est désactivé. En mode adaptatif, l'EQ bouge au plus de 0,15 dB par seconde. Il ne restaure pas les fréquences manquantes d'une source avec pertes.</p>
    </section>

    <section class="au-card" id="au-lim">
      <h3>Limiteur true-peak</h3>
      <label class="chk"><input type="checkbox" id="lim-on"> Protection de crête activée</label>
      <label>Plafond <b id="lim-ceil-v"></b><input type="range" id="lim-ceil" min="-12" max="0" step="0.1"></label>
      <label>Relâchement <b id="lim-rel-v"></b><input type="range" id="lim-rel" min="10" max="1000" step="10"></label>
      <div class="au-meter"><div class="au-gr" id="au-grbar"></div><span id="au-grv">0.0 dB</span></div>
      <div class="au-kv" id="au-limkv"></div>
      <p class="hint">Anticipation de 5 ms avec détection de crête vraie (sur-échantillonnage ×4). Il n'agit que si le signal dépasse le plafond.</p>
    </section>

    <section class="au-card" id="au-st">
      <h3>Stéréo</h3>
      <label>Largeur <b id="st-w-v"></b><input type="range" id="st-w" min="0" max="2" step="0.01"></label>
      <label>Balance <b id="st-b-v"></b><input type="range" id="st-b" min="-1" max="1" step="0.01"></label>
      <label class="chk"><input type="checkbox" id="st-mono"> Écoute mono (contrôle de compatibilité)</label>
      <div class="au-corr"><span>−1</span><div class="au-corrbar"><i id="au-corrdot"></i></div><span>+1</span></div>
      <div class="au-kv" id="au-stkv"></div>
      <p class="hint">Largeur 100 % et balance 0 : le signal est recopié sans aucune modification. Une corrélation proche de −1 signale un risque d'annulation en mono.</p>
    </section>

    <section class="au-card" id="au-out">
      <h3>Sortie audio</h3>
      <div class="au-kv" id="au-outkv"></div>
      <label>Périphérique<select id="au-sink"></select></label>
      <p class="hint" id="au-outnote"></p>
    </section>

    <section class="au-card au-wide" id="au-an">
      <h3>Analyseurs en direct</h3>
      <div class="au-twocv"><canvas id="au-wave" height="110"></canvas><canvas id="au-spec" height="110"></canvas></div>
      <table class="au-tab au-meters"><thead><tr><th></th><th>Entrée (source)</th><th>Sortie (entendu)</th></tr></thead><tbody id="au-meters"></tbody></table>
      <p class="hint">Entrée = signal source avant tout traitement. Sortie = signal final après traitement et A/B. Cibles choisies : voir « Normalisation ».</p>
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------------------------
// Synchronisation interface <- reglages
// ---------------------------------------------------------------------------------------------
function syncAll() {
  const a = A();
  $('#eq-on').checked = a.eq.on;
  const pre = $('#eq-preset'); pre.innerHTML = presetOptions(); pre.value = a.eq.preset;
  const note = a.eq.preset === 'custom' ? 'Réglage personnalisé.' : (D.EQ_PRESETS[a.eq.preset] ? D.EQ_PRESETS[a.eq.preset].note : 'Préréglage personnel.');
  $('#eq-note').textContent = note;
  $('#eq-del').disabled = !a.eq.user[a.eq.preset];
  a.eq.bands.forEach((b, i) => {
    $(`[data-au="band-on"][data-i="${i}"]`).checked = b.on;
    $(`[data-au="band-type"][data-i="${i}"]`).value = b.type;
    $(`[data-au="band-f"][data-i="${i}"]`).value = Math.round(b.f * 10) / 10;
    const g = $(`[data-au="band-g"][data-i="${i}"]`); g.value = b.gain; g.disabled = !D.hasGain(b.type);
    const q = $(`[data-au="band-q"][data-i="${i}"]`); q.value = b.q; q.disabled = !D.hasQ(b.type);
    const r = $(`[data-au="region"][data-i="${i}"]`);
    if (r) { r.value = b.gain; r.disabled = !D.hasGain(b.type); r.style.setProperty('--p', ((b.gain + 12) / 24 * 100) + '%'); $(`[data-au="regv"][data-i="${i}"]`).textContent = D.hasGain(b.type) ? fmt(b.gain) + ' dB' : '—'; }
  });
  $$('[data-au="norm"]').forEach((b) => b.classList.toggle('on', b.dataset.v === a.norm.mode));
  $$('[data-au="target"]').forEach((i) => { i.value = a.norm.targets[i.dataset.k]; });
  $('#au-album').checked = a.norm.album;
  $$('[data-au="int"]').forEach((b) => b.classList.toggle('on', b.dataset.v === a.adaptive.mode));
  $('#au-maxdb').value = a.adaptive.maxDb; $('#au-maxdb-v').textContent = '± ' + a.adaptive.maxDb.toFixed(1) + ' dB';
  $('#lim-on').checked = a.limiter.on;
  $('#lim-ceil').value = a.limiter.ceiling; $('#lim-ceil-v').textContent = fmtAbs(a.limiter.ceiling) + ' dBTP';
  $('#lim-rel').value = a.limiter.release; $('#lim-rel-v').textContent = a.limiter.release + ' ms';
  $('#st-w').value = a.stereo.width; $('#st-w-v').textContent = Math.round(a.stereo.width * 100) + ' %';
  $('#st-b').value = a.stereo.balance; $('#st-b-v').textContent = a.stereo.balance === 0 ? 'centre' : (a.stereo.balance < 0 ? 'G ' : 'D ') + Math.round(Math.abs(a.stereo.balance) * 100) + ' %';
  $('#st-mono').checked = a.stereo.mono;
  $('#au-match').checked = a.ab.match;
  syncRanges();
  drawEQ();
}

function syncRanges() {
  $$('input[type=range]').forEach((r) => { if (r.dataset.au !== 'region') r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); });
}

// ---------------------------------------------------------------------------------------------
// Graphe de l'EQ
// ---------------------------------------------------------------------------------------------
const FMIN = 20, FMAX = 20000;
const xOf = (f, w) => Math.log(f / FMIN) / Math.log(FMAX / FMIN) * w;
const fOf = (x, w) => FMIN * Math.pow(FMAX / FMIN, x / w);
const yOf = (g, h) => h / 2 - g / 12 * (h / 2 - 12);
const gOf = (y, h) => (h / 2 - y) / (h / 2 - 12) * 12;

function fit(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 600, h = Number(cv.getAttribute('height')) || 200;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w, h };
}

function drawEQ() {
  const cv = $('#eq-canvas');
  if (!cv) return;
  const { c, w, h } = fit(cv);
  const a = A();
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#242424'; c.lineWidth = 1; c.fillStyle = '#7d7d7d'; c.font = '10px system-ui';
  [-12, -6, 0, 6, 12].forEach((g) => { const y = yOf(g, h); c.strokeStyle = g === 0 ? '#3c3c3c' : '#202020'; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.fillText((g > 0 ? '+' : '') + g, 3, y - 2); });
  [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => { const x = xOf(f, w); c.strokeStyle = '#202020'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 2, h - 3); });
  const sr = E.engine.ctx ? E.engine.ctx.sampleRate : 48000;
  const freqs = D.logFreqs(Math.max(100, Math.round(w / 3)));
  const offs = a.adaptive.mode === 'adaptive' ? E.engine.offsets : null;
  const resp = D.eqResponseDb(a.eq.on ? a.eq.bands : [], freqs, sr, offs);
  c.beginPath();
  freqs.forEach((f, i) => { const x = xOf(f, w), y = yOf(Math.max(-12, Math.min(12, resp[i])), h); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = a.eq.on ? '#1fd45f' : '#555'; c.lineWidth = 2.2; c.stroke();
  c.lineTo(w, yOf(0, h)); c.lineTo(0, yOf(0, h)); c.closePath(); c.fillStyle = a.eq.on ? 'rgba(31,212,95,.14)' : 'rgba(120,120,120,.1)'; c.fill();
  a.eq.bands.forEach((b, i) => {
    if (!b.on) return;
    const x = xOf(b.f, w), y = yOf(D.hasGain(b.type) ? b.gain : 0, h);
    c.beginPath(); c.arc(x, y, i === sel ? 8 : 6, 0, 7);
    c.fillStyle = i === sel ? '#fff' : '#1fd45f'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
  });
}

function bandAt(x, y, w, h) {
  let best = -1, bd = 18;
  A().eq.bands.forEach((b, i) => {
    if (!b.on) return;
    const d = Math.hypot(xOf(b.f, w) - x, yOf(D.hasGain(b.type) ? b.gain : 0, h) - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function setBand(i, patch) {
  const a = A();
  a.eq.bands[i] = D.clampBand({ ...a.eq.bands[i], ...patch });
  a.eq.preset = 'custom';
  commit({ preset: 'custom' });
  syncAll();
}

function wireEQCanvas() {
  const cv = $('#eq-canvas');
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: Number(cv.getAttribute('height')) }; };
  cv.addEventListener('pointerdown', (e) => {
    const p = pos(e); const i = bandAt(p.x, p.y, p.w, p.h);
    if (i >= 0) { sel = i; drag = i; cv.setPointerCapture(e.pointerId); drawEQ(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    const p = pos(e); const b = A().eq.bands[drag];
    setBand(drag, { f: fOf(Math.max(0, Math.min(p.w, p.x)), p.w), gain: D.hasGain(b.type) ? gOf(p.y, p.h) : 0 });
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    const b = A().eq.bands[sel];
    if (!b || !D.hasQ(b.type)) return;
    e.preventDefault();
    setBand(sel, { q: b.q * (e.deltaY < 0 ? 1.12 : 1 / 1.12) });
  }, { passive: false });
}

// ---------------------------------------------------------------------------------------------
// Montage et evenements
// ---------------------------------------------------------------------------------------------
export async function mountAudioView(el) {
  root = el;
  syncAll();
  wireEQCanvas();
  const a = () => A();
  const eng = () => E.engine;

  root.addEventListener('input', (e) => {
    const t = e.target, k = t.dataset.au;
    if (t.id === 'au-maxdb') { a().adaptive.maxDb = Number(t.value); commit(); syncAll(); }
    else if (k === 'region') { setBand(Number(t.dataset.i), { gain: Number(t.value) }); }
    else if (t.id === 'lim-ceil') { a().limiter.ceiling = Number(t.value); commit(); syncAll(); }
    else if (t.id === 'lim-rel') { a().limiter.release = Number(t.value); commit(); syncAll(); }
    else if (t.id === 'st-w') { a().stereo.width = Number(t.value); commit(); syncAll(); }
    else if (t.id === 'st-b') { a().stereo.balance = Math.abs(Number(t.value)) < 0.03 ? 0 : Number(t.value); commit(); syncAll(); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target, k = t.dataset.au, i = Number(t.dataset.i);
    if (t.id === 'eq-on') { a().eq.on = t.checked; commit(); syncAll(); }
    else if (t.id === 'eq-preset') {
      const key = t.value;
      if (key !== 'custom') { a().eq.bands = presetBands(a(), key); a().eq.preset = key; commit({ preset: key }); }
      syncAll();
    }
    else if (k === 'band-on') setBand(i, { on: t.checked });
    else if (k === 'band-type') setBand(i, { type: t.value });
    else if (k === 'band-f') setBand(i, { f: Number(t.value) });
    else if (k === 'band-g') setBand(i, { gain: Number(t.value) });
    else if (k === 'band-q') setBand(i, { q: Number(t.value) });
    else if (k === 'target') { a().norm.targets[t.dataset.k] = Number(t.value); commit(); syncAll(); }
    else if (t.id === 'au-album') { a().norm.album = t.checked; commit(); }
    else if (t.id === 'lim-on') { a().limiter.on = t.checked; commit(); }
    else if (t.id === 'st-mono') { a().stereo.mono = t.checked; commit(); }
    else if (t.id === 'au-match') { a().ab.match = t.checked; commit(); }
    else if (t.id === 'au-loop') { loop = { on: t.checked, start: E.player.time }; }
    else if (t.id === 'au-sink') {
      a().output.sinkId = t.value; commit();
      eng().setSink(t.value).then(() => E.toast('Sortie audio changée')).catch(() => E.toast('Périphérique indisponible'));
    }
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = b.dataset.au;
    if (k === 'norm') { a().norm.mode = b.dataset.v; commit(); syncAll(); }
    else if (k === 'int') { a().adaptive.mode = b.dataset.v; commit(); syncAll(); }
    else if (k === 'ab') { eng().setMix({ ab: b.dataset.v, bypass: false }); }
    else if (b.id === 'au-bypass') { eng().setMix({ bypass: !eng().mix.bypass }); }
    else if (b.id === 'eq-flat') { a().eq.bands = presetBands(a(), 'flat'); a().eq.preset = 'flat'; commit({ preset: 'flat' }); syncAll(); }
    else if (b.id === 'eq-save') {
      const n = await E.askText('Nom du préréglage', '', 'Enregistrer');
      if (n && n.trim()) { const name = n.trim().slice(0, 40); a().eq.user[name] = a().eq.bands.map((x) => ({ ...x })); a().eq.preset = name; commit({ preset: name }); syncAll(); E.toast('Préréglage enregistré'); }
    }
    else if (b.id === 'eq-del') { const p = a().eq.preset; if (a().eq.user[p]) { delete a().eq.user[p]; a().eq.preset = 'custom'; commit({ preset: 'custom' }); syncAll(); } }
    else if (b.id === 'au-apply-sug') {
      const s = eng().suggestion();
      if (!s.confident || !s.recommend) { E.toast('Aucun ajustement recommandé pour ce titre'); return; }
      s.bands.forEach((sb) => { const i = a().eq.bands.findIndex((x) => x.id === sb.key); if (i >= 0 && sb.gainDb) a().eq.bands[i] = D.clampBand({ ...a().eq.bands[i], on: true, gain: a().eq.bands[i].gain + sb.gainDb }); });
      a().eq.preset = 'custom'; commit({ preset: 'custom' }); syncAll(); E.toast('Suggestion appliquée');
    }
    else if (b.id === 'au-reset-all') {
      if (E.confirm('Remettre tous les réglages audio par défaut ?')) { eng().setAudio(null); E.store.s.settings.audio = eng().audio; E.store.save(); syncAll(); }
    }
  });
  await fillSinks();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
  }
}

export function unmountAudioView() {
  if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  root = null;
}

async function fillSinks() {
  if (!root) return;
  const sel2 = $('#au-sink');
  let list = [];
  try { list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'); } catch (e) { /* ignore */ }
  sel2.innerHTML = `<option value="">Périphérique par défaut du système</option>` + list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${E.esc(d.deviceId)}">${E.esc(d.label || 'Sortie ' + (i + 1))}</option>`).join('');
  sel2.value = A().output.sinkId;
  if (sel2.value !== A().output.sinkId) { sel2.value = ''; }
  sel2.disabled = !E.engine.ctx || !E.engine.ctx.setSinkId;
}

// Peripherique debranche : retour automatique au peripherique par defaut
async function onDeviceChange() {
  if (!root) return;
  await fillSinks();
  const id = A().output.sinkId;
  if (id && $('#au-sink').value !== id) {
    A().output.sinkId = ''; commit();
    E.engine.setSink('').catch(() => {});
    E.toast('Périphérique de sortie déconnecté : retour à la sortie par défaut');
  }
}

// ---------------------------------------------------------------------------------------------
// Mise a jour en direct (appelee ~15 fois par seconde tant que l'ecran est visible)
// ---------------------------------------------------------------------------------------------
const kv = (label, val, cls = '') => `<div class="au-kv-r"><span>${label}</span><b class="${cls}">${val}</b></div>`;

export function tickAudioView(dt) {
  if (!root || !root.isConnected) return;
  const e = E.engine, a = A();
  const live = !!e.ctx && e.active && !!E.player.current;
  const t = E.player.current;

  // etat general
  const st = $('#au-state');
  const mix = e.mix;
  let txt, cls = '';
  if (!t) txt = 'Aucun titre en lecture : les réglages s\'appliqueront au prochain titre.';
  else if (!live) { txt = 'Traitement indisponible pour cette source (lecture simple ou lecteur YouTube : le signal audio n\'est pas accessible). Les réglages sont conservés.'; cls = 'warn'; }
  else if (mix.bypass) { txt = 'Traitement contourné : tu entends le signal d\'origine.'; cls = 'warn'; }
  else txt = 'Traitement actif sur le titre en cours.';
  if (st.dataset.k !== txt) { st.textContent = txt; st.dataset.k = txt; }
  st.className = 'notice ' + cls;

  // gain staging
  const s = e.stages();
  const gr = e.grDb;
  const prot = a.limiter.on ? (gr < -0.1 ? 'ACTIVE · en action' : 'ACTIVE') : 'DÉSACTIVÉE';
  $('#au-stages').innerHTML =
    kv('Gain max ajouté par l\'EQ', fmt(s.eqBoostDb) + ' dB') +
    kv('Gain de normalisation', fmt(s.normDb) + ' dB') +
    kv('Réduction du limiteur', fmtAbs(gr) + ' dB') +
    kv('Cumul (EQ + normalisation)', fmt(s.accumulatedDb) + ' dB', s.warning ? 'bad' : '') +
    kv('Protection de crête', prot, a.limiter.on ? 'ok' : 'bad') +
    (s.warning ? '<p class="hint bad">Gain cumulé élevé : risque de saturation si la protection est coupée.</p>' : '') +
    (!a.limiter.on && s.accumulatedDb > 0 ? '<p class="hint bad">Limiteur coupé avec du gain ajouté : le signal peut dépasser 0 dBFS et saturer en sortie.</p>' : '');
  const byp = $('#au-bypass'); byp.classList.toggle('on', mix.bypass); byp.textContent = mix.bypass ? 'Réactiver le traitement' : 'Contourner tout le traitement';
  $$('[data-au="ab"]').forEach((b) => b.classList.toggle('on', !mix.bypass && b.dataset.v === mix.ab));

  // A/B
  e.updateMatch();
  $('#au-matchdb').textContent = !a.ab.match ? 'désactivée' : (mix.ab === 'A' && !mix.bypass ? fmt(mix.activeMatchDb || 0) + ' dB' : '(utilisée en A)');

  // boucle d'ecoute
  if (loop.on && E.player.current && E.player.time > loop.start + 8) E.player.seek(loop.start);

  // normalisation
  const n = e.norm;
  const lbl = { off: 'Normalisation désactivée', unavailable: 'Indisponible pour cette source', pending: 'Mesure du titre à venir…', measuring: 'Mesure du titre en cours…', failed: 'Mesure impossible pour ce titre' };
  let nk = '';
  if (n.status === 'ready') {
    const m = n.measured, p = n.plan;
    nk = kv('Loudness intégré mesuré', fmtAbs(m.integrated) + ' LUFS') + kv('Crête vraie mesurée', fmtAbs(m.truePeakDb) + ' dBTP') + kv('Dynamique (LRA)', m.lra.toFixed(1) + ' LU') +
      kv('Cible choisie', fmtAbs(n.target) + ' LUFS') + kv(n.album ? 'Gain commun demandé' : 'Gain demandé', fmt(p.requestedDb) + ' dB') + kv('Gain appliqué', fmt(p.appliedDb) + ' dB', p.limited ? 'warn' : 'ok') +
      (n.album ? kv('Loudness de l\'album', fmtAbs(p.albumLufs) + ' LUFS') : '') +
      kv('Mesuré sur', m.scope === 'preview' ? 'l\'extrait de 30 s' : 'le titre complet');
  } else nk = `<div class="au-kv-r"><span>${lbl[n.status] || ''}</span></div>`;
  if ($('#au-normkv').dataset.k !== nk) { $('#au-normkv').innerHTML = nk; $('#au-normkv').dataset.k = nk; }
  const note = n.status === 'ready' && n.plan.limited ? 'Cible inatteignable sans dépasser le plafond de crête : gain limité à la valeur sûre.' :
    (n.status === 'ready' && n.plan.limiterWorks ? 'Le limiteur retiendra quelques crêtes pour atteindre la cible.' : 'Le gain n\'affecte que la lecture : aucun fichier n\'est modifié.');
  if ($('#au-normnote').textContent !== note) $('#au-normnote').textContent = note;

  // EQ intelligent
  e.sampleSpectrum(dt);
  e.adaptTick(dt);
  if (a.adaptive.mode !== 'off') {
    const sug = e.suggestion();
    const ft = sug.features;
    $('#au-intkv').innerHTML = ft ? kv('Centroïde spectral', hz(ft.centroidHz)) + kv('Roll-off (85 %)', hz(ft.rolloffHz)) + kv('Planéité spectrale', ft.flatness.toFixed(2)) + kv('Durée analysée', e.specSeconds.toFixed(0) + ' s') + (ft.lossyLowpass ? kv('Source', 'coupée en aigus (perte)', 'warn') : '') : '<div class="au-kv-r"><span>Analyse en attente de signal…</span></div>';
    const msg = !sug.confident ? 'Pas assez de signal pour conclure : aucun ajustement recommandé.' : (!sug.recommend ? 'Équilibre correct : aucun ajustement recommandé.' : '');
    $('#au-sug').innerHTML = msg ? `<p class="hint">${msg}</p>` : `<table class="au-tab"><tbody>${sug.bands.filter((b) => b.gainDb).map((b) => `<tr><td>${BAND_NAMES[b.key]}</td><td>${hz(b.f)}</td><td><b>${fmt(b.gainDb)} dB</b></td></tr>`).join('')}</tbody></table>`;
    if (a.adaptive.mode === 'adaptive') $('#au-sug').innerHTML += `<p class="hint">Décalages en cours : ${D.REGIONS.map((r) => `${r.key} ${fmt(e.offsets[r.key] || 0, 2)}`).join(' · ')}</p>`;
  } else { $('#au-intkv').innerHTML = ''; $('#au-sug').innerHTML = '<p class="hint">Choisis « Suggestions » ou « Adaptatif » pour lancer l\'analyse.</p>'; }

  // limiteur
  const g = Math.max(-12, gr);
  $('#au-grbar').style.width = (-g / 12 * 100) + '%';
  $('#au-grv').textContent = fmtAbs(gr) + ' dB';
  $('#au-limkv').innerHTML = kv('Type', e.g ? (e.g.limiterKind === 'worklet' ? 'True-peak à anticipation (×4)' : 'Repli (crête échantillon)') : '—') + kv('Latence', e.g ? (e.g.latency / e.ctx.sampleRate * 1000).toFixed(1) + ' ms' : '—');

  // stereo
  const sm = e.stereoMeters;
  if (sm) {
    $('#au-corrdot').style.left = ((sm.corrOut + 1) / 2 * 100) + '%';
    $('#au-corrdot').className = sm.corrOut < 0 ? 'bad' : sm.corrOut < 0.3 ? 'warn' : '';
    $('#au-stkv').innerHTML = kv('Corrélation (entrée)', fmtAbs(sm.corrIn, 2)) + kv('Corrélation (sortie)', fmtAbs(sm.corrOut, 2), sm.corrOut < 0 ? 'bad' : '') + kv('Largeur (entrée)', Math.round(sm.widthIn * 200) + ' %') + kv('Largeur (sortie)', Math.round(sm.widthOut * 200) + ' %') + kv('Mid / Side (entrée)', fmtAbs(sm.midDbIn, 0) + ' / ' + fmtAbs(sm.sideDbIn, 0) + ' dB') + (sm.corrOut < -0.2 ? '<p class="hint bad">Phase inversée : le son s\'annule en grande partie en mono.</p>' : '');
  } else $('#au-stkv').innerHTML = '<div class="au-kv-r"><span>En attente de signal…</span></div>';

  // sortie
  const oi = e.outputInfo();
  $('#au-outkv').innerHTML = oi ? kv('Moteur', oi.backend) + kv('Système', oi.platform) + kv('Fréquence d\'échantillonnage', oi.sampleRate + ' Hz') + kv('Canaux de sortie (max)', oi.channels) +
    kv('Tampon (estimé)', oi.bufferFrames ? oi.bufferFrames + ' échantillons' : '—') + kv('Latence de base', oi.baseLatencyMs.toFixed(1) + ' ms') + kv('Latence de sortie', oi.outputLatencyMs ? oi.outputLatencyMs.toFixed(1) + ' ms' : 'non mesurable') +
    kv('Latence du traitement', oi.processingLatencyMs.toFixed(1) + ' ms') + kv('État', oi.state) + kv('Mode exclusif', 'indisponible') + (oi.degraded.length ? kv('Modules en repli', oi.degraded.length, 'warn') : '')
    : '<div class="au-kv-r"><span>Le moteur démarre à la première lecture.</span></div>';
  const on = 'Les valeurs sont celles que le moteur audio du navigateur rapporte. Le mélangeur du système (mode partagé) peut ré-échantillonner ou modifier le signal : aucun « bit-perfect » n\'est promis. Le moteur ré-échantillonne la source vers la fréquence de sortie avec le convertisseur de qualité du navigateur ; monter la fréquence ne restaure aucun détail d\'une source avec pertes.';
  if ($('#au-outnote').textContent !== on) $('#au-outnote').textContent = on;

  // mesures entree / sortie
  const mo = e.meter.snapshot(), mi = e.inMeter.snapshot();
  const row = (l, a1, b1, u) => `<tr><td>${l}</td><td>${fmtAbs(a1)} ${u}</td><td>${fmtAbs(b1)} ${u}</td></tr>`;
  const mt = $('#au-meters');
  const html = row('Crête échantillon', mi.peakNow, mo.peakNow, 'dBFS') + row('True Peak', mi.truePeak, mo.truePeak, 'dBTP') + row('True Peak max', mi.truePeakMax, mo.truePeakMax, 'dBTP') +
    row('Momentané', mi.momentary, mo.momentary, 'LUFS') + row('Court terme', mi.shortTerm, mo.shortTerm, 'LUFS') + row('Intégré', mi.integrated, mo.integrated, 'LUFS') +
    `<tr><td>Différence de niveau (sortie − entrée)</td><td colspan="2">${Number.isFinite(mo.shortTerm) && Number.isFinite(mi.shortTerm) ? fmt(mo.shortTerm - mi.shortTerm) + ' LU' : '—'}</td></tr>`;
  if (mt.dataset.k !== html) { mt.innerHTML = html; mt.dataset.k = html; }

  drawWave(); drawSpec();
  if (a.adaptive.mode === 'adaptive') drawEQ();
}

function drawWave() {
  const cv = $('#au-wave'); if (!cv) return;
  const { c, w, h } = fit(cv);
  c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#242424'; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
  const d = E.engine.waveform();
  if (!d || !E.engine.active) { c.fillStyle = '#7d7d7d'; c.font = '11px system-ui'; c.fillText('Forme d\'onde (sortie)', 8, 14); return; }
  c.strokeStyle = '#1fd45f'; c.lineWidth = 1.4; c.beginPath();
  const step = Math.max(1, Math.floor(d.length / w));
  for (let x = 0; x < w; x++) { const i = Math.floor(x / w * d.length); let mn = 1, mx = -1; for (let k = 0; k < step; k++) { const v = d[i + k] || 0; if (v < mn) mn = v; if (v > mx) mx = v; } c.moveTo(x, h / 2 - mx * h / 2 * 0.95); c.lineTo(x, h / 2 - mn * h / 2 * 0.95); }
  c.stroke();
  c.fillStyle = '#7d7d7d'; c.font = '11px system-ui'; c.fillText('Forme d\'onde (sortie)', 8, 14);
}

function drawSpec() {
  const cv = $('#au-spec'); if (!cv) return;
  const { c, w, h } = fit(cv);
  c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h);
  const e = E.engine;
  const sp = e.spectrum();
  c.fillStyle = '#7d7d7d'; c.font = '11px system-ui'; c.fillText('Spectre : entrée (gris) / sortie (vert)', 8, 14);
  if (!sp || !e.active) return;
  const path = (data, color, fill) => {
    c.beginPath();
    for (let x = 0; x < w; x++) {
      const f = fOf(x, w); const k = Math.min(data.length - 1, Math.round(f / sp.binHz));
      const y = h - Math.max(0, Math.min(1, (data[k] + 100) / 100)) * (h - 18);
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = color; c.lineWidth = 1.4; c.stroke();
    if (fill) { c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = fill; c.fill(); }
  };
  if (e.freqIn) { e.g.anIn.getFloatFrequencyData(e.freqIn); path(e.freqIn, '#6b6b6b'); }
  path(sp.data, '#1fd45f', 'rgba(31,212,95,.14)');
}

export function populateSinkLater() { return fillSinks(); }
