# Bases théoriques d'EasyPipeStress

Ce document décrit les modèles mécaniques et les règles de dépouillement
implémentés, avec les références de la littérature sur lesquelles ils reposent.

## 1. Modélisation de la tuyauterie

### 1.1 Élément de poutre 3D

La tuyauterie est représentée par des éléments de poutre droite à deux nœuds et
six degrés de liberté par nœud (3 translations, 3 rotations). La matrice de
raideur est celle de Przemieniecki [1], avec déformation d'effort tranchant
(poutre de Timoshenko, coefficient φ = 12EI/(G·Aₛ·L²)) et aire réduite de
cisaillement d'un tube mince Aₛ = A/2 [2]. La raideur est évaluée au module
d'Young à la température de référence (Ec) pour le poids, la pression, l'analyse
modale et le séisme. Pour la dilatation, l'option du projet choisit le module :
- à chaud Eh (défaut, comme PIPESTRESS) : raideur au module à la température de
  chaque tube ; déplacements et réactions sont ceux de l'état chaud, et
  l'étendue de moments des éq. (7) et (8) est multipliée par Ec/Eh élément par
  élément, le code imposant Ec (RCC-M C 3653.3, ASME III NC-3653.3) ;
- à froid Ec : calcul direct avec Ec (contraintes identiques, réactions
  majorées de Ec/Eh).

Les efforts de dilatation étant imposés par des déplacements, ils sont
proportionnels à E dans une ligne de module uniforme : les deux options donnent
alors les mêmes contraintes ; elles diffèrent légèrement en présence de
ressorts, de déplacements imposés ou de températures différentes selon les tubes.

Repère local : x suivant l'axe de l'élément ; y dans le plan contenant l'axe
vertical global (ou un axe horizontal si l'élément est vertical) ; z = x ∧ y.

### 1.2 Coudes

Le rayon R est soit saisi, soit déduit du type de coude : 1,5·Dₑ (par défaut),
ou coude normalisé ASME B16.9 d'après le NPS du tube (petit rayon 1D, grand
rayon 1,5D, 3D), ou coude cintré 5D. Les sections normalisées (diamètres et
épaisseurs ASME B36.10M et B36.19M) sont proposées par le catalogue de l'onglet
Projet.

Le sommet d'intersection des tangentes est remplacé par un arc de rayon R,
discrétisé en cordes (au plus 10° par élément par défaut, nombre pair pour disposer d'un
nœud milieu). Les nœuds créés sont nommés `<sommet>A`, `<sommet>M`,
`<sommet>B`. La flexibilité de l'ovalisation de la section (von Kármán, 1911 ;
Rodabaugh & George, 1957 [3]) est représentée par le **facteur de flexibilité**
k appliqué sur l'inertie de flexion (I/k), dans et hors du plan :

- caractéristique de flexibilité h = eₙ·R / r² (r rayon moyen) ;
- k = 1,65 / h ≥ 1 ; i = 0,9 / h^(2/3) ≥ 1 (table des facteurs de flexibilité
  et d'intensification de la classe 2, équivalente à ASME NC-3673.2) ;
- correction optionnelle de raidissement par la pression (Kellogg [4], ASME
  NC-3673.2 note) : k / [1 + 6(P/E)(r/e)^(7/3)(R/r)^(1/3)] et
  i / [1 + 3,25(P/E)(r/e)^(5/2)(R/r)^(2/3)].

Le facteur est fourni par le **code de vérification** actif (les formules
d'EN 13480-3 ou d'ASME B31.3 diffèrent), ce qui garantit la cohérence entre
analyse et dépouillement.

### 1.3 Tés

Le té est placé au nœud de jonction de trois tubes ; il ne modifie ni la
géométrie ni la raideur (k = 1). Son facteur d'intensification de contraintes
(classe 2, équivalent ASME NC-3673.2, d'après les essais de Markl [3]) s'applique aux
extrémités des trois éléments qui aboutissent au nœud, le plus pénalisant
étant retenu si l'élément porte déjà un facteur (coude) :

- té forgé à souder (B16.9) : h = 4,4·eₙ/r ;
- té de fabrication renforcé : h = (eₙ + e_r/2)^(5/2) / (eₙ^(3/2)·r) ;
- té de fabrication non renforcé : h = eₙ/r ;
- i = 0,9/h^(2/3) ≥ 1, ou valeur imposée par l'utilisateur ;
- facteur des charges primaires 0,75·i ≥ 1.

Tronçon rigide de dérivation (option du projet, activée par défaut comme dans
PIPESTRESS) : la dérivation est rigide de l'axe du collecteur jusqu'à sa paroi
(longueur De/2 du collecteur, raideur × 1000, masse du tube conservée) ; elle est
vérifiée au nœud du té, avec le facteur i du té et la section de la dérivation.

### 1.4 Réductions

La réduction (concentrique ou excentrique) relie deux sections : De₁, e₁ au nœud
de départ, De₂, e₂ au nœud d'arrivée, sur la longueur donnée par DX, DY, DZ.
Elle est découpée en six sous-éléments droits dont le diamètre et l'épaisseur
varient linéairement (section du milieu de chaque sous-élément pour la raideur,
la masse, le poids et le fluide) ; chaque extrémité de sous-élément est vérifiée
avec la section exacte de ce point, en particulier le petit bout avec D₂, t₂.
L'axe est la droite entre les deux nœuds : l'excentricité d'une réduction
excentrique se représente, si on le souhaite, par les composantes DX, DY, DZ.

Facteurs (RCC-M C 3673, ligne « Réductions concentriques (ASME B16.9 ou MSS SP 43) »,
notes (2) et (7), identique à ASME NC-3673.2(b)-1) : k = 1 et
i = 0,5 + 0,01·α·(D₂/t₂)^½, avec 1 ≤ i ≤ 2,0, D₂, t₂ au petit bout et α le
demi-angle du cône en degrés (génératrice inclinée pour une excentrique). La
formule vaut pour α ≤ 60° et D/t ≤ 100 aux deux extrémités ; hors de ce
domaine, i = 2,0 (avertissement). Les réductions excentriques ne figurent pas au
tableau : la formule de la concentrique leur est appliquée (avertissement). α est saisi, ou déduit de la géométrie :
tan α = (D₁ − D₂)/(2L) pour une concentrique, (D₁ − D₂)/L pour une excentrique
(cône occupant toute la longueur ; saisir α quand la partie conique est plus
courte que le face-à-face). Soudures bout à bout aux deux extrémités : brutes de
soudage par défaut (i = 1,8, comme PIPESTRESS), sur les extrémités de tous les
éléments qui aboutissent à ces nœuds, ou arasées (i = 1,0). Un coude ne peut pas être placé directement
contre une réduction.

### 1.5 Robinets

Le robinet est un élément de poutre « rigide » entre deux nœuds, de longueur
égale à son face-à-face : sa masse (robinet vide, calorifuge compris) est
répartie sur sa longueur, et s'y ajoute le fluide contenu (section intérieure du
tube raccordé × longueur, comme dans PIPESTRESS) pour le poids propre et
l'inertie sismique ; sa raideur vaut un facteur (10 par défaut) fois
celle du tube de raccordement, et il se dilate à la température du tube
raccordé. Ce facteur suit la pratique des logiciels de flexibilité : un corps
de robinet est beaucoup plus raide que le tube, mais une raideur « infinie »
dégraderait le conditionnement numérique sans changer les résultats (au-delà
de ×10, la souplesse du robinet devient négligeable devant celle du reste de la
ligne). Le corps du robinet n'est pas vérifié au titre du code (il relève de
la qualification du fabricant) ; les extrémités des tubes raccordés le sont.

### 1.6 Supports

Chaque support est un ensemble de ressorts linéaires orientés (translation ou
rotation). Un blocage rigide est un ressort de pénalité (au moins 10¹⁰ N/mm et
10¹⁴ N·mm/rad, porté pour les gros diamètres à 10⁴ fois la raideur d'un tronçon
de tube d'un diamètre de long, E·A/De et E·I/De), ce qui permet de traiter les directions biaises (guide d'un tube
incliné) et les déplacements imposés (mouvements de piquage, appliqués dans les
cas thermiques) sans modification de la numérotation. L'ancrage équivaut à
De/10⁴ de tube supplémentaire : erreur < 0,05 % sur une console d'un diamètre
de long, quel que soit le diamètre (elle atteignait 7 % sur un DN1200 épais avec
une pénalité fixe).

Les supports sont saisis par familles, chacune avec ses réglages avancés :

- **points fixes et blocages** : ancrage (6 DDL), guide latéral, butée axiale,
  appui vertical bilatéral (étrier), avec ou sans guide latéral, blocage
  personnalisé par DDL globaux ;
- **appuis simples** (tuyauterie posée), avec ou sans guide latéral ;
- **supports à ressort** : variable (raideur + précharge) ou constant, avec une
  course vers le haut et une course vers le bas indépendantes ;
- **dispositifs auto-bloquants**.

