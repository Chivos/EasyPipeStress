// Jeux et butées différents de chaque côté d'une direction bloquée, butées à un
// seul sens, courses haute et basse des supports à ressort.
// Contrôles sur une console d'Euler-Bernoulli (solutions analytiques) : la flèche
// libre en bout sous poids vaut f = wL⁴/8EI et un déplacement vertical imposé à
// l'encastrement, appliqué dans le cas de dilatation, déplace l'extrémité d'autant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { pipeSection } from '../src/core/sections.js';
import { buildMesh } from '../src/core/mesher.js';
import { buildContacts } from '../src/fem/contact.js';

// Comparaisons analytiques à 1e-4 : l'ancrage par pénalité ajoute une souplesse de l'ordre de 1e-5 en relatif.
const near = (a, b, rel, msg, abs = 0) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + abs, `${msg}: ${a} vs ${b}`);
const G = 9806.65; // mm/s²
const E = 200000;
const L = 3000;
const sec = pipeSection({ od: 168.3, t: 7.11 });
const w = 7850e-12 * sec.A * G; // poids linéique, N/mm
const EI = E * sec.I;
const KB = (3 * EI) / L ** 3; // raideur de flexion de la console en bout
const f = (w * L ** 4) / (8 * EI); // flèche libre en bout

/** Console encastrée au nœud 10, le long de +X ou de −X, sans cisaillement ni dilatation propre. */
function cantilever({ solver = 'nonlinear', dx = L } = {}) {
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
  m.components.push({ type: 'pipe', n1: '10', n2: '20', dx, dy: 0, dz: 0, section: 'S', material: 'M', T1: 20, P1: 0 });
  return m;
}
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: `${kind}${node}`, ...extra });
/** Console avec le support `tip` en bout ; `move` : déplacement imposé de l'encastrement dans le cas de dilatation. */
const run = (tip, { move = '0 0 0', solver = 'nonlinear', dx = L } = {}) => {
  const m = cantilever({ solver, dx });
  m.components.push(sup('10', 'anchor', { imposed: move }), tip);
  return runAnalysis(normalizeModel(ensureIds(m)));
};
const sum = (r, ids, pick) => r.cases.filter((c) => ids.includes(c.id)).reduce((a, c) => a + pick(c), 0);
const tip = (r, d, ids = ['W', 'T1']) => sum(r, ids, (c) => c.u[r.mesh.nodeIndex.get('20') * 6 + d]);
const load = (r, label, d, ids = ['W', 'T1']) => sum(r, ids, (c) => c.supportLoads[r.mesh.supports.findIndex((s) => s.label === label) * 6 + d]);
const status = (r) => r.nonlinear.states.map((s) => s.contacts.map((c) => c.status));
const fmt = (v) => v.toFixed(6);

test('jeu différent de chaque côté : butée basse proche, butée haute éloignée', () => {
  const [low, high] = [0.3 * f, 2 * f];
  const r = run(sup('20', 'clamp', { gap: `${fmt(low)}/${fmt(high)}` }), { move: `0 0 ${4 * f}` });
  const c = r.nonlinear.contacts[0];
  near(-c.d1, low, 1e-6, 'jeu côté −');
  near(c.d2, high, 1e-6, 'jeu côté +');
  assert.deepEqual(c.dir, [0, 0, 1]);
  // sous poids : la flèche libre f dépasse le jeu bas, l'extrémité s'arrête à −0,3 f
  assert.deepEqual(status(r), [['closedMinus'], ['closedPlus']]);
  near(tip(r, 2, ['W']), -low, 1e-4, 'arrêt sur la butée basse');
  near(load(r, 'clamp20', 2, ['W']), -KB * (f - low), 1e-4, 'effort sur la butée basse');
  // en service : l'encastrement monte de 4 f, l'extrémité libre irait à +3 f et s'arrête à +2 f
  near(tip(r, 2), high, 1e-4, 'arrêt sur la butée haute');
  near(load(r, 'clamp20', 2), KB * (3 * f - high), 1e-4, 'effort sur la butée haute');
  // le même support à jeu symétrique de 0,3 f s'arrêterait plus tôt vers le haut
  const sym = run(sup('20', 'clamp', { gap: fmt(low) }), { move: `0 0 ${4 * f}` });
  near(tip(sym, 2), low, 1e-4, 'jeu symétrique : arrêt à +0,3 f');
  // entre les deux butées, le support n'agit pas
  const open = run(sup('20', 'clamp', { gap: `${fmt(2 * f)}/${fmt(high)}` }), { move: `0 0 ${2 * f}` });
  assert.deepEqual(status(open), [['open'], ['open']]);
  near(tip(open, 2, ['W']), -f, 1e-4, 'flèche libre');
  near(tip(open, 2), f, 1e-4, 'montée libre');
  assert.equal(load(open, 'clamp20', 2), 0);
});

