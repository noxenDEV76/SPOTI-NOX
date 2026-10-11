# SPOTI NOX

Ton lecteur de musique perso : sans compte, sans pub, pour **PC (Windows .exe)** et **Android (.apk)**.

## Ce que fait l'app

- **Lecteur complet** : recherche, lecture, file d'attente, aléatoire, répétition, volume, touches multimédia
- **Playlists** (illimitées, lecture aléatoire possible), **titres likés**, historique, export/import de sauvegarde
- **Classements** : Hits du moment, Top France, Top Global, tops par genre (Rap, Pop, Dance, Rock, R&B, Électro)
- **Électro** : page dédiée avec les artistes connus (Skrillex, David Guetta, Daft Punk…) et des rangées de titres complets (Dubstep, House, Drum & Bass, Trap…)
- **Import Spotify** : Bibliothèque → « Importer de Spotify ». Tu choisis l'export officiel de tes données (Playlist1.json, YourLibrary.json) ou des CSV (Exportify) ; chaque titre est retrouvé automatiquement sur Audius ou Deezer, et « Pour toi » démarre déjà à ton goût
- **Pour toi** : recommandations calculées d'après ce que tu écoutes, **recalculées toutes les 2 h**
- **Fiche artiste** : photo, pays, fans / abonnés, auditeurs et écoutes (Last.fm), liens réseaux sociaux
- **Analyse en direct** pendant l'écoute, dans le panneau de droite :
  - Loudness **LUFS** momentané / court terme / intégré (norme ITU-R BS.1770)
  - **True Peak** (dBTP) avec max et alerte
  - Analyseur 4 zones : **Low** (20–250 Hz), **Low Mid** (250 Hz–2 kHz), **High Mid** (2–6 kHz), **High** (6–20 kHz), avec verdict d'équilibre
- Téléchargement quand l'artiste l'autorise (bouton ⬇ visible seulement dans ce cas)

## Sources de musique (légales)

| Source | Contenu | Compte requis |
|---|---|---|
| Deezer | Charts et recherche, **extraits de 30 s** | non |
| Audius | Titres **complets**, artistes indépendants, téléchargement possible selon l'artiste | non |
| Jamendo | Titres **complets** sous licence libre | clé gratuite (facultative) |

Les catalogues de Spotify, YouTube Music, Apple Music ou Deezer (titres entiers) ne sont accessibles que via leurs propres apps : SPOTI NOX ne les contourne pas.

## Obtenir le .exe et l'APK (sans rien installer)

1. Crée un dépôt sur GitHub, puis dans ce dossier :
   ```bash
   git init && git add . && git commit -m "SPOTI NOX"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/spoti-nox.git
   git push -u origin main
   ```
2. Sur GitHub : onglet **Actions → Build SPOTI NOX → Run workflow**.
3. Après quelques minutes, télécharge dans les **Artifacts** :
   - `SPOTI-NOX-windows` : l'installateur `.exe` et une version portable
   - `SPOTI-NOX-android` : `SPOTI-NOX.apk`
4. Pour publier une release avec les deux fichiers : `git tag v1.0.0 && git push --tags`.

**Installer l'APK** : copie-le sur le téléphone, ouvre-le et autorise « installer des apps inconnues ».
**Windows** peut afficher un avertissement SmartScreen (app non signée) : « Informations complémentaires → Exécuter quand même ».

## Lancer en local

```bash
npm install
npm start        # ouvre l'app PC
npm test         # vérifie le calcul LUFS / True Peak sur des signaux de référence
```

## Limites à connaître

- Les extraits Deezer durent 30 s : c'est le cas des artistes connus (Skrillex, etc.). Les titres entiers viennent d'Audius / Jamendo (artistes indépendants) ou de tes propres fichiers.
- Sur Android, les extraits Deezer se lisent sans l'analyse live (le système bloque l'accès au signal) ; Audius et Jamendo sont analysés.
- Sur Android, la lecture peut se couper quand l'écran est verrouillé ou l'app en arrière-plan.
- Les recommandations se recalculent quand l'app est ouverte (toutes les 2 h, et au lancement si le dernier calcul a plus de 2 h).
- Le nombre d'auditeurs mensuels Spotify n'est pas disponible légalement ; l'app affiche les fans Deezer, abonnés Audius et auditeurs Last.fm.
- L'équilibre des fréquences est comparé à une courbe de référence (−4,5 dB/octave) : c'est un repère, pas un jugement.
- Le True Peak est estimé par sur-échantillonnage ×4 (précision d'environ 0,1 dB sur nos tests).