**Jeux.** Chaque direction bloquée en translation peut recevoir un jeu avant
contact, différent de chaque côté : « 5 » (5 mm des deux côtés), « 2/5 » (2 mm
côté −, 5 mm côté +), « - » à la place d'une valeur pour un côté sans butée. Le
côté + d'une direction est celui des coordonnées globales croissantes (le haut
pour une direction verticale), quel que soit le sens de saisie du tube. Cette
saisie couvre la butée à un seul sens (« 0/- » : au contact d'un côté, libre de
l'autre), l'appui placé sous le tube (« 3/- » sur un étrier) et l'étrier à jeu
haut (« 0/2 »).

**Supports à contact et calcul linéaire.** Le solveur est linéaire : il ne
cherche pas l'état des contacts. Chaque support à contact reçoit une hypothèse,
contrôlée après calcul sur les états statiques (poids, poids + dilatation) et
sous séisme ; un avertissement signale l'hypothèse mise en défaut :

| Support | Hypothèse du calcul | Contrôle |
|---|---|---|
| Appui simple | bilatéral dans tous les cas | effort vers le haut (appui soulevé) ; effort sismique vertical supérieur à la charge portée |
| Jeu des deux côtés d'une direction bloquée | direction libre en poids et en dilatation (jeu ouvert), bloquée en modal et en séisme (jeu fermé) | déplacement libre supérieur au jeu du côté où il se fait (jeu rattrapé) |
| Butée au contact d'un côté (jeu nul), libre ou à jeu de l'autre | bilatérale dans tous les cas, comme l'appui simple | effort dans le sens où la butée est libre |
| Dispositif auto-bloquant | libre en poids et en dilatation, bloqué en modal et en séisme | aucun (comportement exact) ; le détail donne la course thermique |
| Butées d'un support à ressort | ressort toujours actif, sans butée | déplacement vertical supérieur à la course haute ou basse, y compris sous séisme |

Deux systèmes de raideur sont donc assemblés quand le modèle contient un
auto-bloquant ou un jeu : le système statique, sans ces ressorts, et le système
dynamique, avec eux (analyse modale, réponse spectrale, masse manquante,
statique équivalent). Les constats de contact sont conservés dans le résultat
(`contacts`) : ils désignent les supports qu'un calcul non linéaire par états
aurait à modifier (appui à retirer, jeu ou butée à activer).

### 1.7 Résolution

- Renumérotation des nœuds par Cuthill-McKee inverse (réduction du profil).
- Factorisation de Cholesky en profil (« skyline ») de la matrice de raideur.
- Un pivot nul ou négatif signale un mécanisme : le message indique le nœud et
  le DDL non retenus.

### 1.8 Repère local des résultats (U, V, W)

Déplacements et efforts sur supports peuvent être présentés dans le repère
global (X, Y, Z) ou dans un repère local (U, V, W) propre à chaque nœud, utile
pour les tuyauteries non parallèles aux axes :

- W : axe de l'élément de référence du nœud, même orientation (tube droit de
  préférence à une corde de coude ou un robinet ; celui qui arrive au nœud,
  sinon celui qui en part) ;
- W non vertical : V dans le plan (W, verticale du projet), d'angle minimal
  avec la verticale (verticale projetée orthogonalement à W) ;
- W vertical : U suivant X (suivant Y si X est la verticale) ;
- troisième axe par la règle de la main droite (U × V = W).

Exemple : tube horizontal suivant +X, Z vertical → U = +Y, V = +Z, W = +X (W
effort axial, V effort vertical, U effort latéral horizontal). Pour un cas
sismique, la réponse de chaque mode et de chaque direction est projetée dans le
repère local avant les combinaisons modale et directionnelle : projeter
l'enveloppe globale, non signée, serait faux.

## 2. Chargements

| Cas | Modélisation |
|---|---|
| Poids propre | Charges réparties m·g (métal + fluide + calorifuge) par forces nodales équivalentes de poutre bi-encastrée, masses ponctuelles. |
| Pression | Pression de calcul Pd et maximale de service P1 portées par les tubes, utilisées dans les équations de contraintes (terme de membrane longitudinale) et la correction de flexibilité. Effet de fond auto-équilibré dans un circuit fermé. |
| Dilatation thermique | Déformation libre ε = ᾱ(T)·(T − T_réf), ᾱ coefficient moyen de dilatation entre T_réf et T, introduite par forces de blocage ±E·A·ε ; déplacements imposés des supports ; module à chaud par défaut (§ 1.1). |
| Séisme (inertie) | Analyse modale spectrale ou statique équivalente (cf. § 3). |
| Forces nodales | Forces et moments donnés aux nœuds (repère global). Cas présenté dans les résultats, non combiné dans les équations du code. |

## 3. Analyse sismique

### 3.1 Analyse modale

Matrice de masse concentrée (demi-masse de chaque élément à ses nœuds, masses
ponctuelles), sur les seuls DDL de translation. Le problème K·φ = ω²·M·φ est
condensé exactement sur les DDL massiques : C = M^½·K⁻¹ₘₘ·M^½ (symétrique, défini
positif), dont les valeurs propres sont μ = 1/ω². Les modes sont obtenus par
tridiagonalisation de Householder et algorithme QL implicite (EISPACK
tred2/tql2 [5]), puis étendus à tous les DDL par φ = K⁻¹·M·φ·ω². Ils sont normés
à la masse. Facteurs de participation Γᵢ = φᵢᵀ·M·r, masses effectives Γᵢ².

Au-delà de 120 DDL massiques, les modes sont obtenus par la **méthode de
Lanczos** avec réorthogonalisation complète (Paige, 1972 ; Parlett, *The
Symmetric Eigenvalue Problem*) sur le même opérateur M^½·K⁻¹·M^½ : seuls les
modes utiles sont calculés, jusqu'au premier mode convergé au-dessus de la
fréquence de coupure (ou au nombre maximal de modes), au prix d'une résolution
par itération. Les résultats sont identiques à la résolution complète (écart
~10⁻¹³) pour un coût très inférieur (×13 plus rapide à 1 160 DDL).

