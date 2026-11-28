# Cas « NL-APPUI-JEU » — valeurs attendues

Valeurs calculées par EasyPipeStress (solveur non linéaire, RCC-M, module à chaud pour la dilatation) sur l’exemple « Cas non linéaire – appui qui décolle, jeu rattrapé, frottement », colonne « Frottement μ » vidée. À comparer aux résultats du jeu de données `nl-appui-jeu.fre`. Fiche produite par `valeurs-attendues.mjs`.

## 1. Modèle

- Tube DN200 219,1 × 8,18 mm, P265GH, plein d’eau, sans calorifuge ; 300 °C, 3 MPa ; pesanteur suivant −Z.
- Tracé : ancrage PF1 (0 ; 0 ; 0), montée de 3 m suivant +Z, coude R = 305 mm, 6 m suivant +X, coude R = 305 mm, 5 m suivant +Y, ancrage PF2. Longueurs mesurées aux intersections des axes.
- A1 (à 2,5 m du premier coude) et A2 (à 2 m du second coude) : appuis simples, la tuyauterie est posée.
- G1 (même point que A2) : butée latérale suivant X avec 5 mm de jeu de chaque côté.
- Raideur des trois supports : 1000 kN/mm.

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
| A1, appui simple | en contact, 3.460 kN | **décollé de 7.05 mm**, effort nul |
| A2, appui simple | en contact, 4.188 kN | en contact, 4.176 kN |
| G1, butée X à jeu de 5 mm | jeu ouvert (DX = -0.011 mm), effort nul | **jeu rattrapé côté +X** (DX = 5.012 mm), 11.746 kN |

Itérations (calculs complets) : 1 pour le cas 100, 2 pour le cas 101.

Pour mesurer l’effet : en linéaire (cas 2, supports bilatéraux sans jeu), A1 retiendrait la tuyauterie vers le bas avec 16.2 kN et G1 reprendrait 27.6 kN.

## 3. Cas non linéaires 100 et 101

### Déplacements (mm)

| Point | 100 DX | DY | DZ | 101 DX | DY | DZ |
|---|---:|---:|---:|---:|---:|---:|
| 10 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 20 | -0.004 | -0.129 | -0.003 | -7.838 | -2.488 | 10.023 |
| 21 | -0.009 | -0.165 | 0.004 | -7.338 | -3.789 | 11.402 |
| 30 | -0.009 | -0.107 | -0.003 | 0.814 | -11.598 | 7.049 |
| 40 | -0.009 | -0.006 | -0.899 | 12.681 | -19.055 | -0.856 |
| 41 | -0.012 | 0.000 | -0.787 | 12.942 | -17.474 | -1.130 |
| 50 | -0.011 | 0.000 | -0.004 | 5.012 | -11.166 | -0.004 |
| 60 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

### Efforts sur les supports

Cas 100 — poids seul :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | 0.015 | 0.018 | -2.301 | 0.202 | 0.006 | 0.063 |
| A1 (point 30) | 0.000 | 0.000 | -3.460 | – | – | – |
| A2 (point 50) | 0.000 | 0.000 | -4.188 | – | – | – |
| G1 (point 50) | 0.000 | 0.000 | 0.000 | – | – | – |
| PF2 (point 60) | -0.015 | -0.018 | -0.133 | -0.393 | 0.111 | -0.030 |

Cas 101 — poids + dilatation :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | -9.737 | -2.119 | -6.003 | 5.664 | -20.525 | -3.483 |
| A1 (point 30) | 0.000 | 0.000 | 0.000 | – | – | – |
| A2 (point 50) | 0.000 | 0.000 | -4.176 | – | – | – |
| G1 (point 50) | 11.746 | 0.000 | 0.000 | – | – | – |
| PF2 (point 60) | -2.009 | 2.119 | 0.097 | -0.619 | 1.491 | 4.216 |

Somme des efforts verticaux dans les deux cas : -10.082 kN (poids total).

### Moments résultants √(MX² + MY² + MZ²) et étendue (kN·m)

| Point | Cas 100 | Cas 101 | Étendue 101 − 100 (cas 200) |
|---|---:|---:|---:|
| 10 | 0.211 | 21.575 | 21.539 |
| 20 | 0.260 | 6.694 | 6.762 |
| 21 | 0.270 | 8.073 | 8.183 |
| 30 | 1.780 | 2.300 | 2.100 |
| 40 | 0.403 | 8.764 | 8.773 |
| 41 | 0.121 | 6.492 | 6.509 |
| 50 | 2.514 | 10.770 | 10.331 |
| 60 | 0.410 | 4.514 | 4.470 |