test('butée à un seul sens : « 0/- » équivaut à un appui simple, « -/g » ne retient que vers le haut', () => {
  // au contact vers le bas, libre vers le haut : c'est l'appui simple
  for (const move of ['0 0 0', `0 0 ${0.4 * f}`, `0 0 ${2 * f}`]) {
    const [a, b] = [run(sup('20', 'clamp', { gap: '0/-', label: 'S' }), { move }), run(sup('20', 'rest', { label: 'S' }), { move })];
    a.cases.forEach((c, k) => {
      for (const key of ['u', 'elemForces', 'supportLoads']) assert.deepEqual(Array.from(c[key]), Array.from(b.cases[k][key]), `${move} ${c.id} ${key}`);
    });
    assert.deepEqual(status(a).flat().map((s) => (s === 'closedMinus' ? 'contact' : s === 'open' ? 'lifted' : s)), status(b).flat());
  }
  // pas de butée basse, butée haute à g : flèche libre sous poids, arrêt à +g quand l'encastrement monte
  const g = 0.5 * f;
  const up = run(sup('20', 'clamp', { gap: `-/${fmt(g)}` }), { move: `0 0 ${3 * f}` });
  assert.deepEqual(status(up), [['open'], ['closedPlus']]);
  near(tip(up, 2, ['W']), -f, 1e-4, 'flèche libre');
  near(tip(up, 2), g, 1e-4, 'arrêt sur la butée haute');
  assert.equal(up.nonlinear.contacts[0].d1, -Infinity);
  // et il ne retient jamais vers le bas, même très loin
  const down = run(sup('20', 'clamp', { gap: `-/${fmt(g)}` }), { move: `0 0 ${-5 * f}` });
  assert.deepEqual(status(down), [['open'], ['open']]);
  near(tip(down, 2), -6 * f, 1e-4, 'descente libre');
});

test('appui placé sous le tube et étrier à jeu haut', () => {
  // appui à g sous le tube (« g/- ») : il ne porte que si la flèche l'atteint
  const g = 0.4 * f;
  const under = run(sup('20', 'clamp', { gap: `${fmt(g)}/-` }));
  assert.deepEqual(status(under)[0], ['closedMinus']);
  near(tip(under, 2, ['W']), -g, 1e-4, 'tube posé sur l’appui');
  near(load(under, 'clamp20', 2, ['W']), -KB * (f - g), 1e-4, 'charge portée');
  const far = run(sup('20', 'clamp', { gap: `${fmt(2 * f)}/-` }));
  assert.deepEqual(status(far)[0], ['open']);
  // étrier « 0/g » : au contact vers le bas, jeu g vers le haut
  const hold = run(sup('20', 'clamp', { gap: `0/${fmt(g)}` }), { move: `0 0 ${3 * f}` });
  assert.deepEqual(status(hold), [['closedMinus'], ['closedPlus']]);
  near(load(hold, 'clamp20', 2, ['W']), (-3 * w * L) / 8, 1e-4, 'à froid : console appuyée');
  near(tip(hold, 2), g, 1e-4, 'en service : retenu à +g');
  near(load(hold, 'clamp20', 2), KB * (2 * f - g), 1e-4, 'effort vers le haut');
  // montée intermédiaire : décollé de l'appui, sans atteindre l'étrier
  const mid = run(sup('20', 'clamp', { gap: `0/${fmt(g)}` }), { move: `0 0 ${1.2 * f}` });
  assert.deepEqual(status(mid), [['closedMinus'], ['open']]);
  // différence de deux déplacements voisins (montée 1,2 f, flèche f) : tolérance élargie
  near(tip(mid, 2), 0.2 * f, 1e-3, 'entre l’appui et l’étrier');
});

