// SPOTI NOX - stockage local (playlists, favoris, historique, profil d'ecoute, reglages)
const KEY = 'spotinox.v1';

const defaults = () => ({
  playlists: [],            // [{ id, name, tracks: [track] }]
  likes: [],                // [track]
  history: [],              // [{ t: track, at: timestamp }]
  profile: { artists: {}, genres: {} },
  recs: { items: [], ts: 0, because: [] },
  settings: { lastfm: '', jamendo: '', volume: 0.85, resetOnTrack: true, ytKey: '', ytAuto: true },
  ytCache: {}               // "artiste|titre" -> id de video YouTube
});

let state = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  state = Object.assign(defaults(), saved);
  state.settings = Object.assign(defaults().settings, saved.settings || {});
  state.profile = Object.assign(defaults().profile, saved.profile || {});
  state.recs = Object.assign(defaults().recs, saved.recs || {});
} catch (e) {
  state = defaults();
}

const subs = new Set();
let timer;

// On ne garde dans le stockage que l'essentiel d'un titre (les liens d'aperçu Deezer expirent)
export function slim(t) {
  return {
    id: t.id, src: t.src, title: t.title, artist: t.artist, artistId: t.artistId || null,
    album: t.album || '', cover: t.cover || '', coverBig: t.coverBig || '',
    duration: t.duration || 0, url: t.src === 'deezer' ? '' : t.url,
    full: !!t.full, dl: t.dl || null, genre: t.genre || ''
  };
}

export const store = {
  get s() { return state; },
  save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
      subs.forEach((f) => f());
    }, 150);
  },
  on(fn) { subs.add(fn); },
  uid() { return Math.random().toString(36).slice(2, 10); },
  isLiked(id) { return state.likes.some((t) => t.id === id); },
  toggleLike(t) {
    const i = state.likes.findIndex((x) => x.id === t.id);
    if (i >= 0) state.likes.splice(i, 1); else state.likes.unshift(slim(t));
    this.save();
    return i < 0;
  },
  createPlaylist(name) {
    const p = { id: this.uid(), name: name.trim() || 'Ma playlist', tracks: [] };
    state.playlists.push(p);
    this.save();
    return p;
  },
  addToPlaylist(pid, t) {
    const p = state.playlists.find((x) => x.id === pid);
    if (!p) return false;
    if (p.tracks.some((x) => x.id === t.id)) return false;
    p.tracks.push(slim(t));
    this.save();
    return true;
  },
  exportAll() {
    const { ytKey, ...settings } = state.settings;   // la cle YouTube n'est pas exportee
    return JSON.stringify({ playlists: state.playlists, likes: state.likes, settings }, null, 2);
  },
  importAll(json) {
    const d = JSON.parse(json);
    if (Array.isArray(d.playlists)) state.playlists = d.playlists;
    if (Array.isArray(d.likes)) state.likes = d.likes;
    if (d.settings) Object.assign(state.settings, d.settings);
    this.save();
  },
  wipe() {
    state = defaults();
    localStorage.removeItem(KEY);
    this.save();
  }
};
