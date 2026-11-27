// Vérification commune aux codes dont les équations ont la forme de l'ASME B31.1
// (EN 13480-3 §12.3, CODETI section C3) :
//   charges permanentes   σ₁ = P·D/(4e) + 0,75i·M_A/Z                 ≤ f_h
//   charges occasionnelles σ₂ = P·D/(4e) + 0,75i·M_A/Z + 0,75i·M_B/Z   ≤ k·f_h
//   étendue de dilatation σ₃ = i·M_C/Z                                 ≤ f_a = U(1,25 f_c + 0,25 f_h)·E_h/E_c
//   permanentes + dilatation, si σ₃ > f_a :
//                         σ₄ = P·D/(4e) + 0,75i·M_A/Z + i·M_C/Z        ≤ f_h + f_a
// avec 0,75i ≥ 1 et les moments résultants √(Mt² + My² + Mz²). Chaque code
// fournit ses libellés, son module Z, ses admissibles et ses coefficients k
// (objet `spec`, voir en13480.js et codeti.js), et en option :
//  - `alternative(params)` : méthode à moments séparés dans le plan et hors plan,
//    le terme i·M/Z devenant √[(i_i·M_i)² + (i_o·M_o)² + M_t²]/Z (torsion non
//    intensifiée ; 0,75·i_i et 0,75·i_o ≥ 1 pour les charges primaires) ;
//  - `stressSection(sec, e, model)` et `stressFactors(pt, e, sec, params)` :
//    section et facteurs utilisés pour les contraintes quand ils diffèrent des
//    valeurs nominales (épaisseur de référence diminuée de la corrosion).
// Le RCC-M classe 2 a la même forme mais garde son module propre (rccm-c.js).
//
// M_C est l'étendue de moment calculée au module à chaud E_h ; le rapport E_h/E_c
// (équivalence en déformation) porte sur l'admissible f_a.

import { materialAt, refTemperature } from '../core/materials.js';
import { summarize } from './common.js';
import { resultant, torsion, planeBending, momentRow, planeMomentRow, ecOverEh, checkPoint, loadSets, activeLoads } from './shared.js';

const PLANE_COLS = ['M_t (torsion)', 'M_i (dans le plan)', 'M_o (hors plan)', 'Résultant'];
const PLANE_TITLE = 'Moments à l’extrémité de l’élément (plan du coude ou du té, N·m)';

