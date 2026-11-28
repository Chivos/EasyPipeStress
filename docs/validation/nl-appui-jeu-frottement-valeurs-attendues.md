# Cas « NL-APPUI-JEU-FROTTEMENT » — valeurs attendues

Valeurs calculées par EasyPipeStress (solveur non linéaire, RCC-M, module à chaud pour la dilatation) sur l’exemple « Cas non linéaire – appui qui décolle, jeu rattrapé, frottement ». À comparer aux résultats du jeu de données `nl-appui-jeu-frottement.fre`. Fiche produite par `valeurs-attendues.mjs`.

## 1. Modèle

- Tube DN200 219,1 × 8,18 mm, P265GH, plein d’eau, sans calorifuge ; 300 °C, 3 MPa ; pesanteur suivant −Z.
- Tracé : ancrage PF1 (0 ; 0 ; 0), montée de 3 m suivant +Z, coude R = 305 mm, 6 m suivant +X, coude R = 305 mm, 5 m suivant +Y, ancrage PF2. Longueurs mesurées aux intersections des axes.
- A1 (à 2,5 m du premier coude) et A2 (à 2 m du second coude) : appuis simples, la tuyauterie est posée.
- G1 (même point que A2) : butée latérale suivant X avec 5 mm de jeu de chaque côté.
- Raideur des trois supports : 1000 kN/mm ; frottement μ = 0,3 sur les trois (champ MU des cartes NRST).

| Point du jeu de données | Nœud EasyPipeStress | Position |
|---|---|---|
| 10 | 10 | ancrage PF1 |
| 20 | 20A | début du coude 1 |
| 21 | 20B | fin du coude 1 |
| 30 | 30 | appui A1 |
| 40 | 40A | début du coude 2 |
| 41 | 40B | fin du coude 2 |
| 50 | 50 | appui A2 + butée G1 |
| 60 | 60 | ancrage PF2 |

Conventions : déplacements en mm dans le repère global ; efforts exercés **par la tuyauterie sur le support**, repère global.

## 2. Ce que le cas doit montrer

| Support | Cas 100 (poids seul, 20 °C) | Cas 101 (poids + dilatation, 300 °C) |
|---|---|---|
| A1, appui simple | en contact, 3.455 kN | **décollé de 7.05 mm**, effort nul |
| A1, frottement | adhère, 0.133 kN pour 1.036 kN admis | sans objet, le support n’agit pas |
| A2, appui simple | en contact, 4.185 kN | en contact, 4.174 kN |
| A2, frottement | adhère, 0.039 kN pour 1.256 kN admis | **glisse**, 1.252 kN (= μ·R), déplacement 12.23 mm |
| G1, butée X à jeu de 5 mm | jeu ouvert (DX = 0.000 mm), effort nul | **jeu rattrapé côté +X** (DX = 5.011 mm), 11.234 kN |
| G1, frottement | sans objet, le support n’agit pas | **glisse**, 3.370 kN (= μ·R), déplacement 11.15 mm |

Itérations (calculs complets) : 2 pour le cas 100, 3 pour le cas 101.

Direction des forces de frottement dans le cas 101 (force de la tuyauterie sur le support, colinéaire au déplacement du point 50) : A2 dans le plan horizontal, suivant (0.410 ; -0.912 ; 0.000) ; G1 dans le plan transversal à X, suivant (0.000 ; -1.000 ; 0.000).

Effet principal du frottement : au point 50 le tube est orienté suivant Y et se déplace surtout suivant −Y ; les deux forces de frottement sont donc presque axiales et se retrouvent dans la réaction FY de l’ancrage PF2, qui passe de 2.119 kN sans frottement à 6.631 kN. L’ancrage PF1 et l’éq. (7) au point 10 changent très peu.

Points de modèle à connaître pour la comparaison :

- A2 et G1 sont deux supports distincts au même point : chacun frotte dans son propre plan transversal, comme deux cartes NRST.
- Raideur d’adhérence 1750 kN/mm (valeur par défaut KM = 10⁷ lb/in du logiciel de référence).
- L’application converge à 10⁻⁶ sur la force de frottement ; avec la tolérance par défaut E1 = 0,001 du logiciel de référence, un écart de l’ordre de 0,1 % sur les forces de frottement est normal.
- À froid (cas 100), les forces d’adhérence sont petites et sensibles à la raideur d’adhérence : n’y comparer que l’ordre de grandeur.

## 3. Cas non linéaires 100 et 101

### Déplacements (mm)

