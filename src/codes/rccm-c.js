// RCC-M, Section I, sous-section C (matériels de classe 2) — tuyauteries, C 3650.
//
// Équations implémentées (numérotation RCC-M ; coefficients des admissibles
// paramétrables pour s'adapter à l'édition applicable) :
//  C 3641.1  épaisseur minimale   e_m = P·De / (2(S/I + y·P)) + c,  y = 0,4
//  éq. (6)   poids propre + pression (charges permanentes)
//            S_L = B1·Pc·De/eₙ + B2·MA/Z ≤ k6·Sh
//  éq. (7)   dilatation thermique  S_E = i·MC/Z ≤ S_A = f(1,25 Sc + 0,25 Sh) [+ (Sh − S_L)]
//  éq. (8)   (6) + (7), si (7) non satisfaite :
//            B1·Pmax·De/eₙ + B2·MA/Z + i·MC/Z ≤ Sh + S_A
//  éq. (10)  séisme (permanentes + occasionnelles), par niveau de critère :
//            B1·Pmax·De/eₙ + B2·(MA + MB)/Z ≤ min(kS·Sh ; kY·Sy)
// Formulation par défaut (« 0,75 i ») : B1·De/eₙ → De/(4eₙ) (B1 = 0,25 rapporté à
// De/eₙ, i.e. P·De/4eₙ) et B2 = 0,75·i ≥ 1 ; option « indices B1, B2 » (C 3680 /
// NB-3680) : B1·P·De/(2eₙ), B2 = 1,30/h^(2/3) ≥ 1 pour les coudes.
// Moments : moment résultant √(Mx²+My²+Mz²) aux extrémités de chaque élément.
// Facteurs des coudes : h = e·R/r² ; k = 1,65/h ≥ 1 ; i = 0,9/h^(2/3) ≥ 1.
// Correction de pression (option) : k/[1 + 6(P/E)(r/e)^(7/3)(R/r)^(1/3)],
// i/[1 + 3,25(P/E)(r/e)^(5/2)(R/r)^(2/3)].

import { materialAt } from '../core/materials.js';

