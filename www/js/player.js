// SPOTI NOX - lecteur : file d'attente, aleatoire, repetition, bascule analyse / lecture simple
import * as api from './api.js';
import { store } from './store.js';
import { Analyzer } from './analyzer.js';
import { YTEngine, findVideo, YTQuotaError } from './yt.js';

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

export class Player {
  // elA : <audio crossorigin> branche sur l'analyseur ; elP : <audio> simple (sources sans CORS)
  constructor(elA, elP, ytSlot = null) {
    this.elA = elA;
    this.elP = elP;
    this.el = elA;
    this.analyzer = new Analyzer(elA);
    this.queue = [];
    this.order = [];
    this.pos = -1;
    this.shuffle = false;
    this.repeat = 'off';       // off | all | one
    this.current = null;
    this.analyzable = true;
    this.counted = false;
    this.seq = 0;
    this.blob = null;
    this.h = {};
    // Lecteur YouTube integre : expose la meme forme qu'un <audio> pour reutiliser toute la logique
    this.yt = ytSlot ? new YTEngine(ytSlot) : null;
    const self = this;
    this.ytEl = {
      get src() { return 'youtube'; },
      get paused() { return self.yt.paused; },
      get currentTime() { return self.yt.time; },
      set currentTime(v) { self.yt.seek(v); },
      get duration() { return self.yt.duration; },
      play() { self.yt.play(); return Promise.resolve(); },
      pause() { self.yt.pause(); },
      getAttribute() { return null; }
    };
    if (this.yt) {
      this.yt.onstate = (st) => {
        if (this.el !== this.ytEl) return;
        if (st === 0) this.onEnded(); else this.emit('state');
      };
      this.yt.ontime = () => { if (this.el === this.ytEl) this.onTime(); };
      this.yt.onerror = () => { if (this.el === this.ytEl) this.onYTError(); };
    }
    this.setVolume(store.s.settings.volume);

    [elA, elP].forEach((el) => {
      el.addEventListener('ended', () => { if (el === this.el) this.onEnded(); });
      el.addEventListener('timeupdate', () => { if (el === this.el) this.onTime(); });
      el.addEventListener('loadedmetadata', () => { if (el === this.el) this.emit('time'); });
      el.addEventListener('play', () => { if (el === this.el) this.emit('state'); });
      el.addEventListener('pause', () => { if (el === this.el) this.emit('state'); });
      el.addEventListener('error', () => { if (el === this.el) this.onError(); });
    });
  }

  on(evt, fn) { (this.h[evt] = this.h[evt] || []).push(fn); }
  emit(evt, data) { (this.h[evt] || []).forEach((f) => f(data)); }

  get playing() { return !!this.el.src && !this.el.paused; }
  get time() { return this.el.currentTime || 0; }
  get duration() {
    const d = this.el.duration;
    return Number.isFinite(d) && d > 0 ? d : (this.current ? this.current.duration : 0);
  }

  setVolume(v) {
    this.volume = v;
    this.elA.volume = v;
    this.elP.volume = v;
    if (this.yt) this.yt.setVolume(v);
  }

  seek(t) { if (this.el.src) this.el.currentTime = t; }

  toggle() {
    if (!this.current) return;
    if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause();
  }

  // Demarre la lecture d'une liste a partir de l'index donne
  playList(tracks, index = 0) {
    this.queue = tracks.slice();
    this.buildOrder(index);
    return this.loadAt(index);
  }

  buildOrder(first) {
    const idx = this.queue.map((_, i) => i);
    if (this.shuffle) {
      shuffleArr(idx);
      idx.splice(idx.indexOf(first), 1);
      idx.unshift(first);
    }
    this.order = idx;
    this.pos = this.order.indexOf(first);
  }

  setShuffle(on) {
    this.shuffle = on;
    if (this.queue.length) {
      const cur = this.order[this.pos] ?? 0;
      this.buildOrder(cur);
    }
    this.emit('mode');
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this.emit('mode');
  }

  enqueue(track, next = false) {
    this.queue.push(track);
    const qi = this.queue.length - 1;
    if (next && this.pos >= 0) this.order.splice(this.pos + 1, 0, qi); else this.order.push(qi);
    this.emit('queue');
  }

  loadAt(qi) {
    this.pos = this.order.indexOf(qi);
    return this.load(this.queue[qi]);
  }

  next(auto = false) {
    if (!this.queue.length) return;
    let p = this.pos + 1;
    if (p >= this.order.length) {
      if (this.repeat === 'all' || !auto) p = 0;
      else { this.el.pause(); return; }
    }
    return this.loadAt(this.order[p]);
  }

  prev() {
    if (!this.queue.length) return;
    if (this.time > 3) { this.seek(0); return; }
    let p = this.pos - 1;
    if (p < 0) p = this.order.length - 1;
    return this.loadAt(this.order[p]);
  }

