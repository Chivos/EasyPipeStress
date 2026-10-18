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

Le sommet d'intersection des tangentes est remplacé par un arc de rayon R,
discrétisé en cordes (au plus 22,5° par élément, nombre pair pour disposer d'un
nœud milieu). Les nœuds créés sont nommés `<sommet>A`, `<sommet>M`,
`<sommet>B`. La flexibilité de l'ovalisation de la section (von Kármán, 1911 ;
Rodabaugh & George, 1957 [3]) est représentée par le **facteur de flexibilité**
k appliqué sur l'inertie de flexion (I/k), dans et hors du plan :

- caractéristique de flexibilité h = eₙ·R / r² (r rayon moyen) ;
- k = 1,65 / h ≥ 1 ; i = 0,9 / h^(2/3) ≥ 1 (RCC-M C 3680, ASME NC-3673.2) ;
- correction optionnelle de raidissement par la pression (Kellogg [4], ASME
  NC-3673.2 note) : k / [1 + 6(P/E)(r/e)^(7/3)(R/r)^(1/3)] et
  i / [1 + 3,25(P/E)(r/e)^(5/2)(R/r)^(2/3)].

Le facteur est fourni par le **code de vérification** actif (les formules
d'EN 13480-3 ou d'ASME B31.3 diffèrent), ce qui garantit la cohérence entre
analyse et dépouillement.

### 1.3 Supports

Chaque support est un ensemble de ressorts linéaires orientés (translation ou
rotation). Un blocage rigide est un ressort de pénalité (10¹⁰ N/mm,
10¹⁴ N·mm/rad), ce qui permet de traiter les directions biaises (guide d'un tube
incliné) et les déplacements imposés (mouvements de piquage, appliqués dans les
cas thermiques) sans modification de la numérotation. L'erreur relative induite
est de l'ordre du rapport raideur structurelle / raideur de pénalité (< 10⁻⁴).

Types : ancrage (6 DDL), appui vertical, guide latéral, appui + guide, butée
axiale, ressort vertical, blocage personnalisé par DDL globaux.

### 1.4 Résolution

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

### 3.2 Réponse spectrale

Pour chaque direction d'excitation (X, Y, Z) :

1. réponse du mode i : qᵢ = Γᵢ·Sa(fᵢ)/ωᵢ², avec interpolation log-log du
   spectre ;
2. combinaison modale **SRSS** ou **CQC** (Der Kiureghian, 1981 [6]) :
   ρᵢⱼ = 8ξ²(1+r)r^1,5 / [(1−r²)² + 4ξ²r(1+r)²], r = ωⱼ/ωᵢ ;
3. **correction de masse manquante** (USNRC RG 1.92 rév. 3 [7], ASCE 4-16 [8]) :
   la masse non capturée par les modes inférieurs à la fréquence de coupure,
   Mr − Σ Γᵢ·M·φᵢ, est soumise statiquement à l'accélération à période nulle
   (ZPA) ; la réponse rigide obtenue est combinée en SRSS avec la réponse
   modale.

Puis combinaison directionnelle **SRSS** ou **100-40-40** (Newmark).

Les résultats sismiques sont des enveloppes positives (non signées) ; les
moments résultants sont calculés à partir des composantes combinées.

### 3.3 Statique équivalente

Accélérations uniformes par direction (usuellement 1,5 × le pic du spectre de
plancher, ASME III Annexe N-1225 / pratique RCC-M), combinaison directionnelle.

## 4. Dépouillement RCC-M, sous-section C (classe 2)

Notations : Dₑ diamètre extérieur, eₙ épaisseur nominale, Z module de flexion,
M moment résultant √(Mx² + My² + Mz²) à chaque extrémité d'élément, S contrainte
admissible de base (à la température de calcul), Sy limite d'élasticité, Sc et Sh
valeurs de S à froid et à chaud.

| Réf. | Critère | Formule (formulation par défaut « 0,75 i ») |
|---|---|---|
| C 3641 | Épaisseur minimale | eₘ = P·Dₑ / [2(S/I + 0,4·P)] + c ≤ eₙ·(1 − tol) ; I = (4R/Dₑ − 1)/(4R/Dₑ − 2) à l'intrados des coudes |
| (6) | Poids propre + pression | S_L = P·Dₑ/(4eₙ) + 0,75i·M_A/Z ≤ k₆·Sh (k₆ = 1,0 par défaut) |
| (7) | Dilatation thermique | S_E = i·M_C/Z ≤ S_A = f·(1,25·Sc + 0,25·Sh) [+ (Sh − S_L), option] |
| (8) | (6) + (7), si (7) non satisfaite | P_max·Dₑ/(4eₙ) + 0,75i·M_A/Z + i·M_C/Z ≤ Sh + S_A |
| (10) | Séisme | P_max·Dₑ/(4eₙ) + 0,75i·(M_A + M_B)/Z ≤ k·Sh, k = 1,2 (B), 1,8 (C), 2,4 (D) par défaut, plafond optionnel k'·Sy |

0,75i est pris au moins égal à 1. Une option remplace P·Dₑ/(4eₙ) par
B₁·P·Dₑ/(2eₙ) et 0,75i par B₂ (indices C 3680 / NB-3683 : tube droit B₁ = 0,5,
B₂ = 1,0 ; coude B₁ = −0,1 + 0,4h borné à [0 ; 0,5], B₂ = 1,30/h^(2/3) ≥ 1).

Tous les coefficients d'admissible (k₆, k par niveau, plafonds Sy) sont des
paramètres de l'onglet *Code*, à caler sur l'édition applicable.

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

## 5. Validation

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
- Tés, réductions, brides et robinets rigides à ajouter comme composants (avec
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
