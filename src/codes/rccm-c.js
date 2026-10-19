// RCC-M, Section I, sous-section C (matériels de classe 2) — tuyauteries, C 3650.
//
// Équations implémentées (numérotation RCC-M ; coefficients des admissibles
// fixés par le code, non modifiables). Formulation de la
// classe 2 par le facteur d'intensification i (les indices B1/B2 relèvent de la
// classe 1, sous-section B, et ne sont pas utilisés ici) :
//  éq. (6)   poids propre + pression       S_L = P·De/(4eₙ) + 0,75i·MA/Z ≤ 1,0·Sh
//  éq. (7)   dilatation thermique          S_E = i·MC/Z ≤ S_A = f(1,25 Sc + 0,25 Sh)
//  éq. (8)   (6) + (7), si (7) non satisfaite :
//            P·De/(4eₙ) + 0,75i·MA/Z + i·MC/Z ≤ Sh + S_A
//  éq. (10)  séisme, pour chaque niveau de critère B, C, D (même spectre, coefficient
//            propre au niveau) : P·De/(4eₙ) + 0,75i·(MA + MB)/Z ≤ k·Sh,
//            k = 1,2 (B), 1,8 (C), 2,4 (D)
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
};

/** Coefficients des admissibles fixés par le code : éq. (6) et éq. (10) par niveau. */
export const K6 = 1.0;
export const LEVEL_K = { B: 1.2, C: 1.8, D: 2.4 };

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

/** Composantes locales du moment à une extrémité (torsion, flexions) et résultant, en N·m. */
function moment(name, c, ie, end) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  const f = c.elemForces;
  return { name, signed: c.signed !== false, mt: f[o] / 1000, my: f[o + 1] / 1000, mz: f[o + 2] / 1000, res: Math.hypot(f[o], f[o + 1], f[o + 2]) / 1000 };
}

function resultant(f, ie, end) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  return Math.hypot(f[o], f[o + 1], f[o + 2]);
}

const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);

export function levelLimits(level) {
  return { kS: LEVEL_K[level] ?? LEVEL_K.D };
}

