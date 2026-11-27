// EN 13480-3:2017 (F), version 1 (édition française de décembre 2017 ; en-tête
// des pages « Version 1 (2017-06) ») — « Tuyauteries industrielles métalliques,
// Partie 3 : conception et calcul », article 12 (analyse et critères
// d'acceptation) et annexe H. Module contrôlé sur le texte de la norme.
//
//  (12.3.2-1)  charges permanentes        σ₁ = p_c·d_o/(4e_n) + 0,75i·M_A/Z ≤ f_f
//  (12.3.3-1)  charges occasionnelles ou exceptionnelles
//                                          σ₂ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_f
//              k = 1 (durée d'application > 10 % de toute période de 24 h), 1,15
//              (< 10 %), 1,2 (< 1 %, séisme de dimensionnement), 1,3 (charges
//              exceptionnelles), 1,8 (séisme majoré de sécurité)
//  (12.3.4-1)  étendue de variation       σ₃ = i·M_C/Z ≤ f_a
//  (12.3.4-2)  si (12.3.4-1) non satisfaite
//                                          σ₄ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + i·M_C/Z ≤ f_f + f_a
//  (12.1.3-1)  f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c ; f_c = min(R_m/3 ; f) à froid,
//              f_h = min(f_c ; f ; f_CR) à chaud ; U : tableau 12.1.3-1.
//  §12.3.1     0,75i ≥ 1 (méthode générale et méthode alternative). Si une
//              corrosion considérable est attendue, le module d'inertie et le
//              coefficient i se calculent avec (e_n − c₀) : appliqué quand
//              l'option « tolérance et corrosion » du projet est cochée (le terme
//              de pression suit) ; charges et réactions en épaisseur nominale.
//  §12.3.4     M_C : plus grande différence entre les moments, en prenant les
//              modules d'élasticité aux températures correspondantes : moments au
//              module à chaud, E_h/E_c porté par f_a.
//  §12.3.8     autre méthode (option) : les contraintes i·M/Z deviennent
//              σ = √[(i_i·M_i)² + (i_o·M_o)² + M_t²]/Z, coefficients du tableau H.3.
//
//  Annexe H, tableau H.1 (méthode générale) :
//   2  coude lisse          h = 4R·e_n/d_m², k_B = 1,65/h, i = 0,9/h^(2/3)
//   5  réduction forgée     i = 0,5 + α/100·√(d_o/e_n) ≤ 2 (α ≤ 60°, e_n ≥ d_o/100)
//   6  té à tubulure posée, pénétrante ou extrudée    h = 2e_n/d_m
//   7  idem avec anneau de renfort   h = 2(e_n + e_pl/2)^(5/2)/(d_m·e_n^(3/2)), e_pl ≤ e_n
//   8  té forgé             h = 8,8e_n/d_m
//      tés : k_B = 1, i = 0,9/h^(2/3) ; module de la tubulure π/4·d_m,b²·e_x,
//      e_x = min(e_n ; i·e_n,b)
//   9  soudure bout à bout  1,0 (e_n ≥ 5 mm et δ ≤ 0,1e_n), sinon 1,8
//  Notes h, i (option) : i et k_B des coudes divisés par les termes de pression.
//  Tableau H.3 (méthode du §12.3.8), mêmes caractéristiques h :
//      coude i_o = 0,75/h^(2/3), i_i = 0,9/h^(2/3) ; tés i_o = 0,9/h^(2/3),
//      i_i = 0,75·i_o + 0,25.
//  Non repris : brides aux extrémités des coudes (note c), coudes à sections,
//  tableau H.2, tés extrudés et piquages forgés du tableau H.3, fluage σ₅
//  (12.3.5-1), mouvement d'ancrage unique non répété σ₆ (12.3.6-1).
//  Épaisseur minimale (§6.1, coudes §6.2.3) : e = p_c·D_o/(2f·z + p_c), z = 1.
//
//  Les admissibles sont lus dans la colonne S des matériaux, à saisir comme la
//  contrainte de calcul f du §5.2 (le plafond R_m/3 de f_c est à intégrer dans
//  la valeur saisie à froid).

import { materialAt } from '../core/materials.js';
import { componentFactors as b311Factors, rangeReductionFactor } from './rccm-c.js';
import { momentCheck, momentCombinations, corrodedSection, corrodedFactors } from './moment-family.js';
import { reducedBranch } from './shared.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  method: 'general',
  pressureCorrection: false,
  kB: 1.2,
  kC: 1.3,
  kD: 1.8,
};

export const K_OPTIONS = [1, 1.15, 1.2, 1.3, 1.8];
export const K_LABELS = {
  1: '1,0 — occasionnelle, plus de 10 % du temps',
  1.15: '1,15 — occasionnelle, moins de 10 % du temps',
  1.2: '1,2 — occasionnelle, moins de 1 % du temps (séisme de dimensionnement)',
  1.3: '1,3 — exceptionnelle',
  1.8: '1,8 — séisme majoré de sécurité',
};

