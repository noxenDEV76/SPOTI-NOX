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

### Titres complets avec YouTube (facultatif)

Pour les artistes connus (Deezer = 30 s), SPOTI NOX peut jouer la version complète via le **lecteur officiel YouTube intégré** :

1. Crée une clé gratuite *YouTube Data API v3* (console.cloud.google.com → API et services → Identifiants).
2. Colle-la dans **Réglages → Clé API YouTube**.
3. Les titres en extrait de 30 s basculent alors sur YouTube (désactivable dans les réglages), et le bouton globe force YouTube sur le titre en cours.

À savoir : le lecteur reste **visible et non modifié** (règle de YouTube : pas de vidéo masquée ni floutée), **des pubs peuvent s'afficher** (SPOTI NOX ne les bloque pas), et le loudness / True Peak / analyseur de fréquences ne fonctionnent pas dans ce mode (YouTube ne donne pas accès au signal). Environ 100 titres différents par jour avec le quota gratuit ; les vidéos trouvées sont mémorisées. Sans clé, le bouton globe ouvre la recherche YouTube dans ton navigateur. Si YouTube échoue, l'app retombe sur l'extrait de 30 s.

## Son, égaliseur et langue

- **Écran « Audio »** (menu de gauche) : moteur de traitement en virgule flottante 32 bits, tous les contrôles agissent réellement sur le son et toutes les mesures viennent du signal.

  ```
  Source → EQ paramétrique (9 bandes) → Stéréo (largeur / balance / mono)
         → Normalisation (gain BS.1770) → Limiteur true-peak à anticipation → Sortie
                   └── analyseurs (entrée / sortie) : forme d'onde, spectre, LUFS, true-peak, corrélation, GR
  ```

  - **Égaliseur** : courbe graphique (glisser les points, molette = Q), tableau détaillé, 7 régions (Sub-bass → Air). Préréglages : Flat (défaut, signal inchangé), Bass Boost, Bass Reduction, Vocal Clarity, Treble Reduction, Bright, Warm, Electronic, Acoustic, + tes propres préréglages. Plafond ±12 dB, filtres stables vérifiés.
  - **EQ intelligent** (désactivé par défaut) : *Suggestions* (mesure seulement) ou *Adaptatif* (±0,5 à 4 dB, 0,15 dB/s max). Il ne restaure pas les fréquences qu'une source avec pertes n'a plus.
  - **Normalisation** ITU-R BS.1770 / EBU R128 (K-weighting, gates −70 LUFS / −10 LU) : Normal −14, Quiet −19, Loud −11 LUFS (cibles modifiables), mode album, contournement. Le gain est borné pour que la crête vraie reste sous le plafond. Les Deezer 30 s sont mesurés sur l'extrait ; Audius / Jamendo sur le titre complet (mesure en arrière-plan, mise en cache).
  - **Limiteur true-peak** : plafond −1 dBTP par défaut, anticipation 5 ms, détection ×4, indicateur de réduction de gain. Sur du bruit blanc très large bande, l'estimation peut sous-lire de moins de 1 dB (documenté dans les tests) ; sur de la musique le plafond est tenu.
  - **Stéréo** : largeur, balance, mono, corrélation, Mid/Side. À 100 % / centre le signal est copié à l'identique.
  - **A/B** : Original / Traité avec égalisation de volume perçu (jamais enregistrée) et boucle de 8 s. **Contournement** global.
  - **Sortie** : valeurs réelles rapportées par le navigateur (fréquence, latence, canaux), choix du périphérique, retour automatique si débranché.
  - Réglages versionnés, validés au chargement et à l'import.
- **Limites honnêtes** : Web Audio ne permet ni le mode exclusif WASAPI, ni de choisir la fréquence de sortie, ni le « bit-perfect » ; pas de crossfade / gapless pour l'instant ; les titres lus sans analyse (extraits Deezer sur Android, YouTube) ne passent pas par le moteur ; les extraits Deezer restent des MP3 de 30 s.
- **Réglages → Langue** : automatique, Français ou English (l'app se recharge).
- Les icônes viennent de `scripts/make-icons.py` (`python3 scripts/make-icons.py` pour les régénérer).

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
npm test              # DSP (EQ, LUFS, limiteur, stéréo), réglages, import, serveur, langues
npm run test:browser  # moteur audio réel dans Chromium (Playwright)
npm run test:e2e      # app complète dans Chromium : lecture, écran Audio, persistance
```

## Limites à connaître

- Les extraits Deezer durent 30 s (sauf avec la clé YouTube ci-dessus) : c'est le cas des artistes connus (Skrillex, etc.). Les titres entiers viennent d'Audius / Jamendo (artistes indépendants) ou de tes propres fichiers.
- Sur Android, les extraits Deezer se lisent sans l'analyse live (le système bloque l'accès au signal) ; Audius et Jamendo sont analysés.
- Sur Android, la lecture peut se couper quand l'écran est verrouillé ou l'app en arrière-plan.
- Les recommandations se recalculent quand l'app est ouverte (toutes les 2 h, et au lancement si le dernier calcul a plus de 2 h).
- Le nombre d'auditeurs mensuels Spotify n'est pas disponible légalement ; l'app affiche les fans Deezer, abonnés Audius et auditeurs Last.fm.
- L'équilibre des fréquences est comparé à une courbe de référence (−4,5 dB/octave) : c'est un repère, pas un jugement.
- Le True Peak est estimé par sur-échantillonnage ×4 (précision d'environ 0,1 dB sur nos tests).
