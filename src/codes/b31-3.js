// ASME B31.3-2012 « Process Piping » (révision de l'ASME B31.3-2010) — analyse de
// flexibilité. Module contrôlé sur le texte de cette édition : §302.3.5 (d),
// §302.3.6, §304.1.2, §304.2.1, §319.2.2 (b)(4), §319.4.4, §320 et Appendix D
// (tableau D300). Les éditions 2020 et suivantes, qui renvoient à l'ASME B31J
// pour les facteurs, ne sont pas reprises.
//
//  Charges permanentes (§320.2, éq. 23a à 23d), épaisseur nominale diminuée des
//  surépaisseurs c (corrosion) si l'option du projet est cochée :
//      S_L = √[(|S_a| + S_b)² + (2·S_t)²] ≤ S_h
//      S_a = I_a·F_a/A_p ; S_b = √[(I_i·M_i)² + (I_o·M_o)²]/Z ; S_t = I_t·M_t/(2Z)
//      I_i = max(1 ; 0,75·i_i), I_o = max(1 ; 0,75·i_o), I_a = I_t = 1 ;
//      F_a : effort normal du poids + effet de fond P·A_f.
//  Charges occasionnelles (§302.3.6) : S_L + S_occ ≤ 1,33·S_h, S_occ calculée
//      comme S_L avec les efforts du séisme.
//  Étendue des contraintes de dilatation (§319.4.4, éq. 17 à 21), dimensions
//  nominales, module de référence à 21 °C :
//      S_E = √[(|S_a| + S_b)² + (2·S_t)²] ≤ S_A
//      S_a = i_a·F_a/A_p ; S_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z ; S_t = i_t·M_t/(2Z)
//      i_a = 1 pour les coudes, i_o pour les autres composants ; i_t = 1 ;
//      S_A = f(1,25·S_c + 0,25·S_h)                       (1a)
//      S_A = f[1,25·(S_c + S_h) − S_L] si (1a) non satisfaite et S_h > S_L  (1b)
//      S_c et S_h plafonnés à 138 MPa dans S_A (§302.3.5 d) ;
//      f = 6·N^−0,2, 0,15 ≤ f ≤ f_m                       (1c)
//      (f_m = 1,0 retenu ; le code admet 1,2 pour les aciers à R_m ≤ 517 MPa
//      jusqu'à 371 °C).
//  Module Z : π(D⁴ − d⁴)/(32D) ; flexion du tronçon réduit d'un té ou piquage
//      réduit (éq. 20) : Z_e = π·r₂²·T_s, T_s = min(T_h ; i_i·T_b) ; la torsion
//      reste rapportée au module Z du tube.
//  Module de référence (§319.2.2 b 4) : efforts calculés au module à chaud
//      multipliés par E_a/E, élément par élément.
//  Facteurs (Appendix D, tableau D300) : h = T·R₁/r₂² pour les coudes,
//      k = 1,65/h, i_i = 0,9/h^(2/3), i_o = 0,75/h^(2/3) ;
//      tés : i_o = 0,9/h^(2/3), i_i = 0,75·i_o + 0,25, k = 1, avec
//      h = 3,1·T/r₂ (té forgé B16.9), (T + T_r/2)^2,5/(T^1,5·r₂) (renforcé ;
//      4·T/r₂ si T_r > 1,5·T, note 10), T/r₂ (non renforcé) ; soudure bout à
//      bout, réduction : i = 1. Validité : D/T ≤ 100 (note 1).
//  Non repris : brides aux extrémités des coudes (note 5), coudes à onglets,
//      h = 4,4·T/r₂ des tés forgés à gorge épaisse (note 8), tés extrudés et
//      piquages forgés, limite alternative des charges occasionnelles à haute
//      température.
//  Épaisseur minimale (§304.1.2, éq. 3a ; coudes §304.2.1, éq. 3c à 3e) :
//      t = P·D/[2(S·E·W/I + P·Y)], Y = 0,4, E = W = 1.

