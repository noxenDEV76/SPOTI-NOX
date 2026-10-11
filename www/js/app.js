// SPOTI NOX - interface et logique principale
import * as api from './api.js';
import { store } from './store.js';
import { Player } from './player.js';
import { BANDS } from './analyzer.js';
import { icon } from './icons.js';
import { recordListen, refreshRecs, scheduleRecs, seedArtist, REFRESH_MS } from './recs.js';
import { importFiles } from './importer.js';

// ---------- utilitaires ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (s) => { if (!Number.isFinite(s)) return '0:00'; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtN = (n) => (n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const fmtFull = (n) => new Intl.NumberFormat('fr-FR').format(n);
const bg = (u) => (u ? `background-image:url(&quot;${esc(u)}&quot;)` : '');
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hydrateIcons(root = document) {
  $$('[data-ic]', root).forEach((el) => {
    if (el.dataset.done) return;
    el.innerHTML = icon(el.dataset.ic, Number(el.dataset.s) || 20);
    el.dataset.done = '1';
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
function inDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

// ---------- registre des titres / listes (pour les clics) ----------
const T = new Map();
const LISTS = new Map();
let listSeq = 0;
const reg = (t) => { T.set(t.id, t); return t; };
function regList(tracks) {
  const k = 'l' + (++listSeq);
  tracks.forEach(reg);
  LISTS.set(k, tracks);
  if (LISTS.size > 80) LISTS.delete(LISTS.keys().next().value);
  return k;
}

// ---------- lecteur ----------
const player = new Player($('#audio-a'), $('#audio-p'));
window.__nox = { player, store, api }; // pratique pour le debug

// ---------- modales ----------
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="dlg">${html}</div>`;
  m.classList.remove('hidden');
  hydrateIcons(m);
  return m;
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

function askText(title, value = '', ok = 'Valider') {
  return new Promise((resolve) => {
    const m = openModal(`<h2>${esc(title)}</h2><input type="text" id="ask-in" value="${esc(value)}" maxlength="60"><div class="btns2"><button class="btn" data-x="no">Annuler</button><button class="btn pri" data-x="ok">${esc(ok)}</button></div>`);
    const inp = $('#ask-in', m);
    inp.focus(); inp.select();
    const done = (v) => { closeModal(); resolve(v); };
    m.onclick = (e) => { const x = e.target.closest('[data-x]'); if (x) done(x.dataset.x === 'ok' ? inp.value : null); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
  });
}

function pickPlaylist(track) {
  const pls = store.s.playlists;
  const m = openModal(`<h2>Ajouter à une playlist</h2><div class="pick">${pls.map((p) => `<button data-pid="${p.id}">${esc(p.name)} <small>${p.tracks.length} titres</small></button>`).join('') || '<p>Tu n\'as pas encore de playlist.</p>'}</div><div class="btns2"><button class="btn" data-x="no">Fermer</button><button class="btn pri" data-x="new">Nouvelle playlist</button></div>`);
  m.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pid) {
      const added = store.addToPlaylist(b.dataset.pid, track);
      closeModal();
      toast(added ? 'Ajouté à la playlist' : 'Déjà dans cette playlist');
    } else if (b.dataset.x === 'new') {
      closeModal();
      const name = await askText('Nouvelle playlist', '', 'Créer');
      if (name !== null) { const p = store.createPlaylist(name); store.addToPlaylist(p.id, track); toast(`Ajouté à « ${p.name} »`); }
    } else closeModal();
  };
}

function openSpotifyImport() {
  const m = openModal(`<h2>Importer depuis Spotify</h2>
    <p>SPOTI NOX ne se connecte pas à ton compte : tu lui donnes un export de tes playlists, et il retrouve chaque titre tout seul (extrait de 30 s, ou titre complet quand l'artiste est sur Audius).</p>
    <p><b>Option officielle</b> : sur spotify.com/account/privacy, demande tes « Données du compte ». Spotify t'envoie un zip par mail (ça peut prendre quelques jours). Choisis ensuite les fichiers <b>Playlist1.json</b> (et suivants) et <b>YourLibrary.json</b>.</p>
    <p><b>Plus rapide</b> : un outil comme Exportify exporte tes playlists en fichiers <b>.csv</b>.</p>
    <input type="file" id="sp-files" accept=".json,.csv,text/csv,application/json" multiple>
    <div class="btns2" style="margin-top:14px"><button class="btn" data-x="no">Fermer</button><button class="btn pri" data-x="go">Importer</button></div>`);
  m.onclick = async (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x !== 'go') { closeModal(); return; }
    const files = [...$('#sp-files', m).files];
    if (!files.length) { toast('Choisis au moins un fichier'); return; }
    try {
      const r = await importFiles(files);
      closeModal();
      toast(r.playlists ? `${r.playlists} playlist(s) importée(s), ${r.tracks} titres` : 'Aucune playlist trouvée dans ces fichiers');
      go('library', null, cur.name !== 'library');
    } catch (err) { toast('Fichier illisible'); }
  };
}

function openQueue() {
  const rows = player.order.map((qi, p) => ({ t: player.queue[qi], qi, p }));
  const m = openModal(`<h2>File d'attente</h2>${rows.length ? rows.map(({ t, qi, p }) => `<div class="qrow ${p === player.pos ? 'cur' : ''}" data-qi="${qi}"><small>${p + 1}</small><span>${esc(t.title)} — ${esc(t.artist)}</span><small>${t.full ? fmtT(t.duration) : '0:30'}</small></div>`).join('') : '<p>La file est vide.</p>'}<div class="btns2"><button class="btn" data-x="no">Fermer</button></div>`);
  m.onclick = (e) => {
    const r = e.target.closest('[data-qi]');
    if (r) { player.loadAt(Number(r.dataset.qi)); closeModal(); return; }
    if (e.target.closest('[data-x]')) closeModal();
  };
}

function openSettings() {
  const s = store.s.settings;
  const m = openModal(`<h2>Réglages</h2>
    <label>Clé Last.fm (facultative)</label>
    <input type="password" id="set-lfm" value="${esc(s.lastfm)}" placeholder="Pour afficher auditeurs et écoutes des artistes">
    <label>Client ID Jamendo (facultatif)</label>
    <input type="password" id="set-jm" value="${esc(s.jamendo)}" placeholder="Ajoute les titres complets Jamendo à la recherche">
    <label class="chk"><input type="checkbox" id="set-reset" ${s.resetOnTrack ? 'checked' : ''}> Remettre le loudness à zéro à chaque nouveau titre</label>
    <label>Mes artistes préférés (séparés par des virgules)</label>
    <textarea id="set-fav" rows="3" placeholder="PhatCap!, Wiz Khalifa, Skrillex…"></textarea>
    <div class="btns2" style="margin:0 0 10px"><button class="btn" data-x="seed">Appliquer à « Pour toi »</button></div>
    <p>Les clés Last.fm et Jamendo sont gratuites (last.fm/api, devportal.jamendo.com) et restent sur cet appareil.</p>
    <div class="btns2">
      <button class="btn" data-x="export">Exporter mes playlists</button>
      <button class="btn" data-x="import">Importer</button>
      <button class="btn danger" data-x="wipe">Tout effacer</button>
    </div>
    <div class="btns2"><button class="btn" data-x="no">Annuler</button><button class="btn pri" data-x="save">Enregistrer</button></div>
    <input type="file" id="imp-file" accept="application/json" class="hidden">`);
  m.onclick = async (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const k = x.dataset.x;
    if (k === 'save') {
      s.lastfm = $('#set-lfm', m).value.trim();
      s.jamendo = $('#set-jm', m).value.trim();
      s.resetOnTrack = $('#set-reset', m).checked;
      store.save(); closeModal(); toast('Réglages enregistrés');
    } else if (k === 'export') {
      const blob = new Blob([store.exportAll()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'spoti-nox-sauvegarde.json';
      document.body.appendChild(a); a.click(); a.remove();
    } else if (k === 'seed') {
      const names = $('#set-fav', m).value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 40);
      if (!names.length) { toast('Écris au moins un artiste'); return; }
      toast('Recherche de tes artistes…');
      const res = await Promise.allSettled(names.map((n) => api.findArtist(n)));
      const found = res.map((r, i) => (r.status === 'fulfilled' && r.value ? r.value : null));
      found.forEach((f) => {
        if (!f) return;
        const cur = store.s.profile.artists[f.id] || { id: f.id, name: f.name, src: f.src, w: 0 };
        cur.w = Math.max(cur.w, 4);
        store.s.profile.artists[f.id] = cur;
      });
      store.save();
      const missing = names.filter((n, i) => !found[i]);
      try { await refreshRecs(); } catch (err) { /* ignore */ }
      closeModal();
      toast(`${found.filter(Boolean).length} artiste(s) pris en compte${missing.length ? ' · introuvable : ' + missing.slice(0, 3).join(', ') : ''}`);
      if (cur.name === 'home' || cur.name === 'recs') render();
    } else if (k === 'import') $('#imp-file', m).click();
    else if (k === 'wipe') {
      if (confirm('Effacer playlists, favoris, historique et recommandations ?')) { store.wipe(); closeModal(); go('home', null, false); toast('Données effacées'); }
    } else closeModal();
  };
  $('#imp-file', m).onchange = async (e) => {
    try { store.importAll(await e.target.files[0].text()); closeModal(); toast('Sauvegarde importée'); render(); } catch (err) { toast('Fichier invalide'); }
  };
}

// ---------- gabarits ----------
const artistLink = (t) => (t.artistId ? `<a data-nav="artist:${esc(t.artistId)}">${esc(t.artist)}</a>` : esc(t.artist));

function cardHTML(t, key, i) {
  return `<div class="card" data-act="play" data-list="${key}" data-i="${i}" data-id="${esc(t.id)}">
    <div class="cov" style="${bg(t.cover)}"><span class="fab">${icon('play', 26)}</span></div>
    <b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>`;
}

function artistCardHTML(a) {
  return `<div class="card round-card" data-nav="artist:${esc(a.id)}">
    <div class="cov" style="${bg(a.pic)}"></div><b>${esc(a.name)}</b><span>${a.fans != null ? fmtN(a.fans) + (a.src === 'audius' ? ' abonnés' : ' fans') : 'Artiste'}</span></div>`;
}

function shelf(title, tracks, { sub = '', more = '' } = {}) {
  if (!tracks || !tracks.length) return '';
  const key = regList(tracks);
  return `<section class="shelf"><div class="shelf-h"><div><h2>${esc(title)}</h2>${sub ? `<small style="margin:0">${esc(sub)}</small>` : ''}</div>${more ? `<button class="link" data-nav="${esc(more)}">Tout afficher</button>` : ''}</div>
    <div class="row">${tracks.slice(0, 20).map((t, i) => cardHTML(t, key, i)).join('')}</div></section>`;
}

function artistShelf(title, artists, { sub = '', more = '', wrap = false } = {}) {
  if (!artists || !artists.length) return '';
  return `<section class="shelf"><div class="shelf-h"><div><h2>${esc(title)}</h2>${sub ? `<small style="margin:0">${esc(sub)}</small>` : ''}</div>${more ? `<button class="link" data-nav="${esc(more)}">Tout afficher</button>` : ''}</div>
    <div class="row" ${wrap ? 'style="flex-wrap:wrap;overflow:visible"' : ''}>${artists.map(artistCardHTML).join('')}</div></section>`;
}

function rowHTML(t, key, i, opts = {}) {
  const liked = store.isLiked(t.id);
  const badge = t.src === 'pending' ? '<span class="badge">À retrouver…</span>'
    : t.src === 'missing' ? '<span class="badge">Introuvable</span>'
      : `<span class="badge ${t.full ? 'full' : ''}">${t.full ? 'Titre complet' : 'Extrait 30 s'}</span>`;
  const dur = t.src === 'pending' || t.src === 'missing' ? (t.duration ? fmtT(t.duration) : '—') : (t.full ? fmtT(t.duration) : '0:30');
  return `<div class="trow ${player.current && player.current.id === t.id ? 'cur' : ''}" data-act="play" data-list="${key}" data-i="${i}" data-id="${esc(t.id)}">
    <div class="n"><span class="num">${i + 1}</span><span class="pl">${icon('play', 20)}</span></div>
    <div class="tc"><div class="th" style="${bg(t.cover)}"></div><div class="tt"><b>${esc(t.title)}</b><span>${artistLink(t)}</span></div></div>
    ${badge}
    <div class="tm">${dur}</div>
    <div class="ra">
      <button class="mini ${liked ? 'liked-on' : ''}" data-act="like" data-id="${esc(t.id)}" title="J'aime">${icon(liked ? 'heartfill' : 'heart', 18)}</button>
      <button class="mini" data-act="addpl" data-id="${esc(t.id)}" title="Ajouter à une playlist">${icon('plus', 18)}</button>
      <button class="mini" data-act="queue" data-id="${esc(t.id)}" title="Ajouter à la file">${icon('queue', 18)}</button>
      ${t.full ? '' : `<button class="mini" data-act="yt" data-id="${esc(t.id)}" title="Écouter en entier sur YouTube (ouvre ton navigateur)">${icon('globe', 18)}</button>`}
      ${t.dl ? `<button class="mini" data-act="dl" data-id="${esc(t.id)}" title="Télécharger">${icon('download', 18)}</button>` : ''}
      ${opts.pid ? `<button class="mini" data-act="rm" data-id="${esc(t.id)}" data-pid="${opts.pid}" title="Retirer">${icon('trash', 18)}</button>` : ''}
    </div></div>`;
}

function trackPage({ kind, title, sub, cover, tracks, extra = '', round = false, pid = null, empty = '' }) {
  const key = regList(tracks);
  return `<div class="hero ${round ? 'round' : ''}"><div class="cov" style="${bg(cover)}"></div>
    <div class="meta"><div class="kind">${esc(kind)}</div><h1>${esc(title)}</h1><p>${esc(sub || '')}</p></div></div>
    <div class="actions">
      <button class="btn pri" data-act="playall" data-list="${key}">${icon('play', 20)} Lecture</button>
      <button class="btn" data-act="shuffleall" data-list="${key}">${icon('shuffle', 20)} Aléatoire</button>
      ${extra}
    </div>
    ${tracks.length ? `<div class="tracks">${tracks.map((t, i) => rowHTML(t, key, i, { pid })).join('')}</div>` : `<div class="notice">${esc(empty || 'Aucun titre ici pour le moment.')}</div>`}`;
}

// ---------- fiche artiste (panneau + page) ----------
function statsHTML(a) {
  const s = [];
  if (a.fans != null) s.push(['Fans Deezer', fmtN(a.fans), fmtFull(a.fans)]);
  if (a.followers != null) s.push(['Abonnés Audius', fmtN(a.followers), fmtFull(a.followers)]);
  if (a.listeners != null) s.push(['Auditeurs Last.fm', fmtN(a.listeners), fmtFull(a.listeners)]);
  if (a.playcount != null) s.push(['Écoutes Last.fm', fmtN(a.playcount), fmtFull(a.playcount)]);
  if (a.albums != null) s.push(['Albums', String(a.albums), '']);
  if (a.tracks != null) s.push(['Titres Audius', String(a.tracks), '']);
  if (a.following != null) s.push(['Abonnements', fmtN(a.following), '']);
  const country = a.country
    ? `<div class="country"><img alt="" src="https://flagcdn.com/w40/${esc(a.country.toLowerCase())}.png" onerror="this.remove()"><span>${esc(api.countryName(a.country))}${a.area && !api.countryName(a.country).toLowerCase().includes(a.area.toLowerCase()) && !a.area.toLowerCase().includes(api.countryName(a.country).toLowerCase()) ? ' · ' + esc(a.area) : ''}</span></div>`
    : (a.area ? `<div class="country"><span>${icon('globe', 16)}</span><span>${esc(a.area)}</span></div>` : '');
  const hint = a.src === 'deezer' && a.listeners == null && !store.s.settings.lastfm
    ? '<p class="hint">Ajoute une clé Last.fm gratuite dans Réglages pour voir auditeurs et écoutes.</p>' : '';
  return `${country}<div class="stats">${s.map(([l, v, full]) => `<div class="stat" title="${esc(full)}"><label>${esc(l)}</label><b>${esc(v)}</b></div>`).join('')}</div>
    ${a.socials && a.socials.length ? `<div class="socials">${a.socials.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : ''}
    ${a.bio ? `<p class="bio">${esc(a.bio)}</p>` : ''}${hint}`;
}

function paneArtistHTML(a) {
  return `<div class="art-cover" style="${bg(a.pic)}"><div class="nm">${esc(a.name)}${a.verified ? ' <span class="vf">✔</span>' : ''}</div></div>
    <div class="box"><div id="pane-stats">${statsHTML(a)}</div><div class="actions" style="margin:12px 0 0"><button class="btn" data-nav="artist:${esc(a.id)}">Voir la page</button></div></div>`;
}

async function loadArtistPane(t) {
  const pane = $('#pane-artist');
  if (!t || !t.artistId) { pane.innerHTML = '<p class="muted pad">Pas d\'infos pour cet artiste.</p>'; return; }
  pane.innerHTML = `<div class="art-cover"><div class="nm">${esc(t.artist)}</div></div><div class="box"><div class="loading">Chargement…</div></div>`;
  const stillCurrent = () => player.current && player.current.artistId === t.artistId;
  try {
    const a = await api.artistInfo(t.artistId, t.artist, (v) => {
      const box = $('#pane-stats');
      if (stillCurrent() && box) box.innerHTML = statsHTML(v);
    });
    if (!stillCurrent()) return;
    pane.innerHTML = paneArtistHTML(a);
  } catch (e) {
    if (!stillCurrent()) return;
    pane.innerHTML = `<div class="art-cover"><div class="nm">${esc(t.artist)}</div></div><div class="box"><p class="muted" style="margin:0">Infos indisponibles pour le moment.</p></div>`;
  }
}

// ---------- vues ----------
const CHARTS = {
  france: { title: 'Top France', sub: 'Les titres les plus écoutés en France', load: api.topFrance },
  global: { title: 'Top Global', sub: 'Le classement mondial', load: api.topGlobal },
  hits: { title: 'Hits du moment', sub: 'Ce qui tourne en ce moment partout', load: api.hits },
  audius: { title: 'Tendances · titres complets', sub: 'Les morceaux qui montent sur Audius (écoute intégrale)', load: () => api.auTrending('', 50) }
};

const VIEWS = {
  async home() {
    const h = new Date().getHours();
    const hello = h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const [hits, fr, gl, au, rap, pop, elec, artists, dub, house] = await Promise.allSettled([
      api.hits(), api.topFrance(), api.topGlobal(), api.auTrending('', 30),
      api.dzChart(116, 20), api.dzChart(132, 20), api.dzChart(106, 20),
      api.electroArtists(12), api.auTrending('Dubstep', 20), api.auTrending('House', 20)
    ]);
    const v = (r) => (r.status === 'fulfilled' ? r.value : []);
    const recs = store.s.recs;
    const recent = [];
    const seen = new Set();
    store.s.history.forEach((x) => { if (!seen.has(x.t.id) && recent.length < 15) { seen.add(x.t.id); recent.push(x.t); } });

    const out = [`<h1>${hello}</h1>`];
    if (recs.items.length) {
      out.push(shelf('Pour toi', recs.items, {
        sub: `${recs.because.length ? 'Parce que tu écoutes ' + recs.because.join(', ') + ' · ' : ''}actualisé ${ago(recs.ts)} · prochaine mise à jour dans ${inDur(recs.ts + REFRESH_MS - Date.now())}`,
        more: 'recs'
      }));
    }
    out.push(artistShelf('Artistes électro', v(artists), { sub: 'Skrillex, David Guetta, Daft Punk…', more: 'electro' }));
    out.push(shelf('Écoutés récemment', recent));
    out.push(shelf('Hits du moment', v(hits), { more: 'chart:hits' }));
    out.push(shelf('Top France', v(fr), { more: 'chart:france' }));
    out.push(shelf('Top Global', v(gl), { more: 'chart:global' }));
    out.push(shelf('Tendances · titres complets', v(au), { sub: 'Écoute intégrale, sans pub', more: 'chart:audius' }));
    out.push(shelf('Électro', v(elec), { sub: 'Extraits de 30 s', more: 'chart:genre:106' }));
    out.push(shelf('Dubstep · titres complets', v(dub), { sub: 'Artistes indépendants, écoute intégrale', more: 'chart:au:Dubstep' }));
    out.push(shelf('House · titres complets', v(house), { sub: 'Artistes indépendants, écoute intégrale', more: 'chart:au:House' }));
    out.push(shelf('Rap / Hip-Hop', v(rap), { sub: 'Extraits de 30 s', more: 'chart:genre:116' }));
    out.push(shelf('Pop', v(pop), { sub: 'Extraits de 30 s', more: 'chart:genre:132' }));
    if (out.length <= 2 && ![hits, fr, gl, au].some((r) => r.status === 'fulfilled')) {
      return `<h1>${hello}</h1><div class="notice">Impossible de charger la musique. Vérifie ta connexion internet.</div><div class="actions"><button class="btn pri" data-act="retry">Réessayer</button></div>`;
    }
    return out.join('');
  },

  async electro() {
    const res = await Promise.allSettled([
      api.electroArtists(24), api.dzChart(106, 30), api.dzChart(113, 30),
      ...api.AU_ELECTRO.map((g) => api.auTrending(g, 20))
    ]);
    const v = (r) => (r.status === 'fulfilled' ? r.value : []);
    const [artists, elec, dance, ...au] = res;
    const out = [`<h1>Électro</h1><div class="notice">Les artistes connus (Skrillex, David Guetta, Daft Punk…) sont disponibles en <b>extraits de 30 s</b>. Les titres marqués « Titre complet » viennent d'artistes indépendants et s'écoutent en entier.</div>`];
    out.push(artistShelf('Artistes', v(artists), { wrap: true }));
    out.push(shelf('Top Électro', v(elec), { sub: 'Extraits de 30 s', more: 'chart:genre:106' }));
    out.push(shelf('Dance', v(dance), { sub: 'Extraits de 30 s', more: 'chart:genre:113' }));
    api.AU_ELECTRO.forEach((g, i) => out.push(shelf(`${g} · titres complets`, v(au[i]), { sub: 'Écoute intégrale', more: `chart:au:${g}` })));
    return out.join('');
  },

  async chart(arg) {
    if (arg && arg.startsWith('au:')) {
      const g = arg.slice(3);
      const tracks = await api.auTrending(g, 50);
      return trackPage({ kind: 'Classement', title: `${g} · titres complets`, sub: 'Artistes indépendants (Audius), écoute intégrale', cover: tracks[0] && (tracks[0].coverBig || tracks[0].cover), tracks });
    }
    if (arg && arg.startsWith('genre:')) {
      const id = Number(arg.slice(6));
      const g = api.DZ_GENRES.find((x) => x.id === id) || { name: 'Genre' };
      const tracks = await api.dzChart(id, 50);
      return trackPage({ kind: 'Classement', title: `Top ${g.name}`, sub: 'Extraits de 30 s', cover: tracks[0] && tracks[0].coverBig, tracks });
    }
    const c = CHARTS[arg] || CHARTS.hits;
    const tracks = await c.load();
    return trackPage({ kind: 'Classement', title: c.title, sub: c.sub, cover: tracks[0] && (tracks[0].coverBig || tracks[0].cover), tracks });
  },

  async recs() {
    const r = store.s.recs;
    if (!r.items.length) await refreshRecs();
    const rr = store.s.recs;
    const tracks = rr.items;
    return trackPage({
      kind: 'Fait pour toi', title: 'Pour toi',
      sub: `${rr.because.length ? 'Parce que tu écoutes ' + rr.because.join(', ') + '. ' : 'Écoute quelques titres pour affiner. '}Actualisé ${ago(rr.ts)} · prochaine mise à jour dans ${inDur(rr.ts + REFRESH_MS - Date.now())}.`,
      cover: tracks[0] && (tracks[0].coverBig || tracks[0].cover), tracks,
      extra: `<button class="btn" data-act="refresh-recs">${icon('refresh', 20)} Actualiser maintenant</button>`
    });
  },

  async search(q) {
    if (!q) {
      return `<h1>Recherche</h1><p class="muted">Tape un titre, un artiste ou un album.</p>
        <div class="chips">${api.DZ_GENRES.map((g) => `<button class="chip" data-nav="chart:genre:${g.id}">${esc(g.name)}</button>`).join('')}</div>`;
    }
    const { tracks, artists } = await api.search(q);
    const key = regList(tracks);
    const jmHint = store.s.settings.jamendo ? '' : '<p class="hint">Ajoute un Client ID Jamendo dans Réglages pour inclure encore plus de titres complets.</p>';
    return `<h1>Résultats pour « ${esc(q)} »</h1>
      ${artists.length ? `<section class="shelf"><div class="shelf-h"><h2>Artistes</h2></div><div class="row">${artists.map(artistCardHTML).join('')}</div></section>` : ''}
      <section class="shelf"><div class="shelf-h"><h2>Titres</h2></div>
      ${tracks.length ? `<div class="actions"><button class="btn pri" data-act="playall" data-list="${key}">${icon('play', 20)} Tout lire</button><button class="btn" data-act="shuffleall" data-list="${key}">${icon('shuffle', 20)} Aléatoire</button></div>
      <div class="tracks">${tracks.map((t, i) => rowHTML(t, key, i)).join('')}</div>` : '<div class="notice">Aucun résultat.</div>'}${jmHint}</section>`;
  },

  async library() {
    const pls = store.s.playlists;
    const likes = store.s.likes;
    const cards = [
      `<div class="card" data-nav="likes"><div class="cov" style="background:var(--grad);display:grid;place-items:center;color:#fff">${icon('heartfill', 56)}</div><b>Titres likés</b><span>${likes.length} titres</span></div>`,
      ...pls.map((p) => `<div class="card" data-nav="playlist:${p.id}"><div class="cov" style="${bg(p.tracks[0] && p.tracks[0].cover)}"></div><b>${esc(p.name)}</b><span>${p.tracks.length} titres</span></div>`),
      `<div class="card" data-act="import-sp"><div class="cov" style="display:grid;place-items:center;color:var(--ac)">${icon('download', 56)}</div><b>Importer de Spotify</b><span>Tes playlists, en quelques clics</span></div>`,
      `<div class="card" data-act="new-pl"><div class="cov" style="display:grid;place-items:center;color:var(--mu)">${icon('plus', 56)}</div><b>Nouvelle playlist</b><span>Crée la tienne</span></div>`
    ];
    const hist = [];
    const seen = new Set();
    store.s.history.forEach((x) => { if (!seen.has(x.t.id) && hist.length < 30) { seen.add(x.t.id); hist.push(x.t); } });
    return `<h1>Bibliothèque</h1><div class="row" style="flex-wrap:wrap;overflow:visible">${cards.join('')}</div>${shelf('Historique', hist)}`;
  },

  async likes() {
    return trackPage({ kind: 'Playlist', title: 'Titres likés', sub: `${store.s.likes.length} titres`, cover: '', tracks: store.s.likes.slice(), empty: 'Appuie sur le cœur d\'un titre pour le retrouver ici.' });
  },

  async playlist(id) {
    const p = store.s.playlists.find((x) => x.id === id);
    if (!p) return '<div class="notice">Playlist introuvable.</div>';
    return trackPage({
      kind: 'Playlist', title: p.name, sub: `${p.tracks.length} titres`, cover: p.tracks[0] && (p.tracks[0].coverBig || p.tracks[0].cover),
      tracks: p.tracks.slice(), pid: p.id, empty: 'Playlist vide : ajoute des titres avec le bouton +.',
      extra: `<button class="btn" data-act="rename-pl" data-pid="${p.id}">Renommer</button><button class="btn danger" data-act="delete-pl" data-pid="${p.id}">${icon('trash', 18)} Supprimer</button>`
    });
  },

  async artist(id) {
    const [info, top, rel] = await Promise.allSettled([
      api.artistInfo(id, null, (v) => { const box = $('#artist-stats'); if (box && cur.name === 'artist' && cur.arg === id) box.innerHTML = statsHTML(v) + (v.link ? `<div class="socials"><a href="${esc(v.link)}" target="_blank" rel="noopener">Page officielle</a></div>` : ''); }),
      api.artistTop(id, 25), api.related(id, 10)
    ]);
    if (info.status !== 'fulfilled') throw info.reason;
    const a = info.value;
    const tracks = top.status === 'fulfilled' ? top.value : [];
    const key = regList(tracks);
    const related = rel.status === 'fulfilled' ? rel.value : [];
    return `<div class="hero round"><div class="cov" style="${bg(a.pic)}"></div>
      <div class="meta"><div class="kind">Artiste${a.verified ? ' vérifié ✔' : ''}</div><h1>${esc(a.name)}</h1></div></div>
      <div class="box" id="artist-stats" style="margin:0 0 14px;max-width:560px">${statsHTML(a)}${a.link ? `<div class="socials"><a href="${esc(a.link)}" target="_blank" rel="noopener">Page officielle</a></div>` : ''}</div>
      <div class="actions"><button class="btn pri" data-act="playall" data-list="${key}">${icon('play', 20)} Lecture</button><button class="btn" data-act="shuffleall" data-list="${key}">${icon('shuffle', 20)} Aléatoire</button></div>
      <section class="shelf"><div class="shelf-h"><h2>Titres populaires</h2></div>${tracks.length ? `<div class="tracks">${tracks.map((t, i) => rowHTML(t, key, i)).join('')}</div>` : '<div class="notice">Aucun titre disponible.</div>'}</section>
      ${related.length ? `<section class="shelf"><div class="shelf-h"><h2>Artistes similaires</h2></div><div class="row">${related.map(artistCardHTML).join('')}</div></section>` : ''}`;
  }
};

// ---------- titres importes : retrouves au fur et a mesure ----------
let resolving = false;
async function kickResolve() {
  if (resolving || cur.name !== 'playlist') return;
  const p = store.s.playlists.find((x) => x.id === cur.arg);
  if (!p) return;
  const pend = p.tracks.filter((t) => t.src === 'pending');
  if (!pend.length) return;
  resolving = true;
  let ok = 0;
  let n = 0;
  try {
    for (const t of pend) {
      if (cur.name !== 'playlist' || cur.arg !== p.id) break;
      try { await api.resolve(t); ok++; seedArtist(t); } catch (e) { /* introuvable */ }
      n++;
      await new Promise((r) => setTimeout(r, 250));
      if (n % 10 === 0 && cur.name === 'playlist' && cur.arg === p.id) render();
    }
  } finally { resolving = false; }
  if (ok >= 10) { try { await refreshRecs(); } catch (e) { /* ignore */ } }
  if (cur.name === 'playlist' && cur.arg === p.id) render();
}

// ---------- navigation ----------
const hist = [];
let cur = { name: 'home', arg: null };
let renderToken = 0;

function navKey() { return cur.arg ? `${cur.name}:${cur.arg}` : cur.name; }
function markNav() {
  const k = navKey();
  $$('[data-nav]', $('#sidebar')).forEach((b) => b.classList.toggle('on', b.dataset.nav === k || (b.dataset.nav === 'library' && cur.name === 'library')));
  $$('#mnav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === k || (b.dataset.nav.split(':')[0] === cur.name && cur.name !== 'chart')));
  $('#back').disabled = hist.length === 0;
}

function go(name, arg = null, push = true) {
  if (push) hist.push(cur);
  cur = { name, arg };
  document.body.classList.remove('panel-open');
  markNav();
  render(true);
}

async function render(scrollTop = false) {
  const token = ++renderToken;
  const view = $('#view');
  if (scrollTop) view.scrollTop = 0;
  const keep = view.scrollTop;
  if (scrollTop || !view.firstChild) view.innerHTML = '<div class="loading">Chargement…</div>';
  try {
    const html = await VIEWS[cur.name](cur.arg);
    if (token !== renderToken) return;
    view.innerHTML = html;
    view.scrollTop = scrollTop ? 0 : keep;
    if (cur.name === 'search') $('#q').value = cur.arg || '';
    if (cur.name === 'playlist') kickResolve();
  } catch (e) {
    if (token !== renderToken) return;
    view.innerHTML = `<div class="notice">Impossible de charger cette page (${esc(e.message || 'erreur réseau')}).</div><div class="actions"><button class="btn pri" data-act="retry">Réessayer</button></div>`;
  }
}

function renderSidebarPlaylists() {
  const list = $('#pl-list');
  const s = store.s;
  list.innerHTML = `<div class="pl-item" data-nav="likes"><div class="pi liked">${icon('heartfill', 18)}</div><div><b>Titres likés</b><small>${s.likes.length} titres</small></div></div>` +
    s.playlists.map((p) => `<div class="pl-item" data-nav="playlist:${p.id}"><div class="pi" style="${bg(p.tracks[0] && p.tracks[0].cover)}">${p.tracks[0] ? '' : icon('queue', 18)}</div><div><b>${esc(p.name)}</b><small>${p.tracks.length} titres</small></div></div>`).join('');
  markNav();
}

// ---------- actions (clics) ----------
// Ouvre la recherche YouTube dans le navigateur de l'appareil : le titre complet s'ecoute la-bas,
// avec ce que tu y as (abonnement, extensions de ton navigateur...). Rien n'est modifie dans YouTube.
function openYouTube(t) {
  const q = encodeURIComponent(`${t.artist} ${t.title}`);
  window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
}

async function download(t) {
  if (!t.dl) { toast('Téléchargement non autorisé pour ce titre'); return; }
  if (isNative()) { window.open(t.dl, '_blank'); return; }
  toast('Téléchargement…');
  try {
    const r = await fetch(t.dl);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.artist} - ${t.title}.mp3`.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    toast('Téléchargé');
  } catch (e) { toast('Échec du téléchargement'); }
}

function syncLikes(id) {
  const on = store.isLiked(id);
  $$('[data-act="like"]').forEach((b) => {
    if (b.dataset.id !== id) return;
    b.classList.toggle('liked-on', on);
    b.innerHTML = icon(on ? 'heartfill' : 'heart', 18);
  });
  updateNpLike();
}

const ACTIONS = {
  play(el) {
    const list = LISTS.get(el.dataset.list);
    if (!list) return;
    const i = Number(el.dataset.i);
    if (player.current && player.current.id === list[i].id && el.classList.contains('trow')) { player.toggle(); return; }
    player.playList(list, i);
  },
  playall(el) { const l = LISTS.get(el.dataset.list); if (l && l.length) { player.setShuffle(false); player.playList(l, 0); } },
  shuffleall(el) {
    const l = LISTS.get(el.dataset.list);
    if (!l || !l.length) return;
    player.shuffle = true;
    player.playList(l, Math.floor(Math.random() * l.length));
    player.emit('mode');
  },
  like(el) { const t = T.get(el.dataset.id); if (!t) return; const on = store.toggleLike(t); syncLikes(t.id); toast(on ? 'Ajouté à tes titres likés' : 'Retiré des titres likés'); },
  addpl(el) { const t = T.get(el.dataset.id); if (t) pickPlaylist(t); },
  queue(el) { const t = T.get(el.dataset.id); if (!t) return; if (!player.current) { player.playList([t], 0); return; } player.enqueue(t, true); toast('Ajouté à la file d\'attente'); },
  yt(el) { const t = T.get(el.dataset.id); if (t) openYouTube(t); },
  dl(el) { const t = T.get(el.dataset.id); if (t) download(t); },
  rm(el) { const p = store.s.playlists.find((x) => x.id === el.dataset.pid); if (!p) return; p.tracks = p.tracks.filter((t) => t.id !== el.dataset.id); store.save(); render(); },
  async 'new-pl'() { const n = await askText('Nouvelle playlist', '', 'Créer'); if (n !== null) { const p = store.createPlaylist(n); go('playlist', p.id); } },
  async 'rename-pl'(el) { const p = store.s.playlists.find((x) => x.id === el.dataset.pid); if (!p) return; const n = await askText('Renommer la playlist', p.name, 'Renommer'); if (n && n.trim()) { p.name = n.trim(); store.save(); render(); } },
  'delete-pl'(el) { const p = store.s.playlists.find((x) => x.id === el.dataset.pid); if (p && confirm(`Supprimer « ${p.name} » ?`)) { store.s.playlists = store.s.playlists.filter((x) => x.id !== p.id); store.save(); go('library', null, false); } },
  'import-sp'() { openSpotifyImport(); },
  retry() { render(true); },
  async 'refresh-recs'() { toast('Calcul de tes recommandations…'); try { await refreshRecs(); toast('Recommandations actualisées'); } catch (e) { toast('Échec : réessaie dans un instant'); } render(); }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-nav]');
  if (!el) return;
  if (el.dataset.nav) {
    e.preventDefault();
    const [n, ...r] = el.dataset.nav.split(':');
    go(n, r.join(':') || null);
    return;
  }
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.stopPropagation(); fn(el); }
});