**Contrôle de Sturm.** La méthode de Lanczos à un vecteur de départ peut en
théorie omettre un mode multiple ou très proche d'un autre (tuyauterie à
symétrie de révolution, par exemple une colonne verticale). Le nombre de modes
sous la fréquence de coupure est donc vérifié indépendamment : c'est le nombre
de pivots négatifs de la factorisation L·D·Lᵀ de K − (2πf)²·M (loi d'inertie de
Sylvester ; Bathe, *Finite Element Procedures*, § 10.2.2). En cas d'écart, les
modes sont recalculés par la résolution complète (jusqu'à 1 500 DDL massiques),
sinon un avertissement est émis.

### 3.2 Réponse spectrale

Par défaut, les deux directions horizontales (déduites de l'axe vertical du
projet) partagent un même spectre et un même facteur : une seule saisie pour
l'horizontal, une pour le vertical ; l'option peut être décochée pour saisir un
spectre par direction.

Pour chaque direction d'excitation (X, Y, Z) :

1. réponse du mode i : qᵢ = Γᵢ·Sa(fᵢ)/ωᵢ², avec interpolation log-log (ou linéaire en fréquence, ou linéaire en période, au choix) du
   spectre ;
2. combinaison modale **SRSS** ou **CQC** (Der Kiureghian, 1981 [6]) :
   ρᵢⱼ = 8ξ²(1+r)r^1,5 / [(1−r²)² + 4ξ²r(1+r)²], r = ωⱼ/ωᵢ ;
   avec amortissements propres à chaque mode (Der Kiureghian) :
   ρᵢⱼ = 8√(ξᵢξⱼ)(ξᵢ + rξⱼ)r^1,5 / [(1−r²)² + 4ξᵢξⱼr(1+r²) + 4(ξᵢ²+ξⱼ²)r²].
   L’amortissement du cas séisme ne modifie pas les accélérations (elles sont
   lues sur le spectre saisi) : il ne sert qu'à ces coefficients. Loi constante,
   ou variable selon la fréquence (ξ₁ jusqu'à f₁, ξ₂ au-delà de f₂, linéaire
   entre les deux, par ex. 5 % → 2 % entre 10 et 20 Hz) ; le spectre saisi est
   alors le spectre composite construit par l'utilisateur ;
3. **correction de masse manquante** (USNRC RG 1.92 rév. 3 [7], ASCE 4-16 [8]) :
   la masse non capturée par les modes inférieurs à la fréquence de coupure,
   Mr − Σ Γᵢ·M·φᵢ, est soumise statiquement à l'accélération à période nulle
   (ZPA) ;
4. **réponse rigide des modes** (méthode de Gupta, RG 1.92 rév. 3 §C.1.4.1,
   option par défaut) : pour chaque mode, αᵢ = ln(fᵢ/f₁)/ln(f₂/f₁) borné à
   [0 ; 1], avec f₁ = SA_max/(2π·SV_max) et f₂ = (f₁ + 2·f_ZPA)/3
   (f_ZPA = fréquence de coupure). La part rigide αᵢ·Rᵢ est cumulée
   algébriquement avec la réponse de masse manquante ; la part périodique
   √(1 − αᵢ²)·Rᵢ est combinée par SRSS ou CQC ; réponse = √(R_p² + R_r²).

Puis combinaison directionnelle **SRSS** ou **100-40-40** (Newmark).

Les résultats sismiques sont des enveloppes positives (non signées) ; les
moments résultants sont calculés à partir des composantes combinées.

### 3.3 Statique équivalente

Accélérations uniformes par direction (usuellement 1,5 × le pic du spectre de
plancher, ASME III Annexe N-1225 / pratique RCC-M), combinaison directionnelle.

## 4. Dépouillement RCC-M, sous-section C (classe 2)

Notations : Dₑ diamètre extérieur, eₙ épaisseur nominale, Z module de flexion,
M moment résultant √(Mx² + My² + Mz²) à chaque extrémité d'élément, S contrainte
admissible de base (à la température T du tube), Sy limite d'élasticité, Sc et Sh
valeurs de S à froid et à chaud, P pression intérieure. Les contraintes sont
calculées avec l'épaisseur nominale ; la tolérance de fabrication et la
surépaisseur de corrosion (option du projet) n'interviennent que dans la
vérification d'épaisseur minimale. Pour rester simple,
chaque tube porte une seule température T et une seule pression P, utilisées à
la fois pour la dilatation et comme conditions de calcul du code.

| Réf. | Critère | Formule (formulation par défaut « 0,75 i ») |
|---|---|---|
| C 3641 | Épaisseur minimale (tenue à la pression seule, option du projet désactivée par défaut) | eₘ = P·Dₑ / [2(S/I + 0,4·P)] + c ≤ eₙ·(1 − tol) ; I = (4R/Dₑ − 1)/(4R/Dₑ − 2) à l'intrados des coudes |
| (6) | Poids propre + pression | S_L = P·Dₑ/(4eₙ) + 0,75i·M_A/Z ≤ 1,0·Sh |
| (7) | Dilatation thermique | S_E = i·M_C/Z ≤ S_A = f·(1,25·Sc + 0,25·Sh) |
| (8) | (6) + (7), si (7) non satisfaite | P·Dₑ/(4eₙ) + 0,75i·M_A/Z + i·M_C/Z ≤ Sh + S_A |
| (10B), (10C), (10D) | Séisme, par niveau de critère | P·Dₑ/(4eₙ) + 0,75i·(M_A + M_B)/Z ≤ k·Sh, k = 1,2 (B), 1,8 (C), 2,4 (D) ; M_B = réponse sismique × coefficient du niveau |

**Moments et module Z (C 3658).** Moment résultant √(Mx² + My² + Mz²) à
l'extrémité de chaque élément (pour un té, séparément pour chaque branche, au
nœud de jonction). Module Z = π·r²·eₙ (r rayon moyen, eₙ épaisseur nominale) pour
les parties droites, cintrées, coudes, tés et piquages égaux ; pour le tronçon
réduit d'un té ou d'un piquage réduit, Z = π·r′ₘ²·tₛ avec tₛ = min(Tᵣ, i·T_b)
(Tᵣ épaisseur du collecteur, T_b du piquage, i SIF du té). La faculté de prendre
le moment du piquage à la surface du collecteur quand r′ₘ/r < 0,5 n'est pas
utilisée (moment à la jonction, conservatif). Coudes : vérification à tous les
nœuds du coude, ou aux seules extrémités A et B (option de l'onglet Projet).

0,75i est pris au moins égal à 1. En classe 2, seul le facteur
d'intensification i intervient ; les indices de contraintes primaires B₁, B₂
relèvent de la classe 1 (sous-section B) et ne sont pas utilisés.

**Niveaux sismiques.** Un cas séisme est calculé une fois avec son spectre
d'entrée ; chaque niveau de critère vérifié (B, C, D) lui applique son propre
coefficient (réponse linéaire vis-à-vis du spectre) et est vérifié avec ses
propres admissibles.

**Cumul des chargements.** (6) : moment résultant du poids propre M_A et
pression P ; (7) : étendue de dilatation M_C seule, depuis l'état froid
(déplacements imposés compris) ; (8) : contraintes de (6) et de (7)
additionnées ; (10) : M_A + M_B, somme des moments résultants, avec M_B
enveloppe sismique (combinaisons modale et directionnelle) × coefficient du
niveau. Le tableau « Cumul des chargements » de l'onglet Code détaille ces
cumuls à partir des cas actifs.

Les coefficients d'admissible (1,0·Sh pour (6) ; 1,2 / 1,8 / 2,4·Sh pour
(10B) / (10C) / (10D)) sont fixés par le code et ne sont pas paramétrables.
S_A ne comporte pas de report de marge f·(Sh − S_L) : cette majoration relève
de l'ASME B31.1 / B31.3, pas de la classe 2 du RCC-M.

Facteur de réduction f selon le nombre de cycles équivalents N : 1,0 (N ≤ 7 000),
0,9 (≤ 14 000), 0,8 (≤ 22 000), 0,7 (≤ 45 000), 0,6 (≤ 100 000), 0,5 au-delà.

M_A est le moment résultant du poids propre, M_B celui du séisme (enveloppe),
M_C celui de l'étendue de dilatation (état froid → état chaud, déplacements
imposés compris). La somme M_A + M_B des moments résultants est conservative.

> **Avertissement.** La numérotation et la structure suivent les règles C 3650 ;
> les coefficients par défaut sont ceux de la formulation historique de la
> classe 2. L'utilisateur doit vérifier leur conformité à l'édition du RCC-M et
> aux fiches de modification applicables à son projet, et remplacer les
> propriétés matériaux indicatives par celles de l'Annexe Z I.

### 4.1 Autres codes : CODETI, EN 13480-3, ASME B31.3

