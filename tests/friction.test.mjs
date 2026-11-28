// Frottement des supports (solveur non linéaire, expérimental).
// Contrôles : solutions analytiques sur une console d'Euler-Bernoulli (glissement,
// adhérence, direction de la force, appui décollé, appui guidé, jeu), invariants de
// la loi de frottement et équilibre sur des modèles complets, identité avec le
// calcul sans frottement quand μ est nul, échecs explicites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { pipeSection } from '../src/core/sections.js';
import { EXAMPLES, nonlinearSupports } from '../src/core/examples.js';
import { DenseLU } from '../src/core/linalg.js';
import { buildMesh } from '../src/core/mesher.js';
import { FeSystem } from '../src/fem/system.js';
import { buildContacts, freeBasis, frictionUnits, FRICTION } from '../src/fem/contact.js';
import { solveContactState, NonlinearError } from '../src/fem/nonlinear.js';
import { weightLoads } from '../src/loads/weight.js';

// Comparaisons analytiques à 1e-4 : l'ancrage par pénalité ajoute une souplesse de l'ordre de 1e-5 en relatif.
const near = (a, b, rel, msg, abs = 0) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + abs, `${msg}: ${a} vs ${b}`);
const G = 9806.65; // mm/s²
const E = 200000;
const L = 3000;
const ALPHA = 12e-6;
const DT = 100;
const MU = 0.3;
const sec = pipeSection({ od: 168.3, t: 7.11 });
const w = 7850e-12 * sec.A * G; // poids linéique, N/mm
const EI = E * sec.I;
const EA = E * sec.A;
const R0 = (3 * w * L) / 8; // réaction de l'appui en bout de la console appuyée
const KB = (3 * EI) / L ** 3; // raideur de flexion de la console en bout
const SAG = (w * L ** 4) / (8 * EI); // flèche libre en bout

/** Console le long de X, encastrée au nœud 10, sans cisaillement, module constant ; dilatation si hot. */
function cantilever({ solver = 'nonlinear', hot = false } = {}) {
  const m = emptyModel();
  m.settings.shear = false;
  m.settings.meshMaxLength = 250;
  m.settings.solver = solver;
  m.materials = [{ id: 'M', name: 'test', density: 7850, nu: 0.3, table: [{ T: 20, E, alpha: 12, S: 100, Sy: 200 }, { T: 400, E, alpha: 12, S: 100, Sy: 200 }] }];
  m.sections = [{ id: 'S', od: 168.3, t: 7.11, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  m.loadCases = [
    { id: 'W', type: 'weight', label: 'Poids', enabled: true },
    { id: 'T1', type: 'thermal', label: 'Dilatation', enabled: true, imposed: true },
  ];
  m.components.push({ type: 'pipe', n1: '10', n2: '20', dx: L, dy: 0, dz: 0, section: 'S', material: 'M', T1: hot ? 20 + DT : 20, P1: 0 });
  return m;
}
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: `${kind}${node}`, ...extra });
const run = (m) => runAnalysis(normalizeModel(ensureIds(m)));
/** Effort de la tuyauterie sur le support `label` dans l'état de service (somme W + T1), composante d. */
const load = (r, label, d, ids = ['W', 'T1']) => {
  const k = r.mesh.supports.findIndex((s) => s.label === label);
  return r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.supportLoads[k * 6 + d], 0);
};
const tip = (r, d, ids = ['W', 'T1']) => r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.u[r.mesh.nodeIndex.get('20') * 6 + d], 0);
/** Frottement du support `label` dans l'état `name`. */
const rub = (r, label, name = 'W+T1') => r.nonlinear.states.find((s) => s.name === name).friction.find((f) => r.mesh.supports[f.support].label === label);
/** Invariants de la loi de frottement et équilibre de chaque état calculé. */
function checkStates(r, msg) {
  for (const st of r.nonlinear.states) {
    for (const f of st.friction) {
      if (!f.active) {
        assert.equal(f.force, 0, `${msg} ${st.name} : pas de frottement sur un support inactif`);
        continue;
      }
      assert.ok(f.force <= f.limit * (1 + 1e-5) + 1e-3, `${msg} ${st.name} : force ${f.force} sous la limite ${f.limit}`);
      if (f.slip && f.limit > 1e-3) near(f.force, f.limit, 1e-5, `${msg} ${st.name} : glissement à la limite`, 1e-3);
      if (!f.slip) assert.equal(f.k, FRICTION.kMax, `${msg} ${st.name} : adhérence à la raideur plafond`);
    }
  }
  // les cas de dilatation sont des différences d'états en équilibre : résultante nulle sur les supports
  for (const c of r.cases.filter((x) => x.type === 'thermal')) {
    for (let d = 0; d < 3; d++) {
      const sum = r.mesh.supports.reduce((a, s, k) => a + c.supportLoads[k * 6 + d], 0);
      assert.ok(Math.abs(sum) < 1e-3, `${msg} : résultante ${d} du cas ${c.id} = ${sum}`);
    }
  }
}

