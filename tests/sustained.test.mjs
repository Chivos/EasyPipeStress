// Poids dans la configuration de service (solveur non linéaire, expérimental).
// Quand le supportage change entre l'état froid et le service (appui décollé, jeu
// fermé), le poids est recalculé contacts figés dans l'état de service et les
// équations du code sont vérifiées aussi dans cette configuration.
// Contrôles : solutions analytiques sur une console, absence de tout changement
// quand le supportage ne change pas, et les exemples 1 et 2 de l'annexe S de
// l'ASME B31.3-2012, dont le second est l'exemple du code sur ce sujet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { pipeSection } from '../src/core/sections.js';
import { EXAMPLES, nonlinearSupports } from '../src/core/examples.js';
import { b313AppendixS } from '../src/core/examples-validation.js';

// Comparaisons analytiques à 1e-4 : l'ancrage par pénalité ajoute une souplesse de l'ordre de 1e-5 en relatif.
const near = (a, b, rel, msg, abs = 0) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + abs, `${msg}: ${a} vs ${b}`);
const G = 9806.65; // mm/s²
const E = 200000;
const L = 3000;
const sec = pipeSection({ od: 168.3, t: 7.11 });
const w = 7850e-12 * sec.A * G; // poids linéique, N/mm
const EI = E * sec.I;
const SAG = (w * L ** 4) / (8 * EI); // flèche libre en bout de console

/** Console le long de X, encastrée au nœud 10, sans cisaillement, module constant, sans dilatation propre. */
function cantilever({ thermal = [{ id: 'T1', imposed: true }] } = {}) {
  const m = emptyModel();
  m.settings.shear = false;
  m.settings.meshMaxLength = 250;
  m.settings.solver = 'nonlinear';
  m.materials = [{ id: 'M', name: 'test', density: 7850, nu: 0.3, table: [{ T: 20, E, alpha: 12, S: 100, Sy: 200 }, { T: 400, E, alpha: 12, S: 100, Sy: 200 }] }];
  m.sections = [{ id: 'S', od: 168.3, t: 7.11, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  m.loadCases = [{ id: 'W', type: 'weight', label: 'Poids', enabled: true }, ...thermal.map((t) => ({ type: 'thermal', label: 'Dilatation', enabled: true, ...t }))];
  m.components.push({ type: 'pipe', n1: '10', n2: '20', dx: L, dy: 0, dz: 0, section: 'S', material: 'M', T1: 20, P1: 0 });
  return m;
}
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: `${kind}${node}`, ...extra });
const run = (m) => runAnalysis(normalizeModel(ensureIds(m)));
const byId = (r, id) => r.cases.find((c) => c.id === id);
/** Moment de flexion à l'encastrement (N·mm) du cas c. */
const anchorMoment = (r, c) => {
  const ie = r.mesh.elements.findIndex((e) => r.mesh.nodes[e.n1].label === '10');
  return Math.hypot(c.elemForces[ie * 12 + 4], c.elemForces[ie * 12 + 5]);
};
const vertical = (r, c, label) => c.supportLoads[r.mesh.supports.findIndex((s) => s.label === label) * 6 + 2];
/** Ligne de l'équation eq au nœud, dans la configuration donnée (null : calcul de base). */
const row = (r, eq, node, configuration = null) => {
  const list = r.check.rows.filter((x) => x.eq === eq && x.node === node && (x.configuration ?? null) === configuration);
  return list.reduce((a, b) => (b.stress > a.stress ? b : a), list[0]);
};

