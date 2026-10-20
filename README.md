# EasyPipeStress

Application web d'**analyse de flexibilité des tuyauteries** qui fonctionne
entièrement dans le navigateur : modélisation 3D, calcul par éléments finis de
poutres, chargements poids propre, pression, dilatation thermique et séisme
(spectral ou statique), puis dépouillement selon le **RCC-M, sous-section C
(classe 2), §C 3650** : équations (6) poids propre + pression, (7) dilatation,
(8) = (6) + (7) et (10B), (10C), (10D) séisme par niveau de critère.

Aucune installation ni serveur de calcul : c'est une page statique (modules
JavaScript natifs, sans dépendance ni étape de compilation), publiée sur
GitHub Pages. Les études sont enregistrées dans le navigateur et
exportables/importables en JSON.

## Utilisation

1. **Géométrie** : ajout rapide de tubes par DX/DY/DZ depuis un nœud (cliquer un
   nœud dans la vue pour en partir) ; un coude est inséré automatiquement au
   changement de direction, et un té quand un troisième tube part d'un nœud
   (forgé, de fabrication renforcé ou non, ou SIF imposé). Tableaux éditables
   des tubes (section, matériau, températures et pressions de service et de
   calcul), des coudes (rayon saisi ou normalisé ASME B16.9, épaisseur) et des
   tés. Sections normalisées ASME B36.10M / B36.19M proposées par catalogue.
2. **Supports & masses** : ancrages, appuis, guides, butées, ressorts, blocages
   personnalisés, déplacements imposés de piquage ; masses ponctuelles.
3. **Chargements** : poids (fluide, calorifuge), pression, dilatation, séisme
   (niveaux B, C, D vérifiés avec un coefficient chacun sur le même séisme,
   spectre horizontal commun aux deux directions horizontales et
   spectre vertical, ou un spectre par direction, CQC/SRSS, masse manquante,
   100-40-40/SRSS, ou statique équivalente).
4. **Code** : paramètres du RCC-M C (nombre de cycles, coefficients des
   admissibles par équation et par niveau, tableau du cumul des chargements,
   correction de pression des coudes). La vérification d'épaisseur minimale
   par tenue à la pression seule est une option de l'onglet Projet (désactivée
   par défaut).
5. **Calculer** (Ctrl + Entrée) : synthèse du dépouillement, taux de travail en
   couleur sur la vue, déformées, modes propres animés, tableaux de
   déplacements, d'efforts sur supports et d'efforts internes, **note de calcul**
   imprimable, **export Excel** (choix des contenus : une feuille par équation,
   par support, par cas de déplacements et d'efforts, modes propres).

Le bouton **Exemple** propose plusieurs modèles : ligne DN150 inox entre trois
piquages (té, robinet, masse, déplacement imposé), cas de comparaison PIPESTRESS
(DN100 × 3,6 inox) et ligne DN200 acier carbone avec robinet, débitmètre,
supports variables et support constant.

Ergonomie : les séparateurs entre le volet de saisie, la vue et le bandeau de
résultats se déplacent à la souris (double-clic : taille par défaut). Dans les
tableaux de saisie, ↑ / ↓ / Entrée passent à la ligne précédente / suivante et
← / → à la cellule voisine (en début / fin de texte), la valeur étant validée
au passage.

## Lancer en local

```bash
python3 -m http.server 8000     # puis ouvrir http://localhost:8000
npm test                        # tests de validation (Node ≥ 20)
```

## Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` exécute les tests puis publie le site
à chaque push sur `main`. Réglage à faire une seule fois : *Settings → Pages →
Build and deployment → Source : « GitHub Actions »*.

## Architecture

```
index.html, css/            interface
src/
  core/      registry.js    registre générique d'extensions
             model.js       modèle utilisateur (JSON), exemple, coordonnées
             mesher.js      modèle → maillage de calcul (phases line/corner/point)
             linalg.js      Cholesky profil, valeurs propres symétriques
             materials.js   tables matériaux fonction de T
             sections.js    caractéristiques des tubes
  components/               composants modélisables (registre)
             pipe.js  bend.js  valve.js  tee.js  mass.js  support.js
  fem/       beam3d.js      élément de poutre 3D Timoshenko
             system.js      assemblage, statique, réponses, analyse modale
             spectral.js    spectres, CQC/SRSS, combinaisons directionnelles
  loads/                    types de chargement (registre)
             weight.js  pressure.js  thermal.js  seismic.js
  codes/                    codes de vérification (registre)
             rccm-c.js
  analysis.js               orchestration (utilisable hors navigateur)
  ui/                       vue 3D canvas, panneaux, résultats, note de calcul
tests/                      validation analytique et non-régression
docs/THEORIE.md             formulation et références bibliographiques
```

Le cœur de calcul (`core`, `fem`, `loads`, `codes`, `analysis.js`) ne dépend pas
du navigateur : il est testé sous Node et pourrait être exécuté dans un Web
Worker ou côté serveur.

### Étendre l'application

Les trois axes d'évolution sont des **registres** : on ajoute un module et on
l'enregistre, sans toucher au reste. L'interface de saisie est générée à partir
des descripteurs `fields`.

- **Nouveau composant** (réduction, bride, robinet rigide, compensateur…) :
  créer `src/components/xxx.js` exportant `{ id, label, phase, fields, create,
  mesh }` puis `components.register(xxx)` dans `src/components/index.js`.
  - `phase: 'line'` : `mesh()` appelle `ctx.addSegment({...})` ;
  - `phase: 'corner'` : modifie le tracé autour d'un sommet (`ctx.segmentsAt`,
    `ctx.replaceEnd`, `ctx.addSegment`) ;
  - `phase: 'point'` : `ctx.addSpring`, `ctx.addPointMass`, `ctx.addSupport`.
- **Nouveau chargement** (vent, coup de bélier, épreuve hydraulique…) :
  `src/loads/xxx.js` exportant `{ id, label, fields, create, run(ctx, lc) }` ;
  `run` utilise `ctx.sys.solveStatic(...)` ou `ctx.sys.modal(...)` et renvoie
  `{ signed, u, elemForces, supportLoads, info }`.
- **Nouveau code** (RCC-M B/D, EN 13480-3, B31.3…) : `src/codes/xxx.js`
  exportant `{ id, label, params, componentFactors, check, thickness }`. `componentFactors`
  fournit les facteurs k et i au mailleur ; `check({ model, mesh, cases })` renvoie les
  lignes de vérification et la synthèse ; `thickness` (facultatif) fournit la
  formule d'épaisseur minimale par tenue à la pression seule, appliquée quand
  l'option du projet est cochée.

Unités internes : mm, N, MPa, tonne, s (cohérentes). Saisies en kg et kg/m³.

## Validation

`npm test` compare le solveur à des solutions analytiques (console, effort
thermique bridé, dilatation libre, fréquence propre, oscillateur sous spectre
plat, masse manquante, coefficients CQC, facteurs de coude) et vérifie les
équilibres globaux sur l'exemple. Voir [docs/THEORIE.md](docs/THEORIE.md).

## Avertissement

Outil d'aide à l'analyse. Les propriétés matériaux fournies sont **indicatives** ;
les formules du dépouillement doivent être confrontées à l'édition du RCC-M
applicable. Les résultats doivent être vérifiés par un ingénieur qualifié avant
toute utilisation pour la justification d'un matériel.

## Licence

MIT.