// ---------- recherche ----------
let qTimer;
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(qTimer); const q = $('#q').value.trim(); go('search', q || null, cur.name !== 'search'); });
$('#q').addEventListener('input', () => {
  clearTimeout(qTimer);
  const q = $('#q').value.trim();
  if (q.length < 2) return;
  qTimer = setTimeout(() => go('search', q, cur.name !== 'search'), 550);
});
$('#q').addEventListener('focus', () => { if (cur.name !== 'search' && !$('#q').value) go('search', null); });
$('#back').addEventListener('click', () => { const p = hist.pop(); if (p) { cur = p; markNav(); render(true); } });

// ---------- barre de lecture ----------
const ui = {
  play: $('#b-play'), seek: $('#seek'), cur: $('#t-cur'), dur: $('#t-dur'), vol: $('#vol'),
  title: $('#np-title'), artist: $('#np-artist'), cover: $('#np-cover'), like: $('#np-like')
};
let seeking = false;
const setRange = (el) => el.style.setProperty('--p', (el.value / el.max * 100) + '%');

function updateNpLike() {
  const t = player.current;
  const on = t && store.isLiked(t.id);
  ui.like.innerHTML = icon(on ? 'heartfill' : 'heart', 20);
  ui.like.classList.toggle('liked-on', !!on);
}
function markPlaying() {
  const id = player.current && player.current.id;
  $$('.trow').forEach((r) => r.classList.toggle('cur', r.dataset.id === id));
}