test('appui qui décolle en service : poids recalculé appui retiré (console, solution analytique)', () => {
  const m = cantilever();
  m.components.push(sup('10', 'anchor', { imposed: `0 0 ${2 * SAG}` }), sup('20', 'rest'));
  const r = run(m);
  assert.deepEqual(r.nonlinear.states.map((s) => s.contacts[0].status), ['contact', 'lifted']);
  assert.deepEqual(r.nonlinear.configurations, [{ id: 'W(T1)', weight: 'W', states: ['W+T1'], thermal: ['T1'], changes: [{ contact: 0, from: 'contact', to: 'lifted' }] }]);
  const [cold, hot] = [byId(r, 'W'), byId(r, 'W(T1)')];
  assert.equal(hot.type, 'sustained');
  // à froid : console appuyée ; appui retiré : console libre
  near(anchorMoment(r, cold), (w * L * L) / 8, 1e-4, 'moment à froid');
  near(anchorMoment(r, hot), (w * L * L) / 2, 1e-4, 'moment appui retiré');
  near(vertical(r, cold, 'rest20'), (-3 * w * L) / 8, 1e-4, 'appui à froid');
  assert.equal(vertical(r, hot, 'rest20'), 0);
  near(vertical(r, hot, 'anchor10'), -w * L, 1e-9, 'tout le poids sur l’encastrement');
  near(hot.u[r.mesh.nodeIndex.get('20') * 6 + 2], -SAG, 1e-4, 'flèche libre, sans la montée de l’encastrement');
  // l'éq. (6) est vérifiée dans les deux configurations : sans pression, le rapport est celui des moments
  const [s0, s1] = [row(r, '6', '10'), row(r, '6', '10', 'W(T1)')];
  assert.equal(s0.case, 'W+P');
  assert.equal(s1.case, 'W(T1)+P');
  near(s1.stress / s0.stress, 4, 1e-4, 'éq. (6) appui retiré / à froid');
  near(s1.calc.moments.reduce((a, mr) => a + mr.res, 0), (w * L * L) / 2 / 1e3, 1e-4, 'M_A de l’éq. (6) appui retiré (N·m)');
  // la synthèse retient la configuration la plus sévère
  const governing = r.check.summary.governing.filter((g) => g.eq === '6');
  assert.deepEqual(governing.map((g) => g.case), ['W+P', 'W(T1)+P']);
  near(r.check.summary.maxRatio, Math.max(...r.check.rows.map((x) => (x.coveredBy ? 0 : x.ratio))), 1e-12, 'taux maximal');
  assert.ok(r.check.summary.maxRatio >= s1.ratio);
  // les lignes sans le poids (dilatation seule) ne sont pas dupliquées
  assert.ok(r.check.rows.filter((x) => x.configuration).every((x) => x.eq !== '7'));
  assert.equal(r.check.rows.filter((x) => x.eq === '7' && x.node === '10').length, r.check.rows.filter((x) => x.eq === '6' && x.node === '10' && !x.configuration).length);
});

test('supportage inchangé en service : aucun cas ni ligne supplémentaire', () => {
  // montée inférieure à la flèche libre : l'appui reste en contact
  const m = cantilever();
  m.components.push(sup('10', 'anchor', { imposed: `0 0 ${0.4 * SAG}` }), sup('20', 'rest'));
  const r = run(m);
  assert.deepEqual(r.nonlinear.states.map((s) => s.contacts[0].status), ['contact', 'contact']);
  assert.deepEqual(r.nonlinear.configurations, []);
  assert.ok(!r.cases.some((c) => c.type === 'sustained'));
  assert.ok(r.check.rows.every((x) => !x.configuration));
  // de même avec frottement : l'adhérence ou le glissement ne change pas le supportage
  const f = cantilever();
  f.components[0].T1 = 120;
  f.components.push(sup('10', 'anchor'), sup('20', 'rest', { friction: 0.3 }));
  const rf = run(f);
  assert.equal(rf.nonlinear.states[1].friction[0].slip, true);
  assert.deepEqual(rf.nonlinear.configurations, []);
  // solveur linéaire, ou modèle sans contact : rien non plus
  for (const ex of EXAMPLES.filter((e) => e.build().settings.solver !== 'nonlinear')) {
    const a = normalizeModel(ex.build());
    const b = normalizeModel(ex.build());
    b.settings.solver = 'nonlinear';
    for (const rr of [runAnalysis(a), runAnalysis(b)]) {
      assert.ok(!rr.cases.some((c) => c.type === 'sustained'), ex.id);
      assert.ok(rr.check.rows.every((x) => !x.configuration), ex.id);
    }
  }
});

test('jeu fermé en service : support gardé actif, sens inverse signalé', () => {
  const build = (dz) => {
    const m = cantilever();
    m.components.push(sup('10', 'anchor', { imposed: `0 0 ${dz}` }), sup('20', 'clamp', { gap: String(2 * SAG) }));
    return run(m);
  };
  // l'encastrement descend : l'extrémité vient sur la butée basse, qui porte aussi sous le poids seul
  const low = build(-3 * SAG);
  assert.deepEqual(low.nonlinear.states.map((s) => s.contacts[0].status), ['open', 'closedMinus']);
  assert.deepEqual(low.nonlinear.configurations[0].changes, [{ contact: 0, from: 'open', to: 'closedMinus' }]);
  const [cold, hot] = [byId(low, 'W'), byId(low, 'W(T1)')];
  near(anchorMoment(low, cold), (w * L * L) / 2, 1e-4, 'à froid : console libre');
  near(anchorMoment(low, hot), (w * L * L) / 8, 1e-4, 'butée active : console appuyée');
  near(vertical(low, hot, 'clamp20'), (-3 * w * L) / 8, 1e-4, 'effort sur la butée');
  assert.ok(!low.warnings.some((x) => x.includes('sens inverse')));
  // la configuration de service est ici moins sévère : l'état froid gouverne toujours l'éq. (6)
  assert.ok(row(low, '6', '10', 'W(T1)').stress < row(low, '6', '10').stress);
  // l'encastrement monte : l'extrémité vient sur la butée haute, que le poids seul solliciterait vers le bas
  const high = build(4 * SAG);
  assert.equal(high.nonlinear.states[1].contacts[0].status, 'closedPlus');
  assert.ok(high.warnings.some((x) => x.includes('W(T1)') && x.includes('sens inverse') && x.includes('clamp20')));
  near(anchorMoment(high, byId(high, 'W(T1)')), (w * L * L) / 8, 1e-4, 'butée gardée active');
});

