// Non-régression sur le modèle d'exemple : équilibres globaux et cohérence du dépouillement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleModel, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { G_STD } from '../src/core/units.js';

test('Exemple : calcul complet, équilibre du poids et des efforts thermiques', () => {
  const r = runAnalysis(exampleModel());
  const W = r.cases.find((c) => c.id === 'W');
  const T = r.cases.find((c) => c.id === 'T1');
  const ns = r.mesh.supports.length;
  let total = r.mesh.pointMasses.reduce((s, p) => s + p.m, 0);
  for (const e of r.mesh.elements) total += (e.mpl.metal + e.mpl.fluid + e.mpl.insul) * e.massLength;
  let fz = 0;
  const sumT = [0, 0, 0];
  for (let k = 0; k < ns; k++) {
    fz += W.supportLoads[k * 6 + 2];
    for (let d = 0; d < 3; d++) sumT[d] += T.supportLoads[k * 6 + d];
  }
  assert.ok(Math.abs(-fz - total * G_STD) < 1e-6 * total * G_STD, 'Σ réactions = poids');
  for (const v of sumT) assert.ok(Math.abs(v) < 1e-3, 'efforts thermiques auto-équilibrés');
  assert.ok(r.modal.modes.length > 5);
  assert.ok(r.check.rows.length > 0);
  for (const row of r.check.rows) assert.ok(Number.isFinite(row.ratio) && row.ratio >= 0);
  assert.equal(typeof r.check.summary.ok, 'boolean');
});

test('Sérialisation JSON aller-retour', () => {
  const m = exampleModel();
  const back = normalizeModel(JSON.parse(JSON.stringify(m)));
  const a = runAnalysis(m);
  const b = runAnalysis(back);
  assert.equal(a.check.summary.maxRatio, b.check.summary.maxRatio);
});

test('Méthode sismique statique équivalente', () => {
  const m = exampleModel();
  const s = m.loadCases.find((c) => c.type === 'seismic');
  s.method = 'static';
  const r = runAnalysis(m);
  const S = r.cases.find((c) => c.base === s.id);
  assert.equal(S.signed, false);
  assert.ok(Math.max(...S.supportLoads) > 0);
});

test('Analyse modale : Σ masses modales effectives = masse globale (tous modes)', () => {
  const m = exampleModel();
  Object.assign(m.loadCases.find((c) => c.type === 'seismic'), { maxModes: 10000, cutoff: 1e9 });
  const { modal } = runAnalysis(m);
  const eff = [0, 0, 0];
  for (const md of modal.modes) md.effMass.forEach((v, d) => (eff[d] += v));
  for (let d = 0; d < 3; d++) {
    assert.ok(Math.abs(eff[d] / modal.totalMass[d] - 1) < 1e-6, `direction ${d}`);
    assert.ok(modal.supportedMass[d] > 0 && modal.supportedMass[d] < modal.totalMass[d]);
  }
});

test('Résultats complets en un point : combinaisons ± séisme et enveloppe', async () => {
  const { pointResults } = await import('../src/ui/results.js');
  const r = runAnalysis(exampleModel());
  const k = 0;
  const vals = (c) => Array.from({ length: 6 }, (_, d) => c.supportLoads[k * 6 + d]);
  const { elementary, combos, env } = pointResults(r, vals, [['F', [0, 1, 2]]]);
  const fe = r.cases.filter((c) => c.fe !== false);
  assert.equal(elementary.length, fe.length);
  const W = vals(r.cases.find((c) => c.id === 'W'));
  const T = vals(r.cases.find((c) => c.id === 'T1'));
  const S = r.cases.find((c) => !c.signed);
  const s = vals(S).map(Math.abs);
  const label = `W+P+T1+${S.id}`;
  const mn = combos.find((c) => c.label === `${label} (min)`);
  const mx = combos.find((c) => c.label === `${label} (max)`);
  assert.ok(mn && mx, 'combinaisons W+P+T1 ± séisme présentes');
  for (let d = 0; d < 6; d++) {
    assert.ok(Math.abs(mn.vals[d] - (W[d] + T[d] - s[d])) < 1e-9);
    assert.ok(Math.abs(mx.vals[d] - (W[d] + T[d] + s[d])) < 1e-9);
    assert.ok(env.vals[d] >= Math.abs(mn.vals[d]) && env.vals[d] >= Math.abs(mx.vals[d]));
  }
  assert.ok(Math.abs(mx.der[0] - Math.hypot(...[0, 1, 2].map((d) => Math.abs(W[d] + T[d]) + s[d]))) < 1e-9);
});