player.on('track', (t) => {
  ui.title.textContent = t.title;
  ui.artist.innerHTML = artistLink(t);
  ui.cover.style.backgroundImage = t.cover ? `url("${t.cover}")` : '';
  ui.dur.textContent = t.full ? fmtT(t.duration) : '0:30';
  ui.seek.value = 0; setRange(ui.seek);
  $('#np-dl').disabled = !t.dl;
  document.title = `${t.title} · ${t.artist} — SPOTI NOX`;
  updateNpLike();
  markPlaying();
  loadArtistPane(t);
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || 'SPOTI NOX',
        artwork: t.coverBig || t.cover ? [{ src: t.coverBig || t.cover, sizes: '512x512' }] : []
      });
    } catch (e) { /* ignore */ }
  }
});
player.on('state', () => {
  ui.play.innerHTML = icon(player.playing ? 'pause' : 'play', 26);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused';
});
player.on('time', () => {
  const d = player.duration;
  ui.cur.textContent = fmtT(player.time);
  if (d) ui.dur.textContent = fmtT(d);
  if (!seeking && d) { ui.seek.value = Math.round(player.time / d * 1000); setRange(ui.seek); }
});
player.on('mode', () => {
  $('#b-shuffle').classList.toggle('on', player.shuffle);
  const r = $('#b-repeat');
  r.classList.toggle('on', player.repeat !== 'off');
  r.title = player.repeat === 'one' ? 'Répéter le titre' : player.repeat === 'all' ? 'Répéter la liste' : 'Répéter';
  r.style.opacity = player.repeat === 'one' ? '1' : '';
  r.innerHTML = icon('repeat', 20) + (player.repeat === 'one' ? '<small style="position:absolute;margin:0;font-weight:800;color:var(--ac2)">1</small>' : '');
});
player.on('listen', (t) => { recordListen(t); });
player.on('error', (t) => toast(`Impossible de lire « ${t.title} »`));
player.on('analysis', (active) => updateAnalysisNote(active));