import { materialAt, refTemperature } from '../core/materials.js';
import { summarize } from './common.js';
import { pipeSection } from '../core/sections.js';
import { axialForce, torsion, planeBending, planeMomentRow, ecOverEh, checkPoint, reducedBranch, loadSets, activeLoads } from './shared.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  pressureCorrection: false,
};

export const K_OCC = 1.33;
/** Plafond de S_c et S_h dans l'admissible de l'étendue de déplacement (MPa). */
export const S_CAP = 138;

/** Facteur d'étendue de contrainte f = 6·N^−0,2, borné à [0,15 ; 1] (éq. 1c, f_m = 1,0). */
export function rangeFactor(N) {
  const n = +N > 0 ? +N : 7000;
  return Math.max(0.15, Math.min(1, 6 * n ** -0.2));
}

/** Facteurs de flexibilité k et d'intensification i_i (plan), i_o (hors plan) — tableau D300. */
export function componentFactors({ kind, sec, bend, reducer, P = 0, Ec, params = {}, teeType, pad = 0, sif = null }) {
  const one = { k: 1, i: 1, ii: 1, io: 1, h: null };
  // soudure bout à bout, réduction : i = 1,0
  if (kind === 'reducer' && reducer) return one;
  if (kind === 'tee') {
    if (teeType === 'user' && sif >= 1) return { k: 1, i: sif, ii: sif, io: sif, h: null };
    const T = sec.t;
    const r = sec.rm;
    let h;
    // note 10 : renfort plus épais que 1,5·T → h = 4·T/r₂
    if (teeType === 'reinforced') h = pad > 1.5 * T ? (4 * T) / r : (T + pad / 2) ** 2.5 / (T ** 1.5 * r);
    else if (teeType === 'unreinforced') h = T / r;
    else h = (3.1 * T) / r;
    const io = Math.max(1, 0.9 / h ** (2 / 3));
    const ii = Math.max(1, 0.75 * io + 0.25);
    return { k: 1, i: Math.max(ii, io), ii, io, h };
  }
  if (kind !== 'bend' || !bend) return one;
  const r = sec.rm;
  const t = sec.t;
  const R = bend.radius;
  const h = (t * R) / (r * r);
  let k = Math.max(1, 1.65 / h);
  let ii = Math.max(1, 0.9 / h ** (2 / 3));
  let io = Math.max(1, 0.75 / h ** (2 / 3));
  if (params.pressureCorrection && P > 0 && Ec > 0) {
    k = Math.max(1, k / (1 + 6 * (P / Ec) * (r / t) ** (7 / 3) * (R / r) ** (1 / 3)));
    const d = 1 + 3.25 * (P / Ec) * (r / t) ** (5 / 2) * (R / r) ** (2 / 3);
    ii = Math.max(1, ii / d);
    io = Math.max(1, io / d);
  }
  return { k, i: Math.max(ii, io), ii, io, h };
}

/** Section utilisée par une équation : nominale, ou diminuée de la surépaisseur de corrosion. */
function sectionFor(sec, c) {
  if (!(c > 0) || sec.t - c <= 0) return { ...sec, c: 0 };
  // la corrosion est prise à l'intérieur : diamètre extérieur conservé
  return { ...pipeSection({ od: sec.od, t: sec.t - c }), c };
}

/** Module Z et aire A_p au point vérifié ; Z_e = π·r₂²·T_s pour un piquage réduit (éq. 21). */
function modulus(pt, sec) {
  const run = reducedBranch(pt);
  if (run) {
    // collecteur : même déduction de surépaisseur que le tronçon vérifié
    const Th = run.t - (sec.c > 0 ? Math.min(pt.local.runCorrosion ?? 0, run.t / 2) : 0);
    const Ts = Math.min(Th, pt.fac.ii * sec.t);
    const Z = Math.PI * sec.rm * sec.rm * Ts;
    return {
      Z,
      Zt: sec.Z, // torsion : module du tube
      zItems: [
        ['Module du tube Z = π(D⁴ − d⁴)/(32D) (torsion)', sec.Z, 'mm³'],
        ['Rayon moyen du piquage r₂', sec.rm, 'mm'],
        ['Épaisseur effective T_s = min(T_h ; i_i·T_b)', Ts, 'mm'],
        ['Module Z_e = π·r₂²·T_s (piquage réduit, éq. 21)', Z, 'mm³'],
      ],
    };
  }
  return { Z: sec.Z, Zt: sec.Z, zItems: [['Module Z = π(D⁴ − d⁴)/(32D)', sec.Z, 'mm³']] };
}