export const DEFAULT_PARAMS = {
  cycles: 7000,
  b2Method: '0.75i',
  pressureCorrection: false,
  thickness: true,
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

/**
 * Facteurs k, i, B1, B2 d'un élément (appelé par le mailleur). B1 est exprimé
 * pour le terme B1·P·De/(2eₙ) : formulation 0,75 i ⇒ B1 = 0,5 (soit P·De/4eₙ).
 */
export function componentFactors({ kind, sec, bend, P = 0, Ec, params = {} }) {
  const legacy = (params.b2Method ?? DEFAULT_PARAMS.b2Method) === '0.75i';
  if (kind !== 'bend' || !bend) return { k: 1, i: 1, B1: 0.5, B2: 1.0, h: null };
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
  if (legacy) return { k, i, B1: 0.5, B2: Math.max(1, 0.75 * i), h };
  return { k, i, B1: Math.min(0.5, Math.max(0, -0.1 + 0.4 * h)), B2: Math.max(1, 1.3 / h ** (2 / 3)), h };
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
    { key: 'b2Method', label: 'Indices de contraintes primaires', type: 'select', options: () => ['0.75i', 'indices'], optionLabel: (v) => (v === 'indices' ? 'B1, B2 (C 3680 / NB-3680)' : 'P·De/4e + 0,75 i·M/Z (0,75 i ≥ 1)') },
    { key: 'k6', label: 'Éq. (6) : admissible = k × Sh, k =', type: 'number' },
    { key: 'shMinusSL', label: 'Éq. (7) : ajouter (Sh − S_L) à S_A', type: 'checkbox', title: 'Report de la marge de l’éq. (6) sur l’admissible de dilatation' },
    { key: 'levelB_kS', label: 'Éq. (10) niveau B : k × Sh', type: 'number' },
    { key: 'levelB_kY', label: 'Éq. (10) niveau B : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'levelC_kS', label: 'Éq. (10) niveau C : k × Sh', type: 'number' },
    { key: 'levelC_kY', label: 'Éq. (10) niveau C : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'levelD_kS', label: 'Éq. (10) niveau D : k × Sh', type: 'number' },
    { key: 'levelD_kY', label: 'Éq. (10) niveau D : plafond k × Sy (vide = sans)', type: 'number' },
    { key: 'pressureCorrection', label: 'Correction de pression sur k et i des coudes', type: 'checkbox' },
    { key: 'thickness', label: 'Vérifier l’épaisseur minimale (C 3641)', type: 'checkbox', default: true },
  ],
  componentFactors,

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
      const { sec, factors: fac, mat } = e;
      const { od: De, t, Z } = sec;
      const atD = materialAt(mat, e.Td);
      const atH = materialAt(mat, Math.max(e.T1, e.Td));
      const atC = materialAt(mat, tRef);
      const Sh = atD.S;
      const Sy = atD.Sy;
      const compLabel = e.kind === 'bend' ? `Coude ${e.bend.node}` : 'Tube';
      const pTerm = (P) => (fac.B1 * P * De) / (2 * t);
      for (const end of [0, 1]) {
        const node = mesh.nodes[end === 0 ? e.n1 : e.n2].label;
        const base = { node, elem: e.label, ie, end, comp: compLabel, kind: e.kind };
        const MA = weightCases.reduce((s, c) => s + resultant(c.elemForces, ie, end), 0);
        // éq. (6) poids propre + pression
        const SL = pTerm(e.Pd) + (fac.B2 * MA) / Z;
        rows.push({ ...base, eq: '6', eqLabel: 'Éq. (6) poids propre + pression', case: wId ? `${wId}+P` : 'P', stress: SL, allow: k6 * Sh, ratio: SL / (k6 * Sh), detail: { B1: fac.B1, B2: fac.B2, P: e.Pd, MA, Z, S: Sh } });
        // éq. (7) / (8) par cas thermique
        let SA = f * (1.25 * atC.S + 0.25 * atH.S);
        if (params.shMinusSL && atH.S > SL) SA += atH.S - SL;
        for (const tc of thermalCases) {
          const MC = resultant(tc.elemForces, ie, end);
          const SE = (fac.i * MC) / Z;
          rows.push({ ...base, eq: '7', eqLabel: 'Éq. (7) dilatation thermique', case: tc.id, stress: SE, allow: SA, ratio: SE / SA, detail: { i: fac.i, MC, Z, SA, f, Sc: atC.S, Sh: atH.S } });
          if (SE > SA) {
            const s8 = pTerm(e.P1) + (fac.B2 * MA) / Z + SE;
            const allow8 = atH.S + SA;
            rows.push({ ...base, eq: '8', eqLabel: 'Éq. (8) = (6) + (7)', case: `${wId ? `${wId}+P+` : 'P+'}${tc.id}`, thermalCase: tc.id, stress: s8, allow: allow8, ratio: s8 / allow8, detail: { B1: fac.B1, B2: fac.B2, i: fac.i, MA, MC, Z } });
          }
        }
        // éq. (10) séisme
        for (const sc of seismicCases) {
          const lim = levelLimits(params, sc.level);
          const MB = resultant(sc.elemForces, ie, end);
          const s10 = pTerm(e.P1) + (fac.B2 * (MA + MB)) / Z;
          const allow = lim.kY ? Math.min(lim.kS * Sh, lim.kY * Sy) : lim.kS * Sh;
          rows.push({ ...base, eq: '10', eqLabel: `Éq. (10) séisme niveau ${sc.level ?? 'D'}`, case: `${wId ? `${wId}+P+` : 'P+'}${sc.id}`, stress: s10, allow, ratio: s10 / allow, detail: { B1: fac.B1, B2: fac.B2, P: e.P1, MA, MB, Z, S: Sh, Sy } });
        }
      }
      // épaisseur minimale (une ligne par élément)
      if (params.thickness !== false && e.Pd > 0) {
        let I = 1;
        if (e.kind === 'bend') {
          const x = e.bend.radius / De;
          I = (4 * x - 1) / (4 * x - 2); // intrados (C 3642 / NC-3642.1)
        }
        const c = +(e.secDef.corrosion || 0);
        const tm = (e.Pd * De) / (2 * (Sh / I + 0.4 * e.Pd)) + c;
        const tAvail = t * (1 - (+(e.secDef.millTol ?? 12.5) || 0) / 100);
        rows.push({ node: mesh.nodes[e.n1].label, elem: e.label, ie, end: null, comp: compLabel, kind: e.kind, eq: 'e', eqLabel: 'C 3641 épaisseur minimale', case: 'Pd', stress: tm, allow: tAvail, ratio: tm / tAvail, unit: 'mm', detail: { I, P: e.Pd, S: Sh, c } });
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
};

function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.eqLabel}|${r.case}`;
    const g = groups.get(key);
    const eff = r.coveredBy ? 0 : r.ratio;
    if (!g || eff > g.effRatio) groups.set(key, { ...r, effRatio: eff });
  }
  const order = { e: 0, 6: 1, 7: 2, 8: 3, 10: 4 };
  const list = [...groups.values()].sort((a, b) => (order[a.eq] ?? 9) - (order[b.eq] ?? 9));
  const ok = list.every((g) => g.effRatio <= 1 + 1e-9);
  return { ok, governing: list, maxRatio: Math.max(0, ...list.map((g) => g.effRatio)) };
}
