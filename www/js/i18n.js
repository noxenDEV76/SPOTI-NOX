// SPOTI NOX - langues. Le texte source de l'app est en francais ; l'anglais est applique par-dessus
// (textes statiques ET generes dynamiquement) grace a un petit traducteur de DOM.
// Pour ajouter une langue : ajouter un dictionnaire dans LANGS (cle = texte francais exact).
import { store } from './store.js';

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const EN_PAIRS = {
  // navigation
  'Accueil': 'Home', 'Recherche': 'Search', 'Top France': 'Top France', 'Top Global': 'Top Global',
  'Hits du moment': 'Trending now', 'Électro': 'Electronic', 'Pour toi': 'For you', 'Bibliothèque': 'Library',
  'Biblio': 'Library', 'Tops': 'Charts', 'Réglages': 'Settings', 'Sans pub · Sans compte': 'No ads · No account',
  'Nouvelle playlist': 'New playlist', 'Retour': 'Back', 'Titre, artiste, album…': 'Title, artist, album…',
  // panneau
  'Artiste': 'Artist', 'Analyse live': 'Live analysis', "Lance un titre pour voir les infos de l'artiste.": 'Play a track to see the artist info.',
  'Loudness': 'Loudness', 'Momentané': 'Momentary', 'Court terme': 'Short-term', 'Intégré': 'Integrated', 'True Peak': 'True Peak', 'Max': 'Max',
  'Repère streaming courant : ≈ −14 LUFS · crête ≤ −1 dBTP': 'Typical streaming target: ≈ −14 LUFS · peak ≤ −1 dBTP',
  'Zones de fréquences': 'Frequency zones',
  'Écart par rapport à une courbe de référence (−4,5 dB/octave). Indicatif.': 'Deviation from a reference curve (−4.5 dB/octave). Indicative only.',
  'Équilibré': 'Balanced',
  // lecteur
  'Rien en lecture': 'Nothing playing', 'Choisis un son': 'Pick a track', "J'aime": 'Like', 'Aléatoire': 'Shuffle', 'Précédent': 'Previous',
  'Lecture / pause': 'Play / pause', 'Suivant': 'Next', 'Répéter': 'Repeat', 'Répéter le titre': 'Repeat track', 'Répéter la liste': 'Repeat list',
  'Ajouter à une playlist': 'Add to a playlist', 'Écouter en entier sur YouTube': 'Play the full track on YouTube',
  'Écouter en entier sur YouTube (ouvre ton navigateur)': 'Play the full track on YouTube', 'Télécharger': 'Download', "File d'attente": 'Queue',
  'Ajouter à la file': 'Add to queue', 'Retirer': 'Remove', 'Lecteur YouTube': 'YouTube player',
  'YouTube · titre complet': 'YouTube · full track', 'lecteur officiel, pubs possibles': 'official player, ads possible',
  // vues
  'Bonne nuit': 'Good night', 'Bonjour': 'Good morning', 'Bonsoir': 'Good evening',
  'Les titres les plus écoutés en France': 'Most played tracks in France', 'Le classement mondial': 'The global chart',
  'Ce qui tourne en ce moment partout': "What's playing everywhere right now",
  'Tendances · titres complets': 'Trending · full tracks', 'Les morceaux qui montent sur Audius (écoute intégrale)': 'Rising tracks on Audius (full playback)',
  'Artistes électro': 'Electronic artists', 'Écoutés récemment': 'Recently played', 'Écoute intégrale, sans pub': 'Full playback, no ads',
  'Extraits de 30 s': '30 s previews', 'Dubstep · titres complets': 'Dubstep · full tracks', 'House · titres complets': 'House · full tracks',
  'Artistes indépendants, écoute intégrale': 'Independent artists, full playback', 'Top Électro': 'Top Electronic', 'Dance': 'Dance',
  'Écoute intégrale': 'Full playback', 'Artistes indépendants (Audius), écoute intégrale': 'Independent artists (Audius), full playback',
  'Classement': 'Chart', 'Fait pour toi': 'Made for you', 'Artistes': 'Artists', 'Titres': 'Tracks', 'Tout afficher': 'Show all',
  'Impossible de charger la musique. Vérifie ta connexion internet.': 'Could not load music. Check your internet connection.',
  'Réessayer': 'Retry',
  'Les artistes connus (Skrillex, David Guetta, Daft Punk…) sont disponibles en': 'Well-known artists (Skrillex, David Guetta, Daft Punk…) are available as',
  'extraits de 30 s': '30 s previews',
  ". Les titres marqués « Titre complet » viennent d'artistes indépendants et s'écoutent en entier.": '. Tracks tagged “Full track” come from independent artists and play in full.',
  'Tape un titre, un artiste ou un album.': 'Type a track, an artist or an album.',
  'Ajoute un Client ID Jamendo dans Réglages pour inclure encore plus de titres complets.': 'Add a Jamendo Client ID in Settings to include even more full tracks.',
  'Aucun résultat.': 'No results.', 'Tout lire': 'Play all', 'Lecture': 'Play', 'Historique': 'History', 'Playlist': 'Playlist',
  'Titres likés': 'Liked tracks', "Appuie sur le cœur d'un titre pour le retrouver ici.": 'Tap the heart on a track to find it here.',
  'Playlist introuvable.': 'Playlist not found.', 'Playlist vide : ajoute des titres avec le bouton +.': 'Empty playlist: add tracks with the + button.',
  'Importer de Spotify': 'Import from Spotify', 'Tes playlists, en quelques clics': 'Your playlists, in a few clicks',
  'Crée la tienne': 'Create your own', 'Renommer': 'Rename', 'Supprimer': 'Delete', 'Renommer la playlist': 'Rename playlist',
  'Actualiser maintenant': 'Refresh now', 'Aucun titre ici pour le moment.': 'No tracks here yet.', 'Aucun titre disponible.': 'No tracks available.',
  'Titres populaires': 'Popular tracks', 'Artistes similaires': 'Similar artists', 'Page officielle': 'Official page', 'Voir la page': 'View page',
  'Artiste vérifié ✔': 'Verified artist ✔', 'vérifié': 'verified',
  "Pas d'infos pour cet artiste.": 'No info for this artist.', 'Chargement…': 'Loading…', 'Infos indisponibles pour le moment.': 'Info not available right now.',
  'Fans Deezer': 'Deezer fans', 'Abonnés Audius': 'Audius followers', 'Auditeurs Last.fm': 'Last.fm listeners', 'Écoutes Last.fm': 'Last.fm plays',
  'Albums': 'Albums', 'Titres Audius': 'Audius tracks', 'Abonnements': 'Following',
  'Ajoute une clé Last.fm gratuite dans Réglages pour voir auditeurs et écoutes.': 'Add a free Last.fm key in Settings to see listeners and play counts.',
  // badges
  'À retrouver…': 'Looking up…', 'Introuvable': 'Not found', 'Titre complet': 'Full track', 'Extrait 30 s': '30 s preview',
  // modales
  'Ajouter à une playlist ': 'Add to a playlist', "Tu n'as pas encore de playlist.": "You don't have a playlist yet.", 'Fermer': 'Close', 'Annuler': 'Cancel',
  'Créer': 'Create', 'Valider': 'OK', 'Enregistrer': 'Save', 'Importer': 'Import', 'Exporter mes playlists': 'Export my playlists', 'Tout effacer': 'Erase everything',
  "File d'attente ": 'Queue', 'La file est vide.': 'The queue is empty.',
  'Importer depuis Spotify': 'Import from Spotify',
  "SPOTI NOX ne se connecte pas à ton compte : tu lui donnes un export de tes playlists, et il retrouve chaque titre tout seul (extrait de 30 s, ou titre complet quand l'artiste est sur Audius).":
    "SPOTI NOX doesn't connect to your account: you give it an export of your playlists and it finds each track by itself (30 s preview, or the full track when the artist is on Audius).",
  'Option officielle': 'Official option', 'Plus rapide': 'Faster',
  ': sur spotify.com/account/privacy, demande tes « Données du compte ». Spotify t\'envoie un zip par mail (ça peut prendre quelques jours). Choisis ensuite les fichiers':
    ': on spotify.com/account/privacy, request your “Account data”. Spotify emails you a zip (it can take a few days). Then pick the files',
  '(et suivants) et': '(and following) and',
  ': un outil comme Exportify exporte tes playlists en fichiers': ': a tool like Exportify exports your playlists as',
  // reglages
  'Clé Last.fm (facultative)': 'Last.fm key (optional)', 'Pour afficher auditeurs et écoutes des artistes': 'To show artists’ listeners and play counts',
  'Client ID Jamendo (facultatif)': 'Jamendo Client ID (optional)', 'Ajoute les titres complets Jamendo à la recherche': 'Adds full Jamendo tracks to search',
  'Clé API YouTube (facultative, titres complets)': 'YouTube API key (optional, full tracks)', 'Clé YouTube Data API v3 (gratuite)': 'YouTube Data API v3 key (free)',
  "Jouer automatiquement la version YouTube quand je n'ai qu'un extrait de 30 s": 'Automatically play the YouTube version when I only have a 30 s preview',
  'Remettre le loudness à zéro à chaque nouveau titre': 'Reset loudness at every new track',
  'Mes artistes préférés (séparés par des virgules)': 'My favourite artists (comma-separated)',
  'Appliquer à « Pour toi »': 'Apply to “For you”', 'Langue': 'Language', 'Automatique (langue de l\'appareil)': 'Automatic (device language)',
  'Son : égaliseur': 'Sound: equalizer',
  "Activer l'égaliseur": 'Enable equalizer', 'Préréglage': 'Preset',
  'Équilibré · lows bouncy + brillance': 'Balanced · bouncy lows + brightness', 'Neutre (sans traitement)': 'Flat (no processing)',
  'Bass boost': 'Bass boost', 'Brillant': 'Bright', 'Personnalisé': 'Custom',
  'Graves (Low)': 'Bass (Low)', 'Nettoyage des bas-médiums (≈ 320 Hz)': 'Low-mid cleanup (≈ 320 Hz)', 'Brillance (aigus)': 'Brightness (highs)',
  "S'applique aux titres passant par l'analyse (PC : tout sauf YouTube ; Android : Audius et Jamendo). Un limiteur évite la saturation. Le niveau mesuré à droite est celui que tu entends.":
    'Applies to tracks that go through the analyzer (PC: everything except YouTube; Android: Audius and Jamendo). A limiter prevents distortion. The level measured on the right is what you hear.',
  'Les clés Last.fm, Jamendo et YouTube sont gratuites (last.fm/api, devportal.jamendo.com, console.cloud.google.com → « YouTube Data API v3 ») et restent sur cet appareil. Avec YouTube, le lecteur officiel s\'affiche en entier, avec ses éventuelles pubs ; environ 100 titres différents par jour (les résultats sont mémorisés).':
    'The Last.fm, Jamendo and YouTube keys are free (last.fm/api, devportal.jamendo.com, console.cloud.google.com → “YouTube Data API v3”) and stay on this device. With YouTube, the official player is shown in full, with any ads it may have; about 100 different tracks per day (results are cached).',
  // toasts
  'Ajouté à la playlist': 'Added to the playlist', 'Déjà dans cette playlist': 'Already in this playlist', 'Choisis au moins un fichier': 'Choose at least one file',
  'Aucune playlist trouvée dans ces fichiers': 'No playlist found in these files', 'Fichier illisible': 'Unreadable file',
  'Réglages enregistrés': 'Settings saved', 'Écris au moins un artiste': 'Type at least one artist', 'Recherche de tes artistes…': 'Looking up your artists…',
  'Effacer playlists, favoris, historique et recommandations ?': 'Erase playlists, likes, history and recommendations?',
  'Données effacées': 'Data erased', 'Sauvegarde importée': 'Backup imported', 'Fichier invalide': 'Invalid file',
  'Téléchargement non autorisé pour ce titre': 'Download not allowed for this track', 'Téléchargement…': 'Downloading…', 'Téléchargé': 'Downloaded',
  'Échec du téléchargement': 'Download failed', 'Ajouté à tes titres likés': 'Added to your liked tracks', 'Retiré des titres likés': 'Removed from liked tracks',
  "Ajouté à la file d'attente": 'Added to the queue', 'Calcul de tes recommandations…': 'Computing your recommendations…',
  'Recommandations actualisées': 'Recommendations refreshed', 'Échec : réessaie dans un instant': 'Failed: try again in a moment',
  'Clé YouTube refusée ou quota du jour atteint : extrait de 30 s': 'YouTube key rejected or daily quota reached: 30 s preview',
  'Cette vidéo ne peut pas être lue ici : extrait de 30 s': "This video can't be played here: 30 s preview",
  'YouTube indisponible pour ce titre : extrait de 30 s': 'YouTube unavailable for this track: 30 s preview',
  'Lecture via le lecteur YouTube : loudness, True Peak et fréquences indisponibles (YouTube ne donne pas accès au signal audio).':
    'Playing through the YouTube player: loudness, True Peak and frequencies are unavailable (YouTube gives no access to the audio signal).',
  'Analyse indisponible pour ce titre : la source ne donne pas accès au signal audio.': 'Analysis unavailable for this track: the source gives no access to the audio signal.',
  "La mesure du loudness n'est pas disponible sur cet appareil.": 'Loudness measurement is not available on this device.',
  "Extrait de 30 s : les mesures portent uniquement sur l'extrait.": '30 s preview: measurements cover the preview only.',
  "à l'instant": 'just now',
  // import
  'Playlist Spotify': 'Spotify playlist', 'Spotify · Titres likés': 'Spotify · Liked tracks'
};