test('LU dense à pivot partiel : systèmes quelconques, permutations multiples', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5);
  for (let trial = 0; trial < 100; trial++) {
    const n = 1 + (trial % 12);
    // termes d'ordres de grandeur très différents : force les échanges de lignes
    const A = Float64Array.from({ length: n * n }, () => rnd() * (rnd() > 0 ? 1 : 1e4));
    const x = Float64Array.from({ length: n }, rnd);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b[i] += A[i * n + j] * x[j];
    const y = new DenseLU(A, n).solve(b);
    for (let i = 0; i < n; i++) {
      let res = -b[i];
      for (let j = 0; j < n; j++) res += A[i * n + j] * y[j];
      assert.ok(Math.abs(res) <= 1e-10 * Math.max(1, ...Array.from(b, Math.abs)), `système ${trial}, ligne ${i} : résidu ${res}`);
    }
  }
  assert.throws(() => new DenseLU(new Float64Array([1, 2, 2, 4]), 2), /singulier/);
});

test('directions libres d’un support : plan transversal, axe, aucune', () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const one = freeBasis([[0, 0, 1]]);
  assert.equal(one.length, 2);
  for (const e of one) {
    near(dot(e, e), 1, 1e-12, 'unitaire');
    assert.ok(Math.abs(dot(e, [0, 0, 1])) < 1e-12);
  }
  assert.ok(Math.abs(dot(one[0], one[1])) < 1e-12);
  // deux directions bloquées, même obliques : il reste l'axe perpendiculaire aux deux
  const two = freeBasis([[0, 0, 1], [0, Math.SQRT1_2, Math.SQRT1_2]]);
  assert.equal(two.length, 1);
  near(Math.abs(two[0][0]), 1, 1e-12, 'axe X');
  // directions répétées ou trois directions indépendantes
  assert.equal(freeBasis([[1, 0, 0], [-1, 0, 0]]).length, 2);
  assert.equal(freeBasis([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).length, 0);
});

test('frottement : glissement axial d’un appui simple sous dilatation (solution analytique)', () => {
  const m = cantilever({ hot: true });
  m.components.push(sup('10', 'anchor'), sup('20', 'rest', { friction: MU }));
  const r = run(m);
  // à froid : pas de déplacement horizontal, l'appui adhère sans effort
  const cold = rub(r, 'rest20', 'W');
  assert.equal(cold.slip, false);
  assert.ok(cold.force < 1e-6);
  // en service : l'appui glisse, la force μ·R s'oppose à la dilatation et comprime le tube
  const f = rub(r, 'rest20');
  assert.equal(f.slip, true);
  near(f.limit, MU * R0, 1e-4, 'limite μ·R');
  near(f.force, MU * R0, 1e-4, 'force de frottement');
  near(f.dir[0], 1, 1e-9, 'force exercée sur le support dans le sens du déplacement');
  near(load(r, 'rest20', 0), MU * R0, 1e-4, 'effort horizontal sur l’appui');
  near(load(r, 'anchor10', 0), -MU * R0, 1e-4, 'réaction axiale de l’encastrement');
  near(load(r, 'rest20', 2), -R0, 1e-4, 'réaction verticale inchangée');
  near(tip(r, 0), ALPHA * DT * L - (MU * R0 * L) / EA, 1e-6, 'dilatation freinée');
  // l'étendue de dilatation contient le frottement
  near(r.cases.find((c) => c.id === 'T1').supportLoads[r.mesh.supports.findIndex((s) => s.label === 'anchor10') * 6], -MU * R0, 1e-4, 'cas T1');
  assert.ok(r.nonlinear.states.every((s) => s.iterations <= 3), 'peu d’itérations');
  checkStates(r, 'glissement axial');
});

