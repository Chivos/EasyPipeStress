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
  const S = r.cases.find((c) => c.id === s.id);
  assert.equal(S.signed, false);
  assert.ok(Math.max(...S.supportLoads) > 0);
});
