import { eqParams, EQ_PRESETS, DEFAULT_EQ } from '../www/js/analyzer.js';
import { tr, LANGS } from '../www/js/i18n.js';

let failed = 0;
const check = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${x}`); };

// Egaliseur
let p = eqParams(DEFAULT_EQ);
check('EQ par défaut : graves +4,5 dB', p.bass === 4.5);
check('EQ par défaut : bas-médiums creusés', p.mud === -3.5);
check('EQ par défaut : brillance +4 dB', p.bright === 4 && Math.abs(p.presence - 1.4) < 1e-9);
check('EQ : marge de sécurité (entrée baissée)', p.pre < 1 && p.pre > 0.4, p.pre.toFixed(3));
check('EQ : limiteur actif', p.limit === true);
p = eqParams({ on: false });
check('EQ désactivé : neutre, sans limiteur', p.bass === 0 && p.mud === 0 && p.bright === 0 && p.pre === 1 && p.limit === false);
p = eqParams(EQ_PRESETS.flat);
check('Préréglage neutre : gains nuls', p.bass === 0 && p.mud === 0 && p.bright === 0);
p = eqParams({ on: true, bass: 99, mud: -99, bright: 99 });
check('EQ : valeurs bornées', p.bass === 12 && p.mud === -12 && p.bright === 12);
check('Préréglages : bass > bounce en graves', EQ_PRESETS.bass.bass > EQ_PRESETS.bounce.bass);

// Langues
check('tr fr : inchangé', tr('Accueil', 'fr') === 'Accueil');
check('tr en : exact', tr('Accueil', 'en') === 'Home');
check('tr en : espaces conservés', tr('  Réglages \n', 'en') === '  Settings \n');
check('tr en : pluriel', tr('1 titres', 'en') === '1 track' && tr('12 titres', 'en') === '12 tracks');
check('tr en : regex recos', tr('Parce que tu écoutes A, B · actualisé il y a 5 min · prochaine mise à jour dans 115 min', 'en') === 'Because you listen to A, B · updated 5 min ago · next update in 115 min');
check('tr en : verdict', tr('Trop de Low', 'en') === 'Too much Low' && tr('Manque de High', 'en') === 'Lacking High');
check('tr en : inconnu inchangé', tr('Skrillex', 'en') === 'Skrillex');
check('tr : langue inconnue = fr', tr('Accueil', 'xx') === 'Accueil');
check('langues déclarées', !!LANGS.fr && !!LANGS.en);

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1); }
console.log('\nTests EQ / langues OK');
