// Cas de validation issus de la littérature (données publiques), en complément
// de src/core/examples.js. Les références chiffrées sont dans docs/THEORIE.md et
// vérifiées par tests/reference.test.mjs.

import { emptyModel, ensureIds } from './model.js';

const IN = 25.4; // mm par pouce
const PSI = 6.894757e-3; // MPa par psi
const LBF = 4.4482216; // N par livre-force
const SLINCH = 175.12684; // kg par lb·s²/in (unité de masse du système in-lb-s)
const G_IN = 386.0886; // pesanteur normale, in/s²

const pipe = (base) => (n1, n2, d) => ({ type: 'pipe', n1, n2, dx: d[0] * IN, dy: d[1] * IN, dz: d[2] * IN, ...base });
const material = (id, name, E, density) => ({ id, name, density, nu: 0.3, table: [{ T: 20, E, alpha: 12, S: 1000, Sy: 1000 }, { T: 400, E, alpha: 12, S: 1000, Sy: 1000 }] });
const section = (id, name, od, t) => ({ id, name, od, t, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 });

/**
 * NUREG/CR-1677 vol. 1, problème 1 (Bezler, Hartzman, Reich, BNL, 1980) : la
 * tuyauterie de Hovgaard avec masses concentrées, sous spectre de réponse.
 * Tube sans masse répartie, neuf masses ponctuelles (nœuds 2 à 10 du rapport),
 * cinq modes, SRSS des modes et des directions, sans masse manquante.
 * Repères : nœuds 1 à 11 du rapport ; 3, 4, 5 = C1A, C1M, C1B ; 7, 8, 9 = C2A,
 * C2M, C2B. Axes du rapport conservés (Y vertical).
 */
export function nureg1677p1() {
  const m = emptyModel();
  m.meta.title = 'NUREG/CR-1677 vol. 1, problème 1 – Hovgaard à masses concentrées';
  m.meta.notes =
    'Benchmark NRC (BNL, 1980). Nœuds 3, 4, 5 = C1A, C1M, C1B ; nœuds 7, 8, 9 = C2A, C2M, C2B. Tube sans masse, 9 masses ponctuelles ; spectre tabulé en période (interpolation linéaire en période), ' +
    'facteurs X = 1, Y = 0,667, Z = 1 ; 5 modes, SRSS, sans masse manquante. Références : fréquences 28,53 / 55,77 / 81,50 / 141,7 / 162,8 Hz ; ' +
    'déplacements UX(5) = 0,1994 mm, UY(7) = 0,0634 mm, UZ(4) = 0,4432 mm. La vérification RCC-M n’a pas de sens ici (contrainte admissible fictive).';
  m.settings = { ...m.settings, vertical: 'Y', meshMaxLength: 5000, bendDivisionAngle: 2.25 };
  m.materials = [material('NRC1', 'Matériau du problème 1 (E = 24·10⁶ psi, sans masse)', 24e6 * PSI, 0)];
  m.sections = [section('P1', 'Tube 7,288" × 0,241"', 7.288 * IN, 0.241 * IN)];
  const p = pipe({ section: 'P1', material: 'NRC1', T1: 20, P1: 0 });
  m.components.push(p('1', '2', [0, 54.45, 0]), p('2', 'C1', [0, 90.75, 0]), p('C1', '6', [54.15, 0, 0]), p('6', 'C2', [54.15, 0, 0]), p('C2', '10', [0, 0, 56.8]), p('10', '11', [0, 0, 20.5]));
  for (const node of ['C1', 'C2']) m.components.push({ type: 'bend', node, radiusType: '', radius: 36.3 * IN, t: '', divisions: '' });
  const masses = [['2', 0.03988], ['C1A', 0.05032], ['C1M', 0.02088], ['C1B', 0.01698], ['6', 0.01307], ['C2A', 0.01698], ['C2M', 0.01044], ['C2B', 0.01795], ['10', 0.01501]];
  for (const [node, v] of masses) m.components.push({ type: 'mass', node, mass: Math.round(v * SLINCH * 1e4) / 1e4, label: '' });
  m.components.push({ type: 'support', node: '1', kind: 'anchor', label: 'A1' }, { type: 'support', node: '11', kind: 'anchor', label: 'A11' });
  // spectre du rapport : période (s), accélération (in/s²)
  const table = [[0.001698, 145], [0.0286, 380], [0.058, 775], [0.071, 775], [0.091, 440], [0.114, 1188], [0.141, 1188], [0.172, 700], [0.2, 871], [0.25, 871], [0.323, 400]];
  const points = table.map(([T, a]) => [Math.round(1e5 / T) / 1e5, Math.round((a / G_IN) * 1e6) / 1e6]).sort((a, b) => a[0] - b[0]);
  m.loadCases = [
    {
      id: 'S1',
      type: 'seismic',
      label: 'Séisme (NUREG/CR-1677)',
      enabled: true,
      method: 'spectral',
      dampingLaw: 'constant',
      damping: 2,
      cutoff: 180,
      maxModes: 60,
      modal: 'SRSS',
      directional: 'SRSS',
      rigid: 'none',
      interp: 'period',
      sameHorizontal: true,
      missingMass: false,
      levels: [{ level: 'C', enabled: true, factor: 1 }],
      spectra: Object.fromEntries(['X', 'Y', 'Z'].map((d) => [d, { factor: d === 'Y' ? 0.667 : 1, points: points.map((q) => [...q]) }])),
    },
  ];
  return ensureIds(m);
}

