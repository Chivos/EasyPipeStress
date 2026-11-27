// CODETI 2006 (SNCT), Division 1, partie C, section C3 « Analyse et critères
// d'acceptation » (devenue C10 dans l'édition 2013).
//
//  C3.3.2    charges permanentes        σ₁ = p·D_o/(4e_f) + 0,75i·M_A/Z ≤ f_chaud
//  C3.3.3    charges occasionnelles ou exceptionnelles
//                                        σ₂ = p·D_o/(4e_f) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_chaud
//            k = 1 (durée d'application > 10 % de toute période de 24 h), 1,15
//            (< 10 %), 1,2 (< 1 %), 1,3 (charges exceptionnelles), 1,4 (essai de
//            résistance), 1,5 (SMHV), 1,8 (séisme majoré de sécurité)
//  C3.3.4-1  étendue de variation       σ₃ = i·M_C/Z ≤ f_a
//  C3.3.4-2  si (C3.3.4-1) non satisfaite
//                                        σ₄ = p·D_o/(4e_f) + 0,75i·M_A/Z + i·M_C/Z ≤ f_chaud + f_a
//  C3.2.4.2  f_a = U(1,25 f_froid + 0,25 f_chaud)·E_chaud/E_froid ; U : tableau C3.2.4.3
//            M_C est ramené au module à froid (× E_froid/E_chaud si la dilatation est
//            calculée à chaud), le rapport de f_a étant toujours appliqué : traitement
//            du logiciel de comparaison (PIPESTRESS) pour le CODETI antérieur à 2013.
//            Autre lecture possible, non retenue : celle de l'EN 13480-3, où M_C reste
//            au module à chaud (critère moins sévère de E_froid/E_chaud).
//  C3.2.6.2  0,75i ≥ 1 ; coefficients valables pour D_m/e_f < 100
//  C3.2.6.3  e_f : épaisseur de référence des contraintes (demi-plage des
//            tolérances, diminuée de la corrosion) ; ici l'épaisseur nominale,
//            diminuée de la corrosion si l'option du projet est cochée ; les
//            calculs de flexibilité restent en épaisseur nominale (C3.2.1.4).
//  Méthode alternative (C3.3.2 à C3.3.4, C3.4.3), option du code : moments
//  séparés dans le plan et hors plan, σ = √(σ_b² + 4σ_T²) avec
//  σ_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z. Le texte imprime σ_T = M_T/Z ; M_T/(2Z)
//  est retenu ici (contrainte de cisaillement de torsion), seule valeur qui
//  redonne la méthode directe pour un tube droit (i = 1).
//
// Tableau C3.2.6-1 (h, k, i, i_o, i_i ; D_m diamètre moyen, R_c rayon du coude) :
//  3     coude ou cintre     h = 4e_f·R_c/D_m², k = 1,65/h, i = i_i = 0,9/h^(2/3),
//                            i_o = 0,75/h^(2/3) ; k ramené à 1 pour une ouverture
//                            < 15°, interpolé entre 15° et 45° (C3.2.6.1)
//  5.1   réduction forgée    i = 0,5 + α/100·√(D₂/e₂) ≤ 2 (α ≤ 60°, d/e ≤ 100)
//  6     té reconstitué non renforcé   h = 2e_f/D_m
//  7     té avec anneau ou selle       h = 2(e_f + e_r/2)^(5/2)/(e_f^(3/2)·D_m) si
//                                      e_r ≤ 1,5e_f, 8e_f/D_m au-delà
//  11    té forgé            h = 8,8e_f/D_m
//        tés : k = 1, i = i_o = 0,9/h^(2/3), i_i = 0,75·i_o + 0,25
//  15.1  soudure bout à bout 1,0 (e_n ≥ 5 mm et δ ≤ 0,1e_f), sinon 1,8
//  Module : π(D_o⁴ − D_i⁴)/(32D_o) ; dérivation : π/4·d_m²·e_x, e_x = min(e_f ; i·e_b)
//  Note (4), option : correction de pression sur k et i des coudes.
// Non repris : brides aux extrémités des coudes (note 3), coudes à sections,
// piquages forgés et extrudés (lignes 8 à 10, 12, 13), fluage σ₅ (C3.3.4-3),
// mouvement d'ancrage non répété σ₆ (C3.3.5), tableau C3.2.6-2.

