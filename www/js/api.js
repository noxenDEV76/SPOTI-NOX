// SPOTI NOX - sources musicales legales : Deezer (charts + extraits 30 s), Audius (titres complets),
// Jamendo (titres complets, cle gratuite optionnelle). Infos artistes : Deezer, Audius, MusicBrainz, Last.fm.
import { store } from './store.js';

export const APP_NAME = 'SPOTINOX';
const AU = 'https://api.audius.co/v1';
const DZ = 'https://api.deezer.com';
const JM = 'https://api.jamendo.com/v3.0';

const cache = new Map();
async function j(url, ttl = 300000) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < ttl) return c.v;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const v = await r.json();
  if (v && v.error) throw new Error(v.error.message || 'Erreur API');
  cache.set(url, { t: Date.now(), v });
  return v;
}

const auImg = (a) => (a && (a['480x480'] || a['1000x1000'] || a['150x150'])) || '';

// ---------- normalisation ----------
const dzTrack = (t) => ({
  id: 'dz:' + t.id, src: 'deezer', title: t.title_short || t.title,
  artist: (t.artist && t.artist.name) || '', artistId: t.artist && t.artist.id ? 'dz:' + t.artist.id : null,
  album: (t.album && t.album.title) || '',
  cover: (t.album && (t.album.cover_medium || t.album.cover_big)) || (t.artist && t.artist.picture_medium) || '',
  coverBig: (t.album && (t.album.cover_xl || t.album.cover_big)) || '',
  duration: t.duration || 30, url: t.preview || '', full: false, dl: null, genre: ''
});

const auTrack = (t) => ({
  id: 'au:' + t.id, src: 'audius', title: t.title,
  artist: (t.user && t.user.name) || '', artistId: t.user ? 'au:' + t.user.id : null,
  album: '', cover: auImg(t.artwork) || auImg(t.user && t.user.profile_picture),
  coverBig: (t.artwork && (t.artwork['1000x1000'] || t.artwork['480x480'])) || auImg(t.user && t.user.profile_picture),
  duration: t.duration || 0,
  url: `${AU}/tracks/${t.id}/stream?app_name=${APP_NAME}`, full: true,
  dl: (t.is_downloadable || (t.download && t.download.is_downloadable)) ? `${AU}/tracks/${t.id}/stream?app_name=${APP_NAME}` : null,
  genre: t.genre || ''
});

const jmTrack = (t) => ({
  id: 'jm:' + t.id, src: 'jamendo', title: t.name, artist: t.artist_name, artistId: 'jm:' + t.artist_id,
  album: t.album_name || '', cover: t.album_image || t.image || '', coverBig: t.album_image || t.image || '',
  duration: t.duration || 0, url: t.audio, full: true,
  dl: t.audiodownload_allowed ? t.audiodownload : null, genre: ''
});

const playable = (t) => !(t.access && t.access.stream === false) && t.is_streamable !== false;

// ---------- Deezer : charts ----------
export const DZ_PLAYLISTS = { france: 1109890291, global: 3155776842 };
export const DZ_GENRES = [
  { id: 116, name: 'Rap / Hip-Hop' }, { id: 132, name: 'Pop' }, { id: 113, name: 'Dance' },
  { id: 152, name: 'Rock' }, { id: 165, name: 'R&B' }, { id: 106, name: 'Électro' }
];

export async function dzChart(genre = 0, limit = 50) {
  const d = await j(`${DZ}/chart/${genre}/tracks?limit=${limit}`);
  return (d.data || []).map(dzTrack);
}
export async function dzPlaylistTracks(id, limit = 50) {
  const d = await j(`${DZ}/playlist/${id}/tracks?limit=${limit}`);
  return (d.data || []).map(dzTrack);
}
export const hits = () => dzChart(0, 50);

// Playlist de classement Deezer : on controle le titre (au cas ou l'identifiant changerait)
// puis on cherche par nom si besoin ; en dernier recours, le chart general.
async function dzChartPlaylist(id, query, re) {
  try {
    const meta = await j(`${DZ}/playlist/${id}`, 3600000);
    if (re.test(meta.title || '')) return await dzPlaylistTracks(id);
  } catch (e) { /* on tente la recherche */ }
  try {
    const s = await j(`${DZ}/search/playlist?q=${encodeURIComponent(query)}&limit=10`, 3600000);
    const hit = (s.data || []).find((p) => re.test(p.title || ''));
    if (hit) return await dzPlaylistTracks(hit.id);
  } catch (e) { /* secours */ }
  return dzChart(0, 50);
}
export const topFrance = () => dzChartPlaylist(DZ_PLAYLISTS.france, 'Top France', /france/i);
export const topGlobal = () => dzChartPlaylist(DZ_PLAYLISTS.global, 'Top Worldwide', /(worldwide|monde|global)/i);