/**
 * Ligne BM3 de NUREG/CR-6645 (Morante, Wang, BNL, 1999), reprise par Code_Aster
 * SDLL149 et le manuel de vérification ANSYS : trois diamètres, dix coudes, trois
 * ancrages, sept appuis élastiques ; spectre à 1 % suivant X, 14 modes, SRSS et
 * masse manquante (accélération à période nulle 0,54 g). Modèle à masses
 * concentrées aux 38 nœuds du rapport (tubes droits non subdivisés).
 * Repères : nœuds du rapport ; chaque coude porte le numéro de son premier nœud
 * (coude B7 : nœuds 7 = B7A et 8 = B7B).
 */
export function bm3({ density3 = 1.2908e-3 } = {}) {
  const m = emptyModel();
  m.meta.title = 'NUREG/CR-6645 – ligne BM3 (spectral, masse manquante)';
  m.meta.notes =
    'Benchmark NRC (BNL, 1999 ; Code_Aster SDLL149 ; ANSYS VM-NR6645). Coude Bn : nœuds n = BnA et n+1 = BnB. Masses volumiques équivalentes (tube plein), masses concentrées aux nœuds du rapport. ' +
    'Spectre à 1 % suivant X, 14 modes, SRSS + masse manquante. Références : fréquences 2,91 / 4,39 / 5,52 / 5,70 / 6,98 / 7,34 / 7,88 / 10,30 / 11,06 / 11,23 / 11,50 / 12,43 / 13,88 / 16,12 Hz. ' +
    'La vérification RCC-M n’a pas de sens ici (contrainte admissible fictive).';
  m.settings = { ...m.settings, vertical: 'Z', meshMaxLength: 50000, bendDivisionAngle: 15 };
  const E = 2.9e7 * PSI;
  const rho = (v) => Math.round(v * (SLINCH / (IN / 1000) ** 3) * 10) / 10; // lb·s²/in⁴ → kg/m³
  m.materials = [material('M1', 'BM3 – section 1 (masse volumique équivalente)', E, rho(1.043e-3)), material('M2', 'BM3 – section 2', E, rho(1.107e-3)), material('M3', 'BM3 – section 3', E, rho(density3))];
  m.sections = [section('S1', 'Tube 3,5" × 0,216"', 3.5 * IN, 0.216 * IN), section('S2', 'Tube 4,5" × 0,237"', 4.5 * IN, 0.237 * IN), section('S3', 'Tube 8,625" × 0,322"', 8.625 * IN, 0.322 * IN)];
  const p1 = pipe({ section: 'S1', material: 'M1', T1: 20, P1: 0 });
  const p2 = pipe({ section: 'S2', material: 'M2', T1: 20, P1: 0 });
  const p3 = pipe({ section: 'S3', material: 'M3', T1: 20, P1: 0 });
  m.components.push(
    // ligne 3,5" : ancrage 1 → nœud 21
    p1('1', 'B2', [19.5, 0, 0]),
    p1('B2', '4', [0, -180, 0]),
    p1('4', 'B5', [0, -24, 0]),
    p1('B5', 'B7', [0, 0, 144]),
    p1('B7', '9', [76.5, 0, 0]),
    p1('9', '10', [158, 0, 0]),
    p1('10', '11', [79, 0, 0]),
    p1('11', '12', [78, 0, 0]),
    p1('12', 'B13', [76.5, 0, 0]),
    p1('B13', '15', [0, 0, 48]),
    p1('15', 'B16', [0, 0, 48]),
    p1('B16', '18', [87.5, 0, 0]),
    p1('18', 'B19', [152.5, 0, 0]),
    p1('B19', '21', [0, -60, 0]),
    // ligne 4,5" : nœud 21 → ancrage 31
    p2('21', '22', [0, 0, -35]),
    p2('22', 'B23', [0, 0, -21]),
    p2('B23', '25', [26, 0, 0]),
    p2('25', 'B26', [98, 0, 0]),
    p2('B26', '28', [0, 0, -24]),
    p2('28', 'B29', [0, 0, -24]),
    p2('B29', '31', [0, -96, 0]),
    // ligne 8,625" : nœud 21 → ancrage 38
    p3('21', '32', [0, 0, 15]),
    p3('32', '33', [0, 0, 15]),
    p3('33', '34', [0, 0, 36]),
    p3('34', 'B35', [0, 0, 120]),
    p3('B35', '37', [120, 0, 0]),
    p3('37', '38', [108, 0, 0]),
  );
  const bends = [['B2', 4.5], ['B5', 4.5], ['B7', 4.5], ['B13', 4.5], ['B16', 4.5], ['B19', 4.5], ['B23', 6], ['B26', 6], ['B29', 6], ['B35', 12]];
  for (const [node, R] of bends) m.components.push({ type: 'bend', node, radiusType: '', radius: R * IN, t: '', divisions: '' });
  for (const [node, label] of [['1', 'A1'], ['31', 'A31'], ['38', 'A38']]) m.components.push({ type: 'support', node, kind: 'anchor', label });
  // appuis élastiques (lb/in) : nœud du rapport → [repère du modèle, directions, raideur]
  const K = (v) => Math.round(v * (LBF / IN) * 100) / 100;
  const springs = [
    ['4', 'DX DZ', 1e8, 'R4'],
    ['B7A', 'DY', 1e8, 'R7'],
    ['11', 'DY', 1e8, 'R11Y'],
    ['11', 'DZ', 1e5, 'R11Z'],
    ['15', 'DX', 1e5, 'R15'],
    ['B16B', 'DY', 1e8, 'R17Y'],
    ['B16B', 'DZ', 1e5, 'R17Z'],
    ['B23A', 'DX', 1e5, 'R23X'],
    ['B23A', 'DY', 1e8, 'R23Y'],
    ['B35B', 'DY', 1e8, 'R36Y'],
    ['B35B', 'DZ', 1e5, 'R36Z'],
  ];
  for (const [node, dofs, k, label] of springs) m.components.push({ type: 'support', node, kind: 'custom', stiffness: K(k), preload: '', dofs, imposed: '', label });
  const f = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3, 3.15, 3.3, 3.45, 3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8, 5, 5.25, 5.5, 5.75, 6, 6.25,
    6.5, 6.75, 7, 7.25, 7.5, 7.75, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 18, 20, 22, 25, 28, 31, 34];
  const a = [0.06, 0.13, 0.13, 0.2, 0.35, 0.39, 0.37, 0.41, 0.76, 0.64, 0.59, 0.91, 1.03, 1.46, 0.95, 0.91, 1.61, 1.92, 1.57, 1.18, 2.65, 2.85, 3.26, 4.47, 4.75, 5.29, 7.44, 4.27, 4.61, 4.13, 3.96, 4.05, 2.44, 2.09, 2.29, 1.52, 1.34, 1.37, 1.36,
    1.31, 1.69, 1.27, 1.04, 0.76, 0.76, 0.69, 0.7, 0.74, 0.7, 0.67, 0.66, 0.61, 0.75, 0.6, 0.69, 0.61, 0.7, 0.59, 0.61, 0.56, 0.59, 0.59, 0.59, 0.58, 0.59, 0.58, 0.55, 0.56, 0.55, 0.55, 0.55, 0.54, 0.54, 0.54, 0.54];
  m.loadCases = [
    {
      id: 'S1',
      type: 'seismic',
      label: 'Séisme X (BM3)',
      enabled: true,
      method: 'spectral',
      dampingLaw: 'constant',
      damping: 1,
      cutoff: 17,
      maxModes: 60,
      modal: 'SRSS',
      directional: 'SRSS',
      rigid: 'none',
      interp: 'loglog',
      sameHorizontal: false,
      missingMass: true,
      levels: [{ level: 'C', enabled: true, factor: 1 }],
      spectra: { X: { factor: 1, points: f.map((x, k) => [x, a[k]]) }, Y: { factor: 0, points: [] }, Z: { factor: 0, points: [] } },
    },
  ];
  return ensureIds(m);
}

