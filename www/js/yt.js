// SPOTI NOX - titre complet via le lecteur YouTube officiel integre (IFrame Player API).
// Le lecteur reste visible et intact (regle de YouTube) : pas de masquage, pas de flou, pas de blocage de pub.
// La recherche de la video passe par l'API YouTube Data v3 (cle gratuite a mettre dans Reglages).
import { store } from './store.js';

const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const BAD = /\b(live|cover|reaction|karaoke|slowed|sped ?up|nightcore|8d|reverb|instrumental|tutorial|lyrics? video|mashup|bass boosted|remix)\b/;

// Choisit la meilleure video parmi les resultats de recherche (fonction pure, testee)
export function pickBest(items, t) {
  const title = norm(String(t.title || '').replace(/\(.*?\)|\[.*?\]/g, ' '));
  const artist = norm(t.artist).split(',')[0].trim();
  const want = norm(t.title);
  let best = null;
  let bestScore = -1e9;
  (items || []).forEach((it, i) => {
    const id = it && it.id && (it.id.videoId || (typeof it.id === 'string' ? it.id : null));
    if (!id) return;
    const sn = it.snippet || {};
    const vt = norm(sn.title);
    const ch = norm(sn.channelTitle);
    let s = -i * 0.5;
    if (title && vt.includes(title)) s += 4;
    if (artist && (vt.includes(artist) || ch.includes(artist))) s += 3;
    if (/- topic$|vevo$|official/.test(ch)) s += 1.5;
    const m = vt.match(BAD);
    if (m && !want.includes(m[1])) s -= 4;
    if (s > bestScore) { bestScore = s; best = id; }
  });
  return best;
}

export class YTQuotaError extends Error {}

export async function findVideo(key, t) {
  const cache = (store.s.ytCache = store.s.ytCache || {});
  const ck = norm(t.artist) + '|' + norm(t.title);
  if (cache[ck]) return cache[ck];
  const q = encodeURIComponent(`${t.artist} ${t.title}`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=5&q=${q}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (r.status === 403 || r.status === 429) throw new YTQuotaError('Quota YouTube atteint ou clé refusée');
    throw new Error('YouTube HTTP ' + r.status);
  }
  const d = await r.json();
  const id = pickBest(d.items, t);
  if (!id) throw new Error('Aucune vidéo trouvée');
  const keys = Object.keys(cache);
  if (keys.length > 400) delete cache[keys[0]];
  cache[ck] = id;
  store.save();
  return id;
}

let apiPromise = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((res, rej) => {
    const fail = (m) => { apiPromise = null; rej(new Error(m)); };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => fail('YouTube inaccessible');
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) fail('YouTube ne répond pas'); }, 12000);
  });
  return apiPromise;
}

// Petit moteur qui expose la meme forme qu'un <audio> (paused, currentTime, duration, play, pause)
export class YTEngine {
  constructor(slot) {
    this.slot = slot;     // element qui accueillera l'iframe
    this.p = null;
    this.vol = 0.85;
    this.state = -1;
    this.timer = null;
    this.onstate = () => {};
    this.ontime = () => {};
    this.onerror = () => {};
  }

  async load(videoId) {
    await loadApi();
    if (this.p) { this.p.loadVideoById(videoId); return; }
    await new Promise((res, rej) => {
      const holder = document.createElement('div');
      this.slot.appendChild(holder);
      const to = setTimeout(() => rej(new Error('Lecteur YouTube trop lent')), 10000);
      this.p = new window.YT.Player(holder, {
        width: '100%', height: '100%', videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, controls: 1, fs: 1 },
        events: {
          onReady: () => { clearTimeout(to); try { this.p.setVolume(Math.round(this.vol * 100)); } catch (e) { /* ignore */ } res(); },
          onStateChange: (e) => this._st(e.data),
          onError: (e) => { clearTimeout(to); rej(new Error('YT ' + e.data)); this.onerror(e.data); }
        }
      });
    });
  }

  _st(s) {
    this.state = s;
    clearInterval(this.timer);
    if (s === 1) this.timer = setInterval(() => this.ontime(), 400);
    this.onstate(s);
  }

  get paused() { return !(this.state === 1 || this.state === 3); }
  get time() { try { return (this.p && this.p.getCurrentTime && this.p.getCurrentTime()) || 0; } catch (e) { return 0; } }
  get duration() { try { return (this.p && this.p.getDuration && this.p.getDuration()) || 0; } catch (e) { return 0; } }
  play() { try { this.p.playVideo(); } catch (e) { /* ignore */ } }
  pause() { try { this.p.pauseVideo(); } catch (e) { /* ignore */ } }
  seek(t) { try { this.p.seekTo(t, true); } catch (e) { /* ignore */ } }
  setVolume(v) { this.vol = v; try { if (this.p && this.p.setVolume) this.p.setVolume(Math.round(v * 100)); } catch (e) { /* ignore */ } }
  stop() {
    clearInterval(this.timer);
    this.state = -1;
    try { if (this.p && this.p.stopVideo) this.p.stopVideo(); } catch (e) { /* ignore */ }
  }
}