ui.play.addEventListener('click', () => player.toggle());
$('#b-next').addEventListener('click', () => player.next());
$('#b-prev').addEventListener('click', () => player.prev());
$('#b-shuffle').addEventListener('click', () => player.setShuffle(!player.shuffle));
$('#b-repeat').addEventListener('click', () => player.cycleRepeat());
$('#b-queue').addEventListener('click', openQueue);
$('#np-add').addEventListener('click', () => { if (player.current) pickPlaylist(player.current); });
$('#np-yt').addEventListener('click', () => { if (player.current) openYouTube(player.current); });
$('#np-dl').addEventListener('click', () => { if (player.current) download(player.current); });
ui.like.addEventListener('click', () => { const t = player.current; if (!t) return; reg(t); const on = store.toggleLike(t); syncLikes(t.id); toast(on ? 'Ajouté à tes titres likés' : 'Retiré des titres likés'); });
ui.seek.addEventListener('input', () => { seeking = true; setRange(ui.seek); });
ui.seek.addEventListener('change', () => { const d = player.duration; if (d) player.seek(ui.seek.value / 1000 * d); seeking = false; });
ui.vol.addEventListener('input', () => { const v = ui.vol.value / 100; player.setVolume(v); store.s.settings.volume = v; store.save(); setRange(ui.vol); });
ui.vol.value = Math.round(store.s.settings.volume * 100);

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* non supporte */ } };
  set('play', () => player.toggle());
  set('pause', () => player.toggle());
  set('previoustrack', () => player.prev());
  set('nexttrack', () => player.next());
  set('seekto', (d) => player.seek(d.seekTime));
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && $('#modal').classList.contains('hidden')) {
    e.preventDefault();
    player.toggle();
  }
  if (e.key === 'Escape') closeModal();
});

