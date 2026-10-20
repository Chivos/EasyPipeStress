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
d'Young à la température de référence (E froid), conformément à la pratique des
codes pour le calcul de l'étendue des moments d'expansion (RCC-M C 3653.3,
ASME III NC-3653.3).

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

### 1.4 Robinets

Le robinet est un élément de poutre « rigide » entre deux nœuds, de longueur
égale à son face-à-face : sa masse totale est répartie sur sa longueur (poids
propre et inertie sismique), sa raideur vaut un facteur (10 par défaut) fois
celle du tube de raccordement, et il se dilate à la température du tube
raccordé. Ce facteur suit la pratique des logiciels de flexibilité : un corps
de robinet est beaucoup plus raide que le tube, mais une raideur « infinie »
dégraderait le conditionnement numérique sans changer les résultats (au-delà
de ×10, la souplesse du robinet devient négligeable devant celle du reste de la
ligne). Le corps du robinet n'est pas vérifié au titre du code (il relève de
la qualification du fabricant) ; les extrémités des tubes raccordés le sont.

### 1.5 Supports

Chaque support est un ensemble de ressorts linéaires orientés (translation ou
rotation). Un blocage rigide est un ressort de pénalité (10¹⁰ N/mm,
10¹⁴ N·mm/rad), ce qui permet de traiter les directions biaises (guide d'un tube
incliné) et les déplacements imposés (mouvements de piquage, appliqués dans les
cas thermiques) sans modification de la numérotation. L'erreur relative induite
est de l'ordre du rapport raideur structurelle / raideur de pénalité (< 10⁻⁴).

Types : ancrage (6 DDL), appui vertical, guide latéral, appui + guide, butée
axiale, ressort vertical, blocage personnalisé par DDL globaux.

### 1.6 Résolution

- Renumérotation des nœuds par Cuthill-McKee inverse (réduction du profil).
- Factorisation de Cholesky en profil (« skyline ») de la matrice de raideur.
- Un pivot nul ou négatif signale un mécanisme : le message indique le nœud et
  le DDL non retenus.

## 2. Chargements

| Cas | Modélisation |
|---|---|
| Poids propre | Charges réparties m·g (métal + fluide + calorifuge) par forces nodales équivalentes de poutre bi-encastrée, masses ponctuelles. |
| Pression | Pression de calcul Pd et maximale de service P1 portées par les tubes, utilisées dans les équations de contraintes (terme de membrane longitudinale) et la correction de flexibilité. Effet de fond auto-équilibré dans un circuit fermé. |
| Dilatation thermique | Déformation libre ε = ᾱ(T)·(T − T_réf), ᾱ coefficient moyen de dilatation entre T_réf et T, introduite par forces de blocage ±E·A·ε ; déplacements imposés des supports. |
| Séisme (inertie) | Analyse modale spectrale ou statique équivalente (cf. § 3). |

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

### 3.2 Réponse spectrale

Par défaut, les deux directions horizontales (déduites de l'axe vertical du
projet) partagent un même spectre et un même facteur : une seule saisie pour
l'horizontal, une pour le vertical ; l'option peut être décochée pour saisir un
spectre par direction.

Pour chaque direction d'excitation (X, Y, Z) :

1. réponse du mode i : qᵢ = Γᵢ·Sa(fᵢ)/ωᵢ², avec interpolation log-log du
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
| Ligne DN100 × 3,6 (3 coudes LR, 2 ancrages, appui-guide), éq. (7) RCC-M C | PIPESTRESS (même modèle, coudes vérifiés aux extrémités) | < 0,3 % sur S_E et le taux |
| Même ligne, poids propre (tube plein d'eau) + pression, éq. (6) | PIPESTRESS | Σ réactions < 0,1 % ; réactions et déplacements ≈ 1 % ; taux < 0,5 % (max 0,594 contre 0,592) |
| Même ligne, analyse modale | PIPESTRESS | masse totale identique (239,3 kg) ; 6 premières fréquences < 0,8 % ; masses modales effectives ≈ 1 % |
| Même ligne, séisme spectral (CQC, SRSS directions) + éq. (10C) | PIPESTRESS | contraintes de l'éq. (10C) < 0,5 % aux points critiques (taux 1,369 contre 1,368 en 50, 1,080 contre 1,079 au coude 40) ; déplacements W + S ≈ 1 % |
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
statique rigide), coefficients CQC, facteurs k et i des coudes.

## 6. Limites actuelles et évolutions

- Supports linéaires bilatéraux (pas de jeux, frottement, décollement).
- Pas d'effet de Bourdon ni de poussée de pression sur compensateurs.
- Pas de mouvements sismiques différentiels (SAM, éq. 10a) ni de spectres
  multiples.
- Réductions et brides à ajouter comme composants (avec
  leurs SIF et indices B).
- Codes à ajouter : RCC-M classe 1 (B 3600, indices C, K, analyse en fatigue),
  classe 3 (D 3600), EN 13480-3, ASME B31.1 / B31.3.

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
11. WRC Bulletin 300, *Technical position on damping values for piping*, 1984 ; NUREG-1061, 1985.
