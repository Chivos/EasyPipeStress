// EN 13480-3:2017 « Tuyauteries industrielles métalliques — Partie 3 : conception
// et calcul », chapitre 12 (analyse de flexibilité), facteur i unique de l'annexe H
// (tableau H.1). Les équations sont celles de l'édition 2017 (terme de pression
// p_c·d_o/(4e_n), moment résultant) ; les amendements A4:2021 et l'édition 2024
// (effort axial, section corrodée, facteurs i_i / i_o / i_t du tableau H.3) ne
// sont pas repris.
//
//  (12.3.2-1)  charges permanentes        σ₁ = p_c·d_o/(4e_n) + 0,75i·M_A/Z ≤ f_f
//  (12.3.3-1)  charges occasionnelles ou exceptionnelles (séisme)
//                                          σ₂ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_f
//  (12.3.4-1)  étendue de dilatation      σ₃ = i·M_C/Z ≤ f_a
//  (12.3.4-2)  si (12.3.4-1) non satisfaite
//                                          σ₄ = σ₁ + σ₃ ≤ f_h + f_a
//  avec 0,75i ≥ 1 ; f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c (12.1.3-1), U fonction du
//  nombre de cycles (tableau 12.1.3-1). L'étendue M_C est calculée au module à
//  chaud ; E_h/E_c ramène l'admissible à la même étendue de déformation.
//  Coefficient k (12.3.3) : 1,0 si la charge agit plus de 10 % de toute période de
//  24 h, 1,15 si moins de 10 %, 1,2 si moins de 1 % (séisme de dimensionnement),
//  1,3 pour une charge exceptionnelle, 1,8 pour le séisme majoré de sécurité ;
//  un coefficient par niveau du cas sismique (paramètres du code).
//  Annexe H, tableau H.1 : coude h = 4R·e_n/d_m², k_B = 1,65/h, i = 0,9/h^(2/3) ;
//  té forgé h = 8,8e_n/d_m ; piquage h = 2e_n/d_m ; piquage avec anneau de renfort
//  h = 2(e_n + e_pl/2)^2,5/(d_m·e_n^1,5) ; réduction i = 0,5 + α/100·√(d/e_n) ≤ 2 ;
//  soudure bout à bout 1,0 (1,8 si e_n < 5 mm ou désalignement > 0,1e_n).
//  Mêmes expressions que le RCC-M classe 2 (d_m = 2r).
//  Épaisseur minimale (§6.1, coudes §6.2.3) : e = p_c·D_o/(2f·z + p_c), z = 1.
//
//  Les admissibles sont lus dans la colonne S des matériaux, à saisir comme la
//  contrainte de calcul f du §5.2 : f_f à la température de calcul, f_c à froid
//  (le plafond R_m/3 de f_c est à intégrer dans la valeur saisie), f_h à chaud.
//  Non vérifiés : fluage (12.3.5), déplacement d'appui non répété (12.3.6).

import { materialAt } from '../core/materials.js';
import { componentFactors as b311Factors, rangeReductionFactor } from './rccm-c.js';
import { momentCheck, momentCombinations } from './moment-family.js';
import { reducedBranch } from './shared.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  kB: 1.2,
  kC: 1.3,
  kD: 1.8,
};

export const K_OPTIONS = [1, 1.15, 1.2, 1.3, 1.8];
const K_LABELS = {
  1: '1,0 — occasionnelle, plus de 10 % du temps',
  1.15: '1,15 — occasionnelle, moins de 10 % du temps',
  1.2: '1,2 — occasionnelle, moins de 1 % du temps (séisme de dimensionnement)',
  1.3: '1,3 — exceptionnelle',
  1.8: '1,8 — séisme majoré de sécurité',
};
const kOf = (v, d) => (K_OPTIONS.includes(+v) ? +v : d);

/** Niveaux sismiques : coefficient k de l'admissible choisi par niveau (paramètres du code). */
export const levelsFor = (params) =>
  Object.fromEntries(
    ['B', 'C', 'D'].map((L, n) => {
      const k = kOf(params[`k${L}`], DEFAULT_PARAMS[`k${L}`]);
      return [L, { label: `niveau ${n + 1} (k = ${String(k).replace('.', ',')})`, k }];
    }),
  );

/** Paramètres « coefficient k par niveau » de l'onglet Code. */
export const kParams = (ref) =>
  ['B', 'C', 'D'].map((L, n) => ({
    key: `k${L}`,
    label: `Coefficient k du niveau sismique ${n + 1}`,
    type: 'select',
    options: () => K_OPTIONS,
    optionLabel: (v) => K_LABELS[v],
    title: `Coefficient k de l’équation ${ref} appliqué à ce niveau du cas sismique`,
  }));