// ---------- Audius ----------
export async function auTrending(genre = '', limit = 30, time = 'week') {
  const g = genre ? `&genre=${encodeURIComponent(genre)}` : '';
  const d = await j(`${AU}/tracks/trending?time=${time}&limit=${limit}${g}&app_name=${APP_NAME}`);
  return (d.data || []).filter(playable).map(auTrack);
}

// ---------- Artistes electro connus (recherche Deezer) ----------
export const ELECTRO_ARTISTS = [
  'Skrillex', 'David Guetta', 'Calvin Harris', 'Martin Garrix', 'Avicii', 'Daft Punk', 'deadmau5', 'Marshmello',
  'Kygo', 'Zedd', 'Tiësto', 'Alan Walker', 'Illenium', 'Porter Robinson', 'Fred again..', 'Swedish House Mafia',
  'Diplo', 'Flume', 'Disclosure', 'Justice', 'The Chainsmokers', 'Kaskade', 'Excision', 'Rezz'
];
export const AU_ELECTRO = ['Dubstep', 'House', 'Drum & Bass', 'Trap', 'Future Bass', 'Techno'];
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export async function dzArtistByName(name) {
  const d = await j(`${DZ}/search/artist?q=${encodeURIComponent(name)}&limit=5`, 24 * 3600 * 1000);
  const list = d.data || [];
  const a = list.find((x) => norm(x.name) === norm(name)) || list[0];
  return a ? { id: 'dz:' + a.id, src: 'deezer', name: a.name, pic: a.picture_medium || a.picture, fans: a.nb_fan } : null;
}
// Retrouve un artiste par son nom exact : Deezer d'abord, puis Audius
export async function findArtist(name) {
  try {
    const a = await dzArtistByName(name);
    if (a && norm(a.name) === norm(name)) return a;
  } catch (e) { /* on tente Audius */ }
  try {
    const d = await j(`${AU}/users/search?query=${encodeURIComponent(name)}&limit=5&app_name=${APP_NAME}`, 24 * 3600 * 1000);
    const u = (d.data || []).find((x) => norm(x.name) === norm(name));
    if (u) return { id: 'au:' + u.id, src: 'audius', name: u.name, pic: auImg(u.profile_picture), fans: u.follower_count };
  } catch (e) { /* introuvable */ }
  return null;
}

export async function electroArtists(n = 12) {
  const r = await Promise.allSettled(ELECTRO_ARTISTS.slice(0, n).map(dzArtistByName));
  const seen = new Set();
  return r.filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value).filter((a) => !seen.has(a.id) && seen.add(a.id));
}

// ---------- Jamendo (optionnel) ----------
export async function jmSearch(q, limit = 20) {
  const key = store.s.settings.jamendo;
  if (!key) return [];
  const d = await j(`${JM}/tracks/?client_id=${encodeURIComponent(key)}&format=json&limit=${limit}&search=${encodeURIComponent(q)}&audiodlformat=mp32&include=musicinfo`);
  return (d.results || []).map(jmTrack);
}

// ---------- Recherche ----------
function interleave(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) lists.forEach((l) => { if (l[i]) out.push(l[i]); });
  return out;
}

export async function search(q) {
  const enc = encodeURIComponent(q);
  const [dz, au, jm, dza, aua] = await Promise.allSettled([
    j(`${DZ}/search?q=${enc}&limit=25`).then((d) => (d.data || []).map(dzTrack)),
    j(`${AU}/tracks/search?query=${enc}&limit=25&app_name=${APP_NAME}`).then((d) => (d.data || []).filter(playable).map(auTrack)),
    jmSearch(q, 15),
    j(`${DZ}/search/artist?q=${enc}&limit=6`).then((d) => (d.data || []).map((a) => ({ id: 'dz:' + a.id, src: 'deezer', name: a.name, pic: a.picture_medium || a.picture, fans: a.nb_fan }))),
    j(`${AU}/users/search?query=${enc}&limit=6&app_name=${APP_NAME}`).then((d) => (d.data || []).map((u) => ({ id: 'au:' + u.id, src: 'audius', name: u.name, pic: auImg(u.profile_picture), fans: u.follower_count })))
  ]);
  const v = (r) => (r.status === 'fulfilled' ? r.value : []);
  // titres complets (Audius/Jamendo) en premier, puis extraits Deezer
  const tracks = interleave([v(au), v(jm), v(dz)]);
  const artists = interleave([v(dza), v(aua)]).slice(0, 8);
  return { tracks, artists };
}