// ---------- panneau d'analyse ----------
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
}));
$('#toggle-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));
$('#close-panel').addEventListener('click', () => document.body.classList.remove('panel-open'));
$('#lu-reset').addEventListener('click', () => player.analyzer.resetMeters());

$('#bands').innerHTML = BANDS.map((b) => `<div class="band" id="band-${b.key}"><div class="bn"><b>${b.name}</b><small>${b.from >= 1000 ? b.from / 1000 + ' k' : b.from}–${b.to >= 1000 ? b.to / 1000 + ' kHz' : b.to + ' Hz'}</small></div><div class="bar"><i style="width:0"></i></div><div class="bv">—</div></div>`).join('');

function updateAnalysisNote(active) {
  const note = $('#an-note');
  const t = player.current;
  if (!t) { note.textContent = ''; return; }
  if (!active) note.textContent = 'Analyse indisponible pour ce titre : la source ne donne pas accès au signal audio.';
  else if (player.analyzer.error) note.textContent = 'La mesure du loudness n\'est pas disponible sur cet appareil.';
  else if (!t.full) note.textContent = 'Extrait de 30 s : les mesures portent uniquement sur l\'extrait.';
  else note.textContent = '';
}

const spec = $('#spec');
const sctx = spec.getContext('2d');
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = spec.clientWidth, h = spec.clientHeight;
  if (w && (spec.width !== Math.round(w * dpr) || spec.height !== Math.round(h * dpr))) { spec.width = Math.round(w * dpr); spec.height = Math.round(h * dpr); }
}
const FMIN = 20, FMAX = 20000;
const xOf = (f, W) => Math.log(f / FMIN) / Math.log(FMAX / FMIN) * W;