export const rccmC = {
  id: 'rccm-c',
  label: 'RCC-M classe 2 (C 3650) — tuyauteries',
  reference: 'RCC-M Section I sous-section C, §C 3650 — équations (6), (7), (8), (10)',
  defaults: DEFAULT_PARAMS,
  params: [
    { key: 'cycles', label: 'Nombre de cycles thermiques équivalents N', type: 'number', title: 'Détermine le facteur de réduction f de SA' },
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
    compute(e, model) {
      const De = e.sec.od;
      const S = materialAt(e.mat, e.Td).S;
      let I = 1;
      if (e.kind === 'bend') {
        const x = e.bend.radius / De;
        I = (4 * x - 1) / (4 * x - 2);
      }
      // tolérance de fabrication et surépaisseur de corrosion : option du projet
      const allow = model?.settings?.allowances === true;
      const c = allow ? +(e.secDef.corrosion || 0) : 0;
      const tol = allow ? +(e.secDef.millTol ?? 0) || 0 : 0;
      const tp = (e.Pd * De) / (2 * (S / I + 0.4 * e.Pd));
      const tm = tp + c;
      const tAvail = e.sec.t * (1 - tol / 100);
      return {
        tm,
        tAvail,
        detail: { I, P: e.Pd, S, c },
        calc: {
          formula: 'eₘ = P·Dₑ / [2(S/I + 0,4P)] + c ≤ eₙ·(1 − tol)',
          items: [
            ['Diamètre extérieur Dₑ', De, 'mm'],
            ['Pression P', e.Pd, 'MPa'],
            ['S à T', S, 'MPa'],
            ['Facteur d’intrados I', I, ''],
            ['Épaisseur de pression P·Dₑ/[2(S/I + 0,4P)]', tp, 'mm'],
            ['Surépaisseur de corrosion c', c, 'mm'],
            ['Épaisseur minimale requise eₘ', tm, 'mm'],
          ],
          allow: [
            ['Épaisseur nominale eₙ', e.sec.t, 'mm'],
            ['Tolérance de fabrication', tol, '%'],
            ['Épaisseur disponible eₙ·(1 − tol)', tAvail, 'mm'],
          ],
          note: allow ? null : 'Tolérance de fabrication et corrosion non prises en compte (option du projet désactivée).',
        },
      };
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
    const weightCases = cases.filter((c) => c.type === 'weight' && c.fe !== false);
    const thermalCases = cases.filter((c) => c.type === 'thermal');
    const seismicCases = cases.filter((c) => c.type === 'seismic');
    const wId = weightCases.map((c) => c.id).join('+');
    const rows = [];
    const notes = [`Facteur de réduction f = ${f} (N = ${params.cycles || 7000} cycles).`];
    if (!weightCases.length) notes.push('Aucun cas de poids propre actif : MA = 0.');

    mesh.elements.forEach((e, ie) => {
      if (e.kind === 'valve') return; // corps de robinet rigide : vérifié par le fabricant, pas par le code
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
        // éléments communs au détail de calcul
        const geom = [
          ['Diamètre extérieur Dₑ', De, 'mm'],
          ['Épaisseur nominale eₙ', t, 'mm'],
          ['Module de flexion Z', Z, 'mm³'],
          ['Facteur d’intensification i', fac.i, ''],
          ...(fac.h != null ? [['Caractéristique h', fac.h, '']] : []),
        ];
        const momA = weightCases.map((c) => moment(`M_A — ${c.id}`, c, ie, end));
        const pItems = (P) => [
          ['Pression P', P, 'MPa'],
          ['Contrainte de pression (effet de fond) P·Dₑ/(4eₙ)', pTerm(P), 'MPa'],
        ];
        // éq. (6) poids propre + pression
        const SL = pTerm(e.Pd) + (i75 * MA) / Z;
        rows.push({
          ...base, eq: '6', eqLabel: 'Éq. (6) poids propre + pression', case: wId ? `${wId}+P` : 'P', stress: SL, allow: K6 * Sh, ratio: SL / (K6 * Sh),
          detail: { i: fac.i, i75, P: e.Pd, MA, Z, S: Sh },
          calc: {
            formula: 'S_L = P·Dₑ/(4eₙ) + 0,75i·M_A/Z ≤ 1,0·Sh',
            items: [...geom, ['0,75i (≥ 1)', i75, ''], ...pItems(e.Pd), ['Moment résultant M_A', MA / 1000, 'N·m'], ['Contrainte de moment 0,75i·M_A/Z', (i75 * MA) / Z, 'MPa']],
            moments: momA,
            allow: [['Température T', e.Td, '°C'], ['S à T', Sh, 'MPa'], ['Admissible 1,0·Sh', K6 * Sh, 'MPa']],
          },
        });
        // éq. (7) / (8) par cas thermique
        const SA = f * (1.25 * atC.S + 0.25 * atH.S);
        const saItems = [['Facteur de réduction f', f, ''], ['Sc (à T_réf)', atC.S, 'MPa'], ['Sh (à T)', atH.S, 'MPa'], ['S_A', SA, 'MPa']];
        for (const tc of thermalCases) {
          const MC = resultant(tc.elemForces, ie, end);
          const SE = (fac.i * MC) / Z;
          rows.push({
            ...base, eq: '7', eqLabel: 'Éq. (7) dilatation thermique', case: tc.id, stress: SE, allow: SA, ratio: SE / SA,
            detail: { i: fac.i, MC, Z, SA, f, Sc: atC.S, Sh: atH.S },
            calc: {
              formula: 'S_E = i·M_C/Z ≤ S_A = f(1,25 Sc + 0,25 Sh)',
              items: [...geom, ['Moment résultant M_C', MC / 1000, 'N·m'], ['Contrainte S_E = i·M_C/Z', SE, 'MPa']],
              moments: [moment(`M_C — ${tc.id}`, tc, ie, end)],
              allow: saItems,
            },
          });
          if (SE > SA) {
            const s8 = pTerm(e.Pd) + (i75 * MA) / Z + SE; // (6) + (7) : même pression que (6)
            const allow8 = atH.S + SA;
            rows.push({
              ...base, eq: '8', eqLabel: 'Éq. (8) = (6) + (7)', case: `${wId ? `${wId}+P+` : 'P+'}${tc.id}`, thermalCase: tc.id, stress: s8, allow: allow8, ratio: s8 / allow8,
              detail: { i: fac.i, i75, MA, MC, Z },
              calc: {
                formula: 'P·Dₑ/(4eₙ) + 0,75i·M_A/Z + i·M_C/Z ≤ Sh + S_A',
                items: [...geom, ['0,75i (≥ 1)', i75, ''], ...pItems(e.Pd), ['Contrainte 0,75i·M_A/Z', (i75 * MA) / Z, 'MPa'], ['Contrainte i·M_C/Z', SE, 'MPa']],
                moments: [...momA, moment(`M_C — ${tc.id}`, tc, ie, end)],
                allow: [...saItems, ['Admissible Sh + S_A', allow8, 'MPa']],
              },
            });
          }
        }
        // éq. (10) séisme, par niveau
        for (const sc of seismicCases) {
          const lim = levelLimits(sc.level);
          const MB = resultant(sc.elemForces, ie, end);
          const s10 = pTerm(e.P1) + (i75 * (MA + MB)) / Z;
          const allow = lim.kS * Sh;
          const L = sc.level ?? 'D';
          rows.push({
            ...base, eq: `10${L}`, eqLabel: `Éq. (10) niveau ${L}`, case: `${wId ? `${wId}+P+` : 'P+'}${sc.id}`, stress: s10, allow, ratio: s10 / allow,
            detail: { i: fac.i, i75, P: e.P1, MA, MB, Z, S: Sh, Sy, factor: sc.factor },
            calc: {
              formula: 'P·Dₑ/(4eₙ) + 0,75i·(M_A + M_B)/Z ≤ k·Sh',
              items: [
                ...geom, ['0,75i (≥ 1)', i75, ''], ...pItems(e.P1),
                ['Moment résultant M_A', MA / 1000, 'N·m'], ['Moment résultant M_B (séisme × coefficient)', MB / 1000, 'N·m'],
                ['Coefficient du niveau sur le séisme', sc.factor ?? 1, ''], ['Contrainte 0,75i·(M_A + M_B)/Z', (i75 * (MA + MB)) / Z, 'MPa'],
              ],
              moments: [...momA, moment(`M_B — ${sc.id} (enveloppe)`, sc, ie, end)],
              allow: [['Température T', e.Td, '°C'], ['S à T', Sh, 'MPa'], [`k niveau ${L}`, lim.kS, ''], ['Admissible k·Sh', allow, 'MPa']],
            },
          });
        }
      }
    });

    // éq. (7) satisfaite via (8) : un point est acceptable si (7) OU (8) l'est
    const ok8 = new Set(rows.filter((r) => r.eq === '8' && r.ratio <= 1).map((r) => `${r.ie}:${r.end}:${r.thermalCase}`));
    for (const r of rows) if (r.eq === '7' && r.ratio > 1 && ok8.has(`${r.ie}:${r.end}:${r.case}`)) r.coveredBy = '8';

    const summary = summarize(rows);
    notes.push('Moments résultants aux extrémités des éléments ; SIF du coude appliqué sur les éléments du coude.');
    notes.push('Éq. (8) évaluée seulement aux points où l’éq. (7) n’est pas satisfaite.');
    notes.push('Valeurs matériaux indicatives à confirmer dans l’édition RCC-M applicable.');
    return { rows, summary, notes, f };
  },

  /** Description des cumuls de chargements utilisés par chaque équation. */
  combinations({ model }) {
    const active = model.loadCases.filter((c) => c.enabled !== false);
    const W = active.filter((c) => c.type === 'weight').map((c) => c.id);
    const T = active.filter((c) => c.type === 'thermal').map((c) => c.id);
    const S = active.filter((c) => c.type === 'seismic');
    const w = W.join(' + ') || '(aucun poids)';
    const out = [
      { eq: '(6)', name: 'Poids propre + pression', loads: `${w} ; pression P`, rule: 'M_A = moment résultant du poids propre ; terme de pression P·Dₑ/(4eₙ)', allow: `${K6}·Sh` },
    ];
    for (const t of T) {
      out.push({ eq: '(7)', name: 'Dilatation thermique', loads: `${t} (étendue depuis l’état froid, déplacements imposés compris)`, rule: 'M_C = moment résultant de l’étendue de dilatation, sans poids ni pression', allow: 'S_A = f(1,25 Sc + 0,25 Sh)' });
      out.push({ eq: '(8)', name: '(6) + (7), si (7) non satisfaite', loads: `${w} + P + ${t}`, rule: 'contraintes de (6) et de (7) additionnées', allow: 'Sh + S_A' });
    }
    for (const s of S) {
      for (const lv of seismicLevels(s).filter((x) => x.enabled !== false)) {
        const lim = levelLimits(lv.level);
        out.push({
          eq: `(10${lv.level})`,
          name: `Séisme niveau ${lv.level}`,
          loads: `${w} + P + ${s.id}-${String(lv.name ?? '').trim() || lv.level} (= ${num(lv.factor, 1)} × ${s.id})`,
          rule: `M_A + M_B (somme des moments résultants) ; M_B = réponse sismique ${s.method === 'static' ? 'statique équivalente' : `spectrale ${s.modal ?? 'CQC'}`}, directions ${s.directional ?? 'SRSS'}, × ${num(lv.factor, 1)}`,
          allow: `${lim.kS}·Sh`,
        });
      }
    }
    return out;
  },
};