import { rangeReductionFactor } from './rccm-c.js';
import { momentCheck, momentCombinations, corrodedSection, corrodedFactors } from './moment-family.js';
import { makeLevels, kParams, K_LABELS } from './en13480.js';
import { reducedBranch } from './shared.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  method: 'direct',
  pressureCorrection: false,
  kB: 1.2,
  kC: 1.5,
  kD: 1.8,
};

export const K_OPTIONS = [1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.8];
const LABELS = { ...K_LABELS, 1.2: '1,2 — occasionnelle, moins de 1 % du temps', 1.4: '1,4 — essai de résistance', 1.5: '1,5 — SMHV', 1.8: '1,8 — séisme majoré de sécurité (SMS)' };
const METHODS = { direct: 'Directe : moment résultant, coefficient i (C3.4.2)', alternative: 'Alternative : dans le plan / hors plan, i_i et i_o (C3.4.3)' };

export const levelsFor = makeLevels(K_OPTIONS, DEFAULT_PARAMS);

/** Coefficients du tableau C3.2.6-1 : flexibilité k, intensification i, i_o (hors plan), i_i (dans le plan). */
export function componentFactors({ kind, sec, bend, reducer, P = 0, Ec, params = {}, teeType, pad = 0, sif = null }) {
  const same = (i, h = null) => ({ k: 1, i, ii: i, io: i, h });
  if (kind === 'reducer' && reducer) return same(reducer.i);
  if (kind === 'tee') {
    if (teeType === 'user' && sif >= 1) return same(sif);
    const ef = sec.t;
    const Dm = 2 * sec.rm;
    let h;
    if (teeType === 'reinforced') h = pad > 1.5 * ef ? (8 * ef) / Dm : (2 * (ef + 0.5 * pad) ** 2.5) / (ef ** 1.5 * Dm);
    else if (teeType === 'unreinforced') h = (2 * ef) / Dm;
    else h = (8.8 * ef) / Dm;
    const io = Math.max(1, 0.9 / h ** (2 / 3));
    return { k: 1, i: io, io, ii: Math.max(1, 0.75 * io + 0.25), h };
  }
  if (kind !== 'bend' || !bend) return same(1);
  const r = sec.rm;
  const t = sec.t;
  const R = bend.radius;
  const h = (4 * t * R) / (2 * r) ** 2;
  let k = 1.65 / h;
  let ii = 0.9 / h ** (2 / 3);
  let io = 0.75 / h ** (2 / 3);
  if (params.pressureCorrection && P > 0 && Ec > 0) {
    k /= 1 + 6 * (P / Ec) * (r / t) ** (7 / 3) * (R / r) ** (1 / 3);
    const d = 1 + 3.25 * (P / Ec) * (r / t) ** (5 / 2) * (R / r) ** (2 / 3);
    ii /= d;
    io /= d;
  }
  k = Math.max(1, k);
  // C3.2.6.1 : ouverture < 15° : k = 1 ; de 15° à 45° : interpolation linéaire entre 1 et la valeur du tableau
  const deg = bend.angle != null ? (bend.angle * 180) / Math.PI : 90;
  const w = deg < 15 ? 0 : deg >= 45 ? 1 : (deg - 15) / 30;
  k = 1 + w * (k - 1);
  ii = Math.max(1, ii);
  io = Math.max(1, io);
  return { k, i: ii, ii, io, h };
}

/** Module d'inertie : π(D_o⁴ − D_i⁴)/(32D_o) ; dérivation réduite : π/4·d_m²·e_x, e_x = min(e_f ; i·e_b). */
function modulus(pt, sec) {
  const run = reducedBranch(pt);
  if (run) {
    const ex = Math.min(run.t, pt.fac.i * sec.t);
    const Z = Math.PI * sec.rm * sec.rm * ex;
    return {
      Z,
      zItems: [
        ['Diamètre moyen de la tubulure d_m', 2 * sec.rm, 'mm'],
        ['Épaisseur e_x = min(e_f ; i·e_b)', ex, 'mm'],
        ['Module Z = π/4·d_m²·e_x (dérivation)', Z, 'mm³'],
      ],
    };
  }
  return { Z: sec.Z, zItems: [['Module Z = π(D_o⁴ − D_i⁴)/(32D_o)', sec.Z, 'mm³']] };
}