| Point | 100 DX | DY | DZ | 101 DX | DY | DZ |
|---|---:|---:|---:|---:|---:|---:|
| 10 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 20 | 0.004 | -0.056 | -0.003 | -7.837 | -2.487 | 10.023 |
| 21 | 0.000 | -0.075 | 0.003 | -7.338 | -3.787 | 11.402 |
| 30 | 0.000 | 0.000 | -0.003 | 0.815 | -11.591 | 7.049 |
| 40 | 0.000 | 0.002 | -0.889 | 12.682 | -19.042 | -0.856 |
| 41 | 0.001 | 0.000 | -0.780 | 12.942 | -17.461 | -1.130 |
| 50 | 0.000 | 0.000 | -0.004 | 5.011 | -11.152 | -0.004 |
| 60 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

### Efforts sur les supports

Cas 100 — poids seul :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | 0.023 | 0.086 | -2.302 | 0.019 | 0.027 | 0.087 |
| A1 (point 30) | -0.037 | -0.128 | -3.455 | – | – | – |
| A2 (point 50) | 0.017 | 0.035 | -4.185 | – | – | – |
| G1 (point 50) | 0.000 | 0.000 | 0.000 | – | – | – |
| PF2 (point 60) | -0.003 | 0.007 | -0.140 | -0.386 | 0.107 | -0.003 |

Cas 101 — poids + dilatation :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | -9.737 | -2.118 | -6.003 | 5.662 | -20.525 | -3.481 |
| A1 (point 30) | 0.000 | 0.000 | 0.000 | – | – | – |
| A2 (point 50) | 0.513 | -1.142 | -4.174 | – | – | – |
| G1 (point 50) | 11.234 | -3.370 | -0.001 | – | – | – |
| PF2 (point 60) | -2.010 | 6.631 | 0.097 | -0.619 | 1.491 | 4.214 |

Somme des efforts verticaux dans les deux cas : -10.082 kN (poids total).

### Moments résultants √(MX² + MY² + MZ²) et étendue (kN·m)

| Point | Cas 100 | Cas 101 | Étendue 101 − 100 (cas 200) |
|---|---:|---:|---:|
| 10 | 0.093 | 21.574 | 21.608 |
| 20 | 0.268 | 6.693 | 6.776 |
| 21 | 0.293 | 8.072 | 8.192 |
| 30 | 1.779 | 2.300 | 2.234 |
| 40 | 0.413 | 8.762 | 8.729 |
| 41 | 0.118 | 6.490 | 6.457 |
| 50 | 2.499 | 10.771 | 10.342 |
| 60 | 0.401 | 4.513 | 4.445 |

L’étendue est le module de la différence des moments, composante par composante (pas la différence des modules).

## 4. Contraintes RCC-M (MPa)

| Point | Éq. (6), cas 100 | Éq. (6), configuration de service W(T1) | Éq. (7) EasyPipeStress | Éq. (7) sans le facteur E_froid/E_chaud |
|---|---:|---:|---:|---:|
| 10 | 20.41 | 22.28 | 83.41 | 75.60 |
| 20 | 21.80 | 29.27 | 63.77 | 57.80 |
| 21 | 21.96 | 26.27 | 77.09 | 69.87 |
| 30 | 26.31 | 28.03 | 8.62 | 7.81 |
| 40 | 22.73 | 24.10 | 82.14 | 74.45 |
| 41 | 20.84 | 22.68 | 60.76 | 55.08 |
| 50 | 28.83 | 37.02 | 39.92 | 36.19 |
| 60 | 21.49 | 25.63 | 17.16 | 15.55 |

L’éq. (6) du cas 100 est celle du poids seul à froid, à comparer au logiciel de référence. La colonne suivante est une vérification propre à l’application : le poids recalculé avec les supports dans leur état de service (A1 retiré, G1 actif, sans frottement), sans équivalent direct dans le jeu de données.

EasyPipeStress ramène l’étendue au module à froid : éq. (7) = i·M_C·(E_froid/E_chaud)/Z, avec E_froid/E_chaud = 203/184 = 1.1033. Si le cas 200 du logiciel de référence ne porte pas ce facteur (les cas 100 et 101 sont des cas de poids, pas des cas de dilatation), c’est la dernière colonne qui doit ressortir.
Admissibles : S = 118 MPa pour l’éq. (6), S_A = 177 MPa pour l’éq. (7). L’éq. (8) n’est pas évaluée par l’application quand l’éq. (7) est satisfaite.

## 5. Base linéaire (cas 1, cas 2, modal)

Inchangée par le frottement : voir la fiche du cas sans frottement (`nl-appui-jeu-valeurs-attendues.md`).
