// RCC-M, Section I, sous-section C (matériels de classe 2) — tuyauteries, C 3650.
//
// Équations implémentées (numérotation RCC-M ; coefficients des admissibles
// paramétrables pour s'adapter à l'édition applicable). Formulation de la
// classe 2 par le facteur d'intensification i (les indices B1/B2 relèvent de la
// classe 1, sous-section B, et ne sont pas utilisés ici) :
//  éq. (6)   poids propre + pression       S_L = P·De/(4eₙ) + 0,75i·MA/Z ≤ k6·Sh
//  éq. (7)   dilatation thermique          S_E = i·MC/Z ≤ S_A = f(1,25 Sc + 0,25 Sh) [+ f(Sh − S_L)]
//  éq. (8)   (6) + (7), si (7) non satisfaite :
//            P·De/(4eₙ) + 0,75i·MA/Z + i·MC/Z ≤ Sh + S_A
//  éq. (10)  séisme, pour chaque niveau de critère B, C, D (même spectre, coefficient
//            propre au niveau) : P·De/(4eₙ) + 0,75i·(MA + MB)/Z ≤ min(kS·Sh ; kY·Sy)
//  avec 0,75i ≥ 1. Moments : moment résultant √(Mx²+My²+Mz²) aux extrémités.
//  Épaisseur minimale (méthode `thickness`, si l'option du projet est cochée) :
//            C 3641.1  e_m = P·De / (2(S/I + y·P)) + c,  y = 0,4
// Facteurs des coudes : h = e·R/r² ; k = 1,65/h ≥ 1 ; i = 0,9/h^(2/3) ≥ 1.
// Tés (i = 0,9/h^(2/3) ≥ 1, k = 1) : forgé h = 4,4e/r, fabrication renforcé
// h = (e + e_r/2)^(5/2)/(e^(3/2)·r), non renforcé h = e/r ; le SIF du té
// s'applique aux extrémités des trois éléments qui aboutissent au nœud.
// Correction de pression (option) : k/[1 + 6(P/E)(r/e)^(7/3)(R/r)^(1/3)],
// i/[1 + 3,25(P/E)(r/e)^(5/2)(R/r)^(2/3)].

import { materialAt } from '../core/materials.js';
import { summarize } from './common.js';
import { seismicLevels } from '../loads/seismic.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  pressureCorrection: false,
  k6: 1.0,
  shMinusSL: false,
  levelB_kS: 1.2,
  levelB_kY: '',
  levelC_kS: 1.8,
  levelC_kY: '',
  levelD_kS: 2.4,
  levelD_kY: '',
};

/** Facteur de réduction f en fonction du nombre de cycles thermiques équivalents. */
export function rangeReductionFactor(N) {
  const table = [
    [7000, 1.0],
    [14000, 0.9],
    [22000, 0.8],
    [45000, 0.7],
    [100000, 0.6],
  ];
  for (const [n, f] of table) if (N <= n) return f;
  return 0.5;
}

/** Facteurs de flexibilité k et d'intensification i d'un élément (appelé par le mailleur). */
export function componentFactors({ kind, sec, bend, P = 0, Ec, params = {}, teeType, pad = 0, sif = null }) {
  if (kind === 'tee') {
    const T = sec.t;
    const r = sec.rm;
    let h;
    if (teeType === 'reinforced') h = (T + pad / 2) ** 2.5 / (T ** 1.5 * r);
    else if (teeType === 'unreinforced') h = T / r;
    else h = (4.4 * T) / r;
    const i = teeType === 'user' && sif >= 1 ? sif : Math.max(1, 0.9 / h ** (2 / 3));
    return { k: 1, i, h: teeType === 'user' ? null : h };
  }
  if (kind !== 'bend' || !bend) return { k: 1, i: 1, h: null };
  const r = sec.rm;
  const t = sec.t;
  const R = bend.radius;
  const h = (t * R) / (r * r);
  let k = Math.max(1, 1.65 / h);
  let i = Math.max(1, 0.9 / h ** (2 / 3));
  if (params.pressureCorrection && P > 0 && Ec > 0) {
    k = Math.max(1, k / (1 + 6 * (P / Ec) * (r / t) ** (7 / 3) * (R / r) ** (1 / 3)));
    i = Math.max(1, i / (1 + 3.25 * (P / Ec) * (r / t) ** (5 / 2) * (R / r) ** (2 / 3)));
  }
  return { k, i, h };
}

function resultant(f, ie, end) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  return Math.hypot(f[o], f[o + 1], f[o + 2]);
}

const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);

export function levelLimits(params, level) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const L = ['B', 'C', 'D'].includes(level) ? level : 'D';
  return { kS: num(p[`level${L}_kS`], DEFAULT_PARAMS[`level${L}_kS`]), kY: num(p[`level${L}_kY`], null) };
}