/**
 * SDLL14 (guide VPCS, AFNOR 1990 ; Code_Aster V2.02.014) : modes de vibration
 * d'un coude mince à 90° (R = 1 m, tube 20 × 2 mm) prolongé par deux bras droits
 * de longueur l, encastré aux extrémités C et D, appuyé aux raccords A et B
 * (déplacements transverses nuls). Coude dans le plan XY, Z hors plan.
 * @param l longueur des bras (mm) : 2000 (référence), 600 ou 0
 */
export function sdll14({ l = 2000 } = {}) {
  const m = emptyModel();
  m.meta.title = 'SDLL14 – modes de vibration d’un coude mince (VPCS)';
  m.meta.notes =
    'Cas du guide de validation AFNOR/SFM (VPCS), repris par Code_Aster V2.02.014. Coude R = 1 m entre A (= VA) et B (= VB), bras de 2 m, encastrements en C et D, appuis transverses en A et B. ' +
    'Fréquences de référence : 17,9 / 24,8 / 25,3 / 27,0 Hz (AFNOR) ; PIPESTRESS : 17,64 / 24,39 / 24,89 / 26,63 Hz ; Code_Aster (poutres) : 17,73 / 24,71 / 25,24 / 27,07 Hz. ' +
    'Le spectre n’est là que pour déclencher l’analyse modale (onglet Résultats, modes propres).';
  m.settings = { ...m.settings, vertical: 'Z', meshMaxLength: 100, bendDivisionAngle: 3 };
  m.materials = [material('ACIER', 'Acier (E = 210 000 MPa, ρ = 7800 kg/m³)', 210000, 7800)];
  m.sections = [section('T20', 'Tube 20 × 2', 20, 2)];
  const base = { section: 'T20', material: 'ACIER', T1: 20, P1: 0 };
  m.components.push({ type: 'pipe', n1: 'C', n2: 'V', dx: l + 1000, dy: 0, dz: 0, ...base }, { type: 'pipe', n1: 'V', n2: 'D', dx: 0, dy: -(l + 1000), dz: 0, ...base });
  m.components.push({ type: 'bend', node: 'V', radiusType: '', radius: 1000, t: '', divisions: '' });
  m.components.push({ type: 'support', node: 'C', kind: 'anchor', label: 'C' }, { type: 'support', node: 'D', kind: 'anchor', label: 'D' });
  if (l > 0) {
    m.components.push({ type: 'support', node: 'VA', kind: 'custom', stiffness: '', preload: '', dofs: 'DY DZ', imposed: '', label: 'A' });
    m.components.push({ type: 'support', node: 'VB', kind: 'custom', stiffness: '', preload: '', dofs: 'DX DZ', imposed: '', label: 'B' });
  }
  m.nodeCoords = [{ node: 'C', x: -l, y: 1000, z: 0 }];
  const flat = [[1, 1], [1000, 1]];
  m.loadCases = [
    {
      id: 'S1',
      type: 'seismic',
      label: 'Analyse modale (spectre unité)',
      enabled: true,
      method: 'spectral',
      dampingLaw: 'constant',
      damping: 2,
      cutoff: l >= 2000 ? 40 : 300,
      maxModes: 60,
      modal: 'CQC',
      directional: 'SRSS',
      rigid: 'none',
      interp: 'loglog',
      sameHorizontal: true,
      missingMass: true,
      levels: [{ level: 'C', enabled: true, factor: 1 }],
      spectra: Object.fromEntries(['X', 'Y', 'Z'].map((d) => [d, { factor: 1, points: flat.map((q) => [...q]) }])),
    },
  ];
  return ensureIds(m);
}