// ---------- Lecture ----------
// Retrouve un titre (venu d'un export Spotify) : Audius en priorite (titre complet si l'artiste y est), sinon Deezer
export async function matchTrack(title, artist) {
  const t0 = title.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || title;
  const a0 = artist.split(/[;,&]|\bfeat\.|\bft\./i)[0].trim();
  try {
    const d = await j(`${AU}/tracks/search?query=${encodeURIComponent(a0 + ' ' + t0)}&limit=5&app_name=${APP_NAME}`, 600000);
    const hit = (d.data || []).filter(playable).find((x) => x.user && norm(x.user.name) === norm(a0)
      && (norm(x.title).includes(norm(t0)) || norm(t0).includes(norm(x.title))));
    if (hit) return auTrack(hit);
  } catch (e) { /* on passe a Deezer */ }
  const q1 = `artist:"${a0.replace(/"/g, '')}" track:"${t0.replace(/"/g, '')}"`;
  for (const q of [q1, `${a0} ${t0}`]) {
    try {
      const d = await j(`${DZ}/search?q=${encodeURIComponent(q)}&limit=5`, 600000);
      const list = d.data || [];
      const best = list.find((x) => norm(x.artist && x.artist.name) === norm(a0)) || list[0];
      if (best) return dzTrack(best);
    } catch (e) { /* essai suivant */ }
  }
  return null;
}

export async function resolve(t) {
  if (t.src === 'pending') {
    const m = await matchTrack(t.title, t.artist);
    if (!m) { t.src = 'missing'; store.save(); throw new Error('Introuvable'); }
    Object.assign(t, m);
    store.save();
    return t;
  }
  if (t.src === 'missing') throw new Error('Introuvable');
  if (t.src === 'deezer' && !t.url) {
    const d = await j(`${DZ}/track/${t.id.slice(3)}`, 60000);
    t.url = d.preview || '';
  }
  return t;
}
export async function refreshPreview(t) {
  if (t.src !== 'deezer') return t;
  const r = await fetch(`${DZ}/track/${t.id.slice(3)}`);
  const d = await r.json();
  t.url = d.preview || '';
  return t;
}

// ---------- Artistes ----------
const raw = (id) => id.slice(3);

export async function artistTop(id, limit = 20) {
  if (id.startsWith('dz:')) {
    const d = await j(`${DZ}/artist/${raw(id)}/top?limit=${limit}`);
    return (d.data || []).map(dzTrack);
  }
  if (id.startsWith('au:')) {
    const d = await j(`${AU}/users/${raw(id)}/tracks?limit=${limit}&sort=plays&app_name=${APP_NAME}`);
    return (d.data || []).filter(playable).map(auTrack);
  }
  if (id.startsWith('jm:')) {
    const key = store.s.settings.jamendo;
    if (!key) return [];
    const d = await j(`${JM}/tracks/?client_id=${encodeURIComponent(key)}&format=json&limit=${limit}&artist_id=${raw(id)}&order=popularity_total`);
    return (d.results || []).map(jmTrack);
  }
  return [];
}

export async function related(id, limit = 12) {
  if (!id.startsWith('dz:')) return [];
  const d = await j(`${DZ}/artist/${raw(id)}/related?limit=${limit}`);
  return (d.data || []).map((a) => ({ id: 'dz:' + a.id, src: 'deezer', name: a.name, pic: a.picture_medium, fans: a.nb_fan }));
}

let mbChain = Promise.resolve();
function mbFetch(url) {
  const p = mbChain.then(() => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('MB ' + r.status)))));
  mbChain = p.catch(() => {}).then(() => new Promise((res) => setTimeout(res, 1100)));
  return p;
}

