// Solveur non linéaire (expérimental) : supports à contact calculés par états.
// Contrôles : identité avec le solveur linéaire quand aucun contact ne change
// d'état, solutions analytiques (console d'Euler-Bernoulli : décollement, jeu,
// butée), équilibre, échecs explicites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { buildMesh } from '../src/core/mesher.js';
import { pipeSection } from '../src/core/sections.js';
import { EXAMPLES } from '../src/core/examples.js';
import { zoneOf, branch, contactForce, buildContacts } from '../src/fem/contact.js';
import { solveContactState, NonlinearError } from '../src/fem/nonlinear.js';
import { weightLoads } from '../src/loads/weight.js';
import { FeSystem } from '../src/fem/system.js';

// Comparaisons analytiques à 1e-4 : l'ancrage par pénalité ajoute une souplesse de l'ordre de 1e-5 en relatif.
const near = (a, b, rel, msg, abs = 0) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + abs, `${msg}: ${a} vs ${b}`);
const G = 9806.65; // mm/s²
const E = 200000;
const L = 3000;
const sec = pipeSection({ od: 168.3, t: 7.11 });
const w = 7850e-12 * sec.A * G; // poids linéique, N/mm
const EI = E * sec.I;
const f = (w * L ** 4) / (8 * EI); // flèche libre en bout de console

/** Console le long de X, encastrée au nœud 10, sans cisaillement, module constant. */
function cantilever({ solver = 'nonlinear', thermal = false } = {}) {
  const m = emptyModel();
  m.settings.shear = false;
  m.settings.meshMaxLength = 250;
  m.settings.solver = solver;
  m.materials = [{ id: 'M', name: 'test', density: 7850, nu: 0.3, table: [{ T: 20, E, alpha: 12, S: 100, Sy: 200 }, { T: 400, E, alpha: 12, S: 100, Sy: 200 }] }];
  m.sections = [{ id: 'S', od: 168.3, t: 7.11, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  m.loadCases = [{ id: 'W', type: 'weight', label: 'Poids', enabled: true }];
  if (thermal) m.loadCases.push({ id: 'T1', type: 'thermal', label: 'Dilatation', enabled: true, imposed: true });
  m.components.push({ type: 'pipe', n1: '10', n2: '20', dx: L, dy: 0, dz: 0, section: 'S', material: 'M', T1: 20, P1: 0 });
  return m;
}
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: `${kind}${node}`, ...extra });
const run = (m) => runAnalysis(normalizeModel(ensureIds(m)));
/** Effort vertical de la tuyauterie sur le support `label`, somme des cas donnés (N, positif vers le haut). */
const vertical = (r, label, ids) => {
  const k = r.mesh.supports.findIndex((s) => s.label === label);
  return r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.supportLoads[k * 6 + 2], 0);
};
const tipZ = (r, ids) => {
  const i = r.mesh.nodeIndex.get('20') * 6 + 2;
  return r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.u[i], 0);
};
const anchorMoment = (r, ids) => {
  // moment de flexion à l'encastrement : extrémité 1 du premier élément
  const ie = r.mesh.elements.findIndex((e) => r.mesh.nodes[e.n1].label === '10');
  return r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + Math.hypot(c.elemForces[ie * 12 + 4], c.elemForces[ie * 12 + 5]) * Math.sign(c.elemForces[ie * 12 + 4] || c.elemForces[ie * 12 + 5]), 0);
};

test('loi de contact par zones : continuité et pentes', () => {
  const gap = { d1: -2, d2: 3, k: [1e6, 0, 0, 2e6] };
  assert.deepEqual([-5, -1, 0, 1, 3, 9].map((d) => zoneOf(gap, d)), [1, 2, 3, 3, 4, 4]);
  assert.equal(contactForce(gap, -1), 0);
  assert.equal(contactForce(gap, 2.9), 0);
  near(contactForce(gap, -2.5), 1e6 * -0.5, 1e-12, 'zone 1');
  near(contactForce(gap, 4), 2e6 * 1, 1e-12, 'zone 4');
  // continuité aux frontières, y compris avec des raideurs non nulles dans les zones centrales
  const general = { d1: -1, d2: 2, k: [5, 2, 3, 7] };
  for (const d of [-1, 0, 2]) near(contactForce(general, d - 1e-9), contactForce(general, d + 1e-9), 1e-6, `continuité en ${d}`, 1e-6);
  assert.deepEqual(branch(general, 4), { k: 7, f0: (3 - 7) * 2 });
  // appui simple : n'agit que contre la descente
  const rest = { d1: 0, d2: Infinity, k: [1e9, 0, 0, 0] };
  assert.equal(contactForce(rest, 0.5), 0);
  near(contactForce(rest, -1e-6), -1e3, 1e-12, 'appui en contact');
});