export const rccmC = {
  id: 'rccm-c',
  label: 'RCC-M classe 2 (C 3650) — tuyauteries',
  reference: 'RCC-M Section I sous-section C, §C 3650 — équations (6), (7), (8), (10)',
  defaults: DEFAULT_PARAMS,
  params: [
    { key: 'cycles', label: 'Nombre de cycles thermiques équivalents N', type: 'number', title: 'Détermine le facteur de réduction f de SA' },
    { key: 'k6', label: 'Éq. (6) : admissible = k × Sh, k =', type: 'number' },
    { key: 'shMinusSL', label: 'Éq. (7) : ajouter (Sh − S_L) à S_A', type: 'checkbox', title: 'Report de la marge de l’éq. (6) sur l’admissible de dilatation' },
    { key: 'levelB_kS', label: 'Éq. (10) niveau B : k × Sh', type: 'number' },
    { key: 'levelB_kY', label: 'Éq. (10) niveau B : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'levelC_kS', label: 'Éq. (10) niveau C : k × Sh', type: 'number' },
    { key: 'levelC_kY', label: 'Éq. (10) niveau C : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'levelD_kS', label: 'Éq. (10) niveau D : k × Sh', type: 'number' },
    { key: 'levelD_kY', label: 'Éq. (10) niveau D : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'pressureCorrection', label: 'Correction de pression sur k et i des coudes', type: 'checkbox' },
  ],
  componentFactors,

  /**
   * Épaisseur minimale par tenue à la pression seule (C 3641.1, intrados des
   * coudes C 3642) : e_m = P·De / (2(S/I + y·P)) + c, y = 0,4, comparée à
   * l'épaisseur nominale diminuée de la tolérance de fabrication.
   */
  thickness: {
    ref: 'RCC-M C 3641',
    formula: 'eₘ = P·Dₑ / [2(S/I + 0,4P)] + c ≤ eₙ(1 − tol) ; I = (4R/Dₑ − 1)/(4R/Dₑ − 2) à l’intrados des coudes',
    compute(e) {
      const De = e.sec.od;
      const S = materialAt(e.mat, e.Td).S;
      let I = 1;
      if (e.kind === 'bend') {
        const x = e.bend.radius / De;
        I = (4 * x - 1) / (4 * x - 2);
      }
      const c = +(e.secDef.corrosion || 0);
      const tm = (e.Pd * De) / (2 * (S / I + 0.4 * e.Pd)) + c;
      const tAvail = e.sec.t * (1 - (+(e.secDef.millTol ?? 12.5) || 0) / 100);
      return { tm, tAvail, detail: { I, P: e.Pd, S, c } };
    },
  },

  /**
   * @returns { rows, summary, notes }
   * rows : { eq, eqLabel, node, elem, comp, case, stress, allow, ratio, detail }
   */
  check({ model, mesh, cases }) {
    const params = { ...DEFAULT_PARAMS, ...(model.code?.params ?? {}) };
    const tRef = +model.settings.tRef || 20;
    const f = rangeReductionFactor(+params.cycles || 7000);
    const k6 = num(params.k6, 1);
    const weightCases = cases.filter((c) => c.type === 'weight' && c.fe !== false);
    const thermalCases = cases.filter((c) => c.type === 'thermal');
    const seismicCases = cases.filter((c) => c.type === 'seismic');
    const wId = weightCases.map((c) => c.id).join('+');
    const rows = [];
    const notes = [`Facteur de réduction f = ${f} (N = ${params.cycles || 7000} cycles).`];
    if (!weightCases.length) notes.push('Aucun cas de poids propre actif : MA = 0.');

    mesh.elements.forEach((e, ie) => {
      const { sec, mat } = e;
      const { od: De, t, Z } = sec;
      const atD = materialAt(mat, e.Td);
      const atH = materialAt(mat, Math.max(e.T1, e.Td));
      const atC = materialAt(mat, tRef);
      const Sh = atD.S;
      const Sy = atD.Sy;
      for (const end of [0, 1]) {
        // facteurs de l'extrémité : le plus pénalisant entre l'élément et un té au nœud
        const local = e.endFactors?.[end];
        const fac = local && local.i >= e.factors.i ? local : e.factors;
        const i75 = Math.max(1, 0.75 * fac.i);
        const pTerm = (P) => (P * De) / (4 * t);
        const node = mesh.nodes[end === 0 ? e.n1 : e.n2].label;
        const compLabel = fac === local ? `Té ${node}` : e.kind === 'bend' ? `Coude ${e.bend.node}` : 'Tube';
        const base = { node, elem: e.label, ie, end, comp: compLabel, kind: fac === local ? 'tee' : e.kind };
        const MA = weightCases.reduce((s, c) => s + resultant(c.elemForces, ie, end), 0);
        // éq. (6) poids propre + pression
        const SL = pTerm(e.Pd) + (i75 * MA) / Z;
        rows.push({ ...base, eq: '6', eqLabel: 'Éq. (6) poids propre + pression', case: wId ? `${wId}+P` : 'P', stress: SL, allow: k6 * Sh, ratio: SL / (k6 * Sh), detail: { i: fac.i, i75, P: e.Pd, MA, Z, S: Sh } });
        // éq. (7) / (8) par cas thermique
        let SA = f * (1.25 * atC.S + 0.25 * atH.S);
        if (params.shMinusSL && atH.S > SL) SA += f * (atH.S - SL); // S_A = f[1,25(Sc + Sh) − S_L]
        for (const tc of thermalCases) {
          const MC = resultant(tc.elemForces, ie, end);
          const SE = (fac.i * MC) / Z;
          rows.push({ ...base, eq: '7', eqLabel: 'Éq. (7) dilatation thermique', case: tc.id, stress: SE, allow: SA, ratio: SE / SA, detail: { i: fac.i, MC, Z, SA, f, Sc: atC.S, Sh: atH.S } });
          if (SE > SA) {
            const s8 = pTerm(e.Pd) + (i75 * MA) / Z + SE; // (6) + (7) : même pression que (6)
            const allow8 = atH.S + SA;
            rows.push({ ...base, eq: '8', eqLabel: 'Éq. (8) = (6) + (7)', case: `${wId ? `${wId}+P+` : 'P+'}${tc.id}`, thermalCase: tc.id, stress: s8, allow: allow8, ratio: s8 / allow8, detail: { i: fac.i, i75, MA, MC, Z } });
          }
        }
        // éq. (10) séisme
        for (const sc of seismicCases) {
          const lim = levelLimits(params, sc.level);
          const MB = resultant(sc.elemForces, ie, end);
          const s10 = pTerm(e.P1) + (i75 * (MA + MB)) / Z;
          const allow = lim.kY ? Math.min(lim.kS * Sh, lim.kY * Sy) : lim.kS * Sh;
          const L = sc.level ?? 'D';
          rows.push({ ...base, eq: `10${L}`, eqLabel: `Éq. (10) niveau ${L}`, case: `${wId ? `${wId}+P+` : 'P+'}${sc.id}`, stress: s10, allow, ratio: s10 / allow, detail: { i: fac.i, i75, P: e.P1, MA, MB, Z, S: Sh, Sy, factor: sc.factor } });
        }
      }
    });

    // éq. (7) satisfaite via (8) : un point est acceptable si (7) OU (8) l'est
    const ok8 = new Set(rows.filter((r) => r.eq === '8' && r.ratio <= 1).map((r) => `${r.ie}:${r.end}:${r.thermalCase}`));
    for (const r of rows) if (r.eq === '7' && r.ratio > 1 && ok8.has(`${r.ie}:${r.end}:${r.case}`)) r.coveredBy = '8';

    const summary = summarize(rows);
    notes.push('Moments résultants aux extrémités des éléments ; SIF du coude appliqué sur les éléments du coude.');
    notes.push('Éq. (8) évaluée seulement aux points où l’éq. (7) n’est pas satisfaite.');
    notes.push('Coefficients des admissibles et valeurs matériaux à confirmer dans l’édition RCC-M applicable (onglet Code).');
    return { rows, summary, notes, f };
  },

  /** Description des cumuls de chargements utilisés par chaque équation. */
  combinations({ model }) {
    const params = { ...DEFAULT_PARAMS, ...(model.code?.params ?? {}) };
    const active = model.loadCases.filter((c) => c.enabled !== false);
    const W = active.filter((c) => c.type === 'weight').map((c) => c.id);
    const T = active.filter((c) => c.type === 'thermal').map((c) => c.id);
    const S = active.filter((c) => c.type === 'seismic');
    const w = W.join(' + ') || '(aucun poids)';
    const out = [
      { eq: '(6)', name: 'Poids propre + pression', loads: `${w} ; pression P`, rule: 'M_A = moment résultant du poids propre ; terme de pression P·Dₑ/(4eₙ)', allow: `${num(params.k6, 1)}·Sh` },
    ];
    for (const t of T) {
      out.push({ eq: '(7)', name: 'Dilatation thermique', loads: `${t} (étendue depuis l’état froid, déplacements imposés compris)`, rule: 'M_C = moment résultant de l’étendue de dilatation, sans poids ni pression', allow: 'S_A = f(1,25 Sc + 0,25 Sh)' });
      out.push({ eq: '(8)', name: '(6) + (7), si (7) non satisfaite', loads: `${w} + P + ${t}`, rule: 'contraintes de (6) et de (7) additionnées', allow: 'Sh + S_A' });
    }
    for (const s of S) {
      for (const lv of seismicLevels(s).filter((x) => x.enabled !== false)) {
        const lim = levelLimits(params, lv.level);
        out.push({
          eq: `(10${lv.level})`,
          name: `Séisme niveau ${lv.level}`,
          loads: `${w} + P + ${num(lv.factor, 1)} × ${s.id}`,
          rule: `M_A + M_B (somme des moments résultants) ; M_B = réponse sismique ${s.method === 'static' ? 'statique équivalente' : `spectrale ${s.modal ?? 'CQC'}`}, directions ${s.directional ?? 'SRSS'}, × ${num(lv.factor, 1)}`,
          allow: `${lim.kS}·Sh${lim.kY ? ` et ${lim.kY}·Sy` : ''}`,
        });
      }
    }
    return out;
  },
};