test('Chargement : paramètres de code obsolètes supprimés', () => {
  const raw = JSON.parse(JSON.stringify(exampleModel()));
  raw.code.params = { ...raw.code.params, levelB_kY: '', k6: 2, shMinusSL: true };
  const m = normalizeModel(raw);
  assert.deepEqual(Object.keys(m.code.params).sort(), ['cycles', 'pressureCorrection']);
});

test('Catalogue ASME : épaisseurs B36.10M / B36.19M et rayons de coudes B16.9', async () => {
  const { PIPE_SIZES, schedulesOf, elbowRadius, sizeFromOD } = await import('../src/core/pipeCatalog.js');
  const s6 = PIPE_SIZES.find((x) => x.nps === '6');
  assert.equal(Object.fromEntries(schedulesOf('B36.10M', s6)).STD, 7.11);
  const s12 = sizeFromOD(323.9);
  assert.deepEqual(schedulesOf('B36.19M', s12), [['5S', 3.96], ['10S', 4.57], ['40S', 9.53], ['80S', 12.7]]);
  assert.equal(elbowRadius('LR', 168.3).R, 229);
  assert.equal(elbowRadius('SR', 114.3).R, 102);
  assert.equal(elbowRadius('3D', 60.3).R, 152);
  assert.equal(elbowRadius('', 168.3).R, 252);
  assert.equal(elbowRadius('LR', 170).R, null, 'diamètre hors catalogue');
  // coude du modèle : rayon selon le type, rayon saisi prioritaire
  const m = exampleModel();
  const b = m.components.find((c) => c.type === 'bend' && c.node === '20');
  Object.assign(b, { radius: '', radiusType: 'SR' });
  const od = m.sections.find((x) => x.id === m.components.find((c) => c.type === 'pipe' && (c.n1 === b.node || c.n2 === b.node)).section).od;
  const corner = runAnalysis(m).mesh.corners.get(String(b.node));
  assert.equal(corner.radius, elbowRadius('SR', od).R);
  b.radius = 300;
  assert.equal(runAnalysis(m).mesh.corners.get('20').radius, 300, 'rayon saisi prioritaire');
});

test('Export Excel : une feuille par équation, par support, par cas ; archive xlsx valide', async () => {
  const { exportSheets } = await import('../src/ui/export.js');
  const { buildXlsx, crc32 } = await import('../src/core/xlsx.js');
  const m = exampleModel();
  const r = runAnalysis(m);
  const sheets = exportSheets({ model: m, result: r }, ['summary', 'code', 'supports', 'disp', 'modes']);
  const names = sheets.map((s) => s.name);
  for (const n of ['Synthèse', 'Éq 6', 'Éq 7', 'Éq 10B', 'Modes propres', 'Dépl W', 'Dépl T1']) assert.ok(names.includes(n), `feuille ${n}`);
  assert.equal(names.filter((n) => n.startsWith('Sup ')).length, r.mesh.supports.length);
  // déplacements du nœud supporté dans la feuille du support (cas W, colonnes DX..DZ)
  const k = r.mesh.supports.findIndex((s) => s.kind !== 'anchor');
  const sup = sheets.filter((s) => s.name.startsWith('Sup '))[k];
  const head = sup.rows[2];
  const W = r.cases.find((c) => c.id === 'W');
  const wRow = sup.rows.find((row) => row[0] === 'W');
  const n = r.mesh.supports[k].node;
  for (const [d, col] of ['DX (mm)', 'DY (mm)', 'DZ (mm)'].entries()) assert.ok(Math.abs(wRow[head.indexOf(col)] - W.u[n * 6 + d]) < 0.01, col);
  assert.ok(head.includes('D rés. (mm)'));
  const eq7 = sheets.find((s) => s.name === 'Éq 7');
  assert.equal(eq7.rows.length - 1, r.check.rows.filter((x) => x.eq === '7').length);
  const bytes = buildXlsx(sheets);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50, 'signature ZIP');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC-32 de référence');
});

