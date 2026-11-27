// Cas de validation de la littérature (src/core/examples-validation.js) :
// comparaison aux valeurs publiées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { spectrumAt } from '../src/fem/spectral.js';
import { nureg1677p1, bm3, sdll14 } from '../src/core/examples-validation.js';

const run = (m) => runAnalysis(normalizeModel(JSON.parse(JSON.stringify(m))));
const within = (v, ref, tol, msg) => assert.ok(Math.abs(v / ref - 1) < tol, `${msg} : ${v} / ${ref}`);
const IN = 25.4;
const LBF = 4.4482216;
const INLB = 112.9848; // N·mm par in·lb

test('Spectre : interpolation linéaire en période', () => {
  const pts = [[10, 1], [40, 0.4]];
  // T = 0,05 s entre 0,1 s (1 g) et 0,025 s (0,4 g) : 1 − (0,05/0,075)·0,6 = 0,6
  assert.ok(Math.abs(spectrumAt(pts, 20, 'period') - 0.6) < 1e-12);
  assert.ok(Math.abs(spectrumAt(pts, 20, 'linear') - 0.8) < 1e-12);
});

test('NUREG/CR-1677 vol. 1, problème 1 : fréquences, déplacements et réactions aux ancrages', () => {
  const r = run(nureg1677p1());
  [28.53, 55.77, 81.5, 141.7, 162.8].forEach((f, k) => within(r.modal.modes[k].freq, f, 0.001, `mode ${k + 1}`));
  assert.equal(r.modal.modes.filter((x) => x.freq < 180).length, 5, 'cinq modes retenus');
  const S = r.cases[0];
  const u = (n, d) => S.u[r.mesh.nodeIndex.get(n) * 6 + d];
  // déplacements (in) et rotations (rad) du rapport : UX(5), UY(7), UZ(4), ROTX(3), ROTY(7), ROTZ(3)
  for (const [n, d, v] of [['C1B', 0, 7.84967e-3 * IN], ['C2A', 1, 2.49629e-3 * IN], ['C1M', 2, 1.74471e-2 * IN], ['C1A', 3, 1.8413e-4], ['C2A', 4, 2.12142e-4], ['C1A', 5, 7.01236e-5]]) {
    within(u(n, d), v, 0.002, `déplacement ${n} ${d}`);
  }
  // efforts aux ancrages du rapport (lb, in·lb), ramenés aux axes globaux
  const reac = { A1: [17.88, 4.958, 36.43, 3227, 629.6, 1394], A11: [34.78, 7.472, 24.02, 774.5, 2477, 113.0] };
  for (const [lab, v] of Object.entries(reac)) {
    const k = r.mesh.supports.findIndex((s) => s.label === lab);
    v.forEach((x, d) => within(S.supportLoads[k * 6 + d] / (d < 3 ? LBF : INLB), x, 0.003, `${lab} composante ${d}`));
  }
});

test('NUREG/CR-6645, ligne BM3 : 14 fréquences et réactions (SRSS + masse manquante)', () => {
  const r = run(bm3());
  const fref = [2.91, 4.39, 5.52, 5.7, 6.98, 7.34, 7.88, 10.3, 11.06, 11.23, 11.5, 12.43, 13.88, 16.12];
  fref.forEach((f, k) => within(r.modal.modes[k].freq, f, 0.005, `mode ${k + 1}`));
  assert.equal(r.modal.modes.filter((x) => x.freq < 17).length, 14, '14 modes retenus');
  // cibles du manuel de vérification ANSYS (valeur NRC × rapport publié, lb)
  const ref = {
    A1: [43.71 * 1.1, 4.36 * 1.26, 1.6 * 4.74], R4: [116.79 * 0.8, null, 20.01 * 3.77], R7: [null, 13.27 * 1.2, null], R11Y: [null, 13.31 * 1.48, null], R11Z: [null, null, 81.34 * 0.99],
    R15: [731.47 * 0.6, null, null], R17Y: [null, 25.6 * 1.91, null], R17Z: [null, null, 65.36 * 1.22], R36Y: [null, 46.69 * 1.93, null], R36Z: [null, null, 42.12 * 2.02],
    A38: [732.18 * 0.89, 43.44 * 1.21, 29.95 * 1.4], R23X: [259.59 * 1.02, null, null], R23Y: [null, 26.08 * 4.04, null], A31: [55.05 * 0.92, 14.17 * 1.75, 16.08 * 1.97],
  };
  const S = r.cases[0];
  let count = 0;
  for (const [lab, v] of Object.entries(ref)) {
    const k = r.mesh.supports.findIndex((s) => s.label === lab);
    assert.ok(k >= 0, lab);
    v.forEach((x, d) => {
      if (x == null) return;
      count++;
      within(S.supportLoads[k * 6 + d] / LBF, x, 0.03, `${lab} ${'XYZ'[d]}`);
    });
  }
  assert.equal(count, 21);
});

test('SDLL14 (VPCS) : modes d’un coude mince, trois longueurs de bras', () => {
  // [AFNOR, PIPESTRESS] d'après Code_Aster V2.02.014
  const refs = {
    2000: [[17.9, 24.8, 25.3, 27.0], [17.64, 24.386, 24.885, 26.631]],
    600: [[33.4, 94, 100, 180], [33.168, 93.989, 98.785, 181.979]],
    0: [[44.23, 119, 125, 227], [44.076, 119.028, 125.448, 224.426]],
  };
  for (const [l, [afnor, ps]] of Object.entries(refs)) {
    const r = run(sdll14({ l: +l }));
    assert.deepEqual(r.warnings, [], `l = ${l}`);
    for (let k = 0; k < 4; k++) {
      within(r.modal.modes[k].freq, ps[k], 0.003, `l = ${l}, mode ${k + 1} (PIPESTRESS)`);
      within(r.modal.modes[k].freq, afnor[k], 0.02, `l = ${l}, mode ${k + 1} (AFNOR)`);
    }
  }
});