/** Contrainte combinée √[(|Sa| + Sb)² + (2St)²] et ses termes (Z : flexion, Zt : torsion). */
function combined({ Fa, Mi, Mo, Mt, Ap, Z, Zt = Z, ia, ii, io, it = 1 }) {
  const Sa = (ia * Math.abs(Fa)) / Ap;
  const Sb = Math.hypot(ii * Mi, io * Mo) / Z;
  const St = (it * Math.abs(Mt)) / (2 * Zt);
  return { Sa, Sb, St, S: Math.hypot(Sa + Sb, 2 * St) };
}

const MOMENT_COLS = ['M_t (torsion)', 'M_i (dans le plan)', 'M_o (hors plan)', 'Résultant'];
const MOMENT_TITLE = 'Moments à l’extrémité de l’élément (plan du coude ou du té, N·m)';

export const b313 = {
  id: 'b31-3',
  label: 'ASME B31.3-2012 — Process Piping',
  short: 'ASME B31.3-2012',
  reference: 'ASME B31.3-2012 (révision de l’édition 2010) — §302.3.5, §302.3.6, §319.4.4, §320 ; facteurs de l’Appendix D (tableau D300). Éditions 2020 et suivantes (facteurs ASME B31J) non reprises.',
  defaults: DEFAULT_PARAMS,
  materialHelp: 'Colonne S : contrainte admissible de base du B31.3 (tableau A-1 de l’édition 2012) ; les valeurs par défaut de la bibliothèque sont indicatives et établies pour le RCC-M.',
  params: [
    { key: 'cycles', label: 'Nombre de cycles équivalents N', type: 'number', title: 'f = 6·N^−0,2, borné entre 0,15 et 1,0 (éq. 1c)' },
    { key: 'pressureCorrection', label: 'Correction de pression sur k et i des coudes', type: 'checkbox', title: 'Appendix D, note 7 : coudes de grand diamètre et faible épaisseur' },
  ],
  componentFactors,
  eqName: (eq) => ({ SL: 'S_L (23a)', SE: 'S_E (17)', SE1b: 'S_E (1b)', OCC: 'Occasionnel' })[eq] ?? eq,
  /** Un seul critère occasionnel : le premier niveau coché du cas sismique. */
  singleLevel: { label: 'occasionnel', k: K_OCC },
  levelsTitle: 'Séisme : charge occasionnelle (§302.3.6)',
  levelsHelp: 'Un seul critère occasionnel pour ce code (admissible 1,33·S_h) : le premier niveau coché est vérifié.',
  equations: [
    { ref: '(23a)', name: 'Charges permanentes : poids + pression', formula: 'S_L = √[(|S_a| + S_b)² + (2S_t)²] ≤ S_h ; S_a = F_a/A_p, S_b = √[(I_i·M_i)² + (I_o·M_o)²]/Z, S_t = M_t/(2Z) ; I = max(1 ; 0,75i)' },
    { ref: '(17)', name: 'Étendue des contraintes de dilatation', formula: 'S_E = √[(|S_a| + S_b)² + (2S_t)²] ≤ S_A = f(1,25 S_c + 0,25 S_h)   (1a) ; S_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z' },
    { ref: '(1b)', name: 'Admissible étendu, si (1a) non satisfaite', formula: 'S_E ≤ S_A = f[1,25(S_c + S_h) − S_L]' },
    { ref: '§302.3.6', name: 'Charges occasionnelles : séisme', formula: 'S_L + S_occ ≤ 1,33·S_h ; S_occ calculée comme S_L avec les efforts du séisme' },
  ],
  help: [
    'Module Z = π(D⁴ − d⁴)/(32D) ; flexion du tronçon réduit d’un té ou piquage réduit : Z_e = π·r₂²·T_s, T_s = min(T_h ; i_i·T_b) (torsion rapportée au module du tube). M_i, M_o : flexions dans le plan et hors plan du coude ou du té ; F_a : effort normal (charges permanentes : effet de fond P·A_f compris).',
    'Coudes : h = T·R₁/r₂², k = 1,65/h, i_i = 0,9/h^⅔, i_o = 0,75/h^⅔ (≥ 1). Tés : i_o = 0,9/h^⅔, i_i = 0,75·i_o + 0,25, avec h = 3,1T/r₂ (forgé B16.9), (T + T_r/2)^2,5/(T^1,5·r₂) (renforcé ; 4T/r₂ si T_r > 1,5T), T/r₂ (non renforcé). Réductions et soudures bout à bout : i = 1,0. Facteurs valables pour D/T ≤ 100.',
    'S_L est calculée avec l’épaisseur diminuée de la surépaisseur de corrosion si l’option « tolérance et corrosion » du projet est cochée ; S_E avec les dimensions nominales et le module de référence à 21 °C (efforts calculés à chaud multipliés par E_a/E). Dans S_A, S_c et S_h sont plafonnés à 138 MPa ; f = 6·N^−0,2 borné entre 0,15 et 1,0 (le plafond 1,2 admis pour certains aciers n’est pas utilisé).',
    'Non repris : brides aux extrémités des coudes, coudes à onglets, tés extrudés et piquages forgés, limite alternative des charges occasionnelles à haute température.',
  ],

  thickness: {
    ref: 'B31.3 §304.1.2',
    formula: 't_m = P·D / [2(S/I + 0,4P)] + c ≤ T(1 − tol) ; I = (4R₁/D − 1)/(4R₁/D − 2) à l’intrados des coudes ; E = W = 1',
    compute(e, model) {
      const D = e.sec.od;
      const S = materialAt(e.mat, e.Td).S;
      let I = 1;
      if (e.kind === 'bend') {
        const x = e.bend.radius / D;
        I = (4 * x - 1) / (4 * x - 2);
      }
      const allow = model?.settings?.allowances === true;
      const c = allow ? +(e.secDef.corrosion || 0) : 0;
      const tol = allow ? +(e.secDef.millTol ?? 0) || 0 : 0;
      const tp = (e.Pd * D) / (2 * (S / I + 0.4 * e.Pd));
      const tm = tp + c;
      const tAvail = e.sec.t * (1 - tol / 100);
      return {
        tm,
        tAvail,
        detail: { I, P: e.Pd, S, c },
        calc: {
          formula: 't_m = P·D / [2(S·E·W/I + P·Y)] + c ≤ T·(1 − tol)   (Y = 0,4 ; E = W = 1)',
          items: [
            ['Diamètre extérieur D', D, 'mm'],
            ['Pression P', e.Pd, 'MPa'],
            ['S à T', S, 'MPa'],
            ['Facteur d’intrados I', I, ''],
            ['Épaisseur de pression t', tp, 'mm'],
            ['Surépaisseur de corrosion c', c, 'mm'],
            ['Épaisseur minimale requise t_m', tm, 'mm'],
          ],
          allow: [
            ['Épaisseur nominale T', e.sec.t, 'mm'],
            ['Tolérance de fabrication', tol, '%'],
            ['Épaisseur disponible T·(1 − tol)', tAvail, 'mm'],
          ],
          note: allow ? null : 'Tolérance de fabrication et corrosion non prises en compte (option du projet désactivée).',
        },
      };
    },
  },

  check({ model, mesh, cases }) {
    const params = { ...DEFAULT_PARAMS, ...(model.code?.params ?? {}) };
    const tRef = refTemperature(model.settings);
    const f = rangeFactor(params.cycles);
    const { weight, thermal, seismic, wId } = loadSets(cases);
    const useC = model.settings?.allowances === true;
    const rows = [];
    const notes = [`Facteur d’étendue de contrainte f = ${f.toFixed(3)} (N = ${+params.cycles || 7000} cycles).`];
    if (!weight.length) notes.push('Aucun cas de poids propre actif : efforts permanents réduits à la pression.');

    let thin = 0; // points hors du domaine D/T ≤ 100 du tableau D300 (note 1)
    mesh.elements.forEach((e, ie) => {
      if (e.kind === 'valve') return;
      const atD = materialAt(e.mat, e.Td);
      const atH = materialAt(e.mat, Math.max(e.T1, e.Td));
      const atC = materialAt(e.mat, tRef);
      const Sh = atD.S;
      for (const end of [0, 1]) {
        // soudures bout à bout : i = 1,0 au B31.3 (pas de majoration aux extrémités des réductions)
        const pt = checkPoint(e, ie, end, mesh, model, { weld: false });
        if (!pt) continue;
        const { base, fac } = pt;
        const ii = fac.ii ?? fac.i;
        const io = fac.io ?? fac.i;
        const Ii = Math.max(1, 0.75 * ii);
        const Io = Math.max(1, 0.75 * io);
        // i_a : 1 pour les coudes, i_o pour les autres composants
        const ia = e.kind === 'bend' && !pt.atTee ? 1 : io;
        const nomSec = pt.sec;
        if (nomSec.od / nomSec.t > 100) thin++;
        const susSec = sectionFor(nomSec, useC ? +(e.secDef.corrosion || 0) : 0);
        const nom = modulus(pt, nomSec);
        const sus = modulus(pt, susSec);
        const facItems = [
          ['Facteur dans le plan i_i', ii, ''],
          ['Facteur hors plan i_o', io, ''],
          ...(fac.h != null ? [['Caractéristique h', fac.h, '']] : []),
        ];
        const secItems = (s) => [
          ['Diamètre extérieur D', s.od, 'mm'],
          [s.c > 0 ? 'Épaisseur T − c' : 'Épaisseur nominale T', s.t, 'mm'],
          ['Aire de la section A_p', s.A, 'mm²'],
        ];
        // efforts permanents : poids (somme des cas) + effet de fond
        const sum = (get) => weight.reduce((s, c) => s + get(c), 0);
        const Fw = sum((c) => axialForce(c.elemForces, ie, end));
        const sustained = (P) => {
          const Fa = Fw * (end === 0 ? -1 : 1) + P * susSec.Ai; // traction positive
          return {
            Fa,
            ...combined({ Fa, Mi: sum((c) => planeBending(c, ie, end)[0]), Mo: sum((c) => planeBending(c, ie, end)[1]), Mt: sum((c) => torsion(c.elemForces, ie, end)), Ap: susSec.A, Z: sus.Z, Zt: sus.Zt, ia: 1, ii: Ii, io: Io }),
          };
        };
        const susItems = (s, P) => [
          ...secItems(susSec),
          ...sus.zItems,
          ...facItems,
          ['Indice I_i = max(1 ; 0,75·i_i)', Ii, ''],
          ['Indice I_o = max(1 ; 0,75·i_o)', Io, ''],
          ['Pression P', P, 'MPa'],
          ['Effort axial F_a (poids + P·A_f)', s.Fa, 'N'],
          ['S_a = |F_a|/A_p', s.Sa, 'MPa'],
          ['S_b = √[(I_i·M_i)² + (I_o·M_o)²]/Z', s.Sb, 'MPa'],
          ['S_t = M_t/(2Z)', s.St, 'MPa'],
        ];
        const momW = weight.map((c) => planeMomentRow(`Poids — ${c.id}`, c, ie, end));
        const sl = sustained(e.Pd);
        rows.push({
          ...base, eq: 'SL', order: 1, eqLabel: 'S_L charges permanentes (23a)', case: wId ? `${wId}+P` : 'P', stress: sl.S, allow: Sh, ratio: sl.S / Sh,
          detail: { i: fac.i, ii, io, P: e.Pd, Z: sus.Z, S: Sh },
          calc: {
            formula: 'S_L = √[(|S_a| + S_b)² + (2S_t)²] ≤ S_h',
            items: susItems(sl, e.Pd),
            moments: momW, momentCols: MOMENT_COLS, momentTitle: MOMENT_TITLE,
            allow: [['Température T', e.Td, '°C'], ['S_h à T', Sh, 'MPa']],
          },
        });
        // étendue de dilatation
        // S_c et S_h plafonnés à 138 MPa (20 ksi) dans l'admissible de l'étendue (§302.3.5 d)
        const Sc = Math.min(atC.S, S_CAP);
        const ShA = Math.min(atH.S, S_CAP);
        const SA = f * (1.25 * Sc + 0.25 * ShA);
        for (const tc of thermal) {
          const kE = ecOverEh(tc, e);
          const [Mi, Mo] = planeBending(tc, ie, end);
          const se = combined({ Fa: kE * axialForce(tc.elemForces, ie, end), Mi: kE * Mi, Mo: kE * Mo, Mt: kE * torsion(tc.elemForces, ie, end), Ap: nomSec.A, Z: nom.Z, Zt: nom.Zt, ia, ii, io });
          const items = [
            ...secItems({ ...nomSec, c: 0 }),
            ...nom.zItems,
            ...facItems,
            ['Facteur axial i_a', ia, ''],
            ...(kE !== 1 ? [['Rapport Ec/Eh (efforts calculés à chaud, ramenés au module de référence)', kE, '']] : []),
            ['S_a = i_a·|F_a|/A_p', se.Sa, 'MPa'],
            ['S_b = √[(i_i·M_i)² + (i_o·M_o)²]/Z', se.Sb, 'MPa'],
            ['S_t = M_t/(2Z)', se.St, 'MPa'],
          ];
          const moments = [planeMomentRow(`Dilatation — ${tc.id}${kE !== 1 ? ' (× Ec/Eh)' : ''}`, tc, ie, end, kE)];
          const cap = (v) => (v > S_CAP ? ' — plafonné à 138 MPa' : '');
          const saItems = [['Facteur f', f, ''], [`S_c (à T_réf)${cap(atC.S)}`, Sc, 'MPa'], [`S_h (à T)${cap(atH.S)}`, ShA, 'MPa']];
          rows.push({
            ...base, eq: 'SE', order: 2, eqLabel: 'S_E étendue de dilatation (17)', case: tc.id, stress: se.S, allow: SA, ratio: se.S / SA,
            detail: { i: fac.i, ii, io, Z: nom.Z, SA, f, Sc, Sh: ShA, kE },
            calc: { formula: 'S_E = √[(|S_a| + S_b)² + (2S_t)²] ≤ S_A = f(1,25 S_c + 0,25 S_h)', items, moments, momentCols: MOMENT_COLS, momentTitle: MOMENT_TITLE, allow: [...saItems, ['S_A (1a)', SA, 'MPa']] },
          });
          // admissible étendu (1b) : seulement où (1a) n'est pas satisfaite et S_h > S_L
          const slT = sustained(e.P1);
          if (se.S > SA && atH.S > slT.S) {
            const SAb = f * (1.25 * (Sc + ShA) - slT.S);
            rows.push({
              ...base, eq: 'SE1b', order: 3, eqLabel: 'S_E avec admissible étendu (1b)', case: `${wId ? `${wId}+P+` : 'P+'}${tc.id}`, thermalCase: tc.id, stress: se.S, allow: SAb, ratio: se.S / SAb,
              detail: { i: fac.i, ii, io, Z: nom.Z, SA: SAb, f, kE },
              calc: {
                formula: 'S_E ≤ S_A = f[1,25(S_c + S_h) − S_L]',
                items, moments: [...momW, ...moments], momentCols: MOMENT_COLS, momentTitle: MOMENT_TITLE,
                allow: [...saItems, ['S_L (charges permanentes, pression de service)', slT.S, 'MPa'], ['S_A (1b)', SAb, 'MPa']],
              },
            });
          }
        }
        // charges occasionnelles : S_L + S_occ ≤ 1,33·S_h
        for (const sc of seismic) {
          const [Mi, Mo] = planeBending(sc, ie, end);
          const slO = sustained(e.P1);
          const occ = combined({ Fa: axialForce(sc.elemForces, ie, end), Mi, Mo, Mt: torsion(sc.elemForces, ie, end), Ap: susSec.A, Z: sus.Z, Zt: sus.Zt, ia: 1, ii: Ii, io: Io });
          const s = slO.S + occ.S;
          const allow = K_OCC * Sh;
          rows.push({
            ...base, eq: 'OCC', order: 4, eqLabel: 'Charges occasionnelles (§302.3.6)', case: `${wId ? `${wId}+P+` : 'P+'}${sc.id}`, stress: s, allow, ratio: s / allow,
            detail: { i: fac.i, ii, io, P: e.P1, Z: sus.Z, S: Sh, factor: sc.factor },
            calc: {
              formula: 'S_L + S_occ ≤ 1,33·S_h',
              items: [
                ...susItems(slO, e.P1),
                ['S_L (charges permanentes)', slO.S, 'MPa'],
                ['Coefficient sur le séisme', sc.factor ?? 1, ''],
                ['S_a séisme = |F_a|/A_p', occ.Sa, 'MPa'],
                ['S_b séisme = √[(I_i·M_i)² + (I_o·M_o)²]/Z', occ.Sb, 'MPa'],
                ['S_t séisme = M_t/(2Z)', occ.St, 'MPa'],
                ['S_occ (séisme)', occ.S, 'MPa'],
              ],
              moments: [...momW, planeMomentRow(`Séisme — ${sc.id} (enveloppe)`, sc, ie, end)], momentCols: MOMENT_COLS, momentTitle: MOMENT_TITLE,
              allow: [['Température T', e.Td, '°C'], ['S_h à T', Sh, 'MPa'], ['Admissible 1,33·S_h', allow, 'MPa']],
            },
          });
        }
      }
    });

    // (1a) dépassée mais (1b) satisfaite : point acceptable
    const okB = new Set(rows.filter((r) => r.eq === 'SE1b' && r.ratio <= 1).map((r) => `${r.ie}:${r.end}:${r.thermalCase}`));
    for (const r of rows) {
      if (r.eq === 'SE' && r.ratio > 1 && okB.has(`${r.ie}:${r.end}:${r.case}`)) {
        r.coveredBy = 'SE1b';
        r.coveredName = 'S_E avec l’admissible (1b)';
      }
    }
    notes.push('Flexions séparées dans le plan et hors plan des coudes et des tés ; séisme : projection faite mode par mode avant les combinaisons.');
    notes.push('Admissible étendu (1b) évalué seulement aux points où (1a) n’est pas satisfaite.');
    notes.push('Colonne S des matériaux : contrainte admissible de base du B31.3 (tableau A-1), à saisir pour l’édition applicable.');
    const warnings = thin ? [`ASME B31.3 : ${thin} point(s) avec D/T > 100, hors du domaine de validité des facteurs du tableau D300 (note 1).`] : [];
    if (thin) notes.push(warnings[0]);
    return { rows, summary: summarize(rows), notes, warnings, f };
  },

  combinations({ model }) {
    const { w, T, S } = activeLoads(model);
    const out = [{ eq: '(23a)', name: 'Charges permanentes', loads: `${w} ; pression P`, rule: 'efforts du poids propre + effet de fond P·A_f ; indices I = max(1 ; 0,75i)', allow: 'S_h' }];
    for (const t of T) {
      out.push({ eq: '(17)', name: 'Étendue de dilatation', loads: `${t} (étendue depuis l’état froid, déplacements imposés compris)`, rule: 'efforts de la dilatation seule, facteurs i_i, i_o', allow: 'S_A = f(1,25 S_c + 0,25 S_h)' });
      out.push({ eq: '(1b)', name: 'Admissible étendu, si (1a) non satisfaite', loads: `${t} ; S_L de ${w} + P`, rule: 'même S_E, admissible augmenté de la marge S_h − S_L', allow: 'f[1,25(S_c + S_h) − S_L]' });
    }
    for (const x of S(this)) out.push({ eq: '§302.3.6', name: 'Charges occasionnelles', loads: `${w} + P + ${x.id} (= ${x.factor} × ${x.s.id})`, rule: `S_L + S_occ (somme des contraintes) ; S_occ : ${x.rule}`, allow: '1,33·S_h' });
    return out;
  },
};