test('Modèles d’exemple : tous calculables, sans avertissement de maillage', async () => {
  const { EXAMPLES } = await import('../src/core/examples.js');
  assert.ok(EXAMPLES.length >= 3);
  for (const ex of EXAMPLES) {
    const m = normalizeModel(JSON.parse(JSON.stringify(ex.build())));
    const r = runAnalysis(m);
    assert.ok(r.check.rows.length > 0, ex.id);
    assert.ok(Number.isFinite(r.check.summary.maxRatio), ex.id);
  }
  // supports à ressort : précharges réglées sur le poids (déplacement vertical
  // faible ; précharges identiques au modèle PIPESTRESS, sans le fluide du robinet)
  const r = runAnalysis(EXAMPLES.find((e) => e.id === 'springs').build());
  const W = r.cases.find((c) => c.id === 'W');
  for (const lab of ['25', '35', '45']) assert.ok(Math.abs(W.u[r.mesh.nodeIndex.get(lab) * 6 + 2]) < 0.5, `uz ${lab}`);
  // comparaison PIPESTRESS : taux max de l'éq. (7) = 0,396 (référence PIPESTRESS 0,396)
  const ps = runAnalysis(EXAMPLES.find((e) => e.id === 'pipestress').build());
  const max7 = Math.max(...ps.check.rows.filter((x) => x.eq === '7').map((x) => x.ratio));
  assert.ok(Math.abs(max7 - 0.396) < 0.002, `éq. (7) ${max7}`);
});

test('Problème de Hovgaard (SSLL101) : déplacements du point 3 et moment au point 1', async () => {
  const { EXAMPLES } = await import('../src/core/examples.js');
  const r = runAnalysis(normalizeModel(JSON.parse(JSON.stringify(EXAMPLES.find((e) => e.id === 'hovgaard').build()))));
  const ref = { W: [-0.1658, -0.0204, -0.00801], F1: [-0.1651, -0.0208, -0.009516], T1: [-6.1418, -13.09, 16.799] };
  const i = r.mesh.nodeIndex.get('C1A');
  for (const [id, v] of Object.entries(ref)) {
    const c = r.cases.find((x) => x.id === id);
    v.forEach((x, d) => assert.ok(Math.abs(c.u[i * 6 + d] / x - 1) < 0.003, `${id} ${'XYZ'[d]} : ${c.u[i * 6 + d]} / ${x}`));
  }
  const W = r.cases.find((x) => x.id === 'W');
  const k = r.mesh.supports.findIndex((s) => s.label === 'T1');
  const meq = Math.hypot(...[3, 4, 5].map((d) => W.supportLoads[k * 6 + d] / 1000));
  assert.ok(Math.abs(meq / 189.769 - 1) < 0.001, `Meq ${meq}`);
});

test('Problème de Hovgaard (SDLX02) : fréquences et réponse spectrale', async () => {
  const { EXAMPLES } = await import('../src/core/examples.js');
  const r = runAnalysis(normalizeModel(JSON.parse(JSON.stringify(EXAMPLES.find((e) => e.id === 'hovgaard').build()))));
  // fréquences de référence avec matrice de masse diagonale (masses concentrées)
  [10.18, 19.54, 25.47, 48.09, 52.86, 75.94, 80.11].forEach((f, k) => assert.ok(Math.abs(r.modal.modes[k].freq / f - 1) < 0.02, `mode ${k + 1} : ${r.modal.modes[k].freq}`));
  const S = r.cases.find((c) => c.base === 'S1');
  const disp = { C1A: [4.847, 2.192], C1B: [4.808, 2.914, 0.6507], 7: [3.588, 2.914, 0.8599], C2A: [2.342, 2.913, 1.027], C2B: [null, 0.9375, 0.3364] };
  for (const [n, v] of Object.entries(disp)) {
    const i = r.mesh.nodeIndex.get(n);
    v.forEach((x, d) => x != null && assert.ok(Math.abs(S.u[i * 6 + d] / x - 1) < 0.015, `${n} ${'XYZ'[d]} : ${S.u[i * 6 + d]} / ${x}`));
  }
  const reac = { T1: [2132, 1241, 564.6, 2352, 4746, 937.3], T15: [1653, 3354, 893.7, 170.8, 1668, 4903] };
  for (const [lab, v] of Object.entries(reac)) {
    const k = r.mesh.supports.findIndex((s) => s.label === lab);
    v.forEach((x, d) => {
      const y = S.supportLoads[k * 6 + d] / (d < 3 ? 1 : 1000);
      assert.ok(Math.abs(y / x - 1) < 0.03, `${lab} ${d} : ${y} / ${x}`);
    });
  }
});