test('frottement : adhérence puis glissement latéral (déplacement imposé de l’encastrement)', () => {
  const build = (dy) => {
    const m = cantilever();
    m.components.push(sup('10', 'anchor', { imposed: `0 ${dy} 0` }), sup('20', 'rest', { friction: MU }));
    return run(m);
  };
  // effort de blocage inférieur à μ·R : l'appui adhère et retient l'extrémité
  const dStick = (0.5 * MU * R0) / KB;
  const stick = build(dStick);
  const fs = rub(stick, 'rest20');
  assert.equal(fs.slip, false);
  const kEq = (KB * FRICTION.kMax) / (KB + FRICTION.kMax); // console et raideur d'adhérence en série
  near(fs.force, kEq * dStick, 1e-4, 'effort d’adhérence');
  near(load(stick, 'rest20', 1), kEq * dStick, 1e-4, 'effort latéral sur l’appui');
  assert.ok(Math.abs(tip(stick, 1)) < 1e-3 * dStick, 'extrémité retenue');
  // effort de blocage supérieur : l'appui glisse sous μ·R
  const dSlip = (3 * MU * R0) / KB;
  const slip = build(dSlip);
  const fg = rub(slip, 'rest20');
  assert.equal(fg.slip, true);
  near(fg.force, MU * R0, 1e-4, 'force de glissement');
  near(tip(slip, 1), dSlip - (MU * R0) / KB, 1e-4, 'glissement de l’extrémité');
  near(load(slip, 'anchor10', 1), -MU * R0, 1e-4, 'réaction de l’encastrement');
  checkStates(stick, 'adhérence');
  checkStates(slip, 'glissement latéral');
});

test('frottement : force colinéaire au déplacement (dilatation et déplacement latéral combinés)', () => {
  const dy = (3 * MU * R0) / KB;
  const m = cantilever({ hot: true });
  m.components.push(sup('10', 'anchor', { imposed: `0 ${dy} 0` }), sup('20', 'rest', { friction: MU }));
  const r = run(m);
  const f = rub(r, 'rest20');
  assert.equal(f.slip, true);
  near(f.force, MU * R0, 1e-4, 'module μ·R');
  // direction de la force = direction du déplacement horizontal de l'extrémité
  const [ux, uy] = [tip(r, 0), tip(r, 1)];
  const d = Math.hypot(ux, uy);
  near(load(r, 'rest20', 0), (MU * R0 * ux) / d, 1e-4, 'composante axiale');
  near(load(r, 'rest20', 1), (MU * R0 * uy) / d, 1e-4, 'composante latérale');
  // chaque composante du déplacement est freinée par sa part de la force
  near(ux, ALPHA * DT * L - (load(r, 'rest20', 0) * L) / EA, 1e-6, 'déplacement axial');
  near(uy, dy - load(r, 'rest20', 1) / KB, 1e-4, 'déplacement latéral');
  assert.ok(Math.abs(load(r, 'rest20', 1)) > 1 && Math.abs(load(r, 'rest20', 0)) > 1, 'les deux composantes sont présentes');
  checkStates(r, 'direction');
});

test('frottement : aucun effort sur un appui décollé', () => {
  const m = cantilever({ hot: true });
  m.components.push(sup('10', 'anchor', { imposed: `0 0 ${2 * SAG}` }), sup('20', 'rest', { friction: MU }));
  const r = run(m);
  assert.equal(r.nonlinear.states[1].contacts[0].status, 'lifted');
  const f = rub(r, 'rest20');
  assert.equal(f.active, false);
  assert.equal(f.force, 0);
  for (let d = 0; d < 3; d++) assert.ok(Math.abs(load(r, 'rest20', d)) < 1e-6 * w * L, `appui déchargé (${d})`);
  near(tip(r, 0), ALPHA * DT * L, 1e-9, 'dilatation libre');
  checkStates(r, 'appui décollé');
});