/** Module Z : π(d_o⁴ − d_i⁴)/(32d_o) ; piquage réduit : π/4·d_m,b²·e_b, e_b = min(e_n ; i·e_n,b). */
export function modulus(pt, sec) {
  const run = reducedBranch(pt);
  if (run) {
    const eb = Math.min(run.t, pt.fac.i * sec.t);
    const Z = Math.PI * sec.rm * sec.rm * eb;
    return {
      Z,
      zItems: [
        ['Diamètre moyen du piquage d_m,b', 2 * sec.rm, 'mm'],
        ['Épaisseur effective e_b = min(e_n ; i·e_n,b)', eb, 'mm'],
        ['Module Z = π/4·d_m,b²·e_b (piquage réduit)', Z, 'mm³'],
      ],
    };
  }
  return { Z: sec.Z, zItems: [['Module Z = π(d_o⁴ − d_i⁴)/(32d_o)', sec.Z, 'mm³']] };
}

/** f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c ; rapport non appliqué si les moments sont calculés à froid. */
export function rangeAllowable({ U, fc, fh, ratio, hot }) {
  const fa = U * (1.25 * fc + 0.25 * fh) * ratio;
  return {
    fa,
    items: [
      ['Facteur de réduction U', U, ''],
      ['f_c (à T_réf)', fc, 'MPa'],
      ['f_h (à T)', fh, 'MPa'],
      [hot ? 'Rapport E_h/E_c' : 'Rapport E_h/E_c non appliqué (moments calculés au module à froid)', ratio, ''],
      ['f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c', fa, 'MPa'],
    ],
  };
}