test('plusieurs cas de dilatation : une configuration par supportage distinct', () => {
  const lifted = { imposed: `0 0 ${2 * SAG}` };
  // T1 applique la montée de l'encastrement (appui décollé), T2 non (appui en contact)
  const one = cantilever({ thermal: [{ id: 'T1', imposed: true }, { id: 'T2', imposed: false }] });
  one.components.push(sup('10', 'anchor', lifted), sup('20', 'rest'));
  const r1 = run(one);
  assert.deepEqual(r1.nonlinear.states.map((s) => s.contacts[0].status), ['contact', 'lifted', 'contact']);
  assert.deepEqual(r1.nonlinear.configurations.map((c) => [c.id, c.thermal]), [['W(T1)', ['T1']]]);
  // les deux cas décollent l'appui : une seule configuration, commune
  const two = cantilever({ thermal: [{ id: 'T1', imposed: true }, { id: 'T2', imposed: true }] });
  two.components.push(sup('10', 'anchor', lifted), sup('20', 'rest'));
  const r2 = run(two);
  assert.deepEqual(r2.nonlinear.configurations.map((c) => [c.id, c.states]), [['W(T1,T2)', ['W+T1', 'W+T2']]]);
  assert.equal(r2.cases.filter((c) => c.type === 'sustained').length, 1);
});

test('exemple non linéaire : report du poids quand A1 décolle', () => {
  const r = runAnalysis(normalizeModel(nonlinearSupports({ friction: '' })));
  assert.deepEqual(r.nonlinear.configurations.map((c) => c.id), ['W(T1)']);
  const [cold, hot] = [byId(r, 'W'), byId(r, 'W(T1)')];
  const z = (c, label) => c.supportLoads[r.mesh.supports.findIndex((s) => s.label === label) * 6 + 2];
  assert.equal(z(hot, 'A1'), 0);
  assert.ok(-z(hot, 'A2') > -z(cold, 'A2') + 2000, 'A2 reprend une part du poids de A1');
  const total = (c) => r.mesh.supports.reduce((a, s, k) => a + c.supportLoads[k * 6 + 2], 0);
  near(total(hot), total(cold), 1e-9, 'même poids total');
  const g6 = r.check.summary.governing.filter((g) => g.eq === '6');
  near(g6.find((g) => g.case === 'W+P').stress, 28.88, 1e-3, 'éq. (6) à froid');
  near(g6.find((g) => g.case === 'W(T1)+P').stress, 37.02, 1e-3, 'éq. (6) en configuration de service');
});

test('ASME B31.3-2012, annexe S, exemple 1 : réactions, déplacements et S_L (tableaux S301.5.1 à S301.6)', () => {
  const r = runAnalysis(normalizeModel(b313AppendixS({ example: 1 })));
  const [W, T] = [byId(r, 'W'), byId(r, 'T1')];
  const ope = (label, d) => {
    const k = r.mesh.supports.findIndex((s) => s.label === label);
    return W.supportLoads[k * 6 + d] + T.supportLoads[k * 6 + d];
  };
  // réactions du cas de service (N, N·m)
  near(ope('Ancrage 10', 0), -26500, 2e-3, 'FX 10');
  near(ope('Ancrage 10', 1), -12710, 2e-3, 'FY 10');
  near(Math.abs(ope('Ancrage 10', 5)) / 1e3, 21520, 3e-3, 'MZ 10');
  near(ope('Y 20', 1), -63050, 2e-3, 'FY 20');
  near(ope('Ancrage 50', 0), 26500, 2e-3, 'FX 50');
  near(ope('Ancrage 50', 1), 2810, 1e-2, 'FY 50');
  near(Math.abs(ope('Ancrage 50', 5)) / 1e3, 47480, 3e-3, 'MZ 50');
  // déplacements du cas de service (mm), tableau à 0,1 mm près
  const disp = (label, d) => W.u[r.mesh.nodeIndex.get(label) * 6 + d] + T.u[r.mesh.nodeIndex.get(label) * 6 + d];
  for (const [label, dx, dy] of [['15', 18.3, -1.3], ['20', 36.7, 0], ['30A', 44.0, -3.7], ['30M', 44.7, -2.3], ['30B', 41.4, 0.4], ['40A', -23.0, 15.1], ['40M', -26.4, 17.8], ['40B', -25.7, 19.2], ['45', -18.3, 13.5]]) {
    near(disp(label, 0), dx, 0, `DX ${label}`, 0.11);
    near(disp(label, 1), dy, 0, `DY ${label}`, 0.11);
  }
  // contrainte des charges permanentes S_L (kPa) et moments (N·m)
  for (const [node, moment, sl] of [['10', 17260, 59100], ['20', 56130, 99200], ['30B', 16320, 72700], ['40B', 2340, 46050], ['50', 37860, 80350]]) {
    const x = row(r, 'SL', node);
    near(x.stress * 1e3, sl, 3e-3, `S_L ${node}`);
    near(x.calc.moments.reduce((a, mr) => a + mr.res, 0), moment, 5e-3, `moment ${node}`);
  }
  assert.equal(r.nonlinear, null);
  assert.ok(r.check.summary.ok);
  const total = -r.mesh.supports.reduce((a, s, k) => a + W.supportLoads[k * 6 + 1], 0) / (G / 1000);
  near(total, 7439, 2e-3, 'masse totale (kg)');
});