Le code se choisit dans l'onglet Code ; le RCC-M classe 2 reste le code par
défaut. Changer de code ne modifie ni le modèle ni le calcul des efforts (sauf
les facteurs de flexibilité k fournis par le code) : seuls changent les
équations, les facteurs d'intensification et les admissibles. La colonne S des
matériaux est la contrainte admissible de base **du code retenu** (S du RCC-M ou
du B31.3, f de l'EN 13480-3 ou du CODETI) : les valeurs par défaut de la
bibliothèque, établies pour le RCC-M, sont à remplacer.

**EN 13480-3:2017 (F), version 1 (décembre 2017) — article 12 et annexe H.**
Module contrôlé sur le texte de la norme.

| Réf. | Critère | Formule |
|---|---|---|
| (12.3.2-1) | Charges permanentes | σ₁ = p_c·d_o/(4eₙ) + 0,75i·M_A/Z ≤ f_f |
| (12.3.3-1) | Charges occasionnelles ou exceptionnelles (séisme) | σ₂ = p_c·d_o/(4eₙ) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_f |
| (12.3.4-1) | Étendue de variation de contrainte | σ₃ = i·M_C/Z ≤ f_a = U·(1,25·f_c + 0,25·f_h)·E_h/E_c |
| (12.3.4-2) | Si (12.3.4-1) non satisfaite | σ₄ = p_c·d_o/(4eₙ) + 0,75i·M_A/Z + i·M_C/Z ≤ f_f + f_a |
| §6.1, §6.2.3 | Épaisseur minimale (option) | e = p_c·D_o/(2f·z + p_c), z = 1 ; intrados des coudes : e·(R/D_o − 0,25)/(R/D_o − 0,5) |

Moments résultants (12.3.7), Z = π(d_o⁴ − d_i⁴)/(32d_o) (tubulure réduite :
π/4·d_m,b²·e_x, e_x = min(eₙ ; i·eₙ,b)), 0,75i ≥ 1 (§12.3.1). f_f est la
contrainte de calcul f à la température de calcul, f_c celle à froid,
f_h = min(f_c ; f à chaud) (12.1.3-3, hors fluage). U suit le tableau 12.1.3-1
(mêmes valeurs que le facteur f du RCC-M). Le coefficient k de l'admissible
occasionnel se choisit par niveau du cas sismique : 1 (durée d'application
supérieure à 10 % de toute période de 24 h), 1,15 (inférieure à 10 %), 1,2
(inférieure à 1 %, séisme de dimensionnement ; défaut du niveau 1), 1,3 (charges
exceptionnelles ; niveau 2), 1,8 (séisme majoré de sécurité ; niveau 3).

*Module d'élasticité* (§12.3.4) : M_C est « la plus grande différence entre les
moments en prenant les modules d'élasticité aux températures correspondantes » ;
l'admissible f_a porte le rapport E_h/E_c. Avec l'option du projet « module à
chaud » (défaut), les moments sont pris tels quels et f_a porte le rapport ; avec
un calcul à froid, le rapport n'est pas appliqué : le taux est le même.

*Corrosion* (§12.3.1) : si une corrosion considérable est attendue, le module
d'inertie et le coefficient i se calculent avec (eₙ − c₀), les charges et
réactions restant en épaisseur nominale. C'est fait quand l'option « tolérance et
corrosion » du projet est cochée (le terme de pression suit la même épaisseur).

*Coefficients* (tableau H.1), mêmes expressions que le RCC-M classe 2
(d_m = 2r) : coude lisse h = 4R·eₙ/d_m², k_B = 1,65/h, i = 0,9/h^(2/3) ; té forgé
h = 8,8eₙ/d_m ; té à tubulure posée, pénétrante ou extrudée h = 2eₙ/d_m ; réduction
forgée i = 0,5 + α/100·√(d_o/eₙ) ≤ 2 ; soudure bout à bout 1,0 ou 1,8. Seule
différence : l'anneau de renfort d'un piquage, h = 2(eₙ + e_pl/2)^(5/2)/(d_m·eₙ^(3/2)),
est compté jusqu'à e_pl = eₙ (1,5·e au RCC-M). La correction de pression de i et
k_B des coudes (notes h et i) est une option du code.

*Autre méthode* (§12.3.8), paramètre du code : les contraintes i·M/Z peuvent être
calculées par σ = √[(i_i·M_i)² + (i_o·M_o)² + M_t²]/Z (12.3.8-1), avec les
coefficients du tableau H.3 : coude i_o = 0,75/h^(2/3), i_i = 0,9/h^(2/3) ; tés
i_o = 0,9/h^(2/3), i_i = 0,75·i_o + 0,25 ; 0,75·i_i et 0,75·i_o ≥ 1 pour σ₁ et σ₂.

Non repris : brides aux extrémités des coudes (note c), coudes à sections,
tableau H.2, tés extrudés et piquages forgés du tableau H.3, fluage σ₅
(12.3.5-1), mouvement d'ancrage unique non répété σ₆ (12.3.6-1), plafond R_m/3
de f_c (à intégrer dans la valeur saisie), amendements postérieurs à la version 1.

**ASME B31.3-2012 (révision de l'édition 2010) — §302.3.5, §302.3.6, §319.4.4,
§320 et Appendix D.** Module contrôlé sur le texte de cette édition, et sur les
exemples chiffrés 1 et 2 de son annexe S (§ 5.2). Les flexions
sont séparées dans le plan (M_i) et hors plan (M_o) du coude ou du té, avec des
facteurs distincts i_i, i_o ; la torsion n'est pas intensifiée ; l'effort normal
est pris en compte.

| Réf. | Critère | Formule |
|---|---|---|
| (23a) | Charges permanentes | S_L = √[(\|S_a\| + S_b)² + (2S_t)²] ≤ S_h ; S_a = I_a·F_a/A_p, S_b = √[(I_i·M_i)² + (I_o·M_o)²]/Z, S_t = I_t·M_t/(2Z) ; I_i, I_o = max(1 ; 0,75i), I_a = I_t = 1 |
| (17), (1a) | Étendue des contraintes de déplacement | S_E = √[(\|S_a\| + S_b)² + (2S_t)²] ≤ S_A = f·(1,25·S_c + 0,25·S_h) ; S_a = i_a·F_a/A_p, S_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z, S_t = i_t·M_t/(2Z) |
| (1b) | Si (1a) non satisfaite et S_h > S_L | S_E ≤ f·[1,25·(S_c + S_h) − S_L] |
| §302.3.6 | Charges occasionnelles (séisme) | S_L + S_occ ≤ 1,33·S_h, S_occ calculée comme S_L avec les efforts du séisme |
| §304.1.2, §304.2.1 | Épaisseur minimale (option) | t = P·D/[2(S·E·W/I + P·Y)] (3a, 3c), Y = 0,4, E = W = 1 ; I = (4R₁/D − 1)/(4R₁/D − 2) à l'intrados (3d) |

F_a des charges permanentes : effort normal du poids + effet de fond P·A_f
(§320.2). f = 6·N^−0,2 borné entre 0,15 et f_m (1c) ; f_m = 1,0 est retenu (le
code admet 1,2 pour les aciers à R_m ≤ 517 MPa jusqu'à 371 °C). Dans S_A, S_c et
S_h sont plafonnés à 138 MPa (§302.3.5 d). i_a = 1 pour les coudes, i_o pour les
autres composants ; i_t = 1. Z = π(D⁴ − d⁴)/(32D) ; flexion du tronçon réduit d'un
té ou piquage réduit (éq. 20) : Z_e = π·r₂²·T_s, T_s = min(T_h ; i_i·T_b), la
torsion restant rapportée au module du tube. S_L est calculée avec l'épaisseur
diminuée des surépaisseurs (§320.1) quand l'option « tolérance et corrosion » du
projet est cochée, le poids restant calculé en épaisseur nominale ; S_E toujours
avec les dimensions nominales (§319.3.5) et au module de référence à 21 °C
(§319.2.2 b 4 : efforts calculés à chaud multipliés par E_a/E, élément par
élément). Tableau D300 : coude h = T·R₁/r₂², k = 1,65/h, i_i = 0,9/h^(2/3),
i_o = 0,75/h^(2/3) ; tés i_o = 0,9/h^(2/3), i_i = 0,75·i_o + 0,25, avec
h = 3,1·T/r₂ (té forgé B16.9), (T + T_r/2)^2,5/(T^1,5·r₂) (renforcé ; 4·T/r₂ si
T_r > 1,5·T, note 10), T/r₂ (non renforcé) ; réduction et soudure bout à bout :
i = 1,0 (l'option « soudures brutes » des réductions est sans effet). Les
facteurs valent pour D/T ≤ 100 (note 1) : un avertissement est émis au-delà. Un
seul critère occasionnel : le premier niveau coché du cas sismique ; le code ne
donne pas la formule de la contrainte occasionnelle, calculée ici comme S_L.
Non repris : brides aux extrémités des coudes (note 5), coudes à onglets,
h = 4,4·T/r₂ des tés forgés à gorge épaisse (note 8), tés extrudés et piquages
forgés, limite alternative des charges occasionnelles à haute température,
éditions 2020 et suivantes (facteurs de l'ASME B31J).

*Moments dans le plan et hors plan.* M_i est la composante du moment de flexion
portée par la normale au plan du coude, ou du té (plan du collecteur et du
piquage) quand le facteur du té gouverne ; M_o est l'autre composante. La
projection est linéaire : pour un séisme, elle est faite mode par mode, avant les
combinaisons modale et directionnelle (comme les repères locaux du § 1.8).

**CODETI 2006, Division 1, partie C, section C3** (section C10 de l'édition 2013).

| Réf. | Critère | Formule |
|---|---|---|
| (C3.3.2) | Charges permanentes | σ₁ = p·D_o/(4e_f) + 0,75i·M_A/Z ≤ f_chaud |
| (C3.3.3) | Charges occasionnelles ou exceptionnelles (séisme) | σ₂ = p·D_o/(4e_f) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_chaud |
| (C3.3.4-1) | Étendue de variation de contrainte | σ₃ = i·M_C/Z ≤ f_a = U·(1,25·f_froid + 0,25·f_chaud)·E_chaud/E_froid |
| (C3.3.4-2) | Si (C3.3.4-1) non satisfaite | σ₄ = p·D_o/(4e_f) + 0,75i·M_A/Z + i·M_C/Z ≤ f_chaud + f_a |

Coefficient k (C3.3.3), choisi par niveau du cas sismique : 1 (durée
d'application supérieure à 10 % de toute période de 24 h), 1,15 (inférieure à
10 %), 1,2 (inférieure à 1 % ; défaut du niveau 1), 1,3 (charges
exceptionnelles), 1,4 (essai de résistance), 1,5 (SMHV ; niveau 2), 1,8 (séisme
majoré de sécurité ; niveau 3). U suit le tableau C3.2.4.3 (mêmes valeurs que le
facteur f du RCC-M). 0,75i ≥ 1 (C3.2.6.2).

*Épaisseur de référence e_f* (C3.2.6.3) : épaisseur à la demi-plage des
tolérances diminuée de la corrosion. Elle est prise égale à l'épaisseur nominale,
diminuée de la surépaisseur de corrosion quand l'option « tolérance et
corrosion » du projet est cochée (terme de pression, module Z et coefficients i
recalculés avec e_f) ; la flexibilité reste calculée en épaisseur nominale
(C3.2.1.4).

*Coefficients* (tableau C3.2.6-1, D_m diamètre moyen) : coude ou cintre
h = 4e_f·R_c/D_m², k = 1,65/h, i = i_i = 0,9/h^(2/3), i_o = 0,75/h^(2/3) ; le
coefficient de flexibilité k est ramené à 1 pour une ouverture inférieure à 15°
et interpolé linéairement entre 15° et 45° (C3.2.6.1). Tés : k = 1,
i = i_o = 0,9/h^(2/3), i_i = 0,75·i_o + 0,25, avec h = 8,8e_f/D_m (té forgé),
2e_f/D_m (reconstitué non renforcé), 2(e_f + e_r/2)^(5/2)/(e_f^(3/2)·D_m)
(anneau ou selle de renfort, 8e_f/D_m si e_r > 1,5e_f). Réduction forgée :
i = 0,5 + α/100·√(D₂/e₂) ≤ 2. Soudure bout à bout : 1,0, ou 1,8 si e_n < 5 mm ou
δ > 0,1e_f. Module : π(D_o⁴ − D_i⁴)/(32D_o) ; dérivation réduite π/4·d_m²·e_x,
e_x = min(e_f ; i·e_b). Correction de pression des coudes (note 4) en option.
Les coefficients ne valent que pour D_m/e_f < 100 : un avertissement est émis
au-delà.

*Méthode alternative* (C3.3.2 à C3.3.4, C3.4.3), paramètre du code : les termes
i·M/Z sont remplacés par σ = √(σ_b² + 4σ_T²), σ_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z,
avec 0,75·i_i et 0,75·i_o ≥ 1 pour σ₁ et σ₂. Le texte imprime σ_T = M_T/Z ; la
valeur M_T/(2Z) est retenue, seule à redonner la méthode directe pour un tube
droit (i = 1) et conforme à l'usage (ASME B31.3, EN 13480-3). Ce point est une
interprétation à valider par l'utilisateur.

*Module d'élasticité* : la section C3 ne précise pas le module du calcul de M_C.
**Choix retenu** : celui du logiciel de comparaison (PIPESTRESS) pour le CODETI
antérieur à 2013 — l'étendue M_C est ramenée au module à froid (moments calculés
à chaud multipliés par E_froid/E_chaud) et f_a porte toujours E_chaud/E_froid. Le
résultat est le même que la dilatation soit calculée à chaud ou à froid.
*Alternative non retenue* : le traitement de l'EN 13480-3 (§12.3.4), où M_C reste
au module à chaud ; le critère serait moins sévère d'un facteur E_froid/E_chaud,
soit environ 10 % à 300 °C.

Non repris : brides aux extrémités des coudes (note 3), coudes à sections,
piquages forgés, extrudés et à selle insérée (lignes 8 à 10, 12, 13 et tableau
C3.2.6-2), fluage σ₅ (C3.3.4-3), mouvement d'ancrage unique non répété σ₆
(C3.3.5), épaisseur minimale (section C2).

## 5. Audit de l'implémentation

### 5.1 Dépouillement RCC-M classe 2 (C 3600)

Points vérifiés et corrigés lors de l'audit :

- formulation classe 2 par le seul facteur i (P·Dₑ/4eₙ, 0,75i ≥ 1, i·M_C/Z) ;
  pas d'indices B₁/B₂ (classe 1) ;
- une seule pression P et une seule température T par tube, communes aux
  équations (6), (7), (8), (10) et à l'épaisseur minimale ;
- S_A = f(1,25 Sc + 0,25 Sh), sans report de marge (Sh − S_L), propre aux
  codes B31 ;
- coefficients des admissibles fixes : 1,0·Sh (6), 1,2 / 1,8 / 2,4·Sh (10B/C/D) ;
- SIF des tés calculé avec les dimensions du collecteur et appliqué aux trois
  branches ; coudes : h, k, i avec l'épaisseur propre du coude ;
- moments résultants aux extrémités d'élément ; M_A + M_B en somme de
  résultants (conservatif) ; M_C calculé avec E à froid.

À confirmer par l'utilisateur dans l'édition du RCC-M applicable (texte non
accessible publiquement, AFCEN) : le tableau du facteur f et les éventuelles fiches de
modification. Non traités à ce jour : éq. (9) (occasionnelles hors séisme),
mouvements différentiels d'ancrages, facteurs de correction des coudes à
brides, module de flexion effectif des piquages réduits, réductions.

### 5.2 Solveur

Vérifications numériques (tests automatiques) :

| Contrôle | Référence | Écart |
|---|---|---|
| Console, charge ponctuelle, avec/sans cisaillement | PL³/3EI + PL/GAₛ | < 10⁻³ |
| Console, poids réparti | wL⁴/8EI | < 10⁻⁴ (pénalité) |
| Tube bridé, dilatation | E·A·α·ΔT | < 10⁻⁴ |
| Dilatation libre, T_réf ≠ 20 °C | ᾱ(T)(T−20) − ᾱ(T_réf)(T_réf−20) | < 10⁻⁹ |
| Coude 90°, flexion hors plan + torsion | Castigliano avec I/k | < 0,5 % (10°/élément) |
| Cadre 3D bi-encastré, dilatation (moments aux nœuds) | méthode des forces (EI, GJ, EA) | < 10⁻⁴ |
| Cadre 3D à deux coudes LR, dilatation | méthode des forces sur l'arc exact, EI/k | < 0,1 % |
| Ligne DN100 × 3,6 (3 coudes LR, 2 ancrages, appui bilatéral guidé), éq. (7) RCC-M C | PIPESTRESS (même modèle, coudes vérifiés aux extrémités) | < 0,3 % sur S_E et le taux |
| Même ligne, poids propre (tube plein d'eau) + pression, éq. (6) | PIPESTRESS | Σ réactions < 0,1 % ; réactions et déplacements ≈ 1 % ; taux < 0,5 % (max 0,594 contre 0,592) |
| Même ligne, analyse modale | PIPESTRESS | masse totale identique (239,3 kg) ; 6 premières fréquences < 0,8 % ; masses modales effectives ≈ 1 % |
| Même ligne, séisme spectral (CQC, SRSS directions) + éq. (10C) | PIPESTRESS | contraintes de l'éq. (10C) < 0,5 % aux points critiques (taux 1,369 contre 1,368 en 50, 1,080 contre 1,079 au coude 40) ; déplacements W + S ≈ 1 % |
| Ligne DN200 P265GH à supports à ressort (exemple 3) : supports variables 150 N/mm + précharge, support constant, robinet avec fluide, masse ponctuelle ; spectre à interpolation linéaire, modes jusqu'à 100 Hz + masse manquante | PIPESTRESS | poids : réactions < 0,1 % ; fréquences < 1 % ; éq. (6) < 0,5 % ; éq. (7) < 0,6 % ; éq. (10C) < 0,1 % ; efforts sismiques des ressorts < 0,1 % ; réactions thermiques des ressorts 3 à 4 % (calcul alors au module à froid ; PIPESTRESS les imprime à Eh) |
| Cas test collecteur DN200 (exemple « Cas test ») : té forgé avec tronçon rigide de dérivation, réduction concentrique α = 9,5° à soudures brutes, robinet, deux supports variables, appuis 876 kN/mm, dilatation au module à chaud | PIPESTRESS | éq. (6), (7), (8), (10C) < 1 % aux points critiques (té : 232,5 contre 232,3 MPa en éq. (7), 251,8 contre 251,5 en éq. (8)) ; réactions de dilatation < 0,5 % (AG1 suivant X : 3 %) ; poids < 1 % (ancrage Équipement 1,5 %) ; fréquences des modes 1 à 9 < 1 %, modes 10 à 12 + 3 à 4 % ; réactions sismiques poids + séisme ≈ 1 à 3 % |
| Problème de Hovgaard (Code_Aster SSLL101 ; Kellogg 1956, pb 5.9) : tuyauterie non plane à deux coudes R 922 mm, encastrée aux deux bouts, k = 1,65/h ; poids, dilatation ΔT = 472,22 °C, forces nodales | POUX, ADL, TITUS (poutre) | déplacements du point 3 < 0,2 % dans les trois cas ; moment résultant au point 1 sous poids < 0,05 % ; maillage du modèle A de SDLX02 (tubes droits non subdivisés, 4,5° par élément de coude) ; maillage fin (100 mm, 2,25°) : < 0,1 % |
| Même ligne, analyse modale et réponse spectrale (Code_Aster SDLX02) : spectre 2 % (2 g de 10 à 30 Hz en X et Y, moitié en Z), interpolation log-log, SRSS modes et directions, sans correction statique | POUX, ADL, TITUS | fréquences (masses concentrées) < 2 % sur les 7 premiers modes ; déplacements < 1,3 % ; réactions aux encastrements < 3 % ; efforts généralisés aux points 3, 7, 11 de 1 à 4 % (Mz au point 3 : 7 %, axes locaux différents dans le coude) ; maillage fin : fréquences 0,2 à 3,3 % sous les valeurs à masse complète |
| Hovgaard à masses concentrées (NUREG/CR-1677 vol. 1, problème 1) : tube sans masse, neuf masses ponctuelles, spectre tabulé en période (interpolation linéaire en période), facteurs 1 / 0,667 / 1, cinq modes en SRSS, sans masse manquante | rapport NRC (programme EPIPE, BNL 1980) | cinq fréquences < 0,05 % (28,54 contre 28,53 Hz…) ; facteurs de participation identiques à quatre chiffres ; déplacements et rotations < 0,2 % ; efforts et moments aux deux ancrages < 0,3 % |
| Ligne BM3 (NUREG/CR-6645 ; Code_Aster SDLL149) : trois diamètres, dix coudes, trois ancrages, sept appuis élastiques, masses concentrées aux 38 nœuds du rapport ; spectre à 1 % suivant X, 14 modes en SRSS, masse manquante à 0,54 g | rapport NRC ; cibles du manuel de vérification ANSYS (valeur NRC × rapport publié, arrondies à 1 % environ) | 14 fréquences < 0,3 % ; 21 réactions d'appui < 2 % (critères NRC : 2 % et 10 %) ; masse volumique de la section 3 du rapport (1,2908·10⁻³ lb·s²/in⁴ ; avec la valeur d'ANSYS, 1,253·10⁻³, écarts jusqu'à 9 %) |
| SDLL14 (guide VPCS AFNOR 1990 ; Code_Aster V2.02.014) : modes d'un coude mince à 90° (R = 1 m, tube 20 × 2), bras de 0, 0,6 et 2 m | PIPESTRESS et AFNOR (valeurs de la fiche Code_Aster) | quatre premières fréquences des trois configurations : < 0,25 % de PIPESTRESS, < 1,6 % de la solution analytique AFNOR (PIPESTRESS et Code_Aster en sont au même écart) |
| ASME B31.3-2012, annexe S, exemple 1 : ligne plane DN400 × 9,53 entre deux ancrages, deux coudes LR, calorifuge, eau, 260 °C et 3 450 kPa, raidissement des coudes par la pression | tableaux S301.5.1, S301.5.2 et S301.6 du code | réactions du cas de service < 0,3 % (FY de l'ancrage 50 : 0,6 %) ; déplacements à 0,1 mm près ; S_L aux cinq points < 0,3 % (99,1 contre 99,2 MPa au nœud 20) ; masse totale 0,1 %. L'étendue S_E du tableau S301.7 est donnée sans la contrainte axiale, que l'éq. (17) de l'édition 2012 ajoute |
| ASME B31.3-2012, annexe S, exemple 2 (solveur non linéaire) : même ligne doublée par symétrie, appui Y+ central, 288 °C et 3 795 kPa | tableaux S302.5.1 et S302.6.3.1 du code | appui du nœud 50 décollé en service (19 mm) ; réactions du cas de service < 0,3 % ; S_L appui retiré (condition 3) aux cinq points < 0,2 % : 129,8 contre 129,98 MPa au nœud 20, au-dessus de S_h = 124,5 MPa, alors que le calcul à froid donne 103,2 MPa |
| Fréquence propre d'une console | 1,875²/2π·√(EI/mL⁴) | < 0,5 % |
| Oscillateur simple, spectre plat | m·Sa·L | < 10⁻⁴ |
| Masse manquante, modes tronqués | réponse statique rigide | < 10⁻⁶ |
| Σ masses modales effectives (tous modes) | masse globale | < 10⁻⁶ |
| Gupta, oscillateur simple | réponse sans Gupta (invariance) | < 10⁻⁹ |

Discrétisation : avec 500 mm par élément droit (défaut), les fréquences de
l'exemple sont à moins de 1 % d'un maillage de 100 mm (contre 3 % avec
1 000 mm) ; les contraintes y sont insensibles. Les coudes discrétisés en
cordes de 22,5° sous-estimaient la souplesse de 1,5 % ; 10° par élément
ramène l'écart sous 0,5 %.

Choix de modélisation conformes à la pratique : masses concentrées en
translation (inertie de rotation négligée), raideur à E froid, supports
linéaires par pénalité (erreur relative ~10⁻⁵), spectre à fournir pour
l'amortissement retenu (le même ξ est utilisé par la CQC).

### 5.3 Tests automatiques

Les tests automatiques (`npm test`) comparent le solveur à des solutions
analytiques : console sous charge ponctuelle (avec et sans cisaillement) et
répartie, effort thermique bridé E·A·α·ΔT, dilatation libre, équilibre global
des réactions, fréquence propre d'une console (1,875²/2π·√(EI/mL⁴)), oscillateur
simple sous spectre plat, correction de masse manquante (égalité avec la réponse
statique rigide), coefficients CQC, facteurs k et i des coudes, contrôle de
Sturm (modes doubles), température de référence de 0 °C, plafond du renfort des
tés. Les autres codes (`tests/codes.test.mjs`) sont contrôlés sur des cas
calculables à la main : σ₁ et S_L d'une console sous poids et pression, flexions
dans le plan / hors plan d'un coude, admissibles (1a)/(1b), f_a et rapport
E_h/E_c, coefficients k, tableau C3.2.6-1 et méthode alternative du CODETI. Les cas de la littérature (`tests/reference.test.mjs`) sont rejoués à
chaque exécution : NUREG/CR-1677 problème 1, ligne BM3, SDLL14 ; les exemples 1
et 2 de l'annexe S de l'ASME B31.3-2012 le sont dans `tests/sustained.test.mjs`.

### 5.4 Avertissements de validité

Le calcul signale les situations où ses hypothèses conduisent à un résultat à
interpréter avec prudence (`src/diagnostics.js`), sans modifier les résultats :

- **appui simple soulevé** : effort de la tuyauterie vers le haut sur un appui
  simple sous poids, ou poids + dilatation (le calcul linéaire retient la
  tuyauterie, un appui réel décollerait) ; appui qui décollerait sous séisme ;
- **jeu rattrapé** et **course de support à ressort dépassée** (§ 1.6) ;
- **plusieurs cas de poids actifs** : leurs moments sont cumulés dans M_A ;
- **coupure dans la zone amplifiée du spectre** : la masse manquante, prise à
  l'accélération à période nulle, sous-estime alors les modes non retenus ;
- **SRSS avec des modes de fréquences voisines** (écart ≤ 10 %) : la CQC est
  recommandée (USNRC RG 1.92) ;
- **maillage trop lâche pour la coupure** : moins de deux éléments par demi-onde
  de flexion λ/2 = √(π/(2f))·(EI/m)^¼ (masses concentrées) ;
- **modes omis** : écart au contrôle de Sturm non corrigé.

## 6. Limites actuelles et évolutions

Les points en attente d'une décision ou d'un texte de code sont suivis dans
[QUESTIONS.md](QUESTIONS.md).

- Solveur linéaire (par défaut) : décollement, jeux et butées sont contrôlés
  après calcul et signalés (§ 1.6), sans recherche de l'état des contacts ; le
  frottement est ignoré et signalé. Le solveur non linéaire expérimental (§ 7)
  calcule l'état des contacts et le frottement.
- Poids, analyse modale et séisme au module à froid Ec (seule la dilatation a
  l'option du module à chaud) : en service à haute température, les fréquences
  réelles sont plus basses d'environ ½·(1 − Eh/Ec), soit 5 % à 300 °C.
- Réponse rigide (Gupta) : la fréquence f_ZPA de la formule f₂ = (f₁ + 2·f_ZPA)/3
  est prise égale à la fréquence de coupure saisie ; la coupure doit donc être la
  fréquence où le spectre rejoint l'accélération à période nulle.
- Coudes : pas de correction de k et i pour les extrémités à brides ; tés : pas
  de distinction collecteur / dérivation des piquages non forgés.
- Supports variables (ressorts) : raideur verticale k dans tous les cas, précharge P
  vers le haut dans le cas poids propre (effort repris P − k·u) ; supports constants :
  précharge P seule. Variabilité thermique |ΔF|/P indiquée par support.
- Pas d'effet de Bourdon ni de poussée de pression sur compensateurs.
- Pas de mouvements sismiques différentiels (SAM, éq. 10a) ni de spectres
  multiples.
- Réductions et brides à ajouter comme composants (avec
  leurs SIF et indices B).
- CODETI : édition 2006 (section C3), sans fluage ni épaisseur minimale ; EN 13480-3 :
  édition 2017 version 1 (pas d'A4:2021 / 2024) ; ASME B31.3 : édition
  2012 (pas de facteurs B31J). Admissibles de ces codes à saisir par
  l'utilisateur (une seule colonne S par matériau).
- Codes à ajouter : RCC-M classe 1 (B 3600, indices C, K, analyse en fatigue),
  classe 3 (D 3600), ASME B31.1.

## 7. Calcul non linéaire des supports : principes retenus

> **Expérimental.** Second solveur, au choix dans l'onglet Projet, destiné aux
> supports non linéaires. Le solveur linéaire décrit plus haut reste le solveur
> par défaut et n'est pas modifié. Sont en place : le calcul statique par états,
> la raideur par zones (appuis simples, jeux, butées des supports à ressort) et
> le frottement, qui alimentent directement les équations des codes. Reste à
> faire : la comparaison avec le logiciel de référence.

Les principes sont alignés sur le calcul statique non linéaire du logiciel de
comparaison (PIPESTRESS, aide en ligne, « Non-Linear Static Analysis » et cartes
NCAS, NRST, TITL), pour que les résultats soient directement comparables.

### 7.1 Ce qui change : la superposition

Le calcul linéaire traite chaque chargement séparément (poids, dilatation,
séisme) puis les codes combinent les résultats. Avec des contacts, ce n'est plus
permis : un appui peut porter sous le poids seul et décoller à chaud, un jeu peut
se fermer en cours de dilatation. La superposition des solutions de deux
chargements n'est pas la solution des chargements superposés, et ne l'est presque
jamais avec du frottement. Les codes ne donnent pas de règle stricte pour ce cas :
c'est à l'utilisateur de définir des cas qui respectent leur intention.

Le calcul non linéaire porte donc sur des **états** réels de la tuyauterie,
chacun avec son propre état des contacts :

- état froid (montage) : poids seul ;
- état chaud (service) : poids + dilatation, pour chaque cas thermique.

Les équations des codes demandent pourtant des moments par nature de chargement
(M_A pour le poids, M_C pour la dilatation, M_B pour le séisme). Les paragraphes
suivants disent comment les obtenir à partir des états.

### 7.2 Étendue de dilatation : différence entre états

Le poids est inclus dans tous les cas de dilatation ; M_C est l'étendue entre
ces états et l'état « poids seul » (plus grande différence entre deux états).
C'est la méthode que la documentation du logiciel de comparaison donne en exemple,
et la définition même de l'étendue dans les codes :

- EN 13480-3:2017, §12.3.4 : M_C est déterminé « à partir de la plus grande
  différence entre les moments », l'état nul devant être pris en compte ; §12.3.7,
  éq. (12.3.7-3) : les moments variables sont la différence M_Te − M_Ta entre
  deux instants ;
- CODETI 2006, C3.3.4 : étendue « déterminée pour la plus grande différence entre
  les moments » ;
- ASME B31.3-2012, §319.3.1 (a) et annexe S, exemple 3 : l'étendue se calcule
  par différence algébrique entre les conditions, y compris entre deux
  conditions de service.

Un calcul de « dilatation seule », sans le poids, n'a pas de sens avec des
contacts : sans le poids, les appuis n'ont pas le bon état.

### 7.3 Part du poids : état froid, et configuration de service

Une pratique obtient la part du poids à chaud par soustraction : état de service
moins un calcul de dilatation seule. Elle n'est pas retenue, parce que les deux
calculs soustraits n'ont pas le même état des contacts : leur différence ne
correspond à aucune structure réelle.

**Choix retenu** : M_A est le moment du cas « poids seul », calculé en non
linéaire (état froid). C'est le M_A de l'exemple de la documentation du logiciel
de comparaison (PIPESTRESS), donc directement comparable.

**Complément : le poids dans la configuration de service.** Quand un appui
décolle à chaud, le poids qu'il portait se reporte sur les autres supports, et le
calcul à froid ne le voit pas. L'application vérifie donc aussi les équations du
code avec le poids recalculé dans chaque configuration de supportage de service
qui diffère de l'état froid :

- la tuyauterie est celle de l'état froid, au module à froid ;
- les contacts sont figés dans leur état de service : un contact actif (appui en
  contact, jeu fermé, butée atteinte) devient un blocage ordinaire dans les deux
  sens ; un contact inactif (appui décollé, jeu ouvert) est retiré ;
- le chargement est le poids seul : pas de dilatation, pas de déplacement imposé,
  pas de frottement (ce n'est pas un appui pour les charges permanentes).

Ce cas, noté W(T1) pour l'état de service W+T1, apparaît parmi les cas de calcul
(déplacements, efforts sur les supports, efforts internes). Toutes les équations
où le poids intervient sont rejouées avec lui : charges permanentes, charges
occasionnelles, somme poids + étendue. Leurs lignes portent le cas W(T1)+P… et
la synthèse retient la configuration la plus sévère ; les lignes du calcul de
base (W+P…) restent celles du logiciel de comparaison. Si le supportage est le
même à froid et en service, rien n'est ajouté.

C'est le principe de l'ASME B31.3-2012, §320.1 (« the greatest S_L for each
operating condition ») et annexe S, exemple 2 (« Anticipated sustained
conditions considering pipe lift-off »), dont la condition 3 « reflects the
support scenario of the Operating Case 1, excludes thermal effects ». L'annexe
précise que le même principe vaut pour les guides et butées à un seul sens ou à
jeu. Les autres codes ne l'écrivent pas, mais la contrainte primaire due au
poids doit être admise dans toute configuration que la ligne prend réellement :
la vérification est faite pour tous.

*Limite.* Un contact figé actif est bilatéral : si le poids seul le sollicite en
sens inverse (jeu fermé par la dilatation, que le poids tend à rouvrir), il reste
actif, ce qui allège le reste de la ligne. Ce cas est signalé par un
avertissement.

### 7.4 Modèle de support et algorithme

**Raideur par zones.** Chaque direction d'un support non linéaire a une raideur
qui dépend du déplacement d le long de cette direction, sur quatre zones séparées
par d₁ ≤ 0 ≤ d₂ : k₁ pour d < d₁, k₂ pour d₁ ≤ d < 0, k₃ pour 0 ≤ d < d₂, k₄ pour
d ≥ d₂. Le problème reste linéaire par morceaux. Ce modèle couvre :

| Support | d₁, d₂ | Raideurs |
|---|---|---|
| Appui simple (tuyauterie posée) | d₁ = 0 | k₁ rigide, les autres nulles : n'agit que contre la descente |
| Jeu de part et d'autre | d₁ = −jeu côté −, d₂ = +jeu côté + | k₁ et k₄ rigides, k₂ = k₃ = 0 ; raideur nulle du côté sans butée |
| Butées d'un support à ressort | courses basse et haute | k₂ = k₃ = raideur du ressort, k₁ et k₄ majorées de la butée |

**Frottement.** Coefficient de Coulomb μ par support (réglages avancés des
supports ; vide : pas de frottement). Le frottement d'un support s'oppose au
déplacement de la tuyauterie, mesuré depuis la position de montage, dans les
directions que le support laisse libres. Il suit une loi à deux régimes, δ étant
ce déplacement et L = μ·Σ|R| la limite de frottement, somme des réactions des
directions actives du support :

- *adhérence* : la force vaut k_max·δ et reste inférieure à L ;
- *glissement* : la force vaut L, dirigée suivant le déplacement.

| Support | Directions libres | Limite L |
|---|---|---|
| Appui simple, étrier | plan horizontal | μ·\|R vertical\| |
| Guide ou butée à une direction | plan transversal à la direction bloquée | μ·\|R\| |
| Appui guidé (vertical et latéral) | axe du tube | μ·(\|R vertical\| + \|R latéral\|) |
| Guide d'un tube vertical (deux directions) | axe du tube | μ·(\|R₁\| + \|R₂\|) |

Seules les directions actives comptent : un appui décollé ne frotte pas ; un
guide dont le jeu est ouvert non plus, et sa direction redevient libre. La force
est produite par une raideur ajoutée dans les directions libres, ajustée jusqu'à
donner la bonne force : force et déplacement sont colinéaires par construction.
La raideur d'adhérence k_max vaut 1,75·10⁶ N/mm, valeur du logiciel de
comparaison (10⁷ lb/in). Le frottement est sans objet pour un ancrage, un support
à ressort ou un dispositif auto-bloquant.

*Écart avec le logiciel de comparaison.* Chaque direction bloquée y porte son
propre frottement, dans tout son plan transversal, y compris suivant une autre
direction bloquée au même point. Pour un support à une direction, les deux
modèles sont identiques. Pour un support à deux directions, l'application ne fait
frotter que suivant l'axe laissé libre : le tube ne glisse pas à travers son
guide, et l'adhérence d'une direction ne vient pas décharger l'autre. Deux
supports distincts placés au même nœud gardent chacun leurs directions libres,
comme dans le logiciel de comparaison.

**Itérations.** À chaque itération, deux hypothèses : la zone où se trouve le
déplacement de chaque contact, et la raideur de frottement de chaque support
frottant. Un calcul linéaire est fait sur ces hypothèses, puis elles sont
contrôlées :

1. *zone* : le déplacement calculé est dans la zone supposée ;
2. *frottement* : l'une des trois conditions suivantes, F_c étant la force
   calculée et L la limite :
   - |F_c/L − 1| < 10⁻⁶ (0,001 par défaut dans le logiciel de comparaison) ;
   - |F_c − L| inférieur à 10⁻³ N ;
   - raideur au plafond k_max et F_c ≤ L : le support adhère.

Si une hypothèse est fausse, elle est corrigée et le calcul repris. Au-delà d'un
nombre maximal d'itérations, le calcul échoue explicitement : aucun résultat non
convergé n'est rendu.

**Mise en œuvre des zones.** Dans une zone donnée, un contact apporte sa
raideur et un terme de charge qui assure la continuité de l'effort ; chaque
itération est donc un calcul linéaire ordinaire. Le contrôle de zone est fait sur
l'effort : un contact est cohérent si l'effort de la branche supposée égale celui
de la loi par morceaux au déplacement calculé (écart inférieur à 10⁻³ N ou à 10⁻⁹
de l'effort de contact le plus grand). Ce critère évite toute hésitation à la
frontière d'une zone. Toutes les zones fausses sont corrigées à la fois ; si un
état des contacts se répète (cycle), une seule correction est faite par
itération, celle du contact le plus en défaut. Le calcul échoue explicitement
après 60 itérations (200 avec frottement), si le cycle persiste, ou si la
tuyauterie n'est plus retenue quand des supports cessent d'agir (les supports en
cause sont nommés).

**Mise en œuvre du frottement.** Quand les zones sont cohérentes mais pas le
frottement, les raideurs de frottement sont recalculées d'un coup. Les zones
étant fixées, la tuyauterie répond linéairement aux forces appliquées aux nœuds
frottants : avec C la souplesse du système à ces nœuds, les déplacements valent
w = w₀ − C·g, g étant les forces de frottement. La loi de frottement donnant g en
fonction de w, il reste un petit système non linéaire, g = g(w₀ − C·g), de trois
inconnues par nœud frottant. Il est résolu par la méthode de Newton, avec le
jacobien exact :

- départ : tous les supports frottants adhérents (problème linéaire) ; ceux dont
  la force dépasse la limite passent ensuite en glissement ;
- recherche linéaire sur le résidu de force ; le long d'un pas, les points où un
  support glissant entre dans le domaine d'adhérence sont essayés aussi, la loi
  changeant de pente à cet endroit ;
- le résultat n'est qu'une proposition : le calcul complet suivant applique ces
  raideurs et contrôle zones et frottement avec les critères ci-dessus.

Un état demande ainsi deux à trois calculs complets dans les cas courants. Si le
frottement modifie l'état des contacts (appui déchargé, jeu qui ne se ferme
plus), les zones sont corrigées en gardant les raideurs de frottement comme
départ, puis le frottement est repris.

**États et frottement.** Chaque état est calculé depuis la position de montage,
avec son propre frottement, comme dans le logiciel de comparaison : à froid les
déplacements horizontaux sont faibles et les supports adhèrent le plus souvent ;
en service ils glissent sous la dilatation. L'étendue de dilatation, différence
de deux états, contient donc le frottement. Le retour à froid après un cycle, où
le frottement s'inverse, n'est pas calculé. Un problème avec frottement peut
avoir plusieurs solutions d'équilibre : celle rendue est celle que l'algorithme
atteint en partant de l'adhérence.

**Cas rendus au reste de l'application.** Pour que les équations des codes, les
tableaux et les combinaisons gardent leur sens :

- le cas de poids est l'état froid (poids seul, module à froid) : M_A ;
- chaque cas de dilatation est la différence entre l'état de service (poids +
  dilatation) et l'état « poids seul », tous deux calculés au module de la
  dilatation : M_C. Avec le module à chaud, cela demande un troisième calcul, le
  poids seul au module à chaud ;
- quand le supportage de service diffère de celui de l'état froid, un cas
  supplémentaire W(T1) : le poids dans cette configuration (§ 7.3).

La somme des cas de poids et de dilatation redonne l'état de service, au module près : le poids y est
compté au module à froid, comme dans le solveur linéaire. La répartition du poids
dépendant un peu du module (supports à ressort, tronçons à des températures
différentes), cette somme laisse sur un appui décollé un petit effort résiduel,
de l'ordre du newton sur le cas test collecteur. L'état des contacts affiché, lui,
est celui de l'état de service calculé : effort nul sur un appui décollé.

**Limites de cette version.** Un seul cas de poids propre actif ; les cas de
forces nodales restent calculés en linéaire, sans frottement ; le frottement
part de la position de montage dans chaque état (pas d'histoire du chargement,
pas de retour à froid) ; le séisme et l'analyse modale l'ignorent ; les
dispositifs auto-bloquants restent libres en statique.

### 7.5 Séisme : supports linéaires

L'analyse modale et spectrale est linéaire par nature : elle est faite sur une
structure dont l'état des contacts est fixé à l'avance. Dans le logiciel de
comparaison, un support non linéaire est calculé comme un support linéaire
ordinaire, avec sa raideur, pour l'analyse dynamique : le jeu est ignoré, l'appui
est bilatéral. C'est déjà l'hypothèse du solveur linéaire de l'application
(§ 1.6), qui reste donc valable telle quelle pour le solveur non linéaire.

Le traitement exact des jeux sous séisme relève de l'analyse temporelle linéaire
par morceaux (méthode « adaptive modal summation », ADAMOS, du logiciel de
comparaison : modes et amplitudes modales réévalués à chaque choc ou
relâchement), que l'application ne fait pas.

**Choix retenu** : supports actifs, comme le logiciel de comparaison. Un support
décollé ou à jeu ouvert en service est compté actif, avec sa raideur ; les
constats après calcul (§ 1.6) le signalent.

*Alternatives non retenues* :

| Convention | Support décollé ou jeu ouvert en service | Remarque |
|---|---|---|
| Supports actifs (retenu) | actif, avec sa raideur | compte un support qui peut ne jamais s'engager |
| État figé | libre | ignore un support que le séisme engagerait |
| Enveloppe | deux calculs, libre puis actif, résultats enveloppés | le calcul « libre » dit si le déplacement sismique atteint le jeu restant ; coût doublé |

L'enveloppe serait le raffinement à privilégier si le choix retenu se révélait
insuffisant. Aucune des trois n'est rigoureuse.

### 7.6 Fiabilité

- Sans support non linéaire actif, le solveur non linéaire doit redonner
  exactement les résultats du solveur linéaire : tous les cas de validation
  existants le contrôlent.
- À chaque calcul : équilibre global, conditions de contact (pas de traction sur
  un appui posé, pas de pénétration au-delà d'un jeu), compte rendu de
  convergence ; un calcul non convergé échoue explicitement.
- Cas à solution analytique sur une console (`tests/nonlinear.test.mjs`) :
  appui qui décolle quand l'encastrement monte, jeu ouvert ou rattrapé, butée
  d'un support à ressort ; équilibre vertical et état des contacts sur le cas
  test collecteur avec un appui posé qui décolle à chaud.
- Frottement, cas à solution analytique sur la même console
  (`tests/friction.test.mjs`) : glissement axial sous dilatation (force μ·R,
  dilatation freinée), adhérence puis glissement latéral, force colinéaire au
  déplacement, appui décollé sans frottement, appui guidé (somme des réactions,
  glissement suivant l'axe), guide à jeu, étrier. Sur les modèles complets : loi
  de frottement et équilibre contrôlés pour tous les exemples avec μ de 0,05 à
  1,5 ; résultats inchangés quand μ est nul ou absent.
- Robustesse : le frottement a été éprouvé sur 3 200 lignes tirées au hasard
  (appuis, guides, butées, jeux, deux supports au même nœud, μ de 0,1 à 0,6),
  sans échec et en deux calculs complets par état en médiane.
- Jeux différents de chaque côté (`tests/gaps.test.mjs`), sur la même console :
  butée basse proche et butée haute éloignée, butée à un seul sens (identique à
  l'appui simple), appui placé sous le tube, étrier à jeu haut, côtés − et +
  indépendants du sens de saisie du tube, courses haute et basse d'un support à
  ressort ; contrôles du solveur linéaire par côté.
- Poids dans la configuration de service (`tests/sustained.test.mjs`) : console
  dont l'appui décolle (moment d'encastrement wL²/2 appui retiré, contre wL²/8 à
  froid), jeu fermé gardé actif, sens inverse signalé, aucun ajout quand le
  supportage ne change pas ; exemple 2 de l'annexe S de l'ASME B31.3-2012
  reproduit à 0,2 % (§ 5.2).
- Reste à faire : comparaison avec le logiciel de référence, sans puis avec
  frottement. Les jeux de données et les valeurs attendues sont dans
  [validation/](validation/README.md) ; le modèle jumeau est l'exemple livré
  « Cas non linéaire ».

## Références

1. J. S. Przemieniecki, *Theory of Matrix Structural Analysis*, McGraw-Hill, 1968.
2. L. C. Peng, T.-L. Peng, *Pipe Stress Engineering*, ASME Press, 2009.
3. E. C. Rodabaugh, H. H. George, « Effect of internal pressure on flexibility and stress-intensification factors of curved pipe or welding elbows », *Trans. ASME* 79, 1957 ; A. R. C. Markl, « Fatigue tests of piping components », *Trans. ASME* 74, 1952.
4. M. W. Kellogg Co., *Design of Piping Systems*, 2ᵉ éd., Wiley, 1956.
5. B. T. Smith et al., *Matrix Eigensystem Routines – EISPACK Guide*, Springer, 1976 ; JAMA (domaine public).
6. A. Der Kiureghian, « A response spectrum method for random vibration analysis of MDF systems », *Earthquake Eng. Struct. Dyn.* 9, 1981.
7. U.S. NRC, Regulatory Guide 1.92 rév. 3, *Combining modal responses and spatial components in seismic response analysis*, 2012.
8. ASCE/SEI 4-16, *Seismic Analysis of Safety-Related Nuclear Structures*, 2017.
9. AFCEN, *RCC-M – Règles de conception et de construction des matériels mécaniques des îlots nucléaires REP*, Section I, sous-sections B, C, Annexe Z I.
10. ASME Boiler & Pressure Vessel Code, Section III, Division 1, Subsections NB, NC (NB-3600, NC-3600) et Appendix N.
12. EN 13480-3:2017 (F), version 1 (décembre 2017), *Tuyauteries industrielles métalliques – Partie 3 : conception et calcul*, article 12 et annexe H.
13. ASME B31.3-2012 (révision de l'ASME B31.3-2010), *Process Piping*, §302.3, §304, §319, §320, Appendix D et Appendix S (exemples 1 et 2).
14. SNCT, *CODETI 2006 – Code de construction des tuyauteries industrielles*, Division 1, partie C, section C3 « Analyse et critères d'acceptation ».
11. WRC Bulletin 300, *Technical position on damping values for piping*, 1984 ; NUREG-1061, 1985.
