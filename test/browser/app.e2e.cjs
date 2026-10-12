// Test de bout en bout dans un vrai Chromium : l'app reelle lit un titre, l'ecran Audio pilote le moteur.
// Lancer : npm run test:e2e   (necessite Playwright ; non execute dans le CI)
const path = require('path');
const { start } = require('../../electron/server');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright')); }

function wav(seconds = 20, sr = 44100) {
  const n = seconds * sr, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const kick = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-(t % 0.5) * 20)) * t) * Math.exp(-(t % 0.5) * 8);
    const L = 0.35 * kick + 0.12 * Math.sin(2 * Math.PI * 440 * t) + 0.05 * rnd();
    const R = 0.35 * kick + 0.12 * Math.sin(2 * Math.PI * 660 * t) + 0.05 * rnd();
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R)) * 32767), 46 + i * 4);
  }
  return buf;
}

(async () => {
  const www = path.join(__dirname, '..', '..', 'www');
  const srv = await start(www, 47952);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const ctx = await browser.newContext({ locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const body = wav();
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${srv.port}`)) return route.continue();
    if (u.includes('fake.test/song.wav')) return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'none' }, body });
    return route.fulfill({ status: 404, body: '{}', headers: { 'access-control-allow-origin': '*' } });
  });
  let failed = 0;
  const check = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${x}`); };

  await page.goto(`http://localhost:${srv.port}/index.html`);
  await page.waitForFunction(() => window.__nox, null, { timeout: 8000 });
  await page.click('[data-nav="audio"]');
  await page.waitForSelector('#eq-canvas');
  check('Écran Audio affiché', true);
  const idle = await page.textContent('#au-state');
  check('État sans lecture', /Aucun titre/.test(idle), idle.slice(0, 50));

  await page.evaluate(() => window.__nox.player.playList([{ id: 'jm:e2e', src: 'jamendo', title: 'Test', artist: 'Nox', duration: 20, url: 'https://fake.test/song.wav', full: true, cover: '' }], 0));
  await page.waitForFunction(() => window.__nox.player.analyzer.active && window.__nox.player.analyzer.g, null, { timeout: 10000 });
  await page.evaluate(() => window.__nox.player.analyzer.resume());
  await page.waitForTimeout(2500);
  const st = await page.textContent('#au-state');
  check('Traitement actif', /actif/.test(st), st.slice(0, 60));
  // mesure de normalisation du titre complet
  await page.waitForFunction(() => window.__nox.player.analyzer.norm.status === 'ready', null, { timeout: 15000 }).catch(() => {});
  const norm = await page.evaluate(() => ({ s: window.__nox.player.analyzer.norm.status, m: window.__nox.player.analyzer.norm.measured && window.__nox.player.analyzer.norm.measured.integrated, g: window.__nox.player.analyzer.norm.plan && window.__nox.player.analyzer.norm.plan.appliedDb }));
  check('Normalisation mesurée', norm.s === 'ready' && Number.isFinite(norm.m), JSON.stringify(norm));
  const kvTxt = await page.textContent('#au-normkv');
  check('Mesures affichées', /LUFS/.test(kvTxt));

  // preset -> gains reellement appliques aux filtres
  await page.selectOption('#eq-preset', 'electronic');
  await page.waitForTimeout(600);
  const g = await page.evaluate(() => { const a = window.__nox.player.analyzer; return { preset: window.__nox.store.s.settings.audio.eq.preset, sub: window.__nox.store.s.settings.audio.eq.bands[1].gain, node: a.g.eq ? a.g.eq[1].gain.value : null }; });
  check('Préréglage Electronic appliqué au filtre', g.preset === 'electronic' && g.sub > 0 && g.node !== null && Math.abs(g.node - g.sub) < 0.05, JSON.stringify(g));
  // A/B
  await page.click('[data-au="ab"][data-v="A"]');
  await page.waitForTimeout(400);
  const mixA = await page.evaluate(() => window.__nox.player.analyzer.mix.ab);
  check('A/B : bascule sur A', mixA === 'A');
  await page.click('[data-au="ab"][data-v="B"]');
  // bypass
  await page.click('#au-bypass');
  await page.waitForTimeout(300);
  check('Bypass', await page.evaluate(() => window.__nox.player.analyzer.mix.bypass) === true);
  await page.click('#au-bypass');
  // limiteur / stereo / normalisation persistes
  await page.fill('#st-w', '1.5'); await page.dispatchEvent('#st-w', 'input');
  await page.click('[data-au="norm"][data-v="loud"]');
  await page.click('[data-au="int"][data-v="suggest"]');
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('spotinox.v1')).settings.audio);
  check('Réglages persistés', saved.stereo.width === 1.5 && saved.norm.mode === 'loud' && saved.eq.preset === 'electronic' && saved.adaptive.mode === 'suggest');
  const meters = await page.textContent('#au-meters');
  check('Analyseurs en direct (valeurs réelles)', /LUFS/.test(meters) && !/NaN/.test(meters));
  const grText = await page.textContent('#au-grv');
  check('Réduction de gain affichée', /dB/.test(grText), grText);
  const outTxt = await page.textContent('#au-outkv');
  check('Sortie : fréquence réelle', /\d{5} Hz/.test(outTxt) && /indisponible/.test(outTxt));
  // rechargement : reglages restaures
  await page.reload();
  await page.waitForFunction(() => window.__nox, null, { timeout: 8000 });
  const after = await page.evaluate(() => window.__nox.player.analyzer.audio);
  check('Réglages restaurés au rechargement', after.stereo.width === 1.5 && after.norm.mode === 'loud' && after.eq.preset === 'electronic');
  check('Aucune erreur JS', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.server.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTest de bout en bout OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