L’étendue est le module de la différence des moments, composante par composante (pas la différence des modules).

## 4. Contraintes RCC-M (MPa)

| Point | Éq. (6), cas 100 | Éq. (6), configuration de service W(T1) | Éq. (7) EasyPipeStress | Éq. (7) sans le facteur E_froid/E_chaud |
|---|---:|---:|---:|---:|
| 10 | 20.83 | 22.28 | 83.14 | 75.36 |
| 20 | 21.75 | 29.27 | 63.63 | 57.68 |
| 21 | 21.82 | 26.27 | 77.00 | 69.80 |
| 30 | 26.32 | 28.03 | 8.11 | 7.35 |
| 40 | 22.67 | 24.10 | 82.56 | 74.83 |
| 41 | 20.86 | 22.68 | 61.25 | 55.52 |
| 50 | 28.88 | 37.02 | 39.88 | 36.15 |
| 60 | 21.52 | 25.63 | 17.25 | 15.64 |

L’éq. (6) du cas 100 est celle du poids seul à froid, à comparer au logiciel de référence. La colonne suivante est une vérification propre à l’application : le poids recalculé avec les supports dans leur état de service (A1 retiré, G1 actif, sans frottement), sans équivalent direct dans le jeu de données.

EasyPipeStress ramène l’étendue au module à froid : éq. (7) = i·M_C·(E_froid/E_chaud)/Z, avec E_froid/E_chaud = 203/184 = 1.1033. Si le cas 200 du logiciel de référence ne porte pas ce facteur (les cas 100 et 101 sont des cas de poids, pas des cas de dilatation), c’est la dernière colonne qui doit ressortir.
Admissibles : S = 118 MPa pour l’éq. (6), S_A = 177 MPa pour l’éq. (7). L’éq. (8) n’est pas évaluée par l’application quand l’éq. (7) est satisfaite.

## 5. Base linéaire (cas 1, cas 2, modal)

Ces cas servent à contrôler que les deux modèles sont identiques avant de regarder le non linéaire : les trois supports y sont bilatéraux et sans jeu.

### Déplacements (mm)

| Point | Cas 1 DX | DY | DZ | Cas 2 DX | DY | DZ |
|---|---:|---:|---:|---:|---:|---:|
| 10 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 20 | 0.006 | -0.128 | -0.003 | -11.693 | -3.320 | 10.003 |
| 21 | 0.003 | -0.164 | 0.003 | -11.106 | -4.861 | 10.915 |
| 30 | 0.003 | -0.106 | -0.003 | -2.968 | -12.813 | 0.016 |
| 40 | 0.003 | -0.005 | -0.898 | 8.877 | -19.341 | -4.204 |
| 41 | -0.001 | 0.000 | -0.787 | 8.802 | -17.473 | -3.326 |
| 50 | 0.000 | 0.000 | -0.004 | 0.028 | -11.165 | -0.008 |
| 60 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

### Efforts sur les supports

Cas 1 — poids :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | 0.027 | 0.018 | -2.297 | 0.201 | 0.034 | 0.063 |
| A1 (point 30) | 0.000 | 0.000 | -3.465 | – | – | – |
| A2 (point 50) | 0.000 | 0.000 | -4.187 | – | – | – |
| G1 (point 50) | -0.032 | 0.000 | 0.000 | – | – | – |
| PF2 (point 60) | 0.004 | -0.018 | -0.133 | -0.393 | 0.111 | 0.004 |

Cas 2 — dilatation, efforts au module à chaud :

| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |
|---|---:|---:|---:|---:|---:|---:|
| PF1 (point 10) | -16.552 | -2.380 | -12.290 | 7.165 | -32.397 | -3.489 |
| A1 (point 30) | 0.000 | 0.000 | 16.196 | – | – | – |
| A2 (point 50) | 0.000 | 0.000 | -7.758 | – | – | – |
| G1 (point 50) | 27.585 | 0.000 | 0.000 | – | – | – |
| PF2 (point 60) | -11.032 | 2.380 | 3.852 | -3.768 | -0.206 | -10.785 |

Si le logiciel de référence imprime les efforts du cas 2 ramenés au module à froid, les multiplier par 1.1033.

### Fréquences propres (Hz)

| Mode | 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|
| f (Hz) | 9.04 | 11.70 | 18.27 | 23.02 | 55.86 |

Module à froid, supports bilatéraux sans jeu (les mêmes fréquences sortent du modèle non linéaire : en dynamique les supports sont comptés actifs, sans frottement).