test('côtés − et + : sens global croissant, quel que soit le sens de saisie du tube', () => {
  // guide latéral (direction Y) d'un tube tracé vers +X puis vers −X : jeu 1 mm côté −Y, 3 mm côté +Y
  for (const dx of [L, -L]) {
    const plus = run(sup('20', 'guide', { gap: '1/3' }), { move: '0 10 0', dx });
    const c = plus.nonlinear.contacts[0];
    assert.deepEqual(c.dir, [0, 1, 0], `direction orientée vers +Y (tube vers ${dx > 0 ? '+X' : '−X'})`);
    assert.deepEqual([c.d1, c.d2], [-1, 3]);
    assert.equal(status(plus)[1][0], 'closedPlus');
    near(tip(plus, 1), 3, 1e-4, 'arrêt à +3 mm');
    const minus = run(sup('20', 'guide', { gap: '1/3' }), { move: '0 -10 0', dx });
    assert.equal(status(minus)[1][0], 'closedMinus');
    near(tip(minus, 1), -1, 1e-4, 'arrêt à −1 mm');
  }
});

test('saisie des jeux : une entrée par direction, virgule décimale, entrées non comprises signalées', () => {
  const springs = (kind, gap) => {
    const m = cantilever();
    m.components.push(sup('10', 'anchor'), sup('20', kind, { gap }));
    const mesh = buildMesh(normalizeModel(ensureIds(m)));
    return { mesh, list: mesh.springs.filter((s) => s.support === 1) };
  };
  // appui bilatéral guidé : direction verticale puis latérale
  const two = springs('clampguide', '1/2 3');
  assert.deepEqual(two.list.map((s) => [s.gapMinus, s.gapPlus, s.oneWay]), [[1, 2, 0], [3, 3, 0]]);
  assert.ok(two.list.every((s) => s.dynamicOnly && s.gapped));
  // une seule entrée : toutes les directions ; virgule décimale ; côté sans butée
  assert.deepEqual(springs('clampguide', '2,5/4').list.map((s) => [s.gapMinus, s.gapPlus]), [[2.5, 4], [2.5, 4]]);
  const one = springs('clamp', '0/-').list[0];
  assert.deepEqual([one.gapMinus, one.gapPlus, one.oneWay, one.dynamicOnly], [0, Infinity, -1, false]);
  assert.deepEqual(springs('clamp', 'libre/0').list.map((s) => [s.gapMinus, s.gapPlus, s.oneWay]), [[Infinity, 0, 1]]);
  // jeu nul des deux côtés : blocage ordinaire
  const none = springs('clamp', '0/0');
  assert.equal(none.list[0].gapped, false);
  assert.equal(buildContacts(none.mesh).contacts.length, 0);
  // entrées non comprises : jeu ignoré et signalé
  for (const bad of ['abc', '1/2/3', '-2', '1/', '1 2 3']) {
    const r = springs('clamp', bad);
    assert.ok(r.mesh.warnings.some((x) => x.includes('non compris') && x.includes(bad)), bad);
    assert.equal(r.list[0].gapped, false, bad);
  }
  // aucune butée d'aucun côté : la direction ne retient rien
  const free = springs('clamp', '-');
  assert.ok(free.mesh.warnings.some((x) => x.includes('ne retient rien')));
  assert.equal(free.list.length, 0);
});

