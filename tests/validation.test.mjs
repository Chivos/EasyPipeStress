// Cas de validation analytiques (référence : théorie des poutres, Timoshenko ;
// Blevins, « Formulas for Natural Frequency and Mode Shape »).
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, exampleModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { pipeSection } from '../src/core/sections.js';
import { componentFactors, rangeReductionFactor } from '../src/codes/rccm-c.js';
import { symmetricEigen, ProfileCholesky } from '../src/core/linalg.js';
import { spectrumAt, cqcRho, guptaAlpha } from '../src/fem/spectral.js';

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b}`);

/** Matériau à propriétés constantes. */
function setup({ density = 0, alpha = 12, E = 200000, shear = false, maxLen = 100 } = {}) {
  const m = emptyModel();
  m.settings.shear = shear;
  m.settings.meshMaxLength = maxLen;
  m.materials = [{ id: 'M', name: 'test', density, nu: 0.3, table: [{ T: 20, E, alpha, S: 100, Sy: 200 }, { T: 400, E, alpha, S: 100, Sy: 200 }] }];
  m.sections = [{ id: 'S', od: 168.3, t: 7.11, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  m.loadCases = [];
  return m;
}
const pipe = (n1, n2, dx, dy, dz, extra = {}) => ({ type: 'pipe', n1, n2, dx, dy, dz, section: 'S', material: 'M', T1: 20, P1: 0, ...extra });
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: '', ...extra });
const nodeDisp = (r, caseId, label) => {
  const c = r.cases.find((x) => x.id === caseId);
  const i = r.mesh.nodeIndex.get(label) * 6;
  return Array.from(c.u.slice(i, i + 6));
};

test('Cholesky profil : résolution d’un système SPD', () => {
  const A = new Float64Array([4, 1, 0, 1, 3, 1, 0, 1, 2]);
  const ch = new ProfileCholesky(Float64Array.from(A), 3);
  const x = ch.solve([1, 2, 3]);
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let j = 0; j < 3; j++) s += A[i * 3 + j] * x[j];
    near(s, [1, 2, 3][i], 1e-12, 'résidu');
  }
});

test('Valeurs propres symétriques (tred2/tql2)', () => {
  const { values, vectors } = symmetricEigen([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  const exact = [2 - Math.SQRT2, 2, 2 + Math.SQRT2];
  values.forEach((v, k) => near(v, exact[k], 1e-12, `λ${k}`));
  near(Math.abs(vectors[1][0]), Math.SQRT1_2, 1e-10, 'vecteur propre');
});

test('Console sous charge ponctuelle : flèche PL³/3EI (+ cisaillement)', () => {
  for (const shear of [false, true]) {
    const m = setup({ shear, maxLen: 500 });
    m.components = ensureIds({ components: [pipe('1', '2', 3000, 0, 0), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000, label: '' }] }).components;
    m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
    const r = runAnalysis(m);
    const sp = pipeSection(m.sections[0]);
    const P = 1 * 9806.65; // 1 t
    const G = 200000 / 2.6;
    const exact = (P * 3000 ** 3) / (3 * 200000 * sp.I) + (shear ? (P * 3000) / (G * sp.As) : 0);
    near(-nodeDisp(r, 'W', '2')[2], exact, 1e-3, `flèche (cisaillement ${shear})`);
    const reac = r.cases[0].supportLoads;
    near(-reac[2], P, 1e-6, 'réaction verticale');
    near(Math.abs(reac[4]), P * 3000, 1e-6, 'moment d’encastrement');
  }
});

test('Console sous poids propre réparti : flèche wL⁴/8EI', () => {
  const m = setup({ density: 7850, maxLen: 250 });
  m.components = ensureIds({ components: [pipe('1', '2', 0, 4000, 0), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  const r = runAnalysis(m);
  const sp = pipeSection(m.sections[0]);
  const w = 7850e-12 * sp.A * 9806.65;
  near(-nodeDisp(r, 'W', '2')[2], (w * 4000 ** 4) / (8 * 200000 * sp.I), 1e-4, 'flèche'); // ancrage par pénalité
});

test('Tube bridé entre deux ancrages : effort thermique EAαΔT', () => {
  const m = setup({ alpha: 12 });
  m.components = ensureIds({ components: [pipe('1', '2', 5000, 0, 0, { T1: 220 }), sup('1', 'anchor'), sup('2', 'anchor')] }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const sp = pipeSection(m.sections[0]);
  const N = 200000 * sp.A * 12e-6 * 200;
  const s = r.cases[0].supportLoads;
  near(Math.abs(s[0]), N, 1e-4, 'effort axial ancrage 1'); // ancrages par pénalité
  near(s[0] + s[6], 0, 1e-6 * N, 'équilibre');
});

test('Dilatation libre : déplacement αΔT·L et efforts nuls', () => {
  const m = setup({ alpha: 12 });
  m.components = ensureIds({ components: [pipe('1', '2', 3000, 0, 0, { T1: 120 }), pipe('2', '3', 0, 2000, 0, { T1: 120 }), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const u = nodeDisp(r, 'T1', '3');
  near(u[0], 12e-6 * 100 * 3000, 1e-6, 'ux');
  near(u[1], 12e-6 * 100 * 2000, 1e-6, 'uy');
  assert.ok(Math.max(...Array.from(r.cases[0].supportLoads).map(Math.abs)) < 1e-3);
});

test('Système en L entre ancrages : équilibre global des réactions thermiques', () => {
  const m = setup({ alpha: 16 });
  m.components = ensureIds({
    components: [pipe('1', '2', 4000, 0, 0, { T1: 300 }), pipe('2', '3', 0, 3000, 0, { T1: 300 }), { type: 'bend', node: '2', radius: 229 }, sup('1', 'anchor'), sup('3', 'anchor')],
  }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const s = r.cases[0].supportLoads;
  for (let d = 0; d < 3; d++) assert.ok(Math.abs(s[d] + s[6 + d]) < 1e-6 * (Math.abs(s[d]) + 1), `ΣF${d}`);
  assert.ok(Math.abs(s[0]) > 100, 'effort non trivial');
});

test('Coude : facteurs k = 1,65/h et i = 0,9/h^(2/3)', () => {
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  const f = componentFactors({ kind: 'bend', sec, bend: { radius: 228.6 } });
  const h = (7.11 * 228.6) / sec.rm ** 2;
  near(f.k, 1.65 / h, 1e-12, 'k');
  near(f.i, 0.9 / h ** (2 / 3), 1e-12, 'i');
  assert.equal(f.B1, undefined, 'pas d’indices B1/B2 en classe 2');
  assert.equal(rangeReductionFactor(7000), 1);
  assert.equal(rangeReductionFactor(20000), 0.8);
  assert.equal(rangeReductionFactor(1e6), 0.5);
});

test('Coude 90° en console : la flexibilité du coude augmente la flèche', () => {
  const run = (b2Method) => {
    const m = setup({ maxLen: 200 });
    m.code.params.b2Method = b2Method;
    m.components = ensureIds({ components: [pipe('1', '2', 2000, 0, 0), pipe('2', '3', 0, 2000, 0), { type: 'bend', node: '2', radius: 229 }, sup('1', 'anchor'), { type: 'mass', node: '3', mass: 500 }] }).components;
    m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
    return runAnalysis(m);
  };
  const r = run('indices');
  const bendEl = r.mesh.elements.find((e) => e.kind === 'bend');
  assert.ok(bendEl.factors.k > 5, 'k du coude DN150 grand rayon ≈ 6,6');
  assert.ok(r.mesh.nodeIndex.has('2A') && r.mesh.nodeIndex.has('2M') && r.mesh.nodeIndex.has('2B'));
  const dz = -nodeDisp(r, 'W', '3')[2];
  assert.ok(dz > 0);
});

test('Fréquence propre d’une console : f₁ = 1,875²/(2π)·√(EI/mL⁴)', () => {
  const m = setup({ density: 7850, maxLen: 100 });
  m.components = ensureIds({ components: [pipe('1', '2', 3000, 0, 0), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'S', type: 'seismic', enabled: true, method: 'spectral', cutoff: 1000, maxModes: 6, modal: 'SRSS', directional: 'SRSS', missingMass: false, damping: 5, spectra: { Z: { factor: 1, points: [[0.1, 1], [100, 1]] } } }];
  const r = runAnalysis(m);
  const sp = pipeSection(m.sections[0]);
  const mL = 7850e-12 * sp.A;
  const f1 = (1.875104 ** 2 / (2 * Math.PI)) * Math.sqrt((200000 * sp.I) / (mL * 3000 ** 4));
  near(r.modal.modes[0].freq, f1, 5e-3, 'f1');
  near(r.modal.modes[1].freq, f1, 5e-3, 'f1 (plan perpendiculaire)');
});

test('Spectre plat sur oscillateur simple : moment de base m·Sa·L', () => {
  const m = setup({ density: 0, maxLen: 500 });
  m.components = ensureIds({ components: [pipe('1', '2', 0, 0, 2000), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000 }] }).components;
  for (const missingMass of [false, true]) {
    m.loadCases = [{ id: 'S', type: 'seismic', enabled: true, method: 'spectral', cutoff: 1000, maxModes: 10, modal: 'CQC', directional: 'SRSS', missingMass, damping: 5, spectra: { X: { factor: 1, points: [[0.1, 0.5], [100, 0.5]] } } }];
    const r = runAnalysis(m);
    const s = r.cases[0].supportLoads;
    near(s[0], 0.5 * 9806.65, 1e-4, 'effort tranchant');
    near(s[4], 0.5 * 9806.65 * 2000, 1e-4, 'moment');
  }
});

test('Masse manquante : modes tronqués → réponse rigide retrouvée', () => {
  const m = setup({ density: 7850, maxLen: 200 });
  m.components = ensureIds({ components: [pipe('1', '2', 0, 2000, 0), sup('1', 'anchor'), sup('2', 'anchor')] }).components;
  const lc = (missingMass) => ({ id: 'S', type: 'seismic', enabled: true, method: 'spectral', cutoff: 1, maxModes: 10, modal: 'SRSS', directional: 'SRSS', missingMass, damping: 5, spectra: { Z: { factor: 1, points: [[0.1, 1], [100, 1]] } } });
  // aucun mode sous 1 Hz : sans correction la réponse est nulle, avec correction
  // elle doit égaler la réponse statique à 1 g
  m.loadCases = [lc(true), { id: 'Q', type: 'seismic', enabled: true, method: 'static', directional: 'SRSS', staticAcc: { Z: 1 } }];
  const r = runAnalysis(m);
  const [a, b] = r.cases;
  near(a.supportLoads[2], b.supportLoads[2], 1e-6, 'réaction');
  near(a.supportLoads[4], b.supportLoads[4], 1e-6, 'moment');
});

test('CQC et interpolation de spectre', () => {
  near(cqcRho(10, 10, 0.05), 1, 1e-12, 'ρ modes confondus');
  assert.ok(cqcRho(10, 20, 0.05) < 0.02);
  near(spectrumAt([[1, 1], [10, 10]], Math.sqrt(10)), Math.sqrt(10), 1e-12, 'log-log');
});

test('Mécanisme détecté', () => {
  const m = setup();
  m.components = ensureIds({ components: [pipe('1', '2', 1000, 0, 0), sup('1', 'rest')] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  assert.throws(() => runAnalysis(m), /instable/);
});

test('RCC-M C : équations (6), (7), (8), (10) sur une console', () => {
  const m = setup({ density: 0, maxLen: 500 });
    m.components = ensureIds({ components: [pipe('1', '2', 2000, 0, 0, { P1: 5, T1: 150 }), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000 }] }).components;
  m.loadCases = [
    { id: 'W', type: 'weight', enabled: true },
    { id: 'T1', type: 'thermal', enabled: true },
    { id: 'S1', type: 'seismic', enabled: true, level: 'D', method: 'static', directional: 'SRSS', staticAcc: { Z: 1 } },
  ];
  const r = runAnalysis(m);
  const eqs = new Set(r.check.rows.map((x) => x.eq));
  for (const q of ['6', '7', '10D']) assert.ok(eqs.has(q), `éq. (${q}) présente`);
  assert.ok(!eqs.has('9') && !eqs.has('11'));
  const sp = pipeSection(m.sections[0]);
  const MA = 9806.65 * 2000;
  const row6 = r.check.rows.find((x) => x.eq === '6' && x.node === '1');
  near(row6.stress, (5 * 168.3) / (4 * 7.11) + MA / (Math.PI * sp.rm ** 2 * sp.t), 1e-3, 'éq. (6)');
  near(row6.allow, 100, 1e-12, 'admissible (6) = Sh');
  const row10 = r.check.rows.find((x) => x.eq === '10D' && x.node === '1');
  near(row10.stress, (5 * 168.3) / (4 * 7.11) + (2 * MA) / (Math.PI * sp.rm ** 2 * sp.t), 1e-3, 'éq. (10)');
  near(row10.allow, 2.4 * 100, 1e-12, 'admissible niveau D');
});

test('Té : SIF forgé 0,9/h^(2/3) (h = 4,4 e/r) appliqué aux trois branches', () => {
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  const f = componentFactors({ kind: 'tee', teeType: 'welding', sec });
  near(f.i, 0.9 / ((4.4 * 7.11) / sec.rm) ** (2 / 3), 1e-12, 'i forgé');
  near(componentFactors({ kind: 'tee', teeType: 'unreinforced', sec }).i, 0.9 / (7.11 / sec.rm) ** (2 / 3), 1e-12, 'i non renforcé');
  assert.equal(componentFactors({ kind: 'tee', teeType: 'user', sif: 2.5, sec }).i, 2.5);

  const m = setup({ alpha: 12, maxLen: 500 });
  m.components = ensureIds({
    components: [
      pipe('1', '2', 2000, 0, 0, { T1: 200 }),
      pipe('2', '3', 2000, 0, 0, { T1: 200 }),
      pipe('2', '4', 0, 1500, 0, { T1: 200 }),
      { type: 'tee', node: '2', teeType: 'unreinforced' },
      sup('1', 'anchor'),
      sup('3', 'anchor'),
      sup('4', 'anchor'),
    ],
  }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  assert.equal(r.mesh.tees.length, 1);
  const rows7 = r.check.rows.filter((x) => x.eq === '7' && x.node === '2');
  assert.equal(rows7.length, 3, 'trois extrémités au nœud du té');
  for (const row of rows7) {
    assert.equal(row.comp, 'Té 2');
    near(row.detail.i, componentFactors({ kind: 'tee', teeType: 'unreinforced', sec }).i, 1e-12, 'i appliqué');
  }
  assert.ok(r.check.rows.filter((x) => x.eq === '7' && x.node === '1').every((x) => x.detail.i === 1));
});

test('Épaisseur minimale : désactivée par défaut, activable dans le projet', () => {
  const m = setup();
  m.components = ensureIds({ components: [pipe('1', '2', 1000, 0, 0, { P1: 5 }), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  assert.ok(!runAnalysis(m).check.rows.some((x) => x.eq === 'e'));
  m.settings.checkThickness = true;
  const row = runAnalysis(m).check.rows.find((x) => x.eq === 'e');
  near(row.stress, (5 * 168.3) / (2 * (100 + 0.4 * 5)), 1e-12, 'e_m');
});

test('Séisme : spectre horizontal commun aux deux directions horizontales', () => {
  const m = setup({ density: 0, maxLen: 500 });
  m.components = ensureIds({ components: [pipe('1', '2', 0, 0, 2000), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000 }] }).components;
  const flat = (a) => ({ factor: 1, points: [[0.1, a], [100, a]] });
  const lc = (same) => ({ id: 'S', type: 'seismic', enabled: true, method: 'spectral', cutoff: 1000, maxModes: 10, modal: 'SRSS', directional: 'SRSS', missingMass: true, damping: 5, sameHorizontal: same, spectra: { X: flat(0.5), Y: flat(0.2), Z: flat(0) } });
  m.loadCases = [lc(true)];
  let s = runAnalysis(m).cases[0].supportLoads;
  near(Math.abs(s[1]), 0.5 * 9806.65, 1e-4, 'Y reçoit le spectre horizontal (celui de X)');
  m.loadCases = [lc(false)];
  s = runAnalysis(m).cases[0].supportLoads;
  near(Math.abs(s[1]), 0.2 * 9806.65, 1e-4, 'Y propre si l’option est décochée');
});

test('Séisme : niveaux 10B, 10C, 10D, même spectre et coefficients propres', () => {
  const m = setup({ density: 0, maxLen: 500 });
  m.components = ensureIds({ components: [pipe('1', '2', 2000, 0, 0, { P1: 0 }), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000 }] }).components;
  m.loadCases = [
    {
      id: 'S1', type: 'seismic', enabled: true, method: 'static', directional: 'SRSS', staticAcc: { Z: 1 },
      levels: [{ level: 'B', enabled: true, factor: 0.5 }, { level: 'C', enabled: false, factor: 1 }, { level: 'D', enabled: true, factor: 1 }],
    },
  ];
  const r = runAnalysis(m);
  assert.deepEqual(r.cases.map((c) => c.id), ['S1-B', 'S1-D']);
  near(r.cases[0].supportLoads[2], 0.5 * r.cases[1].supportLoads[2], 1e-12, 'mise à l’échelle du niveau B');
  const sp = pipeSection(m.sections[0]);
  const MB = 9806.65 * 2000;
  const b = r.check.rows.find((x) => x.eq === '10B' && x.node === '1');
  const d = r.check.rows.find((x) => x.eq === '10D' && x.node === '1');
  const Zc = Math.PI * sp.rm ** 2 * sp.t; // C 3658 b
  near(b.stress, (0.5 * MB) / Zc, 1e-3, 'éq. (10B)');
  near(d.stress, MB / Zc, 1e-3, 'éq. (10D)');
  near(b.allow, 1.2 * 100, 1e-12, 'admissible B');
  near(d.allow, 2.4 * 100, 1e-12, 'admissible D');
  assert.ok(!r.check.rows.some((x) => x.eq === '10C'));
  const comb = r.code.combinations({ model: m }).map((c) => c.eq);
  assert.deepEqual(comb, ['(6)', '(10B)', '(10D)']);
});

// ---------------------------------------------------------------- audit

test('Coude 90° : flexibilité vs Castigliano (flexion I/k + torsion), discrétisation par défaut', () => {
  const R = 1000;
  const m = setup({ maxLen: 50 });
  m.components = ensureIds({ components: [pipe('1', '2', R, 0, 0), pipe('2', '3', 0, R, 0), { type: 'bend', node: '2', radius: R }, sup('1', 'anchor'), { type: 'mass', node: '3', mass: 1000 }] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  const r = runAnalysis(m);
  assert.ok(r.mesh.nodeIndex.has('1') && r.mesh.nodeIndex.has('2A'), 'coude soudé directement sur l’ancrage : nœuds fusionnés');
  assert.equal(r.mesh.nodeIndex.get('1'), r.mesh.nodeIndex.get('2A'));
  const sp = pipeSection(m.sections[0]);
  const k = r.mesh.elements.find((e) => e.kind === 'bend').factors.k;
  const E = 200000;
  const G = E / 2.6;
  const P = 9806.65;
  // quart de cercle, ancrage en φ = 0, charge P (–Z) en φ = π/2
  let s = 0;
  const N = 20000;
  for (let n = 0; n < N; n++) {
    const ph = ((n + 0.5) / N) * (Math.PI / 2);
    const ex = R - R * Math.sin(ph);
    const ey = R - R * (1 - Math.cos(ph));
    const Mx = -P * ey;
    const My = P * ex;
    const Mt = Mx * Math.cos(ph) + My * Math.sin(ph);
    const Mb = -Mx * Math.sin(ph) + My * Math.cos(ph);
    s += ((Mb * Mb * k) / (E * sp.I) + (Mt * Mt) / (G * sp.J)) * ((R * Math.PI) / 2 / N);
  }
  const dz = -nodeDisp(r, 'W', '3')[2];
  near(dz, s / P, 5e-3, 'flèche du coude');
});

test('Dilatation : coefficient moyen depuis 20 °C et température de référence ≠ 20 °C', () => {
  const m = setup();
  m.materials[0].table = [
    { T: 20, E: 200000, alpha: 12, S: 100, Sy: 200 },
    { T: 300, E: 200000, alpha: 13.4, S: 100, Sy: 200 },
  ];
  m.settings.tRef = 50;
  m.components = ensureIds({ components: [pipe('1', '2', 1000, 0, 0, { T1: 300 }), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const a50 = 12 + (1.4 * 30) / 280;
  near(nodeDisp(r, 'T1', '2')[0], (13.4e-6 * 280 - a50 * 1e-6 * 30) * 1000, 1e-9, 'ΔL');
});

test('Té : SIF calculé avec les dimensions du collecteur, appliqué à la dérivation', () => {
  const m = setup({ maxLen: 500 });
  m.sections.push({ id: 'B', od: 60.3, t: 3.91, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 });
  m.components = ensureIds({
    components: [pipe('1', '2', 1000, 0, 0), pipe('2', '3', 1000, 0, 0), pipe('2', '4', 0, 800, 0, { section: 'B' }), { type: 'tee', node: '2', teeType: 'welding' }, sup('1', 'anchor'), sup('3', 'anchor'), sup('4', 'anchor')],
  }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  const r = runAnalysis(m);
  const run = pipeSection(m.sections[0]);
  const iRun = 0.9 / ((4.4 * run.t) / run.rm) ** (2 / 3);
  for (const e of r.mesh.nodeElems[r.mesh.nodeIndex.get('2')]) near(e.endFactors[e.n1 === r.mesh.nodeIndex.get('2') ? 0 : 1].i, Math.max(1, iRun), 1e-12, 'i du té');
});

test('Gupta (RG 1.92 rév. 3) : coefficients α et invariance pour un oscillateur simple', () => {
  const pts = [[1, 0.2], [3, 1], [8, 1], [33, 0.3], [50, 0.3]];
  const a = guptaAlpha(pts, 33);
  const svMax = Math.max(...pts.map((p) => p[1] / (2 * Math.PI * p[0])));
  const f1 = 1 / (2 * Math.PI * svMax);
  const f2 = (f1 + 66) / 3;
  assert.equal(a(f1 * 0.99), 0);
  assert.equal(a(f2 * 1.01), 1);
  near(a(Math.sqrt(f1 * f2)), 0.5, 1e-12, 'α au milieu (log)');
  // oscillateur simple : part rigide + part périodique = réponse totale
  const m = setup({ density: 0, maxLen: 500 });
  m.components = ensureIds({ components: [pipe('1', '2', 0, 0, 1500), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 300 }] }).components;
  const lc = (rigid) => ({ id: 'S', type: 'seismic', enabled: true, method: 'spectral', cutoff: 33, maxModes: 10, modal: 'CQC', directional: 'SRSS', missingMass: true, rigid, damping: 5, spectra: { X: { factor: 1, points: pts } } });
  m.loadCases = [lc('none')];
  const base = runAnalysis(m).cases[0].supportLoads[4];
  m.loadCases = [lc('gupta')];
  near(runAnalysis(m).cases[0].supportLoads[4], base, 1e-9, 'moment de base');
});

test('RCC-M C : S_A = f(1,25 Sc + 0,25 Sh), admissibles fixes (anciens paramètres ignorés)', () => {
  const m = setup({ alpha: 12 });
  m.code.params = { ...m.code.params, cycles: 1e6, shMinusSL: true, k6: 2, levelD_kS: 9 };
  m.components = ensureIds({ components: [pipe('1', '2', 3000, 0, 0, { T1: 100 }), pipe('2', '3', 0, 2000, 0, { T1: 100 }), sup('1', 'anchor'), sup('3', 'anchor')] }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const row = r.check.rows.find((x) => x.eq === '7');
  near(row.allow, 0.5 * (1.25 * 100 + 0.25 * 100), 1e-12, 'S_A');
  near(r.check.rows.find((x) => x.eq === '6').allow, 100, 1e-12, 'éq. (6) : 1,0·Sh');
});

test('Tube : une seule température T et une seule pression P', () => {
  const m = setup();
  m.components = ensureIds({ components: [pipe('1', '2', 1000, 0, 0, { T1: 180, P1: 3, Td: 999, Pd: 99 }), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  const e = runAnalysis(m).mesh.elements[0];
  assert.deepEqual([e.T1, e.Td, e.P1, e.Pd], [180, 180, 3, 3], 'Td/Pd anciens ignorés');
});

test('Robinet : masse répartie, raideur × facteur, dilatation, pas de vérification du corps', () => {
  const m = setup({ density: 0, alpha: 12, maxLen: 250 });
  m.components = ensureIds({
    components: [
      pipe('1', '2', 1000, 0, 0, { T1: 120 }),
      { type: 'valve', n1: '2', n2: '3', dx: 400, dy: 0, dz: 0, mass: 200, stiffFactor: 10, section: 'S' },
      pipe('3', '4', 1000, 0, 0, { T1: 120 }),
      sup('1', 'anchor'),
    ],
  }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }, { id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const v = r.mesh.elements.find((e) => e.kind === 'valve');
  near(v.mpl.metal * v.massLength * 1000, 200, 1e-9, 'masse du robinet (kg)');
  near(v.E, 10 * 200000, 1e-12, 'raideur × 10');
  near(-r.cases[0].supportLoads[2], 0.2 * 9806.65, 1e-6, 'réaction = poids du robinet');
  near(nodeDisp(r, 'T1', '4')[0], 12e-6 * 100 * 2400, 1e-6, 'dilatation libre (robinet compris)');
  assert.ok(!r.check.rows.some((x) => x.kind === 'valve'), 'corps du robinet non vérifié');
  m.components.push({ id: 'cb', type: 'bend', node: '2', radius: 200 });
  m.components.find((c) => c.n1 === '2' && c.type === 'valve').dy = 400;
  m.components.find((c) => c.n1 === '2' && c.type === 'valve').dx = 0;
  assert.throws(() => runAnalysis(m), /robinet/);
});

test('Tolérance de fabrication et corrosion : option du projet', () => {
  const m = setup();
  m.sections[0].millTol = 12.5;
  m.sections[0].corrosion = 1;
  m.settings.checkThickness = true;
  m.components = ensureIds({ components: [pipe('1', '2', 1000, 0, 0, { P1: 5 }), sup('1', 'anchor')] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }];
  const tp = (5 * 168.3) / (2 * (100 + 0.4 * 5));
  let row = runAnalysis(m).check.rows.find((x) => x.eq === 'e');
  near(row.stress, tp, 1e-12, 'sans surépaisseurs');
  near(row.allow, 7.11, 1e-12, 'épaisseur nominale');
  m.settings.allowances = true;
  row = runAnalysis(m).check.rows.find((x) => x.eq === 'e');
  near(row.stress, tp + 1, 1e-12, 'avec corrosion');
  near(row.allow, 7.11 * 0.875, 1e-12, 'avec tolérance');
  assert.ok(row.calc.items.length > 3);
});

test('Séisme : nom des niveaux repris dans le bilan, détail de calcul complet', () => {
  const m = setup({ density: 0, maxLen: 500 });
  m.components = ensureIds({ components: [pipe('1', '2', 2000, 0, 0), sup('1', 'anchor'), { type: 'mass', node: '2', mass: 1000 }] }).components;
  m.loadCases = [{ id: 'W', type: 'weight', enabled: true }, { id: 'S1', type: 'seismic', enabled: true, method: 'static', directional: 'SRSS', staticAcc: { Z: 1 }, levels: [{ level: 'D', enabled: true, factor: 1, name: 'SMS' }] }];
  const r = runAnalysis(m);
  const row = r.check.rows.find((x) => x.eq === '10D' && x.node === '1');
  assert.equal(row.eqLabel, 'Éq. (10) niveau D', 'critère = équation + niveau');
  assert.match(row.case, /\+S1-SMS$/, 'nom du séisme dans le cas');
  assert.ok(r.cases.some((c) => c.id === 'S1-SMS'));
  const names = row.calc.moments.map((mo) => mo.name);
  assert.ok(names.some((n) => n.startsWith('M_A')) && names.some((n) => n.startsWith('M_B')));
  near(row.calc.moments.find((mo) => mo.name.startsWith('M_B')).res, 9806.65 * 2, 1e-6, 'M_B en N·m');
  assert.ok(row.calc.items.some(([k]) => /effet de fond/.test(k)));
});

test('Analyse modale : Lanczos identique à la résolution complète', async () => {
  const { exampleModel } = await import('../src/core/model.js');
  const { buildMesh } = await import('../src/core/mesher.js');
  const { FeSystem } = await import('../src/fem/system.js');
  const mesh = buildMesh(exampleModel());
  const d = new FeSystem(mesh).modal({ maxModes: 30, method: 'dense' });
  const l = new FeSystem(mesh).modal({ maxModes: 30, method: 'lanczos' });
  assert.equal(l.modes.length, 30);
  d.modes.forEach((md, k) => {
    near(l.modes[k].freq, md.freq, 1e-9, `f${k + 1}`);
    md.effMass.forEach((e, dd) => assert.ok(Math.abs(l.modes[k].effMass[dd] - e) <= 1e-9 * d.totalMass[dd]));
  });
  // arrêt à la fréquence de coupure : premier mode au-delà conservé
  const c = new FeSystem(mesh).modal({ maxModes: 60, method: 'lanczos', fmax: 15 });
  assert.ok(c.modes.length < 30 && c.modes[c.modes.length - 1].freq > 15 && c.modes[c.modes.length - 2].freq <= 15);
});

// Références : méthode des forces indépendante (intégration des énergies de
// flexion EI/k, torsion GJ et effort normal EA le long de la fibre moyenne, coudes
// sur l'arc exact), ligne encastrée aux deux extrémités, ΔT = 200 °C, α = 12e-6.
function thermalFrame(withBends) {
  const m = setup({ alpha: 12, maxLen: 250 });
  m.components = ensureIds({
    components: [
      pipe('1', '2', 4000, 0, 0, { T1: 220 }),
      pipe('2', '3', 0, 3000, 0, { T1: 220 }),
      pipe('3', '4', 0, 0, 2500, { T1: 220 }),
      ...(withBends ? [{ type: 'bend', node: '2', radiusType: 'LR' }, { type: 'bend', node: '3', radiusType: 'LR' }] : []),
      sup('1', 'anchor'),
      sup('4', 'anchor'),
    ],
  }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  const r = runAnalysis(m);
  const T = r.cases[0];
  return (lab) => {
    const ni = r.mesh.nodeIndex.get(lab);
    let mx = 0;
    r.mesh.elements.forEach((e, ie) => {
      for (const end of [0, 1]) if ((end ? e.n2 : e.n1) === ni) mx = Math.max(mx, Math.hypot(...T.elemForces.slice(ie * 12 + end * 6 + 3, ie * 12 + end * 6 + 6)));
    });
    return mx;
  };
}

test('Dilatation, cadre 3D bi-encastré : moments = méthode des forces (flexion + torsion)', () => {
  const M = thermalFrame(false);
  const ref = { 1: 5566793, 2: 5443025, 3: 3558930, 4: 5926494 };
  for (const [n, v] of Object.entries(ref)) near(M(n), v, 2e-3, `M nœud ${n}`);
});

test('Dilatation, cadre 3D avec coudes LR : moments = méthode des forces sur l’arc (k = 1,65/h)', () => {
  const M = thermalFrame(true);
  const ref = { 1: 4497883, '2A': 2920531, '2M': 3120691, '2B': 2991377, '3A': 2162906, '3M': 2274956, '3B': 2114218, 4: 4457442 };
  for (const [n, v] of Object.entries(ref)) near(M(n), v, 2e-3, `M nœud ${n}`);
});

test('RCC-M C 3658 : Z = π·r²·eₙ, piquage réduit π·r′ₘ²·tₛ (tₛ = min(Tᵣ, i·T_b)), points des coudes', () => {
  const m = setup({ alpha: 12, maxLen: 500 });
  m.sections.push({ id: 'B', od: 60.3, t: 3.91, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 });
  m.components = ensureIds({
    components: [
      pipe('1', '2', 2000, 0, 0, { T1: 200 }),
      pipe('2', '3', 2000, 0, 0, { T1: 200 }),
      pipe('2', '4', 0, 1500, 0, { T1: 200, section: 'B' }),
      pipe('4', '5', 0, 0, 1500, { T1: 200, section: 'B' }),
      { type: 'tee', node: '2', teeType: 'welding' },
      { type: 'bend', node: '4', radiusType: 'LR' },
      sup('1', 'anchor'), sup('3', 'anchor'), sup('5', 'anchor'),
    ],
  }).components;
  m.loadCases = [{ id: 'T1', type: 'thermal', enabled: true }];
  let r = runAnalysis(m);
  const run = pipeSection(m.sections[0]);
  const br = pipeSection(m.sections[1]);
  const rows = r.check.rows.filter((x) => x.eq === '7');
  const zOf = (x) => x.detail.Z;
  // tube principal au té et tube droit courant
  near(zOf(rows.find((x) => x.node === '1')), Math.PI * run.rm ** 2 * run.t, 1e-12, 'Z tube');
  // tronçon réduit au té
  const brRow = rows.find((x) => x.node === '2' && r.mesh.elements[x.ie].sec.od < 100);
  const i = brRow.detail.i;
  near(zOf(brRow), Math.PI * br.rm ** 2 * Math.min(run.t, i * br.t), 1e-12, 'Z piquage réduit');
  // coudes : points intérieurs (option du projet)
  const inner = (rs) => rs.filter((x) => x.eq === '7' && x.comp === 'Coude 4' && !['4A', '4B'].includes(x.node)).length;
  assert.ok(inner(r.check.rows) > 0, 'points intérieurs vérifiés par défaut');
  m.settings.bendInnerPoints = false;
  r = runAnalysis(m);
  assert.equal(inner(r.check.rows), 0, 'extrémités seulement');
  assert.ok(r.check.rows.some((x) => x.comp === 'Coude 4' && x.node === '4A'));
});

test('Amortissement : loi constante ou variable (5 % → 2 % entre 10 et 20 Hz), CQC à amortissements différents', async () => {
  const { dampingOf } = await import('../src/loads/seismic.js');
  const v = { dampingLaw: 'variable', dampLow: 5, fLow: 10, dampHigh: 2, fHigh: 20 };
  near(dampingOf(v, 5), 0.05, 1e-12, 'ξ sous f₁');
  near(dampingOf(v, 15), 0.035, 1e-12, 'ξ interpolé');
  near(dampingOf(v, 30), 0.02, 1e-12, 'ξ au-delà de f₂');
  near(dampingOf({ damping: 4 }, 30), 0.04, 1e-12, 'constant');
  // formule générale : ξᵢ = ξⱼ redonne la formule à amortissement commun
  const r = 1.1;
  const xi = 0.05;
  const ref = (8 * xi * xi * (1 + r) * r ** 1.5) / ((1 - r * r) ** 2 + 4 * xi * xi * r * (1 + r) ** 2);
  near(cqcRho(1, r, xi, xi), ref, 1e-12, 'ρ commun');
  assert.ok(cqcRho(1, r, 0.05, 0.02) < ref && cqcRho(1, r, 0.05, 0.02) > cqcRho(1, r, 0.02, 0.02), 'ρ entre les deux amortissements');
  // calcul complet : loi variable à ξ₁ = ξ₂ = 5 % identique à 5 % constant
  const m = exampleModel();
  const s = m.loadCases.find((c) => c.type === 'seismic');
  const base = runAnalysis(m).cases.find((c) => c.type === 'seismic').supportLoads;
  Object.assign(s, { dampingLaw: 'variable', dampLow: 5, dampHigh: 5 });
  const same = runAnalysis(m).cases.find((c) => c.type === 'seismic').supportLoads;
  for (let k = 0; k < base.length; k++) near(same[k], base[k], 1e-9, `réaction ${k}`);
});