const EN_RULES = [
  [/^(\d+) titres?$/, (m) => `${m[1]} track${m[1] === '1' ? '' : 's'}`],
  [/^(.+) · titres complets$/, (m) => `${m[1]} · full tracks`],
  [/^Top (.+)$/, (m) => `Top ${m[1]}`],
  [/^il y a (\d+) min$/, (m) => `${m[1]} min ago`],
  [/^il y a (\d+) h (\d+)$/, (m) => `${m[1]} h ${m[2]} ago`],
  [/^(.+) abonnés$/, (m) => `${m[1]} followers`],
  [/^Ajouté à « (.+) »$/, (m) => `Added to “${m[1]}”`],
  [/^(\d+) playlist\(s\) importée\(s\), (\d+) titres$/, (m) => `${m[1]} playlist(s) imported, ${m[2]} tracks`],
  [/^Impossible de lire « (.+) »$/, (m) => `Unable to play “${m[1]}”`],
  [/^Résultats pour « (.+) »$/, (m) => `Results for “${m[1]}”`],
  [/^Impossible de charger cette page \((.+)\)\.$/, (m) => `Could not load this page (${m[1]}).`],
  [/^(\d+) artiste\(s\) pris en compte( · introuvable : .+)?$/, (m) => `${m[1]} artist(s) taken into account${m[2] ? m[2].replace(' · introuvable : ', ' · not found: ') : ''}`],
  [/^Trop de (.+)$/, (m) => `Too much ${m[1]}`],
  [/^Manque de (.+)$/, (m) => `Lacking ${m[1]}`],
  [/^(?:Parce que tu écoutes (.+?) · )?actualisé (.+?) · prochaine mise à jour dans (.+)$/, (m) => `${m[1] ? 'Because you listen to ' + m[1] + ' · ' : ''}updated ${m[2].replace(/^il y a (.+)$/, '$1 ago').replace("à l'instant", 'just now')} · next update in ${m[3]}`],
  [/^(?:Parce que tu écoutes (.+?)\. |Écoute quelques titres pour affiner\. )Actualisé (.+?) · prochaine mise à jour dans (.+)\.$/, (m) => `${m[1] ? 'Because you listen to ' + m[1] + '. ' : 'Listen to a few tracks to refine. '}Updated ${m[2].replace(/^il y a (.+)$/, '$1 ago').replace("à l'instant", 'just now')} · next update in ${m[3]}.`],
  [/^Supprimer « (.+) » \?$/, (m) => `Delete “${m[1]}”?`]
];

