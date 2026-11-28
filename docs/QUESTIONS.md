# Questions ouvertes

Points en attente d'une décision, d'un texte de code ou d'une vérification. Les
limites techniques de l'application sont décrites au § 6 de
[THEORIE.md](THEORIE.md) ; ce fichier suit ce qui reste à trancher.

Chaque point indique son état : **à décider** (choix de l'utilisateur),
**texte manquant** (à contrôler sur le code), **à vérifier** (comparaison à
faire), **évolution** (travail non commencé).

## Calcul sismique

### 1. Fréquence f_ZPA de la réponse rigide (Gupta) — à décider

- **Aujourd'hui** : f_ZPA de la formule f₂ = (f₁ + 2·f_ZPA)/3 est prise égale à
  la fréquence de coupure saisie.
- **Question** : la lire sur le spectre (fréquence où il rejoint l'accélération
  à période nulle), ou la faire saisir séparément de la coupure ?
- **Enjeu** : écart mesuré d'au plus 1,3 % sur l'exemple DN100. Un
  avertissement signale déjà une coupure placée dans la zone amplifiée du
  spectre.

### 2. Module d'élasticité : modal et séisme — à décider, sans modification pour le moment

Le module à chaud est traité chargement par chargement. Seuls le modal et le
séisme restent ouverts.

| Chargement | Module utilisé | État |
|---|---|---|
| Dilatation thermique | à chaud par défaut, option du projet pour revenir à froid ; contraintes ramenées à l'équivalent froid selon le code | **réglé** (PR #43) |
| Poids propre | à froid | peu d'enjeu : la répartition des efforts dépend très peu du module ; seules les flèches augmenteraient de E_c/E_h |
| Analyse modale, séisme | à froid, sans option | **ouvert** |

- **Question** : ajouter une option « module à chaud pour le modal et le
  séisme » ?
- **Enjeu** : il porte sur les fréquences propres, pas sur les contraintes de
  dilatation. À 300 °C elles sont environ 5 % plus basses au module à chaud
  (½·(1 − E_h/E_c)), ce qui déplace les modes sur le spectre.
- **Règle de PIPESTRESS** (aide en ligne, carte FREQ, champ RF) : le modal est
  calculé au module du cas de référence désigné par la carte FREQ, et au module
  à froid si ce champ est omis.
- **Constat** : dans le fichier d'entrée du cas test collecteur, la carte FREQ
  désigne le cas 1 (`RF=1`), dont les conditions (`OPER CA=1`) sont à 20 °C. Le
  modal de comparaison était donc calculé avec le module à 20 °C, c'est-à-dire à
  froid, comme celui de l'application.
- **Indice** : sur le cas test collecteur DN200 (300 °C, E_h/E_c = 0,906), les
  modes 1 à 9 concordent à moins de 1 % avec le calcul de comparaison alors que
  l'application calcule le modal à froid. Un modal de référence au module à
  chaud donnerait des fréquences environ 5 % plus basses : cohérent avec le
  constat ci-dessus.
- **Proposition** : option du projet décochée par défaut, pour ne pas modifier
  les cas validés.
- **Décision** : aucune modification pour le moment ; le modal et le séisme
  restent au module à froid. L'option reste à décider : elle demanderait, côté
  PIPESTRESS, un cas de référence à la température de service sur la carte FREQ.

### 3. Mouvements sismiques différentiels d'ancrages — évolution

Non traités (pas de déplacements imposés sismiques, pas de spectres multiples).

### 3 bis. Analyse sismique temporelle — évolution

L'application ne fait que de l'analyse spectrale et du statique équivalent. Le
traitement rigoureux des jeux sous séisme demande une analyse temporelle
linéaire par morceaux (méthode ADAMOS de PIPESTRESS : modes réévalués à chaque
choc ou relâchement), avec des accélérogrammes en donnée d'entrée. Non prévue
dans le découpage du solveur non linéaire (point 12).

## Codes de vérification

### 4. CODETI : module d'élasticité de l'étendue M_C — décidé

La section C3 du CODETI 2006 ne précise pas le module du calcul de M_C.

- **Choix retenu** : comme PIPESTRESS. Son aide en ligne (carte LCAS) indique
  qu'avec l'option module à chaud, les efforts des cas de dilatation sont
  multipliés par E_froid/E_chaud pour tous les codes sauf, notamment, l'EN
  13480-3 et le CODETI à partir de l'édition 2013. Pour le CODETI 2006, M_C est
  donc ramené au module à froid, et f_a porte toujours E_chaud/E_froid.
- **Alternative non retenue** : le traitement de l'EN 13480-3, où M_C reste au
  module à chaud ; critère moins sévère d'un facteur E_froid/E_chaud (environ
  10 % à 300 °C).

### 5. CODETI : torsion de la méthode alternative — décidé