  onEnded() {
    if (this.repeat === 'one') { this.el.currentTime = 0; this.el.play().catch(() => {}); return; }
    this.next(true);
  }

  onTime() {
    if (!this.counted && this.current) {
      const need = Math.min(15, (this.duration || 30) * 0.4);
      if (this.time >= need) { this.counted = true; this.emit('listen', this.current); }
    }
    this.emit('time');
  }

  async onError() {
    const t = this.current;
    if (!t || !this.el.getAttribute('src')) return;
    // 1) lien d'extrait Deezer expire : on le renouvelle une fois
    if (t.src === 'deezer' && !this.retriedDz) {
      this.retriedDz = true;
      try { await api.refreshPreview(t); return this.load(t, true); } catch (e) { /* suite */ }
    }
    // 2) source sans CORS : lecture simple, sans analyse
    if (this.el === this.elA && !this.fellBack) {
      this.fellBack = true;
      return this.load(t, true, true);
    }
    this.emit('error', t);
    if (this.queue.length > 1) setTimeout(() => this.next(true), 1200);
  }

  get ytReady() { return !!(this.yt && store.s.settings.ytKey); }

  // Titre complet via YouTube pour les titres qui n'ont qu'un extrait de 30 s
  async loadYT(track, seq) {
    try {
      const id = await findVideo(store.s.settings.ytKey, track);
      if (seq !== this.seq) return true;
      await this.yt.load(id);
      if (seq !== this.seq) { this.yt.stop(); return true; }
    } catch (e) {
      if (seq !== this.seq) return true;
      this.emit('ytfail', e instanceof YTQuotaError ? 'quota' : 'error');
      return false;
    }
    this.elA.pause(); this.elA.removeAttribute('src'); this.elA.load();
    this.elP.pause(); this.elP.removeAttribute('src'); this.elP.load();
    if (this.blob) { URL.revokeObjectURL(this.blob); this.blob = null; }
    this.el = this.ytEl;
    this.analyzable = false;
    this.analyzer.active = false;
    this.emit('yt', true);
    this.emit('analysis', false);
    this.yt.play();
    this.emit('state');
    return true;
  }

  // Erreur du lecteur YouTube (video non integrable, supprimee...) : on retombe sur l'extrait
  onYTError() {
    const t = this.current;
    if (!t || this.ytFailed === t.id) return;
    this.ytFailed = t.id;
    this.emit('ytfail', 'embed');
    this.load(t, true, false, false, true);
  }

  async load(track, isRetry = false, forcePlain = false, forceYT = false, skipYT = false) {
    const seq = ++this.seq;
    forceYT = forceYT || this.forceYT;
    this.forceYT = false;
    if (!isRetry) { this.retriedDz = false; this.fellBack = false; this.ytFailed = null; }
    this.current = track;
    this.counted = false;
    this.emit('track', track);

    let resolveErr = null;
    try {
      await api.resolve(track);
      if (!track.url) throw new Error('Aucune source audio');
    } catch (e) { resolveErr = e; }
    if (seq !== this.seq) return;

    // YouTube : titres sans version complete (extrait 30 s, introuvables), ou demande explicite
    const useYT = this.ytReady && !skipYT && !forcePlain
      && (forceYT || ((store.s.settings.ytAuto !== false) && !(track.full && track.url)));
    if (useYT) {
      if (await this.loadYT(track, seq)) return;
      if (seq !== this.seq) return;
    }
    if (resolveErr || !track.url) {
      this.emit('error', track);
      return;
    }
    if (this.yt) { this.yt.stop(); this.emit('yt', false); }

    let el = this.elA;
    let src = track.url;
    let analyzable = true;
    if (forcePlain) { el = this.elP; analyzable = false; }
    else if (track.src === 'deezer') {
      if (isNative()) { el = this.elP; analyzable = false; }
      else {
        try {
          const r = await fetch(track.url);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          if (seq !== this.seq) return;
          src = URL.createObjectURL(await r.blob());
        } catch (e) { el = this.elP; analyzable = false; }
      }
    }
    if (seq !== this.seq) return;

    // coupe l'autre element
    const other = el === this.elA ? this.elP : this.elA;
    other.pause();
    other.removeAttribute('src');
    other.load();
    if (this.blob) { URL.revokeObjectURL(this.blob); this.blob = null; }
    if (src.startsWith('blob:')) this.blob = src;

    this.el = el;
    this.analyzable = analyzable;
    this.analyzer.active = analyzable && el === this.elA;
    if (el === this.elA) {
      try { await this.analyzer.init(); await this.analyzer.resume(); } catch (e) { this.analyzer.error = e; }
    }
    if (store.s.settings.resetOnTrack) this.analyzer.resetMeters();
    this.emit('analysis', this.analyzer.active);

    el.src = src;
    try { await el.play(); } catch (e) { /* lecture bloquee : l'utilisateur appuiera sur play */ }
    this.emit('state');
  }
}