test('frottement : appui guidé, glissement suivant l’axe seul sous la somme des réactions', () => {
  const dy = 2;
  const m = cantilever({ hot: true });
  m.components.push(sup('10', 'anchor', { imposed: `0 ${dy} 0` }), sup('20', 'restguide', { friction: MU }));
  const r = run(m);
  // le guide retient l'extrémité latéralement : réaction 3EI·δ/L³ ; elle frotte comme la réaction verticale
  const lateral = KB * dy;
  near(Math.abs(load(r, 'restguide20', 1)), lateral, 1e-4, 'réaction du guide');
  const f = rub(r, 'restguide20');
  assert.equal(f.slip, true);
  near(f.limit, MU * (R0 + lateral), 1e-4, 'limite μ·(R vertical + R latéral)');
  near(Math.abs(f.dir[0]), 1, 1e-9, 'frottement suivant l’axe du tube');
  near(load(r, 'anchor10', 0), -MU * (R0 + lateral), 1e-4, 'réaction axiale de l’encastrement');
  // les réactions du support ne sont pas modifiées par son frottement
  near(load(r, 'restguide20', 2), -R0, 1e-4, 'réaction verticale');
  checkStates(r, 'appui guidé');
});

test('frottement : guide à jeu, sans effet tant que le jeu est ouvert', () => {
  const build = (dy) => {
    const m = cantilever({ hot: true });
    m.components.push(sup('10', 'anchor', { imposed: `0 ${dy} 0` }), sup('20', 'guide', { gap: '1', friction: MU }));
    return run(m);
  };
  // jeu ouvert : dilatation libre
  const open = build(0.5);
  assert.equal(rub(open, 'guide20').active, false);
  near(tip(open, 0), ALPHA * DT * L, 1e-9, 'dilatation libre');
  assert.ok(Math.abs(load(open, 'anchor10', 0)) < 1e-6);
  // jeu rattrapé : la réaction du guide frotte, contre le déplacement dans son plan transversal (axe et vertical)
  const closed = build(3);
  const f = rub(closed, 'guide20');
  const normal = Math.abs(load(closed, 'guide20', 1));
  near(normal, KB * (3 - 1), 1e-4, 'réaction du guide');
  assert.equal(f.slip, true);
  near(f.limit, MU * normal, 1e-6, 'limite μ·R');
  const [fx, fz] = [load(closed, 'guide20', 0), load(closed, 'guide20', 2)];
  near(Math.hypot(fx, fz), MU * normal, 1e-4, 'module de la force de frottement');
  const [ux, uz] = [tip(closed, 0), tip(closed, 2)];
  near(fx / fz, ux / uz, 1e-4, 'force colinéaire au déplacement');
  assert.ok(ux > 0 && uz < 0, 'dilatation et flèche');
  checkStates(closed, 'guide à jeu');
});

test('frottement : blocage dans les deux sens (étrier), réaction prise en valeur absolue', () => {
  const m = cantilever({ hot: true });
  m.components.push(sup('10', 'anchor'), sup('20', 'clamp', { friction: MU }));
  const r = run(m);
  assert.deepEqual(r.nonlinear.contacts.map((c) => c.kind), ['fixed']);
  assert.equal(r.nonlinear.states[1].contacts[0].status, 'held');
  near(load(r, 'anchor10', 0), -MU * R0, 1e-4, 'réaction axiale');
  // sans frottement, l'étrier reste un ressort ordinaire : aucun contact
  const plain = cantilever({ hot: true });
  plain.components.push(sup('10', 'anchor'), sup('20', 'clamp'));
  assert.equal(run(plain).nonlinear.contacts.length, 0);
  checkStates(r, 'étrier');
});