const spec = {
  defaults: DEFAULT_PARAMS,
  sym: { U: 'Facteur de réduction U', D: 'd_o', e: 'e_n', fh: 'f_f', fhot: 'f_h', fa: 'f_a', pTerm: 'p_c·d_o/(4e_n)', faFormula: 'f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
  eq: {
    sus: { id: 's1', ref: '(12.3.2-1)', name: 'σ₁', label: 'σ₁ charges permanentes (12.3.2-1)', formula: 'σ₁ = p_c·d_o/(4e_n) + 0,75i·M_A/Z ≤ f_f' },
    occ: { id: 's2', ref: '(12.3.3-1)', name: 'σ₂', label: 'σ₂ charges occasionnelles (12.3.3-1)', formula: 'σ₂ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_f' },
    exp: { id: 's3', ref: '(12.3.4-1)', name: 'σ₃', label: 'σ₃ étendue de dilatation (12.3.4-1)', formula: 'σ₃ = i·M_C/Z ≤ f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
    comb: { id: 's4', ref: '(12.3.4-2)', name: 'σ₄', label: 'σ₄ permanentes + dilatation (12.3.4-2)', formula: 'σ₄ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + i·M_C/Z ≤ f_h + f_a' },
  },
  rangeFactor: (params) => rangeReductionFactor(+params.cycles || 7000),
  levelsFor,
  modulus,
  rangeAllowable,
  notes: [
    'Colonne S des matériaux : contrainte de calcul f de l’EN 13480-3 §5.2, à saisir pour la nuance et l’édition applicables (f_c plafonnée à R_m/3).',
    'Fluage (12.3.5) et déplacement d’appui non répété (12.3.6) : non vérifiés.',
  ],
};

export const en13480 = {
  id: 'en13480-3',
  label: 'EN 13480-3 (2017) — tuyauteries industrielles',
  short: 'EN 13480-3',
  reference: 'EN 13480-3:2017, §12.3 — équations (12.3.2-1), (12.3.3-1), (12.3.4-1), (12.3.4-2) ; facteur i unique de l’annexe H (tableau H.1)',
  defaults: DEFAULT_PARAMS,
  materialHelp: 'Colonne S : contrainte de calcul f de l’EN 13480-3 (§5.2 : min(Rp0,2/t / 1,5 ; Rm / 2,4) pour les aciers non austénitiques, Rp1,0/t / 1,5 pour les austénitiques à A ≥ 35 %) ; les valeurs par défaut de la bibliothèque sont indicatives et établies pour le RCC-M.',
  params: [{ key: 'cycles', label: 'Nombre de cycles équivalents N', type: 'number', title: 'Détermine le facteur de réduction U de f_a (tableau 12.1.3-1)' }, ...kParams('(12.3.3-1)')],
  componentFactors: b311Factors,
  eqName: (eq) => ({ s1: 'σ₁', s2B: 'σ₂ niveau 1', s2C: 'σ₂ niveau 2', s2D: 'σ₂ niveau 3', s3: 'σ₃', s4: 'σ₄' })[eq] ?? eq,
  levelsFor,
  levelsTitle: 'Niveaux sismiques vérifiés (σ₂, éq. 12.3.3-1)',
  levelsHelp: 'Le coefficient k de l’admissible de chaque niveau se choisit dans l’onglet Code.',
  equations: [
    { ref: spec.eq.sus.ref, name: 'Charges permanentes : poids + pression', formula: `${spec.eq.sus.formula}   (0,75i ≥ 1)` },
    { ref: spec.eq.occ.ref, name: 'Charges occasionnelles ou exceptionnelles : séisme', formula: `${spec.eq.occ.formula} ; M_B = séisme × coefficient du niveau` },
    { ref: spec.eq.exp.ref, name: 'Étendue de contrainte de dilatation', formula: spec.eq.exp.formula },
    { ref: spec.eq.comb.ref, name: 'Permanentes + dilatation, si σ₃ > f_a', formula: spec.eq.comb.formula },
  ],
  help: [
    'Module Z = π(d_o⁴ − d_i⁴)/(32d_o) ; tronçon réduit d’un té ou piquage réduit : π/4·d_m,b²·e_b, e_b = min(e_n ; i·e_n,b). Moments résultants √(Mx² + My² + Mz²) à la jonction, branche par branche. M_C : étendue calculée au module à chaud, E_h/E_c porté par l’admissible.',
    'Annexe H (tableau H.1) : coudes h = 4R·e_n/d_m², k_B = 1,65/h, i = 0,9/h^⅔ (≥ 1). Tés : i = 0,9/h^⅔ avec h = 8,8e_n/d_m (forgé), 2(e_n + e_pl/2)^2,5/(d_m·e_n^1,5) (piquage renforcé), 2e_n/d_m (piquage non renforcé). Réduction : i = 0,5 + α/100·√(d/e_n) ≤ 2. Soudure bout à bout : 1,0, ou 1,8 si e_n < 5 mm ou désalignement > 0,1e_n (colonne « Soudures » des réductions).',
    'f_f, f_c, f_h : contrainte de calcul f du matériau (colonne S) à la température de calcul, à froid et à chaud. Édition 2017 ; non repris : effort axial et facteurs i_i, i_o, i_t (amendement A4:2021, édition 2024), fluage (12.3.5), déplacement d’appui non répété (12.3.6).',
  ],

  thickness: {
    ref: 'EN 13480-3 §6.1',
    formula: 'e = p_c·D_o/(2f·z + p_c) + c ≤ e_n(1 − tol) ; intrados des coudes : e·(R/D_o − 0,25)/(R/D_o − 0,5) ; z = 1',
    compute(e, model) {
      const Do = e.sec.od;
      const f = materialAt(e.mat, e.Td).S;
      let I = 1;
      if (e.kind === 'bend') {
        const x = e.bend.radius / Do;
        I = (x - 0.25) / (x - 0.5);
      }
      const allow = model?.settings?.allowances === true;
      const c = allow ? +(e.secDef.corrosion || 0) : 0;
      const tol = allow ? +(e.secDef.millTol ?? 0) || 0 : 0;
      const e0 = (e.Pd * Do) / (2 * f + e.Pd);
      const tm = e0 * I + c;
      const tAvail = e.sec.t * (1 - tol / 100);
      return {
        tm,
        tAvail,
        detail: { I, P: e.Pd, S: f, c },
        calc: {
          formula: 'e = p_c·D_o/(2f·z + p_c) ; coude (intrados) : e_int = e·(R/D_o − 0,25)/(R/D_o − 0,5) ; e + c ≤ e_n·(1 − tol)',
          items: [
            ['Diamètre extérieur D_o', Do, 'mm'],
            ['Pression p_c', e.Pd, 'MPa'],
            ['f à T', f, 'MPa'],
            ['Épaisseur du tube droit e', e0, 'mm'],
            ['Facteur d’intrados', I, ''],
            ['Surépaisseur de corrosion c', c, 'mm'],
            ['Épaisseur minimale requise', tm, 'mm'],
          ],
          allow: [
            ['Épaisseur nominale e_n', e.sec.t, 'mm'],
            ['Tolérance de fabrication', tol, '%'],
            ['Épaisseur disponible e_n·(1 − tol)', tAvail, 'mm'],
          ],
          note: allow ? null : 'Tolérance de fabrication et corrosion non prises en compte (option du projet désactivée).',
        },
      };
    },
  },

  check: (ctx) => momentCheck(spec, ctx),
  combinations: (ctx) => momentCombinations(spec, ctx, en13480),
};