/**
 * ASME B31.3-2012, annexe S : exemple 1 (ligne plane DN400 entre deux ancrages, § S301) et
 * exemple 2 (même ligne doublée par symétrie, appui Y+ au nœud 50 qui décolle en service, § S302).
 * Données des tableaux S301.3.1, S301.3.2 et S302.3 ; options de calcul du § S301.3 : raidissement
 * des coudes par la pression, sections nominales pour les raideurs, sections diminuées de la
 * surépaisseur pour S_L, module de référence à 21 °C.
 */
export function b313AppendixS({ example = 2 } = {}) {
  const lift = example === 2;
  const m = emptyModel();
  m.meta.title = lift ? 'Validation – ASME B31.3, annexe S, exemple 2 (appui qui décolle)' : 'Validation – ASME B31.3, annexe S, exemple 1';
  m.meta.notes =
    'ASTM A106 Gr. B, DN400 × 9,53 mm, calorifuge 127 mm, eau ; ' +
    (lift
      ? 'cas de service 1 : 288 °C, 3 795 kPa. L’appui du nœud 50 décolle en service : la contrainte S_L est vérifiée aussi appui retiré (condition 3 du tableau S302.6.2.1), où elle dépasse S_h au nœud 20.'
      : '260 °C, 3 450 kPa.');
  Object.assign(m.settings, { vertical: 'Y', tRef: 20, thermalModulus: 'cold', allowances: true, bendInnerPoints: true, solver: lift ? 'nonlinear' : 'linear' });
  m.code = { id: 'b31-3', params: { pressureCorrection: true, cycles: 7000 } };
  // dilatation totale depuis 21 °C (tableau C-1, acier au carbone) : 3,62 in/100 ft à 500 °F et
  // 4,11 in/100 ft à 550 °F, soit 3,0155 et 3,4236 mm/m ; coefficients moyens depuis 20 °C
  m.materials = [
    {
      id: 'A106B',
      name: 'ASTM A106 Gr. B',
      density: 7833.4,
      nu: 0.3,
      table: [
        { T: 20, E: 203400, alpha: 11.5, S: 138, Sy: 241 },
        { T: 204, E: 203400, alpha: 12.2, S: 138, Sy: 241 },
        { T: 260, E: 203400, alpha: 3015.5 / 240, S: 130.3, Sy: 241 },
        { T: 288, E: 203400, alpha: 3423.6 / 268, S: 124.8, Sy: 241 },
        { T: 316, E: 203400, alpha: 13.0, S: 119.3, Sy: 241 },
      ],
    },
  ];
  m.sections = [{ id: 'DN400', name: 'DN400 (NPS 16) Sch 30 (406,4 × 9,53)', od: 406.4, t: 9.53, millTol: 12.5, corrosion: 1.59, fluidDensity: 1000, insulThk: 127, insulDensity: 176 }];
  const cond = { section: 'DN400', material: 'A106B', T1: lift ? 288 : 260, P1: lift ? 3.795 : 3.45 };
  const half = [
    ['10', '15', 6100, 0],
    ['15', '20', 6100, 0],
    ['20', '30', 3050, 0],
    ['30', '40', 0, 6100],
    ['40', '45', 3050, 0],
    ['45', '50', 6100, 0],
  ];
  // exemple 2 : seconde moitié, symétrique de la première par rapport au nœud 50
  const mirror = [
    ['50', '145', 6100, 0],
    ['145', '140', 3050, 0],
    ['140', '130', 0, -6100],
    ['130', '120', 3050, 0],
    ['120', '115', 6100, 0],
    ['115', '110', 6100, 0],
  ];
  for (const [n1, n2, dx, dy] of lift ? [...half, ...mirror] : half) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz: 0, ...cond });
  for (const node of lift ? ['30', '40', '140', '130'] : ['30', '40']) m.components.push({ type: 'bend', node, radiusType: '', radius: 609.6, t: '', divisions: '' });
  m.components.push({ type: 'support', node: '10', kind: 'anchor', label: 'Ancrage 10' });
  m.components.push({ type: 'support', node: '20', kind: 'clamp', label: 'Y 20' });
  if (lift) {
    m.components.push({ type: 'support', node: '50', kind: 'rest', label: 'Y+ 50' });
    m.components.push({ type: 'support', node: '120', kind: 'clamp', label: 'Y 120' });
    m.components.push({ type: 'support', node: '110', kind: 'anchor', label: 'Ancrage 110' });
  } else {
    m.components.push({ type: 'support', node: '50', kind: 'anchor', label: 'Ancrage 50' });
  }
  m.loadCases = m.loadCases.filter((c) => c.type !== 'seismic');
  return ensureIds(m);
}