test('frottement nul ou absent : résultats inchangés ; solveur linéaire : frottement ignoré et signalé', () => {
  const build = (solver, friction) => {
    const m = normalizeModel(EXAMPLES.find((e) => e.id === 'benchmark').build());
    for (const c of m.components) {
      if (c.type !== 'support') continue;
      if (['AG1', 'AG2'].includes(c.label)) c.kind = 'restguide';
      if (friction !== undefined && ['AG1', 'AG2', 'G1', 'BA1'].includes(c.label)) c.friction = friction;
    }
    m.settings.solver = solver;
    return runAnalysis(m);
  };
  const same = (a, b, msg) => {
    a.cases.forEach((c, k) => {
      for (const key of ['u', 'elemForces', 'supportLoads']) assert.deepEqual(Array.from(b.cases[k][key]), Array.from(c[key]), `${msg} ${c.id} ${key}`);
    });
    assert.deepEqual(b.check.summary.governing.map((g) => g.stress), a.check.summary.governing.map((g) => g.stress), msg);
  };
  const ref = build('nonlinear');
  for (const mu of ['', 0, '0']) {
    const r = build('nonlinear', mu);
    same(ref, r, `μ = « ${mu} »`);
    assert.deepEqual(r.warnings, ref.warnings);
    assert.ok(r.nonlinear.states.every((s) => s.friction.length === 0));
  }
  // solveur linéaire : mêmes résultats avec ou sans μ, et un avertissement
  const [lin, linMu] = [build('linear'), build('linear', MU)];
  same(lin, linMu, 'linéaire');
  assert.ok(linMu.warnings.some((x) => x.includes('Frottement') && x.includes('ignoré') && x.includes('AG1')));
  assert.ok(!lin.warnings.some((x) => x.includes('Frottement')));
  // le frottement modifie bien le calcul non linéaire, et le séisme n'en dépend pas
  const rubbing = build('nonlinear', MU);
  assert.ok(rubbing.nonlinear.states[0].friction.length === 4, 'un frottement par support');
  const t = (r) => r.cases.find((c) => c.id === 'T1');
  assert.ok(Array.from(t(rubbing).supportLoads).some((v, i) => Math.abs(v - t(ref).supportLoads[i]) > 10), 'efforts de dilatation modifiés');
  const s = (r) => r.cases.find((c) => c.type === 'seismic');
  assert.deepEqual(Array.from(s(rubbing).elemForces), Array.from(s(ref).elemForces));
  assert.deepEqual(rubbing.modal.modes.map((x) => x.freq), ref.modal.modes.map((x) => x.freq));
  assert.ok(rubbing.nonlinear.states.every((st) => st.iterations <= 6), `itérations : ${rubbing.nonlinear.states.map((st) => st.iterations)}`);
  checkStates(rubbing, 'collecteur');
});

test('frottement : tous les exemples convergent, loi et équilibre respectés (μ de 0,05 à 1,5)', () => {
  const kinds = ['rest', 'restguide', 'guide', 'axial', 'clamp', 'clampguide'];
  for (const ex of EXAMPLES) {
    for (const posed of [false, true]) {
      for (const mu of [0.05, 0.3, 1.5]) {
        const m = normalizeModel(ex.build());
        m.settings.solver = 'nonlinear';
        let n = 0;
        for (const c of m.components) {
          if (c.type !== 'support') continue;
          if (posed && c.kind === 'clampguide') c.kind = 'restguide';
          if (kinds.includes(c.kind)) {
            c.friction = mu;
            n++;
          }
        }
        if (!n) continue;
        const r = runAnalysis(m);
        checkStates(r, `${ex.id} ${posed ? 'posé' : 'bilatéral'} μ=${mu}`);
        assert.ok(r.nonlinear.states.every((st) => st.iterations <= 10), `${ex.id} μ=${mu} : itérations ${r.nonlinear.states.map((st) => st.iterations)}`);
      }
    }
  }
});

test('frottement : saisie non comprise ou sans objet signalée ; itérations épuisées : échec explicite', () => {
  const bad = cantilever();
  bad.components.push(sup('10', 'anchor', { friction: MU }), sup('20', 'rest', { friction: 'abc' }));
  const r = run(bad);
  assert.ok(r.warnings.some((x) => x.includes('sans objet') && x.includes('nœud 10')));
  assert.ok(r.warnings.some((x) => x.includes('non compris') && x.includes('nœud 20')));
  assert.equal(r.nonlinear.states[0].friction.length, 0);
  // un calcul avec frottement demande au moins deux itérations : avec une seule, échec explicite
  const m = cantilever();
  m.components.push(sup('10', 'anchor'), sup('20', 'rest', { friction: MU }));
  const model = normalizeModel(ensureIds(m));
  const mesh = buildMesh(model);
  const sys = new FeSystem(mesh, { shear: false });
  const { contacts, baseSprings } = buildContacts(mesh);
  assert.deepEqual(frictionUnits(contacts).map((u) => [u.mu, u.contacts.length]), [[MU, 1]]);
  const loads = weightLoads(sys, model.loadCases[0]);
  assert.throws(() => solveContactState({ mesh, shear: false, loads, contacts, baseSprings, maxIter: 1, name: 'W' }), (e) => e instanceof NonlinearError && /frottement/.test(e.message) && /rest20/.test(e.message));
  assert.equal(solveContactState({ mesh, shear: false, loads, contacts, baseSprings }).iterations, 2);
});