const SOCIAL_HOSTS = [
  ['instagram.com', 'Instagram'], ['twitter.com', 'X'], ['x.com', 'X'], ['facebook.com', 'Facebook'],
  ['tiktok.com', 'TikTok'], ['youtube.com', 'YouTube'], ['soundcloud.com', 'SoundCloud'],
  ['bandcamp.com', 'Bandcamp'], ['snapchat.com', 'Snapchat']
];

async function musicBrainz(name) {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
  const s = await mbFetch(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=1`);
  const a = s.artists && s.artists[0];
  if (!a || (a.score || 0) < 90) return {};
  const out = { country: a.country || (a.area && a['iso-3166-1-codes'] && a['iso-3166-1-codes'][0]) || '', area: (a.area && a.area.name) || '' };
  try {
    const d = await mbFetch(`https://musicbrainz.org/ws/2/artist/${a.id}?inc=url-rels&fmt=json`);
    const links = [];
    (d.relations || []).forEach((r) => {
      const u = r.url && r.url.resource;
      if (!u) return;
      const host = SOCIAL_HOSTS.find(([h]) => u.includes(h));
      if (host && !links.some((l) => l.label === host[1])) links.push({ label: host[1], url: u });
    });
    out.socials = links;
  } catch (e) { /* liens facultatifs */ }
  return out;
}

async function lastfm(name) {
  const key = store.s.settings.lastfm;
  if (!key) return {};
  const d = await j(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(key)}&format=json`, 3600000);
  const st = d.artist && d.artist.stats;
  return st ? { listeners: Number(st.listeners), playcount: Number(st.playcount) } : {};
}

const infoCache = new Map();

function mergeExtras(v, x) {
  if (!x) return;
  if (x.country && !v.country) v.country = x.country;
  if (x.area && !v.area) v.area = x.area;
  if (x.listeners != null) v.listeners = x.listeners;
  if (x.playcount != null) v.playcount = x.playcount;
  (x.socials || []).forEach((l) => {
    v.socials = v.socials || [];
    if (!v.socials.some((o) => o.label === l.label)) v.socials.push(l);
  });
}

// Renvoie tout de suite les infos de base ; pays, reseaux et Last.fm arrivent ensuite via onUpdate(v)
export async function artistInfo(id, name, onUpdate) {
  const hit = infoCache.get(id);
  if (hit && Date.now() - hit.t < 24 * 3600 * 1000) {
    if (onUpdate) hit.subs.add(onUpdate);
    return hit.v;
  }
  let v;
  let extras = [];
  if (id.startsWith('dz:')) {
    const a = await j(`${DZ}/artist/${raw(id)}`, 3600000);
    v = { id, src: 'deezer', name: a.name, pic: a.picture_xl || a.picture_big || a.picture_medium, fans: a.nb_fan, albums: a.nb_album, link: a.link, socials: [] };
    extras = [lastfm(a.name), musicBrainz(a.name)];
  } else if (id.startsWith('au:')) {
    const d = await j(`${AU}/users/${raw(id)}?app_name=${APP_NAME}`, 3600000);
    const u = d.data;
    const socials = [];
    if (u.twitter_handle) socials.push({ label: 'X', url: `https://x.com/${u.twitter_handle}` });
    if (u.instagram_handle) socials.push({ label: 'Instagram', url: `https://instagram.com/${u.instagram_handle}` });
    if (u.tiktok_handle) socials.push({ label: 'TikTok', url: `https://tiktok.com/@${u.tiktok_handle}` });
    v = {
      id, src: 'audius', name: u.name, pic: (u.profile_picture && (u.profile_picture['1000x1000'] || u.profile_picture['480x480'])) || '',
      followers: u.follower_count, following: u.followee_count, tracks: u.track_count, verified: u.is_verified,
      area: u.location || '', link: `https://audius.co/${u.handle}`, bio: u.bio || '', socials
    };
    extras = [lastfm(u.name), musicBrainz(u.name)];
  } else {
    v = { id, src: 'jamendo', name: name || '', pic: '', socials: [] };
  }
  const entry = { t: Date.now(), v, subs: new Set(onUpdate ? [onUpdate] : []) };
  infoCache.set(id, entry);
  extras.forEach((p) => p.then((x) => {
    mergeExtras(v, x);
    entry.subs.forEach((f) => { try { f(v); } catch (e) { /* ignore */ } });
  }).catch(() => {}));
  return v;
}

export function countryName(code) {
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code.toUpperCase()); } catch (e) { return code; }
}