test('sans contact actif, le solveur non linéaire redonne le solveur linéaire (exemples au solveur linéaire)', () => {
  const linear = EXAMPLES.filter((ex) => ex.build().settings.solver !== 'nonlinear');
  assert.equal(linear.length, 8);
  for (const ex of linear) {
    const a = normalizeModel(ex.build());
    const b = normalizeModel(ex.build());
    b.settings.solver = 'nonlinear';
    const ra = runAnalysis(a);
    const rb = runAnalysis(b);
    assert.equal(ra.nonlinear, null);
    assert.ok(rb.nonlinear, `${ex.id} : compte rendu non linéaire`);
    assert.equal(ra.cases.length, rb.cases.length);
    ra.cases.forEach((c, k) => {
      for (const key of ['u', 'elemForces', 'supportLoads']) {
        const scale = Math.max(1e-9, ...Array.from(c[key], Math.abs));
        for (let i = 0; i < c[key].length; i++) assert.ok(Math.abs(c[key][i] - rb.cases[k][key][i]) <= 1e-8 * scale, `${ex.id} ${c.id} ${key}[${i}]`);
      }
    });
    if (ra.check) ra.check.summary.governing.forEach((g, k) => near(rb.check.summary.governing[k].ratio, g.ratio, 1e-8, `${ex.id} ${g.eq}`));
    assert.deepEqual(rb.warnings, ra.warnings);
  }
});

test('appui simple en contact : identique au linéaire', () => {
  const build = (solver) => {
    const m = cantilever({ solver });
    m.components.push(sup('10', 'anchor'), sup('20', 'rest'));
    return run(m);
  };
  const [lin, nl] = [build('linear'), build('nonlinear')];
  near(vertical(nl, 'rest20', ['W']), -(3 * w * L) / 8, 1e-4, 'réaction de la console appuyée');
  near(vertical(nl, 'rest20', ['W']), vertical(lin, 'rest20', ['W']), 1e-9, 'linéaire');
  assert.equal(nl.nonlinear.states[0].contacts[0].status, 'contact');
  assert.equal(nl.nonlinear.states[0].iterations, 1);
});

test('appui simple : décollement quand l’encastrement monte (console, solution analytique)', () => {
  const build = (solver, delta) => {
    const m = cantilever({ solver, thermal: true });
    m.components.push(sup('10', 'anchor', { imposed: `0 0 ${delta}` }), sup('20', 'rest'));
    return run(m);
  };
  // montée inférieure à la flèche libre : l'appui reste en contact, R = 3EI(f − δ)/L³
  const small = build('nonlinear', 0.4 * f);
  near(vertical(small, 'rest20', ['W', 'T1']), (-3 * EI * (f - 0.4 * f)) / L ** 3, 1e-4, 'réaction en service');
  assert.equal(small.nonlinear.states[1].contacts[0].status, 'contact');
  // montée supérieure à la flèche libre : l'appui décolle, la console porte seule
  const big = build('nonlinear', 2 * f);
  assert.equal(big.nonlinear.states[0].contacts[0].status, 'contact');
  assert.equal(big.nonlinear.states[1].contacts[0].status, 'lifted');
  near(vertical(big, 'rest20', ['W']), -(3 * w * L) / 8, 1e-4, 'à froid : console appuyée');
  assert.ok(Math.abs(vertical(big, 'rest20', ['W', 'T1'])) < 1e-6 * w * L, 'en service : appui déchargé');
  near(tipZ(big, ['W', 'T1']), 2 * f - f, 1e-4, 'extrémité libre : montée − flèche');
  near(Math.abs(anchorMoment(big, ['W', 'T1'])), (w * L * L) / 2, 1e-4, 'moment d’encastrement de la console libre');
  // étendue de dilatation = état de service − état froid
  near(Math.abs(anchorMoment(big, ['W'])), (w * L * L) / 8, 1e-4, 'moment à froid');
  near(Math.abs(anchorMoment(big, ['T1'])), (w * L * L) / 2 - (w * L * L) / 8, 1e-4, 'étendue M_C');
  assert.ok(!big.warnings.some((x) => x.includes('soulevé')), 'pas d’avertissement de soulèvement');
  // le solveur linéaire retient l'appui vers le haut et le signale
  const lin = build('linear', 2 * f);
  assert.ok(vertical(lin, 'rest20', ['W', 'T1']) > 1, 'linéaire : appui en traction');
  assert.ok(lin.warnings.some((x) => x.includes('soulevé')));
});