/** f_a = U(1,25 f_froid + 0,25 f_chaud)·E_chaud/E_froid (C3.2.4.2-1). */
function rangeAllowable({ U, fc, fh, ratio, hot }) {
  const fa = U * (1.25 * fc + 0.25 * fh) * ratio;
  return {
    fa,
    items: [
      ['Coefficient de réduction U', U, ''],
      ['f_froid (à T_réf)', fc, 'MPa'],
      ['f_chaud (à T)', fh, 'MPa'],
      [hot ? 'Rapport E_chaud/E_froid' : 'Rapport E_chaud/E_froid non appliqué (moments calculés au module à froid)', ratio, ''],
      ['f_a = U(1,25 f_froid + 0,25 f_chaud)·E_chaud/E_froid', fa, 'MPa'],
    ],
  };
}

const spec = {
  short: 'CODETI',
  defaults: DEFAULT_PARAMS,
  maxDmOverE: 100,
  sym: { U: 'Coefficient de réduction U', D: 'D_o', e: 'e_f', fh: 'f_chaud', fhot: 'f_chaud', fa: 'f_a', pTerm: 'p·D_o/(4e_f)', faFormula: 'f_a = U(1,25 f_froid + 0,25 f_chaud)·E_chaud/E_froid' },
  eq: {
    sus: { id: 'c1', ref: '(C3.3.2)', name: 'σ₁', label: 'σ₁ charges permanentes (C3.3.2)', formula: 'σ₁ = p·D_o/(4e_f) + 0,75i·M_A/Z ≤ f_chaud' },
    occ: { id: 'c2', ref: '(C3.3.3)', name: 'σ₂', label: 'σ₂ charges occasionnelles (C3.3.3)', formula: 'σ₂ = p·D_o/(4e_f) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_chaud' },
    exp: { id: 'c3', ref: '(C3.3.4-1)', name: 'σ₃', label: 'σ₃ étendue de variation (C3.3.4-1)', formula: 'σ₃ = i·M_C/Z ≤ f_a = U(1,25 f_froid + 0,25 f_chaud)·E_chaud/E_froid' },
    comb: { id: 'c4', ref: '(C3.3.4-2)', name: 'σ₄', label: 'σ₄ permanentes + dilatation (C3.3.4-2)', formula: 'σ₄ = p·D_o/(4e_f) + 0,75i·M_A/Z + i·M_C/Z ≤ f_chaud + f_a' },
  },
  rangeFactor: (params) => rangeReductionFactor(+params.cycles || 7000),
  levelsFor,
  alternative: (params) => params.method === 'alternative',
  // module de M_C non précisé par la section C3 : étendue ramenée au module à froid,
  // f_a portant E_chaud/E_froid, comme le logiciel de comparaison pour le CODETI
  // antérieur à 2013 (plus sévère que le traitement de l'EN 13480-3 de E_froid/E_chaud)
  rangeModulus: 'cold',
  // e_f : épaisseur de référence (C3.2.6.3), corrosion déduite si l'option du projet est cochée
  stressSection: corrodedSection,
  stressFactors: corrodedFactors(componentFactors),
  modulus,
  rangeAllowable,
  notes: [
    'Colonne S des matériaux : contrainte admissible f du CODETI (annexes GA4 ou GA5), à saisir pour la nuance et la catégorie de construction.',
    'Fluage σ₅ (C3.3.4-3) et mouvement d’ancrage unique non répété σ₆ (C3.3.5) : non vérifiés.',
  ],
};

