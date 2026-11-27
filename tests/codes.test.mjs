// Codes de vérification autres que le RCC-M classe 2 : ASME B31.3, EN 13480-3,
// CODETI. Formules contrôlées sur des cas calculables à la main ; le RCC-M reste
// le code par défaut et ses résultats ne dépendent pas des autres codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyModel, ensureIds, exampleModel, normalizeModel } from '../src/core/model.js';
import { runAnalysis } from '../src/analysis.js';
import { pipeSection } from '../src/core/sections.js';
import { codes } from '../src/codes/index.js';
import { eqName } from '../src/codes/common.js';
import { b313, componentFactors as b313Factors, rangeFactor } from '../src/codes/b31-3.js';
import { EXAMPLES } from '../src/core/examples.js';
const fullBenchmark = () => EXAMPLES.find((x) => x.id === 'benchmark').build();

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + 1e-9, `${msg}: ${a} vs ${b}`);
const G = 9806.65; // mm/s²

/** Matériau à propriétés constantes, section DN150, sans cas de charge. */
function setup(code, { density = 7850, S = 100 } = {}) {
  const m = emptyModel();
  m.settings.shear = false;
  m.settings.meshMaxLength = 250;
  m.materials = [{ id: 'M', name: 'test', density, nu: 0.3, table: [{ T: 20, E: 200000, alpha: 12, S, Sy: 200 }, { T: 400, E: 200000, alpha: 12, S, Sy: 200 }] }];
  m.sections = [{ id: 'S', od: 168.3, t: 7.11, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  m.loadCases = [{ id: 'W', type: 'weight', label: 'Poids', enabled: true }];
  m.code = { id: code, params: {} };
  return m;
}
const pipe = (n1, n2, dx, dy, dz, extra = {}) => ({ type: 'pipe', n1, n2, dx, dy, dz, section: 'S', material: 'M', T1: 20, P1: 0, ...extra });
const sup = (node, kind, extra = {}) => ({ type: 'support', node, kind, stiffness: '', dofs: '', imposed: '', label: '', ...extra });
const run = (m) => runAnalysis(normalizeModel(ensureIds(m)));
const rowAt = (r, eq, node, elemHas = '') => r.check.rows.find((x) => x.eq === eq && x.node === node && x.elem.includes(elemHas));

test('RCC-M classe 2 : code par défaut, premier de la liste', () => {
  assert.equal(emptyModel().code.id, 'rccm-c');
  assert.equal(codes.list()[0].id, 'rccm-c');
  assert.equal(exampleModel().code.id, 'rccm-c');
  for (const id of ['b31-3', 'en13480-3', 'codeti']) assert.ok(codes.has(id), `code ${id} inscrit`);
});

test('changement de code : paramètres par défaut du code choisi', () => {
  const m = normalizeModel({ ...emptyModel(), code: { id: 'b31-3', params: { cycles: 20000, obsolete: 1 } } });
  assert.equal(m.code.params.cycles, 20000);
  assert.ok(!('obsolete' in m.code.params));
  assert.ok('pressureCorrection' in m.code.params);
});

test('B31.3 : facteurs du tableau D300 (coude, tés)', () => {
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  const R = 228.6;
  const h = (sec.t * R) / sec.rm ** 2;
  const b = b313Factors({ kind: 'bend', sec, bend: { radius: R } });
  near(b.k, 1.65 / h, 1e-12, 'k');
  near(b.ii, 0.9 / h ** (2 / 3), 1e-12, 'i_i');
  near(b.io, 0.75 / h ** (2 / 3), 1e-12, 'i_o');
  const t = b313Factors({ kind: 'tee', sec, teeType: 'welding' });
  const ht = (3.1 * sec.t) / sec.rm;
  near(t.io, 0.9 / ht ** (2 / 3), 1e-12, 'té forgé i_o');
  near(t.ii, 0.75 * t.io + 0.25, 1e-12, 'té forgé i_i');
  near(b313Factors({ kind: 'tee', sec, teeType: 'unreinforced' }).io, 0.9 / (sec.t / sec.rm) ** (2 / 3), 1e-12, 'té non renforcé');
  // plaque de renfort comptée jusqu'à 1,5 T
  assert.equal(b313Factors({ kind: 'tee', sec, teeType: 'reinforced', pad: 30 }).io, b313Factors({ kind: 'tee', sec, teeType: 'reinforced', pad: 1.5 * sec.t }).io);
  // réduction : i = 1,0
  assert.equal(b313Factors({ kind: 'reducer', sec, reducer: { i: 1.7 } }).i, 1);
  near(rangeFactor(7000), 1, 1e-12, 'f(7000)');
  near(rangeFactor(100000), 6 * 100000 ** -0.2, 1e-12, 'f(1e5)');
  assert.equal(rangeFactor(1e12), 0.15);
});

test('B31.3 : S_L d’une console sous poids propre et pression (23a)', () => {
  const m = setup('b31-3');
  const L = 3000;
  const P = 5;
  m.components.push(pipe('10', '20', L, 0, 0, { P1: P }), sup('10', 'anchor'));
  const r = run(m);
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  const w = 7850e-12 * sec.A * G; // N/mm
  const Sb = (w * L * L) / 2 / sec.Z;
  const Sa = (P * sec.Ai) / sec.A; // effet de fond
  const row = rowAt(r, 'SL', '10');
  near(row.stress, Sa + Sb, 1e-6, 'S_L à l’encastrement');
  assert.equal(row.allow, 100);
  assert.equal(eqName(b313, 'SL'), 'S_L (23a)');
});

test('B31.3 : flexion dans le plan / hors plan d’un coude', () => {
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  // coude dans le plan vertical XZ : le poids fléchit dans le plan
  const a = setup('b31-3');
  a.components.push(pipe('10', '20', 2000, 0, 0), pipe('20', '30', 0, 0, -2000), { type: 'bend', node: '20', radiusType: 'LR', radius: '', t: '', divisions: '' }, sup('10', 'anchor'));
  const ra = run(a);
  const wa = ra.cases.find((c) => c.id === 'W');
  // coude dans le plan horizontal XY : le poids fléchit hors plan et tord
  const b = setup('b31-3');
  b.components.push(pipe('10', '20', 2000, 0, 0), pipe('20', '30', 0, 2000, 0), { type: 'bend', node: '20', radiusType: 'LR', radius: '', t: '', divisions: '' }, sup('10', 'anchor'));
  const rb = run(b);
  const wb = rb.cases.find((c) => c.id === 'W');
  let seen = 0;
  for (const [r, w, inPlane] of [[ra, wa, true], [rb, wb, false]]) {
    r.mesh.elements.forEach((e, ie) => {
      if (e.kind !== 'bend') return;
      for (const end of [0, 1]) {
        const o = ie * 12 + (end === 0 ? 3 : 9);
        const [Mi, Mo] = [w.elemPlane[ie * 4 + end * 2], w.elemPlane[ie * 4 + end * 2 + 1]];
        const bending = Math.hypot(w.elemForces[o + 1], w.elemForces[o + 2]);
        near(Math.hypot(Mi, Mo), bending, 1e-9, 'norme conservée');
        if (bending > 1) assert.ok(Math.abs(inPlane ? Mo : Mi) < 1e-6 * bending, `composante nulle (${inPlane ? 'hors plan' : 'plan'})`);
        // contrainte de la ligne S_L recalculée à partir des efforts
        const node = r.mesh.nodes[end === 0 ? e.n1 : e.n2].label;
        const row = r.check.rows.find((x) => x.eq === 'SL' && x.ie === ie && x.end === end);
        const f = e.factors;
        const [Ii, Io] = [Math.max(1, 0.75 * f.ii), Math.max(1, 0.75 * f.io)];
        const Sa = Math.abs(w.elemForces[ie * 12 + (end === 0 ? 0 : 6)]) / sec.A;
        const exp = Math.hypot(Sa + Math.hypot(Ii * Mi, Io * Mo) / sec.Z, Math.abs(w.elemForces[o]) / sec.Z);
        near(row.stress, exp, 1e-9, `S_L au nœud ${node}`);
        seen++;
      }
    });
  }
  assert.ok(seen > 8);
  // i_i > i_o : à moment égal, le coude est plus sollicité dans son plan
  const f = ra.mesh.elements.find((e) => e.kind === 'bend').factors;
  assert.ok(f.ii > f.io && f.i === f.ii);
});

test('B31.3 : séisme, projection plan / hors plan faite avant les combinaisons', () => {
  const m = exampleModel();
  m.code = { id: 'b31-3', params: {} };
  const r = run(m);
  const sc = r.cases.find((c) => c.type === 'seismic');
  // un seul critère occasionnel : le niveau B du cas
  assert.equal(r.cases.filter((c) => c.type === 'seismic').length, 1);
  // SRSS / CQC : la somme des carrés des deux flexions est invariante par rotation du repère de section
  r.mesh.elements.forEach((e, ie) => {
    for (const end of [0, 1]) {
      const o = ie * 12 + (end === 0 ? 3 : 9);
      near(Math.hypot(sc.elemPlane[ie * 4 + end * 2], sc.elemPlane[ie * 4 + end * 2 + 1]), Math.hypot(sc.elemForces[o + 1], sc.elemForces[o + 2]), 1e-6, `élément ${e.label}`);
    }
  });
  const occ = r.check.rows.filter((x) => x.eq === 'OCC');
  assert.ok(occ.length > 0);
  for (const x of occ) near(x.allow, 1.33 * x.detail.S, 1e-12, 'admissible occasionnel');
  // la contrainte occasionnelle dépasse S_L de la même extrémité (S_L + S_occ)
  for (const x of occ.slice(0, 20)) {
    const sl = r.check.rows.find((y) => y.eq === 'SL' && y.ie === x.ie && y.end === x.end);
    assert.ok(x.stress >= sl.stress - 1e-9);
  }
});

test('B31.3 : étendue de dilatation, admissible (1a) puis (1b)', () => {
  const m = fullBenchmark();
  m.code = { id: 'b31-3', params: {} };
  const r = run(m);
  const se = r.check.rows.filter((x) => x.eq === 'SE');
  const over = se.filter((x) => x.ratio > 1);
  assert.ok(over.length > 0, 'des points dépassent (1a)');
  for (const x of over) {
    const b = r.check.rows.find((y) => y.eq === 'SE1b' && y.ie === x.ie && y.end === x.end);
    assert.ok(b, 'ligne (1b) présente');
    assert.equal(b.stress, x.stress);
    assert.ok(b.allow > x.allow, 'admissible (1b) supérieur à (1a)');
    assert.equal(x.coveredBy === 'SE1b', b.ratio <= 1);
  }
  // (1b) n'est jouée qu'aux points dépassant (1a)
  assert.equal(r.check.rows.filter((x) => x.eq === 'SE1b').length, over.length);
  // critère occasionnel unique : le premier niveau coché du séisme (ici le niveau C) est vérifié
  assert.ok(r.check.rows.some((x) => x.eq === 'OCC'), 'séisme vérifié');
  assert.equal(r.cases.filter((c) => c.type === 'seismic').length, 1);
  // le facteur i d'un té réduit s'applique avec Z_e = π·r₂²·T_s
  const br = r.check.rows.find((x) => x.eq === 'SE' && x.kind === 'tee' && x.calc.items.some((i) => String(i[0]).startsWith('Module Z_e')));
  assert.ok(br, 'piquage réduit vérifié avec Z_e');
});

// ---------------------------------------------------------------- EN 13480-3, CODETI
import { en13480, levelsFor } from '../src/codes/en13480.js';
import { codeti } from '../src/codes/codeti.js';
import { componentFactors as rccmFactors } from '../src/codes/rccm-c.js';

test('EN 13480-3 : σ₁ d’une console sous poids propre et pression (12.3.2-1)', () => {
  const m = setup('en13480-3');
  const L = 3000;
  const P = 5;
  m.components.push(pipe('10', '20', L, 0, 0, { P1: P }), sup('10', 'anchor'));
  const r = run(m);
  const sec = pipeSection({ od: 168.3, t: 7.11 });
  const w = 7850e-12 * sec.A * G;
  const row = rowAt(r, 's1', '10');
  // tube droit : i = 1, 0,75i ramené à 1 ; module exact π(d_o⁴ − d_i⁴)/(32d_o)
  near(row.stress, (P * 168.3) / (4 * 7.11) + (w * L * L) / 2 / sec.Z, 1e-6, 'σ₁');
  assert.equal(row.allow, 100);
  assert.equal(eqName(en13480, 's1'), 'σ₁');
});

test('EN 13480-3 : f_a avec E_h/E_c, taux indépendant du module de calcul', () => {
  const build = (modulus) => {
    const m = setup('en13480-3');
    // module et admissible variables avec la température
    m.materials[0].table = [{ T: 20, E: 200000, alpha: 12, S: 120, Sy: 200 }, { T: 300, E: 170000, alpha: 13, S: 90, Sy: 150 }];
    m.settings.thermalModulus = modulus;
    m.loadCases = [{ id: 'W', type: 'weight', label: 'Poids', enabled: true }, { id: 'T1', type: 'thermal', label: 'Dilatation', enabled: true, imposed: true }];
    m.components.push(
      pipe('10', '20', 3000, 0, 0, { T1: 300 }),
      pipe('20', '30', 0, 3000, 0, { T1: 300 }),
      { type: 'bend', node: '20', radiusType: 'LR', radius: '', t: '', divisions: '' },
      sup('10', 'anchor'),
      sup('30', 'anchor'),
    );
    return run(m);
  };
  const hot = build('hot');
  const cold = build('cold');
  const s3h = hot.check.summary.governing.find((g) => g.eq === 's3');
  const s3c = cold.check.summary.governing.find((g) => g.eq === 's3');
  // admissible : U(1,25 f_c + 0,25 f_h)·E_h/E_c à chaud, sans le rapport à froid
  near(s3h.allow, (1.25 * 120 + 0.25 * 90) * (170000 / 200000), 1e-9, 'f_a à chaud');
  near(s3c.allow, 1.25 * 120 + 0.25 * 90, 1e-9, 'f_a (moments à froid)');
  // même étendue de déformation : même taux quel que soit le module du calcul
  near(s3h.ratio, s3c.ratio, 1e-5, 'taux σ₃'); // à la raideur de pénalité des ancrages près
  near(s3c.stress / s3h.stress, 200000 / 170000, 1e-5, 'σ₃ froid / chaud');
  // facteurs de l'annexe H : mêmes expressions que le RCC-M classe 2
  assert.equal(en13480.componentFactors, rccmFactors);
});

test('EN 13480-3 : coefficients k par niveau sismique et équation σ₄', () => {
  assert.deepEqual(Object.values(levelsFor({})).map((x) => x.k), [1.2, 1.3, 1.8]);
  assert.equal(levelsFor({ kB: 1.15, kC: '1', kD: 7 }).B.k, 1.15);
  assert.equal(levelsFor({ kC: '1' }).C.k, 1);
  assert.equal(levelsFor({ kD: 7 }).D.k, 1.8); // valeur hors liste : défaut
  const m = fullBenchmark();
  m.code = { id: 'en13480-3', params: { kC: 1.2 } };
  const r = run(m);
  const occ = r.check.rows.filter((x) => x.eq.startsWith('s2'));
  assert.ok(occ.length > 0);
  for (const x of occ) near(x.allow, 1.2 * x.detail.S, 1e-12, 'k·f_f');
  // σ₃ dépassée : σ₄ = σ₁ + σ₃ ≤ f_h + f_a au même point
  const over = r.check.rows.filter((x) => x.eq === 's3' && x.ratio > 1);
  assert.ok(over.length > 0);
  for (const x of over) {
    const s4 = r.check.rows.find((y) => y.eq === 's4' && y.ie === x.ie && y.end === x.end);
    const s1 = r.check.rows.find((y) => y.eq === 's1' && y.ie === x.ie && y.end === x.end);
    near(s4.stress, s1.stress + x.stress, 1e-9, 'σ₄ = σ₁ + σ₃');
    near(s4.allow, x.detail.Sh + x.allow, 1e-9, 'f_h + f_a');
  }
  assert.ok(r.check.summary.coveredPairs.every((p) => p.eq === 's3' && p.by === 's4'));
});

test('CODETI : mêmes contraintes que l’EN 13480-3, avertissement de non-validation', () => {
  const a = fullBenchmark();
  a.code = { id: 'en13480-3', params: {} };
  const b = fullBenchmark();
  b.code = { id: 'codeti', params: {} };
  const ra = run(a);
  const rb = run(b);
  assert.equal(ra.check.rows.length, rb.check.rows.length);
  ra.check.rows.forEach((x, k) => {
    assert.equal(rb.check.rows[k].stress, x.stress);
    assert.equal(rb.check.rows[k].allow, x.allow);
  });
  assert.ok(codeti.caveat && rb.warnings.some((w) => w.includes('non consulté')), 'avertissement présent');
  assert.ok(!ra.warnings.some((w) => w.includes('non consulté')));
  assert.equal(eqName(codeti, 'c2C'), 'C10.3.3 niveau 2');
  // pas de formule d'épaisseur confirmée pour ce code
  assert.equal(codeti.thickness, undefined);
});

test('tous les codes : synthèse ordonnée, cumuls décrits, RCC-M inchangé par la présence des autres', () => {
  for (const code of codes.list()) {
    const m = exampleModel();
    m.code = { id: code.id, params: {} };
    m.settings.checkThickness = true;
    const r = run(m);
    const eqs = r.check.summary.governing.map((g) => g.eq);
    assert.ok(eqs.length >= 3, `${code.id} : équations vérifiées`);
    for (const g of r.check.summary.governing) assert.ok(Number.isFinite(g.ratio) && g.ratio > 0, `${code.id} ${g.eq}`);
    assert.ok(code.combinations({ model: normalizeModel(m) }).length >= 3, `${code.id} : cumuls`);
    assert.ok(code.equations.length >= 4 && code.help.length >= 2);
    // noms d'équations distincts (listes déroulantes, feuilles Excel)
    const names = [...new Set(r.check.rows.map((x) => x.eq))].map((q) => eqName(code, q));
    assert.equal(new Set(names).size, names.length, `${code.id} : noms uniques`);
  }
  const r = run(exampleModel());
  assert.deepEqual(r.check.summary.governing.map((g) => g.eq), ['6', '7', '10B', '10C', '10D']);
});