test('jeu vertical en bout de console : ouvert ou rattrapé (solution analytique)', () => {
  const build = (solver, gap) => {
    const m = cantilever({ solver });
    m.components.push(sup('10', 'anchor'), sup('20', 'clamp', { gap: String(gap) }));
    return run(m);
  };
  // jeu supérieur à la flèche libre : le support n'agit pas
  const open = build('nonlinear', 2 * f);
  near(tipZ(open, ['W']), -f, 1e-4, 'flèche libre');
  assert.ok(Math.abs(vertical(open, 'clamp20', ['W'])) < 1e-9);
  assert.equal(open.nonlinear.states[0].contacts[0].status, 'open');
  // jeu inférieur : le support porte, R = 3EI(f − j)/L³, l'extrémité s'arrête au jeu
  const g = 0.3 * f;
  const closed = build('nonlinear', g);
  near(tipZ(closed, ['W']), -g, 1e-4, 'extrémité arrêtée au jeu');
  near(vertical(closed, 'clamp20', ['W']), (-3 * EI * (f - g)) / L ** 3, 1e-4, 'réaction');
  assert.equal(closed.nonlinear.states[0].contacts[0].status, 'closedMinus');
  assert.ok(closed.nonlinear.states[0].iterations >= 2);
  assert.ok(!closed.warnings.some((x) => x.includes('rattrapé')));
  // linéaire : direction libre, jeu rattrapé signalé
  const lin = build('linear', g);
  near(tipZ(lin, ['W']), -f, 1e-4, 'linéaire : flèche libre');
  assert.ok(lin.warnings.some((x) => x.includes('rattrapé')));
});

test('butée basse d’un support à ressort (solution analytique)', () => {
  const k = 20; // N/mm
  const free = f / (1 + (k * L ** 3) / (3 * EI)); // descente d'équilibre avec le ressort seul
  const build = (solver, travelDown) => {
    const m = cantilever({ solver });
    m.components.push(sup('10', 'anchor'), sup('20', 'variable', { stiffness: k, preload: '', travelDown }));
    return run(m);
  };
  // course suffisante : ressort seul
  const inside = build('nonlinear', 2 * free);
  near(tipZ(inside, ['W']), -free, 1e-4, 'équilibre sur le ressort');
  assert.equal(inside.nonlinear.states[0].contacts[0].status, 'free');
  // course insuffisante : butée, l'effort total est celui d'un appui à −course
  const t = 0.5 * free;
  const stop = build('nonlinear', t);
  near(tipZ(stop, ['W']), -t, 1e-4, 'arrêt sur la butée basse');
  near(vertical(stop, 'variable20', ['W']), (-3 * EI * (f - t)) / L ** 3, 1e-4, 'ressort + butée');
  assert.equal(stop.nonlinear.states[0].contacts[0].status, 'stopLow');
  near(stop.nonlinear.states[0].contacts[0].force, (-3 * EI * (f - t)) / L ** 3 + k * t, 1e-4, 'part de la butée');
  assert.ok(!stop.warnings.some((x) => x.includes('Course')));
  assert.ok(build('linear', t).warnings.some((x) => x.includes('Course')));
});