export const codeti = {
  id: 'codeti',
  label: 'CODETI 2006 Division 1 (section C3)',
  short: 'CODETI 2006, C3',
  reference: 'CODETI 2006, Division 1, partie C, section C3 — équations (C3.3.2), (C3.3.3), (C3.3.4-1), (C3.3.4-2) ; coefficients du tableau C3.2.6-1',
  defaults: DEFAULT_PARAMS,
  materialHelp: 'Colonne S : contrainte admissible f du CODETI (annexes GA4 ou GA5, selon la nuance et la catégorie de construction) ; les valeurs par défaut de la bibliothèque sont indicatives et établies pour le RCC-M.',
  params: [
    { key: 'cycles', label: 'Nombre de cycles de pleine amplitude équivalent N', type: 'number', title: 'Détermine le coefficient de réduction U de f_a (tableau C3.2.4.3)' },
    { key: 'method', label: 'Méthode de calcul des contraintes', type: 'select', options: () => Object.keys(METHODS), optionLabel: (v) => METHODS[v], title: 'Méthode directe (moment résultant et coefficient i) ou méthode alternative (moments dans le plan et hors plan, coefficients i_i et i_o)' },
    { key: 'pressureCorrection', label: 'Correction de pression sur k et i des coudes', type: 'checkbox', title: 'Tableau C3.2.6-1, note (4) : grand diamètre, petite épaisseur' },
    ...kParams('(C3.3.3)', K_OPTIONS, LABELS),
  ],
  componentFactors,
  eqName: (eq) => ({ c1: 'σ₁', c2B: 'σ₂ niveau 1', c2C: 'σ₂ niveau 2', c2D: 'σ₂ niveau 3', c3: 'σ₃', c4: 'σ₄' })[eq] ?? eq,
  levelsFor,
  levelsTitle: 'Niveaux sismiques vérifiés (σ₂, éq. C3.3.3)',
  levelsHelp: 'Le coefficient k de l’admissible de chaque niveau (1,5 pour le SMHV, 1,8 pour le SMS…) se choisit dans l’onglet Code.',
  equations: [
    { ref: '(C3.3.2)', name: 'Charges permanentes : poids + pression', formula: `${spec.eq.sus.formula}   (0,75i ≥ 1)` },
    { ref: '(C3.3.3)', name: 'Charges occasionnelles ou exceptionnelles : séisme', formula: `${spec.eq.occ.formula} ; M_B = séisme × coefficient du niveau` },
    { ref: '(C3.3.4-1)', name: 'Étendue de variation de contrainte', formula: spec.eq.exp.formula },
    { ref: '(C3.3.4-2)', name: 'Permanentes + dilatation, si σ₃ > f_a', formula: spec.eq.comb.formula },
  ],
  help: [
    'e_f : épaisseur de référence des contraintes (C3.2.6.3), prise égale à l’épaisseur nominale, diminuée de la surépaisseur de corrosion si l’option « tolérance et corrosion » du projet est cochée ; la flexibilité est calculée en épaisseur nominale (C3.2.1.4). Module Z = π(D_o⁴ − D_i⁴)/(32D_o) ; dérivation réduite : π/4·d_m²·e_x, e_x = min(e_f ; i·e_b). M_C : étendue ramenée au module à froid (moments calculés à chaud × E_froid/E_chaud), f_a portant E_chaud/E_froid.',
    'Tableau C3.2.6-1 : coudes h = 4e_f·R_c/D_m², k = 1,65/h (ramené à 1 sous 15° d’ouverture, interpolé jusqu’à 45°), i = i_i = 0,9/h^⅔, i_o = 0,75/h^⅔. Tés : i = i_o = 0,9/h^⅔, i_i = 0,75·i_o + 0,25, avec h = 8,8e_f/D_m (forgé), 2(e_f + e_r/2)^2,5/(e_f^1,5·D_m) (renforcé, 8e_f/D_m si e_r > 1,5e_f), 2e_f/D_m (non renforcé). Réduction forgée : i = 0,5 + α/100·√(D₂/e₂) ≤ 2. Soudure bout à bout : 1,0, ou 1,8 si e_n < 5 mm ou δ > 0,1e_f (colonne « Soudures » des réductions). Coefficients valables pour D_m/e_f < 100.',
    'Méthode alternative (C3.4.3), au choix ci-dessus : les termes i·M/Z deviennent σ = √(σ_b² + 4σ_T²), σ_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z, σ_T = M_T/(2Z) ; le texte imprime σ_T = M_T/Z, non retenu car il ne redonne pas la méthode directe pour un tube droit. Non vérifiés : épaisseur minimale, fluage σ₅ (C3.3.4-3), mouvement d’ancrage non répété σ₆ (C3.3.5).',
  ],
  check: (ctx) => momentCheck(spec, ctx),
  combinations: (ctx) => momentCombinations(spec, ctx, codeti),
};
