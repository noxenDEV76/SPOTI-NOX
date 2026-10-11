// SPOTI NOX - recommandations personnelles, recalculees toutes les 2 h a partir de ce que tu ecoutes
import * as api from './api.js';
import { store, slim } from './store.js';

export const REFRESH_MS = 2 * 60 * 60 * 1000;

const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
};

// Appele quand un titre a ete reellement ecoute (> 15 s ou 40 %)
export function recordListen(t) {
  const s = store.s;
  s.history.unshift({ t: slim(t), at: Date.now() });
  s.history = s.history.slice(0, 300);
  if (t.artistId) {
    const a = s.profile.artists[t.artistId] || { id: t.artistId, name: t.artist, src: t.src, w: 0 };
    a.w += 1;
    a.name = t.artist;
    if (t.genre) a.genre = t.genre;
    s.profile.artists[t.artistId] = a;
  }
  if (t.genre) s.profile.genres[t.genre] = (s.profile.genres[t.genre] || 0) + 1;
  store.save();
}

function decayProfile() {
  const a = store.s.profile.artists;
  for (const k of Object.keys(a)) {
    a[k].w *= 0.92;
    if (a[k].w < 0.15) delete a[k];
  }
  const g = store.s.profile.genres;
  for (const k of Object.keys(g)) {
    g[k] *= 0.92;
    if (g[k] < 0.15) delete g[k];
  }
}

export async function refreshRecs() {
  const s = store.s;
  const heard = new Set(s.history.slice(0, 200).map((h) => h.t.id));
  s.likes.forEach((t) => heard.add(t.id));

  const seeds = Object.values(s.profile.artists)
    .map((a) => ({ ...a, score: a.w * (0.75 + Math.random() * 0.5) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 6);
  const topGenres = Object.entries(s.profile.genres).sort((a, b) => b[1] - a[1]).slice(0, 2).map((g) => g[0]);

  const cand = [];
  const because = [];

  await Promise.allSettled(seeds.map(async (seed) => {
    if (seed.id.startsWith('dz:')) {
      const rel = shuffle(await api.related(seed.id, 14)).slice(0, 4);
      because.push(seed.name);
      await Promise.allSettled(rel.map(async (r) => {
        const tops = shuffle(await api.artistTop(r.id, 8)).slice(0, 3);
        tops.forEach((t) => cand.push({ t, score: seed.score + Math.random() }));
      }));
    } else if (seed.id.startsWith('au:') || seed.id.startsWith('jm:')) {
      because.push(seed.name);
      const tops = shuffle(await api.artistTop(seed.id, 12)).slice(0, 3);
      tops.forEach((t) => cand.push({ t, score: seed.score * 0.8 + Math.random() }));
    }
  }));

  // titres complets tendance dans tes genres Audius
  await Promise.allSettled(topGenres.map(async (g) => {
    const tr = shuffle(await api.auTrending(g, 20)).slice(0, 5);
    tr.forEach((t) => cand.push({ t, score: 1 + Math.random() }));
  }));

  // exploration : quelques titres des charts pour ne pas t'enfermer
  try {
    const chart = shuffle(await api.hits()).slice(0, 4);
    chart.forEach((t) => cand.push({ t, score: 0.5 + Math.random() }));
  } catch (e) { /* ignore */ }

  // demarrage a froid : pas encore d'historique
  if (!seeds.length) {
    try { shuffle(await api.topFrance()).slice(0, 10).forEach((t) => cand.push({ t, score: 1 + Math.random() })); } catch (e) { /* ignore */ }
    try { shuffle(await api.auTrending('', 20)).slice(0, 10).forEach((t) => cand.push({ t, score: 1 + Math.random() })); } catch (e) { /* ignore */ }
  }

  const seen = new Set();
  const perArtist = {};
  const items = [];
  cand.sort((a, b) => b.score - a.score);
  for (const { t } of cand) {
    if (heard.has(t.id) || seen.has(t.id)) continue;
    const k = (t.title + '|' + t.artist).toLowerCase();
    if (seen.has(k)) continue;
    if ((perArtist[t.artistId] || 0) >= 3) continue;
    seen.add(t.id); seen.add(k);
    perArtist[t.artistId] = (perArtist[t.artistId] || 0) + 1;
    items.push(slim(t));
    if (items.length >= 30) break;
  }

  decayProfile();
  s.recs = { items: shuffle(items), ts: Date.now(), because: [...new Set(because)].slice(0, 4) };
  store.save();
  return s.recs;
}

export const nextRefreshAt = () => store.s.recs.ts + REFRESH_MS;

// Verifie toutes les minutes ; relance le calcul des qu'il s'est ecoule 2 h
export function scheduleRecs(onUpdate) {
  const check = async () => {
    if (Date.now() - store.s.recs.ts >= REFRESH_MS) {
      try { await refreshRecs(); onUpdate(); } catch (e) { /* reessaie a la prochaine verification */ }
    }
  };
  check();
  setInterval(check, 60000);
}