test('ASME B31.3-2012, annexe S, exemple 2 : appui qui décolle, S_L appui retiré (tableaux S302.5.1 et S302.6.3.1)', () => {
  const r = runAnalysis(normalizeModel(EXAMPLES.find((e) => e.id === 'b313-s2').build()));
  const [W, T, C] = [byId(r, 'W'), byId(r, 'T1'), byId(r, 'W(T1)')];
  // cas de service 1 : l'appui Y+ du nœud 50 ne porte plus
  assert.deepEqual(r.nonlinear.states.map((s) => s.contacts[0].status), ['contact', 'lifted']);
  const ope = (label, d) => {
    const k = r.mesh.supports.findIndex((s) => s.label === label);
    return W.supportLoads[k * 6 + d] + T.supportLoads[k * 6 + d];
  };
  near(ope('Ancrage 10', 0), -26600, 3e-3, 'FX 10');
  near(ope('Ancrage 10', 1), -14050, 3e-3, 'FY 10');
  near(Math.abs(ope('Ancrage 10', 5)) / 1e3, 27000, 3e-3, 'MZ 10');
  near(ope('Y 20', 1), -58900, 2e-3, 'FY 20');
  assert.ok(Math.abs(ope('Y+ 50', 1)) < 1, 'appui 50 déchargé');
  // condition 3 : supportage du cas de service 1, sans effets thermiques
  assert.deepEqual(r.nonlinear.configurations.map((c) => [c.id, c.changes]), [['W(T1)', [{ contact: 0, from: 'contact', to: 'lifted' }]]]);
  const k10 = r.mesh.supports.findIndex((s) => s.label === 'Ancrage 10');
  near(Math.abs(C.supportLoads[k10 * 6]), 12575, 5e-3, 'effort horizontal');
  near(-C.supportLoads[k10 * 6 + 1], 8385, 5e-3, 'FY 10');
  near(-C.supportLoads[r.mesh.supports.findIndex((s) => s.label === 'Y 20') * 6 + 1], 64565, 3e-3, 'FY 20');
  assert.equal(C.supportLoads[r.mesh.supports.findIndex((s) => s.label === 'Y+ 50') * 6 + 1], 0);
  for (const [node, moment, sl] of [['10', 3995, 48645], ['20', 82845, 129975], ['30B', 29985, 101920], ['40M', 32770, 108525], ['50', 62885, 109385]]) {
    const x = row(r, 'SL', node, 'W(T1)');
    near(x.stress * 1e3, sl, 3e-3, `S_L ${node}`);
    near(x.calc.moments.reduce((a, mr) => a + mr.res, 0), moment, 1e-2, `moment ${node}`);
    assert.equal(x.case, 'W(T1)+P');
  }
  // conclusion du code : S_L dépasse S_h au nœud 20 appui retiré, alors qu'elle est admise à froid
  const [cold, hot] = [row(r, 'SL', '20'), row(r, 'SL', '20', 'W(T1)')];
  assert.ok(cold.ratio < 1 && hot.ratio > 1, `${cold.ratio} / ${hot.ratio}`);
  near(hot.allow, 124.5, 3e-3, 'S_h à 288 °C');
  assert.equal(r.check.summary.ok, false);
  near(r.check.summary.maxRatio, hot.ratio, 1e-9, 'la configuration de service gouverne');
});