test('solveur linéaire : jeu rattrapé signalé avec son côté, butée à un seul sens prise dans les deux sens', () => {
  // jeu des deux côtés : direction libre en statique ; le dépassement est comparé au jeu du côté où il se fait
  const gap = `${fmt(0.3 * f)}/${fmt(2 * f)}`;
  const lin = run(sup('20', 'clamp', { gap, label: 'B' }), { solver: 'linear' });
  near(tip(lin, 2, ['W']), -f, 1e-4, 'flèche libre');
  assert.ok(lin.warnings.some((x) => x.includes('rattrapé') && x.includes('côté −Z')), lin.warnings.join(' | '));
  // montée : c'est maintenant le jeu haut qui compte, et il n'est pas atteint
  const up = run(sup('20', 'clamp', { gap, label: 'B' }), { solver: 'linear', move: `0 0 ${2.5 * f}` });
  const g = up.contacts.find((c) => c.type === 'gap');
  assert.ok(g && g.side === -1, 'seul le jeu bas est rattrapé, sous poids seul');
  const top = run(sup('20', 'clamp', { gap, label: 'B' }), { solver: 'linear', move: `0 0 ${4 * f}` });
  assert.ok(top.warnings.some((x) => x.includes('rattrapé') && x.includes('côté +Z')), top.warnings.join(' | '));
  // butée au contact d'un côté : active, comme un blocage ; signalée si elle travaille en sens inverse
  const held = run(sup('20', 'clamp', { gap: '0/-', label: 'B' }), { solver: 'linear' });
  near(load(held, 'B', 2, ['W']), (-3 * w * L) / 8, 1e-4, 'butée active sous poids');
  assert.ok(!held.warnings.some((x) => x.includes('sens inverse')));
  const pulled = run(sup('20', 'clamp', { gap: '0/-', label: 'B' }), { solver: 'linear', move: `0 0 ${2 * f}` });
  assert.ok(load(pulled, 'B', 2) > 1, 'linéaire : la butée retient vers le haut');
  assert.ok(pulled.warnings.some((x) => x.includes('sens inverse') && x.includes('B') && x.includes('vers +Z')), pulled.warnings.join(' | '));
  // le solveur non linéaire, lui, laisse la butée s'ouvrir
  const nl = run(sup('20', 'clamp', { gap: '0/-', label: 'B' }), { move: `0 0 ${2 * f}` });
  assert.ok(Math.abs(load(nl, 'B', 2)) < 1e-6);
  assert.ok(!nl.warnings.some((x) => x.includes('sens inverse')));
});

test('support à ressort : courses basse et haute indépendantes', () => {
  const k = 20; // N/mm
  const free = f / (1 + k / KB); // descente d'équilibre sur le ressort seul, sous poids
  const [down, up] = [0.5 * free, 3 * free];
  const spring = (extra) => sup('20', 'variable', { stiffness: k, preload: '', ...extra });
  // montée δ de l'encastrement : l'extrémité sur le ressort seul irait à (δ − f)·KB/(KB + k)
  const delta = f + 8 * free;
  const r = run(spring({ travelDown: down, travelUp: up }), { move: `0 0 ${delta}` });
  assert.deepEqual(status(r), [['stopLow'], ['stopHigh']]);
  near(tip(r, 2, ['W']), -down, 1e-4, 'butée basse sous poids');
  near(tip(r, 2), up, 1e-4, 'butée haute en service');
  near(load(r, 'variable20', 2), KB * (delta - f - up), 1e-4, 'ressort + butée haute');
  // une seule butée saisie : l'autre sens reste libre
  const onlyUp = run(spring({ travelUp: up }), { move: `0 0 ${delta}` });
  assert.deepEqual(status(onlyUp), [['free'], ['stopHigh']]);
  near(tip(onlyUp, 2, ['W']), -free, 1e-4, 'équilibre sur le ressort');
  const onlyDown = run(spring({ travelDown: down }), { move: `0 0 ${delta}` });
  assert.deepEqual(status(onlyDown), [['stopLow'], ['free']]);
  near(tip(onlyDown, 2), ((delta - f) * KB) / (KB + k), 1e-4, 'montée libre sur le ressort');
});
