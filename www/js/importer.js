// SPOTI NOX - import de playlists depuis un export Spotify (JSON officiel "Données du compte" ou CSV)
// Aucune connexion au compte : on lit les fichiers que tu choisis. Chaque titre est ensuite retrouvé
// sur Deezer / Audius au moment de l'ouverture de la playlist (voir api.resolve).
import { store } from './store.js';

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const pretty = (n) => n.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Playlist Spotify';

function pend(title, artist, durationMs) {
  return {
    id: 'sp:' + Math.random().toString(36).slice(2, 10), src: 'pending',
    title: String(title || '').trim(), artist: String(artist || '').replace(/\s*;\s*/g, ', ').trim(),
    artistId: null, album: '', cover: '', coverBig: '', duration: durationMs ? Math.round(Number(durationMs) / 1000) : 0,
    url: '', full: false, dl: null, genre: ''
  };
}

function clean(tracks) {
  const seen = new Set();
  return tracks.filter((t) => {
    if (!t.title) return false;
    const k = (t.title + '|' + t.artist).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Renvoie [{ name, tracks }] a partir du contenu d'un fichier
export function extractPlaylists(fileName, text) {
  const out = [];
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return out;

  if (t.startsWith('{') || t.startsWith('[')) {
    let d;
    try { d = JSON.parse(t); } catch (e) { return out; }
    if (Array.isArray(d.playlists)) {
      d.playlists.forEach((p) => {
        const tracks = clean((p.items || []).map((it) => it && it.track).filter(Boolean)
          .map((x) => pend(x.trackName || x.track, x.artistName || x.artist)));
        if (tracks.length) out.push({ name: p.name || pretty(fileName), tracks });
      });
    }
    if (Array.isArray(d.tracks)) {
      const tracks = clean(d.tracks.map((x) => pend(x.track || x.trackName, x.artist || x.artistName)));
      if (tracks.length) out.push({ name: 'Spotify · Titres likés', tracks });
    }
    return out;
  }

  const rows = parseCSV(t);
  if (rows.length < 2) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const ti = head.findIndex((h) => h === 'track name' || h === 'name' || h === 'title' || h === 'track');
  const ai = head.findIndex((h) => h.startsWith('artist'));
  const di = head.findIndex((h) => h.startsWith('duration'));
  if (ti < 0 || ai < 0) return out;
  const tracks = clean(rows.slice(1).map((r) => pend(r[ti], r[ai], di >= 0 ? r[di] : 0)));
  if (tracks.length) out.push({ name: pretty(fileName), tracks });
  return out;
}

const readText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(file);
});

export async function importFiles(files) {
  let playlists = 0;
  let tracks = 0;
  for (const f of files) {
    const found = extractPlaylists(f.name, await readText(f));
    for (const pl of found) {
      const p = store.createPlaylist(pl.name);
      p.tracks = pl.tracks;
      playlists++;
      tracks += pl.tracks.length;
    }
  }
  store.save();
  return { playlists, tracks };
}
