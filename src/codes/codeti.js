// CODETI (SNCT) — Division 1, édition 2013, partie C, section C10 « Analyse et
// critères d'acceptation » (C3.3 dans l'édition 2006).
//
// ATTENTION — le texte du CODETI n'est pas en accès libre : ce module est établi
// par recoupement de sources secondaires (guide professionnel citant les
// équations C10.3.2 et C10.3.3, documentation de logiciels de calcul), qui
// montrent une section C10 parallèle au chapitre 12 de l'EN 13480-3 :
//   C10.3.2  charges permanentes        σ₁ = P·Dₑ/(4e) + 0,75i·M_A/Z ≤ f
//   C10.3.3  charges occasionnelles ou exceptionnelles
//                                        σ₂ = P·Dₑ/(4e) + 0,75i·(M_A + M_B)/Z ≤ k·f
//            k = 1,0 / 1,15 / 1,2 / 1,3 / 1,8 (1,8 : séisme majoré de sécurité)
//   C10.3.4  étendue de dilatation      σ₃ = i·M_C/Z ≤ f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c
//            sinon                       σ₁ + σ₃ ≤ f + f_a
// Non confirmés sur le texte : tableau des facteurs de flexibilité et
// d'intensification (ceux de l'EN 13480-3, tableau H.1, sont repris ; le CODETI
// donnerait des facteurs distincts dans le plan et hors plan pour les piquages),
// module Z des piquages réduits, épaisseur à retenir (nominale ici), facteur U.
// À valider sur l'exemplaire du code de l'utilisateur avant tout usage contractuel.

import { componentFactors as b311Factors, rangeReductionFactor } from './rccm-c.js';
import { momentCheck, momentCombinations } from './moment-family.js';
import { DEFAULT_PARAMS, levelsFor, kParams, modulus, rangeAllowable } from './en13480.js';

export { DEFAULT_PARAMS };

const CAVEAT = 'Texte du CODETI non consulté (code non disponible en accès libre) : équations établies par recoupement de sources secondaires, facteurs k et i repris de l’EN 13480-3 (tableau H.1). À valider sur votre exemplaire du code.';

const spec = {
  defaults: DEFAULT_PARAMS,
  sym: { U: 'Facteur de réduction U', D: 'Dₑ', e: 'e', fh: 'f', fhot: 'f', fa: 'f_a', pTerm: 'P·Dₑ/(4e)', faFormula: 'f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
  eq: {
    sus: { id: 'c1', ref: 'C10.3.2', name: 'C10.3.2', label: 'C10.3.2 charges permanentes', formula: 'σ₁ = P·Dₑ/(4e) + 0,75i·M_A/Z ≤ f' },
    occ: { id: 'c2', ref: 'C10.3.3', name: 'C10.3.3', label: 'C10.3.3 charges occasionnelles', formula: 'σ₂ = P·Dₑ/(4e) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f' },
    exp: { id: 'c3', ref: 'C10.3.4', name: 'C10.3.4 (dilatation)', label: 'C10.3.4 étendue de dilatation', formula: 'σ₃ = i·M_C/Z ≤ f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
    comb: { id: 'c4', ref: 'C10.3.4', name: 'C10.3.4 (permanentes + dilatation)', label: 'C10.3.4 permanentes + dilatation', formula: 'σ₁ + σ₃ = P·Dₑ/(4e) + 0,75i·M_A/Z + i·M_C/Z ≤ f + f_a' },
  },
  rangeFactor: (params) => rangeReductionFactor(+params.cycles || 7000),
  levelsFor,
  modulus,
  rangeAllowable,
  notes: [CAVEAT, 'Colonne S des matériaux : contrainte nominale de calcul f du CODETI, à saisir pour la nuance, la catégorie de construction et l’édition applicables.'],
};

export const codeti = {
  id: 'codeti',
  label: 'CODETI Division 1 (2013) — à valider sur le texte',
  short: 'CODETI 2013, C10',
  reference: 'CODETI Division 1, édition 2013, partie C, section C10 — C10.3.2, C10.3.3, C10.3.4',
  caveat: CAVEAT,
  defaults: DEFAULT_PARAMS,
  materialHelp: 'Colonne S : contrainte nominale de calcul f du CODETI (selon la nuance et la catégorie de construction) ; les valeurs par défaut de la bibliothèque sont indicatives et établies pour le RCC-M.',
  params: [{ key: 'cycles', label: 'Nombre de cycles équivalents N', type: 'number', title: 'Détermine le facteur de réduction U de f_a' }, ...kParams('C10.3.3')],
  componentFactors: b311Factors,
  eqName: (eq) => ({ c1: 'C10.3.2', c2B: 'C10.3.3 niveau 1', c2C: 'C10.3.3 niveau 2', c2D: 'C10.3.3 niveau 3', c3: 'C10.3.4 dilatation', c4: 'C10.3.4 perm. + dilatation' })[eq] ?? eq,
  levelsFor,
  levelsTitle: 'Niveaux sismiques vérifiés (C10.3.3)',
  levelsHelp: 'Le coefficient k de l’admissible de chaque niveau se choisit dans l’onglet Code.',
  equations: [
    { ref: 'C10.3.2', name: 'Charges permanentes : poids + pression', formula: `${spec.eq.sus.formula}   (0,75i ≥ 1)` },
    { ref: 'C10.3.3', name: 'Charges occasionnelles ou exceptionnelles : séisme', formula: `${spec.eq.occ.formula} ; M_B = séisme × coefficient du niveau` },
    { ref: 'C10.3.4', name: 'Étendue de contrainte de dilatation', formula: spec.eq.exp.formula },
    { ref: 'C10.3.4', name: 'Permanentes + dilatation, si σ₃ > f_a', formula: spec.eq.comb.formula },
  ],
  help: [
    'Module Z = π(Dₑ⁴ − Dᵢ⁴)/(32Dₑ) ; tronçon réduit d’un té ou piquage réduit : π/4·d_m²·e_b, e_b = min(e ; i·e_b). Moments résultants √(Mx² + My² + Mz²) à la jonction, branche par branche. M_C : étendue calculée au module à chaud, E_h/E_c porté par l’admissible.',
    'Facteurs repris de l’EN 13480-3 (tableau H.1) : coudes h = 4R·e/d_m², k = 1,65/h, i = 0,9/h^⅔ (≥ 1). Tés : i = 0,9/h^⅔ avec h = 8,8e/d_m (forgé), 2(e + e_r/2)^2,5/(d_m·e^1,5) (piquage renforcé), 2e/d_m (piquage non renforcé). Réduction : i = 0,5 + α/100·√(D₂/e₂) ≤ 2.',
    'Épaisseur minimale, fluage et tassement d’appui : non vérifiés pour ce code.',
  ],
  check: (ctx) => momentCheck(spec, ctx),
  combinations: (ctx) => momentCombinations(spec, ctx, codeti),
};