test('Cas test collecteur DN200 : éq. (7) dépassée, couverte par l’éq. (8) ; précharges réglées sur le poids', async () => {
  const { EXAMPLES } = await import('../src/core/examples.js');
  const m = normalizeModel(JSON.parse(JSON.stringify(EXAMPLES.find((e) => e.id === 'benchmark').build())));
  const r = runAnalysis(m);
  assert.deepEqual(r.warnings, []);
  for (const t of ['tee', 'reducer', 'valve']) assert.ok(m.components.some((c) => c.type === t), t);
  const over7 = r.check.rows.filter((x) => x.eq === '7' && x.ratio > 1);
  assert.ok(over7.length >= 2, 'éq. (7) dépassée');
  assert.ok(over7.every((x) => x.coveredBy === '8'), 'éq. (8) satisfaite aux points concernés');
  assert.ok(over7.some((x) => x.comp.startsWith('Té')), 'dépassement au té');
  assert.ok(r.check.summary.ok);
  assert.ok(r.check.rows.some((x) => x.eq === '10C'));
  const W = r.cases.find((c) => c.id === 'W');
  for (const lab of ['25', '75']) assert.ok(Math.abs(W.u[r.mesh.nodeIndex.get(lab) * 6 + 2]) < 0.1, `uz ${lab}`);
});

test('Cas test collecteur DN200 : comparaison PIPESTRESS (module à chaud, té avec tronçon rigide, soudures de réduction)', async () => {
  const { EXAMPLES } = await import('../src/core/examples.js');
  const r = runAnalysis(normalizeModel(JSON.parse(JSON.stringify(EXAMPLES.find((e) => e.id === 'benchmark').build()))));
  const max = (eq, pred) => Math.max(...r.check.rows.filter((x) => x.eq === eq && pred(x)).map((x) => x.stress));
  const ref = [
    ['7', (x) => x.node === '30' && x.comp.startsWith('Té') && r.mesh.elements[x.ie].rigid, 232.29, 0.01],
    ['7', (x) => x.node === '60A', 203.84, 0.01],
    ['7', (x) => x.node === '70B', 200.22, 0.01],
    ['7', (x) => x.node === '41', 148.98, 0.01],
    ['8', (x) => x.node === '30', 251.52, 0.01],
    ['8', (x) => x.node === '60A', 227.49, 0.01],
    ['6', (x) => x.node === '45', 31.44, 0.01],
    ['6', (x) => x.node === '41', 28.91, 0.01],
    ['10C', (x) => x.node === '45', 46.93, 0.01],
    ['10C', (x) => x.node === '120', 43.11, 0.015],
  ];
  for (const [eq, pred, v, tol] of ref) {
    const s = max(eq, pred);
    assert.ok(Math.abs(s / v - 1) < tol, `éq. (${eq}) ${s} / ${v}`);
  }
  // réactions de dilatation (à chaud) et fréquences
  const T = r.cases.find((c) => c.id === 'T1');
  const sup = (lab, d) => -T.supportLoads[r.mesh.supports.findIndex((s) => s.label === lab) * 6 + d];
  for (const [lab, d, v] of [['G1', 0, 26612], ['G1', 1, -14515], ['BA1', 0, -13057], ['AG2', 0, -15576], ['Pompe', 2, 4474], ['Équipement', 0, -17093]]) assert.ok(Math.abs(sup(lab, d) / v - 1) < 0.01, `${lab} ${d} : ${sup(lab, d)} / ${v}`);
  [10.37, 14.78, 17.85, 19.36, 25.18, 29.71, 30.2, 43.16, 48.78].forEach((f, k) => assert.ok(Math.abs(r.modal.modes[k].freq / f - 1) < 0.012, `mode ${k + 1} : ${r.modal.modes[k].freq}`));
});