function drawSpectrum() {
  fitCanvas();
  const W = spec.width, H = spec.height, dpr = window.devicePixelRatio || 1;
  sctx.clearRect(0, 0, W, H);
  // zones
  const cols = ['rgba(31,212,95,.13)', 'rgba(255,255,255,.04)', 'rgba(31,212,95,.13)', 'rgba(255,255,255,.04)'];
  BANDS.forEach((b, i) => {
    const x1 = xOf(b.from, W), x2 = xOf(b.to, W);
    sctx.fillStyle = cols[i]; sctx.fillRect(x1, 0, x2 - x1, H);
    sctx.fillStyle = 'rgba(255,255,255,.75)';
    sctx.font = `${10 * dpr}px system-ui, sans-serif`;
    sctx.fillText(b.name, x1 + 5 * dpr, 13 * dpr);
  });
  const a = player.analyzer;
  const sp = a.active && player.playing ? a.spectrum() : null;
  if (!sp) return;
  const { data, binHz } = sp;
  const grad = sctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#17a84b'); grad.addColorStop(1, '#7dffa8');
  sctx.beginPath();
  sctx.moveTo(0, H);
  const step = 2 * dpr;
  for (let x = 0; x <= W; x += step) {
    const f1 = FMIN * Math.pow(FMAX / FMIN, x / W);
    const f2 = FMIN * Math.pow(FMAX / FMIN, Math.min(W, x + step) / W);
    let k1 = Math.max(1, Math.floor(f1 / binHz)), k2 = Math.max(k1, Math.ceil(f2 / binHz));
    k2 = Math.min(k2, data.length - 1);
    let m = -140;
    for (let k = k1; k <= k2; k++) if (data[k] > m) m = data[k];
    const y = H - clamp((m + 100) / 90, 0, 1) * (H - 18 * dpr);
    sctx.lineTo(x, y);
  }
  sctx.lineTo(W, H);
  sctx.closePath();
  sctx.globalAlpha = .85;
  sctx.fillStyle = grad;
  sctx.fill();
  sctx.globalAlpha = 1;
}

