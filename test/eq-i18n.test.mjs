import { tr, LANGS } from '../www/js/i18n.js';

let failed = 0;
const check = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${x}`); };

// Reglages audio : validation / migration
import { defaultAudio, validateAudio, presetBands, AUDIO_VERSION } from '../www/js/audio-settings.js';
import { EQ_PRESETS } from '../www/js/dsp.js';
let d = defaultAudio();
check('Audio : version', d.v === AUDIO_VERSION);
check('Audio : EQ par défaut = Flat, tous gains à 0', d.eq.preset === 'flat' && d.eq.bands.every((b) => b.gain === 0));
check('Audio : normalisation Normal −14 LUFS', d.norm.mode === 'normal' && d.norm.targets.normal === -14 && d.norm.targets.quiet === -19 && d.norm.targets.loud === -11);
check('Audio : limiteur −1 dBTP', d.limiter.on && d.limiter.ceiling === -1);
check('Audio : EQ intelligent désactivé par défaut', d.adaptive.mode === 'off');
let v = validateAudio(null);
check('validate(null) = défauts', JSON.stringify(v) === JSON.stringify(d));
v = validateAudio({ eq: { bands: 'nimp', preset: 'zzz' }, norm: { mode: 'x', targets: { normal: 99, quiet: 'a' } }, limiter: { ceiling: 50, release: -4 }, stereo: { width: 9, balance: -7, mono: 1 }, adaptive: { mode: 'foo', maxDb: 99 }, output: { sinkId: 42 } });
check('validate : préréglage inconnu → flat', v.eq.preset === 'flat');
check('validate : bandes invalides → défauts', v.eq.bands.length === d.eq.bands.length);
check('validate : cible bornée', v.norm.targets.normal === -5 && v.norm.targets.quiet === -19 && v.norm.mode === 'normal');
check('validate : plafond/relâchement bornés', v.limiter.ceiling === 0 && v.limiter.release === 10);
check('validate : stéréo bornée', v.stereo.width === 2 && v.stereo.balance === -1 && v.stereo.mono === true);
check('validate : adaptatif', v.adaptive.mode === 'off' && v.adaptive.maxDb === 4);
check('validate : sinkId non-texte ignoré', v.output.sinkId === '');
v = validateAudio({ eq: { bands: d.eq.bands.map((b) => ({ ...b, gain: 99, f: -5 })) } });
check('validate : gains/fréquences bornés', v.eq.bands.every((b) => b.gain <= 12 && b.f >= 10));
v = validateAudio({ eq: { user: { 'Mon son': d.eq.bands }, preset: 'Mon son' } });
check('validate : préréglage utilisateur conservé', v.eq.preset === 'Mon son' && presetBands(v, 'Mon son').length === d.eq.bands.length);
const j = JSON.parse(JSON.stringify(validateAudio({ eq: { preset: 'electronic' } })));
check('validate : idempotent après JSON', JSON.stringify(validateAudio(j)) === JSON.stringify(j));
check('Préréglages Spotify-like présents', ['flat', 'bassboost', 'bassreduction', 'vocal', 'treblereduction', 'bright', 'warm', 'electronic', 'acoustic'].every((k) => EQ_PRESETS[k]));

// Langues
check('tr fr : inchangé', tr('Accueil', 'fr') === 'Accueil');
check('tr en : exact', tr('Accueil', 'en') === 'Home');
check('tr en : espaces conservés', tr('  Réglages \n', 'en') === '  Settings \n');
check('tr en : pluriel', tr('1 titres', 'en') === '1 track' && tr('12 titres', 'en') === '12 tracks');
check('tr en : regex recos', tr('Parce que tu écoutes A, B · actualisé il y a 5 min · prochaine mise à jour dans 115 min', 'en') === 'Because you listen to A, B · updated 5 min ago · next update in 115 min');
check('tr en : verdict', tr('Trop de Low', 'en') === 'Too much Low' && tr('Manque de High', 'en') === 'Lacking High');
check('tr en : écran Audio', tr('Normalisation du volume', 'en') === 'Volume normalization' && tr('Décalages en cours : sub 0.00', 'en') === 'Current offsets: sub 0.00');
check('tr en : inconnu inchangé', tr('Skrillex', 'en') === 'Skrillex');
check('tr : langue inconnue = fr', tr('Accueil', 'xx') === 'Accueil');
check('langues déclarées', !!LANGS.fr && !!LANGS.en);

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1); }
console.log('\nTests EQ / langues OK');