export function momentCheck(spec, { model, mesh, cases }) {
  const params = { ...spec.defaults, ...(model.code?.params ?? {}) };
  const tRef = refTemperature(model.settings);
  const U = spec.rangeFactor(params);
  const levels = spec.levelsFor(params);
  const alt = spec.alternative?.(params) === true;
  const { weight, thermal, seismic, wId } = loadSets(cases);
  const q = spec.eq;
  const s = spec.sym;
  const rows = [];
  const notes = [`${s.U} = ${+U.toFixed(3)} (N = ${+params.cycles || 7000} cycles).`];
  if (!weight.length) notes.push('Aucun cas de poids propre actif : M_A = 0.');
  let thin = 0;

  mesh.elements.forEach((e, ie) => {
    if (e.kind === 'valve') return; // corps de robinet rigide : hors vérification
    const atD = materialAt(e.mat, e.Td);
    const atH = materialAt(e.mat, Math.max(e.T1, e.Td));
    const atC = materialAt(e.mat, tRef);
    const fh = atD.S;
    for (const end of [0, 1]) {
      const pt = checkPoint(e, ie, end, mesh, model, { weld: spec.weld !== false });
      if (!pt) continue;
      const { base } = pt;
      // section et facteurs des contraintes (nominaux, sauf épaisseur de référence du code)
      const sec = spec.stressSection ? spec.stressSection(pt.sec, e, model) : pt.sec;
      const fac = spec.stressFactors ? spec.stressFactors(pt, e, sec, params) : pt.fac;
      if (spec.maxDmOverE && (2 * sec.rm) / sec.t >= spec.maxDmOverE) thin++;
      const i75 = Math.max(1, 0.75 * fac.i);
      const ii = fac.ii ?? fac.i;
      const io = fac.io ?? fac.i;
      const pTerm = (P) => (P * sec.od) / (4 * sec.t);
      const { Z, zItems } = spec.modulus({ ...pt, fac }, sec);
      // terme de moment : i·M/Z (moment résultant) ou forme séparée plan / hors plan
      const bend = (c, primary) => {
        if (!alt) return ((primary ? i75 : fac.i) * resultant(c.elemForces, ie, end)) / Z;
        const [Mi, Mo] = planeBending(c, ie, end);
        const [a, b] = primary ? [Math.max(1, 0.75 * ii), Math.max(1, 0.75 * io)] : [ii, io];
        return Math.hypot(a * Mi, b * Mo, torsion(c.elemForces, ie, end)) / Z;
      };
      const mRow = (name, c, k = 1) => (alt ? planeMomentRow(name, c, ie, end, k) : momentRow(name, c, ie, end, k));
      const momExtra = alt ? { momentCols: PLANE_COLS, momentTitle: PLANE_TITLE } : {};
      const primLabel = alt ? '√[(0,75i_i·M_i)² + (0,75i_o·M_o)² + M_t²]/Z' : '0,75i·M/Z';
      const rangeLabel = alt ? '√[(i_i·M_i)² + (i_o·M_o)² + M_t²]/Z' : 'i·M_C/Z';
      const MA = weight.reduce((a, c) => a + resultant(c.elemForces, ie, end), 0);
      const sA = weight.reduce((a, c) => a + bend(c, true), 0);
      const geom = [
        [`Diamètre extérieur ${s.D}`, sec.od, 'mm'],
        [`${sec.c > 0 ? 'Épaisseur de référence (corrosion déduite)' : 'Épaisseur nominale'} ${s.e}`, sec.t, 'mm'],
        ...zItems,
        ...(alt ? [['Facteur dans le plan i_i', ii, ''], ['Facteur hors plan i_o', io, '']] : [['Facteur d’intensification i', fac.i, '']]),
        ...(fac.h != null && !fac.weld ? [['Caractéristique h', fac.h, '']] : []),
        ...(fac.weld ? [['Soudure bout à bout brute de soudage (extrémité de réduction)', pt.weldI, '']] : []),
      ];
      const i75Items = alt ? [['0,75i_i (≥ 1)', Math.max(1, 0.75 * ii), ''], ['0,75i_o (≥ 1)', Math.max(1, 0.75 * io), '']] : [['0,75i (≥ 1)', i75, '']];
      const momA = weight.map((c) => mRow(`M_A — ${c.id}`, c));
      const pItems = (P) => [
        ['Pression P', P, 'MPa'],
        [`Contrainte de pression ${s.pTerm}`, pTerm(P), 'MPa'],
      ];
      const detail = alt ? { i: fac.i, ii, io } : { i: fac.i, i75 };
      // charges permanentes
      const s1 = pTerm(e.Pd) + sA;
      rows.push({
        ...base, eq: q.sus.id, order: 1, eqLabel: q.sus.label, case: wId ? `${wId}+P` : 'P', stress: s1, allow: fh, ratio: s1 / fh,
        detail: { ...detail, P: e.Pd, MA, Z, S: fh },
        calc: {
          formula: q.sus.formula,
          items: [...geom, ...i75Items, ...pItems(e.Pd), ['Moment résultant M_A', MA / 1000, 'N·m'], [`Contrainte de moment ${primLabel} (M_A)`, sA, 'MPa']],
          moments: momA,
          ...momExtra,
          allow: [['Température T', e.Td, '°C'], [`${s.fh} à T`, fh, 'MPa']],
        },
      });
      // étendue de dilatation, puis permanentes + dilatation où elle est dépassée
      for (const tc of thermal) {
        // Le code compare l'étendue calculée au module à chaud à un admissible réduit
        // de E_h/E_c : avec un calcul à chaud (option du projet par défaut) les moments
        // sont pris tels quels ; avec un calcul à froid, l'admissible n'est pas réduit
        // (les deux écritures donnent le même taux).
        const hot = ecOverEh(tc, e) !== 1;
        const MC = resultant(tc.elemForces, ie, end);
        const s3 = bend(tc, false);
        const { fa, items: faItems } = spec.rangeAllowable({ U, fc: atC.S, fh: atH.S, ratio: hot ? e.Eh / e.E : 1, hot, params });
        const momC = mRow(`M_C — ${tc.id}`, tc);
        const cItems = [[`Moment résultant M_C (module ${hot ? 'à chaud' : 'à froid'})`, MC / 1000, 'N·m'], [`Contrainte ${rangeLabel}`, s3, 'MPa']];
        rows.push({
          ...base, eq: q.exp.id, order: 3, eqLabel: q.exp.label, case: tc.id, stress: s3, allow: fa, ratio: s3 / fa,
          detail: { ...detail, i75: undefined, MC, Z, SA: fa, f: U, Sc: atC.S, Sh: atH.S },
          calc: { formula: q.exp.formula, items: [...geom, ...cItems], moments: [momC], ...momExtra, allow: faItems },
        });
        if (s3 > fa) {
          const s4 = pTerm(e.Pd) + sA + s3;
          const allow4 = atH.S + fa;
          rows.push({
            ...base, eq: q.comb.id, order: 4, eqLabel: q.comb.label, case: `${wId ? `${wId}+P+` : 'P+'}${tc.id}`, thermalCase: tc.id, stress: s4, allow: allow4, ratio: s4 / allow4,
            detail: { ...detail, MA, MC, Z },
            calc: {
              formula: q.comb.formula,
              items: [...geom, ...i75Items, ...pItems(e.Pd), [`Contrainte ${primLabel} (M_A)`, sA, 'MPa'], ...cItems],
              moments: [...momA, momC],
              ...momExtra,
              allow: [...faItems, [`Admissible ${s.fhot} + ${s.fa}`, allow4, 'MPa']],
            },
          });
        }
      }
      // charges occasionnelles (séisme), par niveau
      for (const sc of seismic) {
        const lv = levels[sc.level];
        if (!lv) continue;
        const MB = resultant(sc.elemForces, ie, end);
        const sB = bend(sc, true);
        const s2 = pTerm(e.P1) + sA + sB;
        const allow = lv.k * fh;
        rows.push({
          ...base, eq: `${q.occ.id}${sc.level}`, order: 2 + 'BCD'.indexOf(sc.level) / 10, eqLabel: `${q.occ.label} — ${lv.label}`, case: `${wId ? `${wId}+P+` : 'P+'}${sc.id}`, stress: s2, allow, ratio: s2 / allow,
          detail: { ...detail, P: e.P1, MA, MB, Z, S: fh, factor: sc.factor },
          calc: {
            formula: q.occ.formula,
            items: [
              ...geom, ...i75Items, ...pItems(e.P1),
              ['Moment résultant M_A', MA / 1000, 'N·m'], ['Moment résultant M_B (séisme × coefficient)', MB / 1000, 'N·m'],
              ['Coefficient sur le séisme', sc.factor ?? 1, ''],
              [`Contrainte ${primLabel} (M_A)`, sA, 'MPa'], [`Contrainte ${primLabel} (M_B)`, sB, 'MPa'],
            ],
            moments: [...momA, mRow(`M_B — ${sc.id} (enveloppe)`, sc)],
            ...momExtra,
            allow: [['Température T', e.Td, '°C'], [`${s.fh} à T`, fh, 'MPa'], [`k (${lv.label})`, lv.k, ''], [`Admissible k·${s.fh}`, allow, 'MPa']],
          },
        });
      }
    }
  });

  // étendue de dilatation dépassée mais équation combinée satisfaite : point acceptable
  const okComb = new Set(rows.filter((r) => r.eq === q.comb.id && r.ratio <= 1).map((r) => `${r.ie}:${r.end}:${r.thermalCase}`));
  for (const r of rows) {
    if (r.eq === q.exp.id && r.ratio > 1 && okComb.has(`${r.ie}:${r.end}:${r.case}`)) {
      r.coveredBy = q.comb.id;
      r.coveredName = q.comb.name;
    }
  }

  notes.push(
    alt
      ? 'Méthode à moments séparés : flexions dans le plan et hors plan des coudes et des tés (séisme : projection mode par mode avant les combinaisons), torsion non intensifiée.'
      : 'Moments résultants aux extrémités des éléments ; facteur i du coude appliqué sur les éléments du coude.',
  );
  notes.push(`${q.comb.name} évaluée seulement aux points où ${q.exp.name} n’est pas satisfaite.`);
  if (thin) notes.push(`${thin} point(s) vérifié(s) avec un rapport diamètre moyen / épaisseur ≥ ${spec.maxDmOverE} : hors du domaine de validité des coefficients d’intensification du code.`);
  notes.push(...(spec.notes ?? []));
  const warnings = thin ? [`${spec.short ?? 'Code'} : ${thin} point(s) avec D_m/e ≥ ${spec.maxDmOverE}, hors du domaine de validité des coefficients d’intensification.`] : [];
  return { rows, summary: summarize(rows), notes, warnings, f: U };
}