/**
 * Niveaux sismiques à coefficient k choisi par niveau (paramètres kB, kC, kD du
 * code) : renvoie la fonction params → { B: { label, k }, C: …, D: … }.
 */
export const makeLevels = (options, defaults) => (params) =>
  Object.fromEntries(
    ['B', 'C', 'D'].map((L, n) => {
      const k = options.includes(+params[`k${L}`]) ? +params[`k${L}`] : defaults[`k${L}`];
      return [L, { label: `niveau ${n + 1} (k = ${String(k).replace('.', ',')})`, k }];
    }),
  );

export const levelsFor = makeLevels(K_OPTIONS, DEFAULT_PARAMS);

/** Paramètres « coefficient k par niveau » de l'onglet Code. */
export const kParams = (ref, options = K_OPTIONS, labels = K_LABELS) =>
  ['B', 'C', 'D'].map((L, n) => ({
    key: `k${L}`,
    label: `Coefficient k du niveau sismique ${n + 1}`,
    type: 'select',
    options: () => options,
    optionLabel: (v) => labels[v],
    title: `Coefficient k de l’équation ${ref} appliqué à ce niveau du cas sismique`,
  }));

const METHODS = { general: 'Générale : moment résultant, coefficient i (tableau H.1)', alternative: 'Autre méthode : dans le plan / hors plan, i_i et i_o (§12.3.8, tableau H.3)' };

/**
 * Coefficients de l'annexe H : k_B et i du tableau H.1, i_o (hors plan) et i_i
 * (dans le plan) du tableau H.3. Mêmes expressions que le RCC-M classe 2
 * (d_m = 2r), sauf l'anneau de renfort d'un piquage (H.1, ligne 7), compté
 * jusqu'à e_pl = e_n. Notes h et i (option) : correction de pression des coudes.
 */
export function componentFactors(desc) {
  const f = b311Factors(desc.kind === 'tee' && desc.teeType === 'reinforced' ? { ...desc, pad: Math.min(desc.pad ?? 0, desc.sec.t) } : desc);
  if (desc.kind === 'tee' && f.h != null) return { ...f, io: f.i, ii: Math.max(1, 0.75 * f.i + 0.25) };
  if (desc.kind === 'bend' && desc.bend && f.h != null) {
    const { sec, bend, P = 0, Ec, params = {} } = desc;
    let io = 0.75 / f.h ** (2 / 3);
    if (params.pressureCorrection && P > 0 && Ec > 0) io /= 1 + 3.25 * (P / Ec) * (sec.rm / sec.t) ** (5 / 2) * (bend.radius / sec.rm) ** (2 / 3);
    return { ...f, ii: f.i, io: Math.max(1, io) };
  }
  return { ...f, ii: f.i, io: f.i };
}

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
export function rangeAllowable({ U, fc, fh: f, ratio, hot }) {
  const fh = Math.min(fc, f); // (12.1.3-3), hors fluage
  const fa = U * (1.25 * fc + 0.25 * fh) * ratio;
  return {
    fa,
    items: [
      ['Facteur de réduction U', U, ''],
      ['f_c (à T_réf)', fc, 'MPa'],
      ['f_h = min(f_c ; f à T)', fh, 'MPa'],
      [hot ? 'Rapport E_h/E_c' : 'Rapport E_h/E_c non appliqué (moments calculés au module à froid)', ratio, ''],
      ['f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c', fa, 'MPa'],
    ],
  };
}