Le texte imprime σ_T = M_T/Z dans σ = √(σ_b² + 4σ_T²). La valeur M_T/(2Z) est
retenue : c'est la seule qui redonne la méthode directe sur un tube droit
(décision de l'utilisateur). Reste à faire : tracer cette hypothèse dans la note
de calcul quand la méthode alternative est choisie.

### 6. RCC-M : renfort des tés de fabrication — texte manquant

Le renfort est plafonné à 1,5·e dans la formule de h, soit h = 4,05·e/r à
l'extrême. L'ASME B31.3 (tableau D300, note 10) donne h = 4·e/r au-delà de
1,5·e, soit moins de 1 % d'écart sur i. À contrôler sur la note correspondante
du tableau des facteurs du RCC-M.

### 7. RCC-M : réductions — texte manquant

Les notes (2) et (7) de la ligne « Réductions concentriques » du tableau C 3673
n'ont pas été vues. Hypothèses retenues : α ≤ 60° et D/t ≤ 100, sinon i = 2,0.

### 8. RCC-M : type « piquage » — évolution

Les tés sont forgés, renforcés ou non renforcés. Un type « piquage » distinct
(avec distinction collecteur / dérivation) n'existe pas.

### 9. ASME B31.3 : facteur f et contrainte occasionnelle — à décider

- f est plafonné à 1,0. Le code admet f_m = 1,2 pour les aciers à
  R_m ≤ 517 MPa jusqu'à 371 °C, ce qui relève l'admissible sous 7 000 cycles.
- Le §302.3.6 ne donne pas la formule de la contrainte occasionnelle : elle est
  calculée comme S_L avec les efforts du séisme, puis ajoutée à S_L.

### 10. Admissibles par code — à décider

Une seule colonne S par matériau : en changeant de code, les valeurs de la
bibliothèque (établies pour le RCC-M) doivent être ressaisies, sans quoi elles
sont utilisées telles quelles. Pistes : une colonne par code, ou un calcul de f
à partir de Rp0,2 et R_m.

### 11. Vérifications non reprises — évolution

- Fluage (σ₅) et mouvement d'ancrage unique non répété (σ₆) : EN 13480-3 et
  CODETI.
- Brides aux extrémités des coudes, coudes à onglets ou à sections, tés
  extrudés, piquages forgés : les trois codes.
- Épaisseur minimale du CODETI (section C2, texte non disponible).
- EN 13480-3 : amendements postérieurs à la version 1 (A4:2021, édition 2024) ;
  ASME B31.3 : éditions 2020 et suivantes (facteurs B31J).

## Supports

### 12. Supports non linéaires — évolution

Second solveur, expérimental et au choix dans le projet ; le solveur linéaire
reste le défaut. Principes consignés au § 7 de [THEORIE.md](THEORIE.md), alignés
sur le calcul statique non linéaire de PIPESTRESS (aide en ligne).

| Sujet | Choix retenu (comme PIPESTRESS) | Alternative notée |
|---|---|---|
| Étendue de dilatation M_C | différence entre états, le poids étant inclus dans tous les cas de dilatation | — (c'est aussi la définition des codes) |
| Part du poids M_A | cas « poids seul » en non linéaire, à froid | en complément, **fait** : M_A vérifié aussi dans la configuration de service à contacts figés (ASME B31.3, annexe S, exemple 2), le plus sévère gouvernant |
| Supports sous séisme | supports non linéaires comptés actifs, avec leur raideur | état figé dans l'état de service, ou enveloppe de deux calculs (supports libres / actifs) |
| Modèle et algorithme | raideur par zones (d₁, d₂, k₁ à k₄), frottement par raideur ajustée dans les directions libres, mêmes critères de convergence (plus serrés) | — |
| Frottement d'un support à deux directions | écart assumé : un frottement par support, suivant l'axe laissé libre, sous la somme des réactions | comme PIPESTRESS : chaque direction frotte dans tout son plan transversal, y compris suivant l'autre direction bloquée |

- **Fait (lot A)** : choix du solveur dans l'onglet Projet, calcul statique par
  états, raideur par zones (appuis simples, jeux, butées des supports à ressort),
  état des contacts affiché. Les équations des codes sont alimentées par les
  états sans autre changement (le lot B prévu n'a plus d'objet).
- **Fait (frottement)** : coefficient μ par support, adhérence ou glissement dans
  chaque état, affiché avec l'état des contacts ; ignoré par le solveur linéaire,
  qui le signale.
- **Fait (exemple)** : exemple livré « Cas non linéaire – appui qui décolle, jeu
  rattrapé, frottement », jumeau des jeux de données de comparaison de
  [validation/](validation/README.md).
- **Fait (poids en configuration de service)** : quand le supportage change
  entre l'état froid et le service, le poids est recalculé contacts figés et les
  équations où il intervient sont vérifiées aussi dans cette configuration
  (cas W(T1), lignes W(T1)+P…). Validé sur l'exemple 2 de l'annexe S de l'ASME
  B31.3-2012, livré comme exemple.
- **Fait (jeux par côté)** : jeu différent de chaque côté d'une direction
  bloquée, butée à un seul sens, appui placé sous le tube ; les supports à
  ressort avaient déjà une course haute et une course basse séparées. Les côtés
  − et + suivent les axes globaux, comme D1 et D2 d'une carte NRST dont la
  direction est donnée dans le sens positif.
- **Reste à faire** : comparaison avec PIPESTRESS sur le cas « appui qui décolle,
  jeu rattrapé », sans puis avec frottement (jeux de données et valeurs attendues
  prêts).
- **Limites** : un seul cas de poids actif, forces nodales en linéaire ;
  frottement compté depuis la position de montage dans chaque état, sans retour
  à froid ; séisme sans frottement.

## Validation

### 13. Cas de la littérature à ajouter — évolution

NUREG/CR-1677 problèmes 3, 5 et 7 ; cas Code_Aster SSLL106.
