// Test de la lecture des exports Spotify (CSV et JSON)
import { parseCSV, extractPlaylists } from '../www/js/importer.js';

let failed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${extra}`);
};

// CSV style Exportify : guillemets, virgules et retours a la ligne dans les champs
const csv = '﻿"Track URI","Track Name","Album Name","Artist Name(s)","Duration (ms)"\n' +
  '"spotify:track:1","Bangarang (feat. Sirah)","Bangarang","Skrillex;Sirah","215000"\n' +
  '"spotify:track:2","Titre, avec virgule","Album ""X""","Daft Punk","300000"\r\n' +
  '"spotify:track:3","Bangarang (feat. Sirah)","Bangarang","Skrillex;Sirah","215000"\n';
const rows = parseCSV(csv.replace(/^﻿/, ''));
check('CSV : 4 lignes lues', rows.length === 4, `(${rows.length})`);
check('CSV : guillemets doubles', rows[2][2] === 'Album "X"');

let pl = extractPlaylists('Ma_Playlist_Electro.csv', csv);
check('CSV : une playlist nommée d\'après le fichier', pl.length === 1 && pl[0].name === 'Ma Playlist Electro', pl[0] && pl[0].name);
check('CSV : doublon retiré', pl[0].tracks.length === 2, `(${pl[0].tracks.length})`);
check('CSV : artistes séparés par une virgule', pl[0].tracks[0].artist === 'Skrillex, Sirah', pl[0].tracks[0].artist);
check('CSV : titres à retrouver', pl[0].tracks.every((t) => t.src === 'pending'));
check('CSV : durée en secondes', pl[0].tracks[0].duration === 215);

// JSON officiel "Données du compte"
const pj = JSON.stringify({ playlists: [{ name: 'Soirée', items: [
  { track: { trackName: 'Titre A', artistName: 'Artiste A', albumName: 'x', trackUri: 'spotify:track:a' } },
  { track: { trackName: 'Titre B', artistName: 'Artiste B' } },
  { episode: { name: 'podcast' } }
] }] });
pl = extractPlaylists('Playlist1.json', pj);
check('JSON : playlist avec son nom', pl.length === 1 && pl[0].name === 'Soirée');
check('JSON : 2 titres (épisode ignoré)', pl[0].tracks.length === 2);

const lib = JSON.stringify({ tracks: [{ artist: 'Skrillex', album: 'Scary', track: 'Scary Monsters', uri: 'spotify:track:z' }] });
pl = extractPlaylists('YourLibrary.json', lib);
check('JSON bibliothèque : titres likés', pl.length === 1 && pl[0].name === 'Spotify · Titres likés' && pl[0].tracks[0].artist === 'Skrillex');

check('Fichier invalide : aucune playlist', extractPlaylists('x.json', '{oops').length === 0 && extractPlaylists('x.csv', 'a,b\n1,2').length === 0);

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests d\'import passent.');