const spec = {
  defaults: DEFAULT_PARAMS,
  sym: { U: 'Facteur de réduction U', D: 'd_o', e: 'e_n', fh: 'f_f', fhot: 'f_f', fa: 'f_a', pTerm: 'p_c·d_o/(4e_n)', faFormula: 'f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
  eq: {
    sus: { id: 's1', ref: '(12.3.2-1)', name: 'σ₁', label: 'σ₁ charges permanentes (12.3.2-1)', formula: 'σ₁ = p_c·d_o/(4e_n) + 0,75i·M_A/Z ≤ f_f' },
    occ: { id: 's2', ref: '(12.3.3-1)', name: 'σ₂', label: 'σ₂ charges occasionnelles (12.3.3-1)', formula: 'σ₂ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + 0,75i·M_B/Z ≤ k·f_f' },
    exp: { id: 's3', ref: '(12.3.4-1)', name: 'σ₃', label: 'σ₃ étendue de dilatation (12.3.4-1)', formula: 'σ₃ = i·M_C/Z ≤ f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c' },
    comb: { id: 's4', ref: '(12.3.4-2)', name: 'σ₄', label: 'σ₄ permanentes + dilatation (12.3.4-2)', formula: 'σ₄ = p_c·d_o/(4e_n) + 0,75i·M_A/Z + i·M_C/Z ≤ f_f + f_a' },
  },
  rangeFactor: (params) => rangeReductionFactor(+params.cycles || 7000),
  levelsFor,
  alternative: (params) => params.method === 'alternative',
  rangeModulus: 'hot', // §12.3.4 : M_C aux modules des températures correspondantes
  // §12.3.1 : corrosion considérable → module d'inertie et coefficient i avec (e_n − c₀)
  stressSection: corrodedSection,
  stressFactors: corrodedFactors(componentFactors),
  modulus,
  rangeAllowable,
  notes: [
    'Colonne S des matériaux : contrainte de calcul f de l’EN 13480-3 §5.2, à saisir pour la nuance et l’édition applicables (f_c plafonnée à R_m/3).',
    'Fluage σ₅ (12.3.5-1) et mouvement d’ancrage unique non répété σ₆ (12.3.6-1) : non vérifiés.',
  ],
};

export const en13480 = {
  id: 'en13480-3',
  label: 'EN 13480-3:2017 (V1, décembre 2017)',
  short: 'EN 13480-3:2017',
  reference: 'EN 13480-3:2017 (F), version 1 (décembre 2017), article 12 — équations (12.3.2-1), (12.3.3-1), (12.3.4-1), (12.3.4-2) ; coefficients de l’annexe H (tableaux H.1 et H.3)',
  defaults: DEFAULT_PARAMS,
  materialHelp: 'Colonne S : contrainte de calcul f de l’EN 13480-3 (§5.2 : min(Rp0,2/t / 1,5 ; Rm / 2,4) pour les aciers non austénitiques, Rp1,0/t / 1,5 pour les austénitiques à A ≥ 35 %) ; les valeurs par défaut de la bibliothèque sont indicatives et établies pour le RCC-M.',
  params: [
    { key: 'cycles', label: 'Nombre de cycles équivalents N', type: 'number', title: 'Détermine le facteur de réduction U de f_a (tableau 12.1.3-1)' },
    { key: 'method', label: 'Méthode de calcul des contraintes', type: 'select', options: () => Object.keys(METHODS), optionLabel: (v) => METHODS[v], title: 'Méthode générale (moment résultant et coefficient i du tableau H.1) ou autre méthode du §12.3.8 (moments dans le plan et hors plan, coefficients i_i et i_o du tableau H.3)' },
    { key: 'pressureCorrection', label: 'Correction de pression sur k_B et i des coudes', type: 'checkbox', title: 'Tableaux H.1 (notes h, i) et H.3 (notes c, j) : grand diamètre, petite épaisseur' },
    ...kParams('(12.3.3-1)'),
  ],
  componentFactors,
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
    'Module Z = π(d_o⁴ − d_i⁴)/(32d_o) ; tubulure réduite : π/4·d_m,b²·e_x, e_x = min(e_n ; i·e_n,b). Moments résultants √(Mx² + My² + Mz²) à la jonction, branche par branche. M_C : étendue calculée aux modules des températures correspondantes (module à chaud), E_h/E_c porté par f_a. Corrosion (§12.3.1) : si l’option « tolérance et corrosion » du projet est cochée, les contraintes et les coefficients i sont calculés avec e_n − c₀.',
    'Annexe H (tableau H.1) : coudes h = 4R·e_n/d_m², k_B = 1,65/h, i = 0,9/h^⅔ (≥ 1). Tés : i = 0,9/h^⅔ avec h = 8,8e_n/d_m (forgé), 2(e_n + e_pl/2)^2,5/(d_m·e_n^1,5) (anneau de renfort, compté jusqu’à e_pl = e_n), 2e_n/d_m (tubulure posée, pénétrante ou extrudée). Réduction forgée : i = 0,5 + α/100·√(d_o/e_n) ≤ 2. Soudure bout à bout : 1,0, ou 1,8 si e_n < 5 mm ou désalignement > 0,1e_n (colonne « Soudures » des réductions).',
    'Autre méthode (§12.3.8), au choix ci-dessus : les termes i·M/Z deviennent σ = √[(i_i·M_i)² + (i_o·M_o)² + M_t²]/Z avec les coefficients du tableau H.3 (coude i_o = 0,75/h^⅔, i_i = 0,9/h^⅔ ; tés i_o = 0,9/h^⅔, i_i = 0,75·i_o + 0,25), 0,75·i_i et 0,75·i_o ≥ 1 pour σ₁ et σ₂.',
    'f_f : contrainte de calcul f du matériau (colonne S) à la température de calcul ; f_c à froid, f_h = min(f_c ; f à chaud). Non repris : brides aux extrémités des coudes (note c), coudes à sections, fluage σ₅ (12.3.5-1), mouvement d’ancrage non répété σ₆ (12.3.6-1), amendements postérieurs à la version 1.',
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