const fmtDb = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '−∞');
let lastSlow = 0;

function updateMeters() {
  const a = player.analyzer;
  if (!a.active) return;
  const m = a.meter.snapshot();
  $('#lu-m').textContent = fmtDb(m.momentary);
  $('#lu-s').textContent = fmtDb(m.shortTerm);
  $('#lu-i').textContent = fmtDb(m.integrated);
  $('#tp-now').textContent = fmtDb(m.truePeak);
  $('#tp-max').textContent = fmtDb(m.truePeakMax);
  $('#lbar-m').style.width = (Number.isFinite(m.momentary) ? clamp((m.momentary + 50) / 50, 0, 1) * 100 : 0) + '%';
  const f = $('#tp-flag');
  if (m.truePeakMax > 0) { f.className = 'flag bad'; f.textContent = 'CLIP'; }
  else if (m.truePeakMax > -1) { f.className = 'flag warn'; f.textContent = 'LIMITE'; }
  else { f.className = 'flag ok'; f.textContent = 'OK'; }

  const r = a.readBands();
  const verdict = $('#verdict');
  if (!r || r.silent || !player.playing) {
    if (!player.playing) return;
    verdict.textContent = '—'; verdict.className = 'verdict';
    return;
  }
  BANDS.forEach((b, i) => {
    const row = $('#band-' + b.key);
    const pct = clamp((r.dens[i] + 90) / 60, 0, 1) * 100;
    const dev = r.dev[i];
    const cls = Math.abs(dev) <= 3 ? 'ok' : Math.abs(dev) <= 6 ? 'warn' : 'bad';
    const bar = row.querySelector('.bar i');
    bar.style.width = pct + '%';
    bar.style.background = cls === 'ok' ? 'var(--ok)' : cls === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const bv = row.querySelector('.bv');
    bv.textContent = (dev > 0 ? '+' : '') + dev.toFixed(1) + ' dB';
    bv.className = 'bv ' + cls;
  });
  const worst = Math.max(...r.dev.map(Math.abs));
  verdict.textContent = a.verdict(r.dev);
  verdict.className = 'verdict ' + (worst <= 4 ? 'ok' : worst <= 7 ? 'warn' : 'bad');
}

function panelVisible() { return window.innerWidth >= 1000 || document.body.classList.contains('panel-open'); }

function loop(ts) {
  requestAnimationFrame(loop);
  if (document.hidden || !panelVisible()) return;
  drawSpectrum();
  if (ts - lastSlow > 50) { lastSlow = ts; updateMeters(); }
}
requestAnimationFrame(loop);

// ---------- demarrage ----------
hydrateIcons();
renderSidebarPlaylists();
store.on(renderSidebarPlaylists);
$('#new-pl').addEventListener('click', () => ACTIONS['new-pl']());
$('#open-settings').addEventListener('click', openSettings);
player.emit('mode');
ui.play.innerHTML = icon('play', 26);
setRange(ui.vol); setRange(ui.seek);
markNav();
render(true);

// recommandations : recalculees toutes les 2 h (et au lancement si c'est perime)
scheduleRecs(() => { if (cur.name === 'home' || cur.name === 'recs') render(); });
