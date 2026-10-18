// RCC-M, Section I, sous-section C (matériels de niveau/classe 2) — tuyauteries,
// règles C 3600 (analogues à ASME III NC-3600).
//
// Équations implémentées (édition de référence à confirmer par l'utilisateur) :
//  C 3641.1  épaisseur minimale   e_m = P·De / (2(S/I + y·P)) + c,  y = 0,4
//  éq. (8)   charges permanentes  B1·Pc·De/(2e) + B2·MA/Z ≤ 1,5 S
//  éq. (9)   charges occasionnelles B1·Pmax·De/(2e) + B2·(MA+MB)/Z
//            niveau B ≤ min(1,8 S ; 1,5 Sy)  C ≤ min(2,25 S ; 1,8 Sy)
//            niveau D ≤ min(3,0 S ; 2,0 Sy)
//  éq. (10)  dilatation thermique  SE = i·MC/Z ≤ SA = f(1,25 Sc + 0,25 Sh)
//  éq. (11)  si (10) non satisfaite : Pmax·De/(4e) + 0,75i·MA/Z + i·MC/Z ≤ Sh + SA
// Moments : moment résultant √(Mx²+My²+Mz²) aux extrémités de chaque élément.
// Indices (C 3680 / NB-3680, NC-3673) :
//   tube droit : B1 = 0,5 ; B2 = 1,0 ; i = 1,0 ; k = 1
//   coude      : h = e·R/r² ; k = 1,65/h ≥ 1 ; i = 0,9/h^(2/3) ≥ 1
//                B1 = −0,1 + 0,4h (0 ≤ B1 ≤ 0,5) ; B2 = 1,30/h^(2/3) ≥ 1
//   option « 0,75 i » : B1 = 0,5 et B2 = 0,75 i ≥ 1 (formulation historique).
//   Correction de pression (option) : k/[1 + 6(P/E)(r/e)^(7/3)(R/r)^(1/3)],
//   i/[1 + 3,25(P/E)(r/e)^(5/2)(R/r)^(2/3)].

import { materialAt } from '../core/materials.js';

const LEVELS = {
  B: { kS: 1.8, kY: 1.5 },
  C: { kS: 2.25, kY: 1.8 },
  D: { kS: 3.0, kY: 2.0 },
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

/** Facteurs k, i, B1, B2 d'un élément (appelé par le mailleur). */
export function componentFactors({ kind, sec, bend, P = 0, Ec, params = {} }) {
  if (kind !== 'bend' || !bend) {
    const i = 1;
    return { k: 1, i, B1: 0.5, B2: params.b2Method === '0.75i' ? Math.max(1, 0.75 * i) : 1.0, h: null };
  }
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
  let B1 = Math.min(0.5, Math.max(0, -0.1 + 0.4 * h));
  let B2 = Math.max(1, 1.3 / h ** (2 / 3));
  if (params.b2Method === '0.75i') {
    B1 = 0.5;
    B2 = Math.max(1, 0.75 * i);
  }
  return { k, i, B1, B2, h };
}

function resultant(f, ie, end) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  return Math.hypot(f[o], f[o + 1], f[o + 2]);
}