test('exemple non linéaire (docs/validation) : état des contacts, frottement et valeurs de référence', () => {
  const kN = (v) => v / 1e3;
  const sup = (r, label) => r.mesh.supports.findIndex((s) => s.label === label);
  const contact = (r, st, label) => st.contacts[r.nonlinear.contacts.findIndex((c) => r.mesh.supports[c.support].label === label)];
  const total = (r, label, d) => r.cases.filter((c) => ['W', 'T1'].includes(c.id)).reduce((a, c) => a + c.supportLoads[sup(r, label) * 6 + d], 0);
  // sans frottement : fiche nl-appui-jeu-valeurs-attendues.md
  const plain = runAnalysis(normalizeModel(nonlinearSupports({ friction: '' })));
  const [pc, ps] = plain.nonlinear.states;
  assert.deepEqual(pc.contacts.map((c) => c.status), ['contact', 'contact', 'open']);
  // G1 : direction orientée vers +X, le tube vient en butée de ce côté
  assert.deepEqual(ps.contacts.map((c) => c.status), ['lifted', 'contact', 'closedPlus']);
  near(kN(-contact(plain, pc, 'A1').force), 3.46, 1e-3, 'A1 à froid');
  near(kN(-contact(plain, pc, 'A2').force), 4.188, 1e-3, 'A2 à froid');
  near(contact(plain, ps, 'A1').d, 7.049, 1e-3, 'décollement de A1');
  near(kN(Math.abs(contact(plain, ps, 'G1').force)), 11.746, 1e-3, 'G1 en service');
  near(kN(total(plain, 'PF2', 1)), 2.119, 2e-3, 'PF2 FY sans frottement');
  assert.deepEqual(plain.modal.modes.slice(0, 5).map((m) => +m.freq.toFixed(2)), [9.04, 11.7, 18.27, 23.02, 55.86]);
  near(plain.check.summary.governing.find((g) => g.eq === '7').stress, 83.14, 1e-3, 'éq. (7)');
  // avec frottement μ = 0,3 : fiche nl-appui-jeu-frottement-valeurs-attendues.md
  const r = runAnalysis(normalizeModel(EXAMPLES.find((e) => e.id === 'nonlinear').build()));
  const [cold, service] = r.nonlinear.states;
  assert.deepEqual(service.contacts.map((c) => c.status), ['lifted', 'contact', 'closedPlus']);
  const fr = (st, label) => st.friction.find((f) => r.mesh.supports[f.support].label === label);
  assert.deepEqual(cold.friction.map((f) => [f.active, f.slip]), [[true, false], [true, false], [false, false]]);
  assert.deepEqual(service.friction.map((f) => [f.active, f.slip]), [[false, false], [true, true], [true, true]]);
  near(kN(fr(service, 'A2').force), 1.252, 1e-3, 'frottement de A2');
  near(kN(fr(service, 'G1').force), 3.37, 1e-3, 'frottement de G1');
  near(kN(Math.abs(contact(r, service, 'G1').force)), 11.234, 1e-3, 'G1 avec frottement');
  // le tube glisse surtout suivant son axe au point 50 : le frottement se retrouve dans la réaction axiale de PF2
  near(kN(total(r, 'PF2', 1)), 6.631, 2e-3, 'PF2 FY avec frottement');
  near(r.check.summary.governing.find((g) => g.eq === '7').stress, 83.41, 1e-3, 'éq. (7) avec frottement');
  assert.deepEqual(r.modal.modes.map((m) => m.freq), plain.modal.modes.map((m) => m.freq));
  assert.deepEqual([cold.iterations, service.iterations], [2, 3]);
  checkStates(r, 'exemple non linéaire');
});
