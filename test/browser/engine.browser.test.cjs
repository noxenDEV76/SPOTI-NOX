// Tests du moteur audio dans un vrai Chromium (Playwright) : graphe Web Audio + AudioWorklets reels.
// Lancer : npm run test:browser   (necessite Playwright et son Chromium ; non execute dans le CI)
const path = require('path');
const { start } = require('../../electron/server');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright')); }

(async () => {
  const root = path.join(__dirname, '..', '..');
  const srv = await start(root, 47951);
  const exe = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${srv.port}/test/browser/engine.html`);
  await page.waitForFunction(() => typeof window.runAll === 'function', null, { timeout: 8000 }).catch(() => { console.log('Chargement du module impossible :', errors.join('\n')); });
  const res = await page.evaluate(() => window.runAll());
  let failed = 0;
  res.forEach((r) => { if (!r.ok) failed++; console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name} ${r.extra}`); });
  if (errors.length) { console.log('Erreurs page :', errors.slice(0, 5).join('\n')); failed++; }
  await browser.close(); srv.server.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les tests navigateur passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