export const LANGS = {
  fr: { name: 'Français', locale: 'fr-FR' },
  en: { name: 'English', locale: 'en-US', pairs: EN_PAIRS, rules: EN_RULES }
};

const MAPS = {};
function mapFor(code) {
  if (!MAPS[code]) {
    MAPS[code] = new Map();
    Object.entries((LANGS[code] && LANGS[code].pairs) || {}).forEach(([k, v]) => MAPS[code].set(norm(k), v));
  }
  return MAPS[code];
}

export function detectLang() {
  const pref = store.s.settings.lang;
  if (pref && LANGS[pref]) return pref;
  const nav = String((typeof navigator !== 'undefined' && navigator.language) || 'fr').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'en';
}

export let lang = 'fr';
export const locale = () => LANGS[lang].locale;

// Traduit une chaine francaise (renvoie la meme chaine si pas de traduction ou langue = fr)
export function tr(s, code = lang) {
  if (code === 'fr' || !LANGS[code]) return s;
  const core = norm(s);
  if (!core) return s;
  let out = mapFor(code).get(core);
  if (out === undefined) {
    for (const [re, fn] of LANGS[code].rules || []) {
      const m = core.match(re);
      if (m) { out = fn(m); break; }
    }
  }
  if (out === undefined) return s;
  return s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);

function trNode(n) {
  if (n.nodeType === 3) {
    if (n.parentNode && SKIP.has(n.parentNode.nodeName)) return;
    const v = tr(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  } else if (n.nodeType === 1 && !SKIP.has(n.nodeName)) {
    ATTRS.forEach((a) => {
      if (n.hasAttribute(a)) { const o = n.getAttribute(a); const v = tr(o); if (v !== o) n.setAttribute(a, v); }
    });
    n.childNodes.forEach(trNode);
  }
}

let obs = null;
export function applyLang(code, root = document.body) {
  lang = LANGS[code] ? code : 'fr';
  document.documentElement.lang = lang;
  if (obs) { obs.disconnect(); obs = null; }
  if (lang === 'fr') return;
  trNode(root);
  obs = new MutationObserver((recs) => {
    recs.forEach((r) => {
      if (r.type === 'characterData') trNode(r.target);
      else if (r.type === 'attributes') trNode(r.target);
      else r.addedNodes.forEach(trNode);
    });
  });
  obs.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function initLang() { applyLang(detectLang()); return lang; }