/** Description des cumuls de chargements (onglet Code, note de calcul). */
export function momentCombinations(spec, { model }, code) {
  const params = { ...spec.defaults, ...(model.code?.params ?? {}) };
  const levels = spec.levelsFor(params);
  const alt = spec.alternative?.(params) === true;
  const m = (x) => (alt ? `contrainte du moment ${x} à flexions séparées dans le plan / hors plan` : `${x} = moment résultant`);
  const { w, T, S } = activeLoads(model);
  const q = spec.eq;
  const s = spec.sym;
  const out = [{ eq: q.sus.ref, name: 'Charges permanentes : poids + pression', loads: `${w} ; pression P`, rule: `${m('M_A')} du poids propre ; terme de pression ${s.pTerm}`, allow: s.fh }];
  for (const x of S(code)) {
    const lv = levels[x.lv.level];
    out.push({ eq: q.occ.ref, name: `Charges occasionnelles — ${lv.label}`, loads: `${w} + P + ${x.id} (= ${x.factor} × ${x.s.id})`, rule: `contraintes de M_A et de M_B additionnées ; M_B = ${x.rule}`, allow: `${String(lv.k).replace('.', ',')}·${s.fh}` });
  }
  for (const t of T) {
    out.push({ eq: q.exp.ref, name: 'Étendue de dilatation', loads: `${t} (étendue depuis l’état froid, déplacements imposés compris)`, rule: `${m('M_C')} de l’étendue de dilatation, sans poids ni pression`, allow: s.faFormula });
    out.push({ eq: q.comb.ref, name: `Permanentes + dilatation, si ${q.exp.name} non satisfaite`, loads: `${w} + P + ${t}`, rule: 'contraintes des charges permanentes et de la dilatation additionnées', allow: `${s.fhot} + ${s.fa}` });
  }
  return out;
}