export const rccmC = {
  id: 'rccm-c',
  label: 'RCC-M classe 2 (C 3600) — tuyauteries',
  reference: 'RCC-M Section I sous-section C, §C 3600 (cf. ASME III NC-3600)',
  params: [
    { key: 'cycles', label: 'Nombre de cycles thermiques équivalents N', type: 'number', title: 'Détermine le facteur de réduction f de SA' },
    { key: 'b2Method', label: 'Indices de contraintes primaires', type: 'select', options: () => ['indices', '0.75i'], optionLabel: (v) => (v === 'indices' ? 'B1, B2 (C 3680 / NB-3680)' : 'B1 = 0,5 ; B2 = 0,75 i ≥ 1') },
    { key: 'pressureCorrection', label: 'Correction de pression sur k et i des coudes', type: 'checkbox' },
    { key: 'thickness', label: 'Vérifier l’épaisseur minimale (C 3641)', type: 'checkbox', default: true },
  ],
  componentFactors,

  /**
   * @returns { rows, summary, notes }
   * rows : { eq, eqLabel, node, elem, comp, case, stress, allow, ratio, detail }
   */
  check({ model, mesh, cases }) {
    const params = model.code?.params ?? {};
    const tRef = +model.settings.tRef || 20;
    const f = rangeReductionFactor(+params.cycles || 7000);
    const weightCases = cases.filter((c) => c.type === 'weight' && c.fe !== false);
    const thermalCases = cases.filter((c) => c.type === 'thermal');
    const seismicCases = cases.filter((c) => c.type === 'seismic');
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
      const SA = f * (1.25 * atC.S + 0.25 * atH.S);
      const compLabel = e.kind === 'bend' ? `Coude ${e.bend.node}` : 'Tube';
      const i75 = Math.max(1, 0.75 * fac.i);
      for (const end of [0, 1]) {
        const node = mesh.nodes[end === 0 ? e.n1 : e.n2].label;
        const base = { node, elem: e.label, ie, end, comp: compLabel, kind: e.kind };
        const MA = weightCases.reduce((s, c) => s + resultant(c.elemForces, ie, end), 0);
        // éq. (8)
        {
          const sP = (fac.B1 * e.Pd * De) / (2 * t);
          const sM = (fac.B2 * MA) / Z;
          const allow = 1.5 * Sh;
          rows.push({ ...base, eq: '8', eqLabel: 'Éq. (8) charges permanentes', case: weightCases.map((c) => c.id).join('+') || '—', stress: sP + sM, allow, ratio: (sP + sM) / allow, detail: { B1: fac.B1, B2: fac.B2, P: e.Pd, MA, Z, S: Sh } });
        }
        // éq. (9) par séisme
        for (const sc of seismicCases) {
          const lvl = LEVELS[sc.level] ?? LEVELS.D;
          const MB = resultant(sc.elemForces, ie, end);
          const sP = (fac.B1 * e.P1 * De) / (2 * t);
          const sM = (fac.B2 * (MA + MB)) / Z;
          const allow = Math.min(lvl.kS * Sh, lvl.kY * Sy);
          rows.push({ ...base, eq: '9', eqLabel: `Éq. (9) niveau ${sc.level ?? 'D'}`, case: `${weightCases.map((c) => c.id).join('+')}${weightCases.length ? '+' : ''}${sc.id}`, stress: sP + sM, allow, ratio: (sP + sM) / allow, detail: { B1: fac.B1, B2: fac.B2, P: e.P1, MA, MB, Z, S: Sh, Sy } });
        }
        // éq. (10) / (11) par cas thermique
        for (const tc of thermalCases) {
          const MC = resultant(tc.elemForces, ie, end);
          const SE = (fac.i * MC) / Z;
          rows.push({ ...base, eq: '10', eqLabel: 'Éq. (10) dilatation', case: tc.id, stress: SE, allow: SA, ratio: SE / SA, detail: { i: fac.i, MC, Z, SA, f, Sc: atC.S, Sh: atH.S } });
          if (SE > SA) {
            const s11 = (e.P1 * De) / (4 * t) + (i75 * MA) / Z + SE;
            const allow11 = atH.S + SA;
            rows.push({ ...base, eq: '11', eqLabel: 'Éq. (11) permanentes + dilatation', case: `${weightCases.map((c) => c.id).join('+')}+${tc.id}`, stress: s11, allow: allow11, ratio: s11 / allow11, detail: { i: fac.i, MA, MC, Z } });
          }
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

    // éq. (10) satisfaite via (11) : un point est acceptable si (10) OU (11) l'est
    const ok11 = new Set(rows.filter((r) => r.eq === '11' && r.ratio <= 1).map((r) => `${r.ie}:${r.end}:${r.case.split('+').pop()}`));
    for (const r of rows) if (r.eq === '10' && r.ratio > 1 && ok11.has(`${r.ie}:${r.end}:${r.case}`)) r.coveredBy11 = true;

    const summary = summarize(rows);
    notes.push('Moments résultants aux extrémités des éléments ; SIF du coude appliqué sur les éléments du coude.');
    notes.push('Valeurs matériaux à confirmer dans l’Annexe Z I de l’édition RCC-M applicable.');
    return { rows, summary, notes, f };
  },
};

function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.eqLabel}|${r.case}`;
    const g = groups.get(key);
    const eff = r.coveredBy11 ? 0 : r.ratio;
    if (!g || eff > g.effRatio) groups.set(key, { ...r, effRatio: eff });
  }
  const list = [...groups.values()];
  const ok = list.every((g) => g.effRatio <= 1 + 1e-9);
  return { ok, governing: list, maxRatio: Math.max(0, ...list.map((g) => g.effRatio)) };
}