test('cas test collecteur avec un appui simple qui décolle : équilibre et état des contacts', () => {
  const build = (solver) => {
    const m = normalizeModel(EXAMPLES.find((e) => e.id === 'benchmark').build());
    m.components.find((c) => c.label === 'AG2').kind = 'restguide';
    m.components.find((c) => c.label === 'AG1').kind = 'restguide';
    m.settings.solver = solver;
    return runAnalysis(m);
  };
  const [lin, nl] = [build('linear'), build('nonlinear')];
  assert.ok(vertical(lin, 'AG2', ['W', 'T1']) > 1000, 'linéaire : AG2 en traction');
  // AG2 décolle en service, AG1 reste en contact ; aucun effort de traction sur un appui posé
  const state = nl.nonlinear.states.find((s) => s.name === 'W+T1');
  const byLabel = (label) => state.contacts[nl.nonlinear.contacts.findIndex((c) => nl.mesh.supports[c.support].label === label && c.kind === 'rest')];
  assert.equal(byLabel('AG2').status, 'lifted');
  assert.equal(byLabel('AG1').status, 'contact');
  assert.ok(byLabel('AG2').d > 0, 'AG2 au-dessus de son appui');
  // effort nul sur l'appui décollé dans l'état de service calculé ; la somme des cas W + T1 le
  // redonne au module près (poids à froid, étendue au module à chaud) : écart < 0,1 % de la charge à froid
  assert.equal(byLabel('AG2').force, 0);
  assert.ok(Math.abs(vertical(nl, 'AG2', ['W', 'T1'])) < 1e-3 * Math.abs(vertical(nl, 'AG2', ['W'])));
  // sous séisme, l'appui décollé est compté actif : signalé comme tel
  assert.ok(nl.warnings.some((x) => x.includes('décollé') && x.includes('AG2') && x.includes('séisme')), 'constat sismique');
  assert.ok(vertical(nl, 'AG1', ['W', 'T1']) < 0);
  // équilibre vertical de l'état de service : même poids total que le calcul linéaire
  const total = (r) => r.mesh.supports.reduce((a, s) => a + vertical(r, s.label, ['W', 'T1']), 0);
  near(total(nl), total(lin), 1e-9, 'somme des efforts verticaux');
  assert.ok(!nl.warnings.some((x) => x.includes('soulevé')));
  // le séisme reste calculé sur le système linéaire, tous supports actifs
  const [sl, sn] = [lin, nl].map((r) => r.cases.find((c) => c.type === 'seismic'));
  assert.deepEqual(Array.from(sn.elemForces), Array.from(sl.elemForces));
  // les équations du code sont alimentées par les états
  assert.ok(nl.check.rows.length === lin.check.rows.length || nl.check.rows.length > 0);
  const eq7 = (r) => Math.max(...r.check.rows.filter((x) => x.eq === '7').map((x) => x.stress));
  assert.ok(Math.abs(eq7(nl) - eq7(lin)) > 1e-3, 'l’étendue de dilatation tient compte du décollement');
});

test('échecs explicites : deux cas de poids, tuyauterie non retenue, itérations épuisées', () => {
  // deux cas de poids actifs
  const two = cantilever();
  two.loadCases.push({ id: 'W2', type: 'weight', label: 'Poids 2', enabled: true });
  two.components.push(sup('10', 'anchor'));
  assert.throws(() => run(two), /un seul cas de poids propre/);

  // tuyauterie posée, soulevée par un support constant trop chargé : plus rien ne la retient verticalement
  const lifted = cantilever();
  lifted.components.push(sup('10', 'custom', { dofs: 'DX DY RX RZ' }), sup('10', 'rest'), sup('20', 'rest'), sup('20', 'guide'), sup('20', 'constant', { preload: 10 * w * L }));
  assert.throws(() => run(lifted), (err) => /n'est plus retenue/.test(err.message) && /rest/.test(err.message));

  // nombre d'itérations insuffisant : pas de résultat rendu
  const m = cantilever();
  m.components.push(sup('10', 'anchor'), sup('20', 'clamp', { gap: String(0.3 * f) }));
  const model = normalizeModel(ensureIds(m));
  const mesh = buildMesh(model);
  const sys = new FeSystem(mesh, { shear: false });
  const { contacts, baseSprings } = buildContacts(mesh);
  const loads = weightLoads(sys, model.loadCases[0]);
  assert.throws(() => solveContactState({ mesh, shear: false, loads, contacts, baseSprings, maxIter: 1 }), NonlinearError);
  const ok = solveContactState({ mesh, shear: false, loads, contacts, baseSprings });
  assert.ok(ok.iterations >= 2 && ok.states[0].status === 'closedMinus');
});
