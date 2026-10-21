// Modèles d'exemple proposés par le bouton « Exemple » : chacun est une
// fonction qui construit un modèle complet (même format qu'un fichier .json).

import { emptyModel, ensureIds, exampleModel } from './model.js';

// Spectres du cas de comparaison PIPESTRESS (accélérations en g, ξ = 5 %)
const PS_H = [[0.2, 0.0017], [0.25, 0.00329], [0.3, 0.00564], [0.35, 0.00891], [0.4, 0.01324], [0.45, 0.01876], [0.5, 0.02564], [0.55, 0.03401], [0.6, 0.04401], [0.65, 0.0558], [0.7, 0.0695], [0.75, 0.08527], [0.8, 0.10324], [0.85, 0.12356], [0.9, 0.14636], [0.95, 0.1718], [1, 0.2], [1.2, 0.34331], [1.4, 0.5421], [1.6, 0.80526], [1.8, 1.14162], [2, 1.56], [2.2, 1.69883], [2.4, 1.83634], [2.6, 1.97264], [2.8, 2.10784], [3, 2.24202], [3.2, 2.37526], [3.4, 2.50763], [3.6, 2.63917], [3.8, 2.76995], [4, 2.9], [4.5, 2.9], [4.6, 2.87022], [4.8, 2.81342], [5, 2.76], [5.2, 2.60294], [5.4, 2.46026], [5.6, 2.33016], [5.8, 2.21116], [6, 2.10197], [6.2, 2.00149], [6.4, 1.90879], [6.6, 1.82303], [6.8, 1.74352], [7, 1.66963], [7.2, 1.60083], [7.4, 1.53663], [7.6, 1.47662], [7.8, 1.42042], [8, 1.3677], [8.2, 1.31817], [8.4, 1.27157], [8.6, 1.22765], [8.8, 1.1862], [9, 1.14704], [9.2, 1.10999], [9.4, 1.0749], [9.6, 1.04162], [9.8, 1.01003], [10, 0.98], [11, 0.93396], [12, 0.89248], [13, 0.8547], [14, 0.81995], [15, 0.78774], [16, 0.7577], [17, 0.72952], [18, 0.70297], [19, 0.67785], [20, 0.654], [21, 0.6297], [22, 0.60737], [23, 0.58677], [24, 0.5677], [25, 0.55], [90, 0.55]];
const PS_V = [[0.2, 0.032], [0.25, 0.04091], [0.3, 0.05], [0.35, 0.0593], [0.4, 0.06874], [0.45, 0.07831], [0.5, 0.088], [0.55, 0.09852], [0.6, 0.10921], [0.65, 0.12007], [0.7, 0.13109], [0.75, 0.14225], [0.8, 0.15355], [0.85, 0.16498], [0.9, 0.17654], [0.95, 0.18821], [1, 0.2], [1.2, 0.24], [1.4, 0.28], [1.6, 0.32], [1.8, 0.36], [2, 0.4], [2.2, 0.42154], [2.4, 0.44222], [2.6, 0.46213], [2.8, 0.48137], [3, 0.5], [3.2, 0.51288], [3.4, 0.52527], [3.6, 0.53723], [3.8, 0.5488], [4, 0.56], [5, 0.56], [5.2, 0.54448], [5.4, 0.52995], [5.6, 0.51631], [5.8, 0.50349], [6, 0.4914], [6.2, 0.47999], [6.4, 0.46919], [6.6, 0.45895], [6.8, 0.44924], [7, 0.44], [7.2, 0.42689], [7.4, 0.41451], [7.6, 0.40281], [7.8, 0.39173], [8, 0.38123], [8.2, 0.37125], [8.4, 0.36177], [8.6, 0.35274], [8.8, 0.34414], [9, 0.33593], [9.2, 0.3281], [9.4, 0.32061], [9.6, 0.31344], [9.8, 0.30658], [10, 0.3], [11, 0.29235], [12, 0.28495], [13, 0.27775], [14, 0.27071], [15, 0.2638], [16, 0.257], [17, 0.25031], [18, 0.24371], [19, 0.2372], [20, 0.23078], [21, 0.22367], [22, 0.21709], [23, 0.21099], [24, 0.20531], [25, 0.2], [90, 0.2]];

/** Ligne DN100 × 3,6 inox comparée à PIPESTRESS (poids, dilatation, modal, séisme 10C). */
function pipestressBenchmark() {
  const m = emptyModel();
  m.meta.title = 'Ligne DN100 × 3,6 inox – coudes, appui-guide, séisme niveau C';
  m.meta.notes = 'Coudes vérifiés à leurs extrémités ; Sc = 117 MPa à 20 °C.';
  m.settings.bendInnerPoints = false;
  m.materials = [
    {
      id: 'Z2CND17-12',
      name: 'Z2CND17-12',
      density: 7852,
      nu: 0.3,
      table: [
        { T: 20, E: 197000, alpha: 15.5, S: 117, Sy: 173 },
        { T: 50, E: 195000, alpha: 15.72, S: 117, Sy: 165 },
        { T: 100, E: 191500, alpha: 16, S: 117, Sy: 143 },
        { T: 150, E: 187500, alpha: 16.3, S: 116, Sy: 129 },
        { T: 200, E: 184000, alpha: 16.6, S: 107, Sy: 119 },
        { T: 250, E: 180000, alpha: 16.86, S: 100, Sy: 111 },
        { T: 300, E: 176500, alpha: 17.1, S: 94, Sy: 104 },
      ],
    },
  ];
  m.sections = [{ id: 'DN100-3.6', name: 'DN100 (114,3 × 3,6)', od: 114.3, t: 3.6, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 0, insulDensity: 0 }];
  const base = { section: 'DN100-3.6', material: 'Z2CND17-12', T1: 250, P1: 4 };
  const pipes = [
    ['10', '15', 1500, 0, 0],
    ['15', '20', 1500, 0, 0],
    ['20', '30', 0, 0, -2500],
    ['30', '35', 0, 2000, 0],
    ['35', '40', 0, 2000, 0],
    ['40', '45', 1000, 0, 0],
    ['45', '46', 400, 0, 0],
    ['46', '50', 2000, 0, 0],
  ];
  for (const [n1, n2, dx, dy, dz] of pipes) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz, ...base });
  for (const node of ['20', '30', '40']) m.components.push({ type: 'bend', node, radiusType: '', radius: 152, t: '', divisions: '' });
  m.components.push({ type: 'support', node: '10', kind: 'anchor', label: 'PF A' });
  m.components.push({ type: 'support', node: '35', kind: 'restguide', label: 'S1' });
  m.components.push({ type: 'support', node: '50', kind: 'anchor', label: 'PF B' });
  const seismic = m.loadCases.find((c) => c.type === 'seismic');
  seismic.levels = [
    { level: 'B', enabled: false, factor: 0.5, name: 'DSD' },
    { level: 'C', enabled: true, factor: 1, name: 'SMS' },
    { level: 'D', enabled: false, factor: 2, name: 'SND' },
  ];
  seismic.spectra = { X: { factor: 1, points: PS_H.map((p) => [...p]) }, Y: { factor: 1, points: PS_H.map((p) => [...p]) }, Z: { factor: 1, points: PS_V.map((p) => [...p]) } };
  return ensureIds(m);
}

/** Ligne DN200 acier carbone pompe → échangeur : robinet, débitmètre, supports variables et constant. */
function springSupportedLine() {
  const m = emptyModel();
  m.meta.title = 'Ligne DN200 acier carbone – robinet, masse et supports à ressort';
  m.meta.notes = 'Précharges des supports V1, V2 (variables) et C1 (constant) réglées sur le poids repris : déplacement quasi nul sous poids propre ; variabilité thermique de V1 ≈ 24 %.';
  m.sections.push({ id: 'DN200-Sch40', name: 'DN200 (NPS 8) Sch 40 — ASME B36.10M (219,1 × 8,18)', od: 219.1, t: 8.18, millTol: 12.5, corrosion: 1, fluidDensity: 1000, insulThk: 80, insulDensity: 120 });
  const base = { section: 'DN200-Sch40', material: 'P265GH', T1: 220, P1: 2 };
  const pipes = [
    ['10', '20', 0, 0, 2000],
    ['20', '25', 2000, 0, 0],
    ['25', '30', 2000, 0, 0],
    ['30', '35', 0, 1500, 0],
    ['35', '40', 0, 1500, 0],
    ['41', '45', 0, 1000, 0],
    ['45', '47', 0, 700, 0],
    ['47', '50', 0, 800, 0],
    ['50', '60', 0, 0, -3000],
  ];
  for (const [n1, n2, dx, dy, dz] of pipes) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz, ...base });
  for (const node of ['20', '30', '50']) m.components.push({ type: 'bend', node, radiusType: 'LR', radius: '', t: '', divisions: '' });
  m.components.push({ type: 'valve', n1: '40', n2: '41', dx: 0, dy: 600, dz: 0, mass: 350, stiffFactor: 10, section: 'DN200-Sch40', label: 'Robinet DN200' });
  m.components.push({ type: 'mass', node: '47', mass: 60, label: 'Débitmètre' });
  m.components.push({ type: 'support', node: '10', kind: 'anchor', label: 'Pompe' });
  m.components.push({ type: 'support', node: '25', kind: 'variable', stiffness: 150, preload: 2290, label: 'V1' });
  m.components.push({ type: 'support', node: '35', kind: 'variable', stiffness: 150, preload: 4210, label: 'V2' });
  m.components.push({ type: 'support', node: '45', kind: 'constant', preload: 4610, label: 'C1' });
  m.components.push({ type: 'support', node: '60', kind: 'anchor', label: 'Échangeur' });
  return ensureIds(m);
}

/**
 * Problème de Hovgaard (Kellogg, Design of Piping Systems, 1956, problème 5.9 ;
 * Code_Aster SSLL101 en statique, SDLX02 en séisme) : tuyauterie non plane encastrée aux deux extrémités, deux
 * coudes à 90° de rayon 922 mm. Masse volumique « équivalente » incluant l'eau.
 * Repères : points 1 à 15 du cas de référence ; les sommets des coudes sont C1
 * (points 3, 4, 5 = C1A, C1M, C1B) et C2 (points 9, 10, 11 = C2A, C2M, C2B).
 * Référence poutre (POUX, ADL, TITUS) : coudes avec facteur de flexibilité k = 1,65/h.
 * Séisme : spectre de SDLX02 (Code_Aster V2.05.002), combinaisons SRSS sans
 * correction statique ; maillage du modèle A (tubes droits entre les points du
 * cas, 20 éléments par coude, masses concentrées) sur lequel portent les
 * valeurs de référence de la réponse spectrale.
 */
function hovgaard() {
  const m = emptyModel();
  m.meta.title = 'Problème de Hovgaard (SSLL101, SDLX02)';
  m.meta.notes =
    'Cas de validation Code_Aster SSLL101 (Kellogg 1956, problème 5.9). Points 3, 4, 5 = C1A, C1M, C1B ; points 9, 10, 11 = C2A, C2M, C2B. ' +
    'Références au point 3 (C1A), en mm — poids : DX −0,1658, DY −0,0204, DZ −0,00801 ; forces nodales : DX −0,1651, DY −0,0208, DZ −0,009516 ; ' +
    'dilatation (ΔT = 472,22 °C) : DX −6,1418, DY −13,090, DZ 16,799. Moment résultant au point 1 sous poids : 189,77 N·m. ' +
    'Séisme (SDLX02, spectre à 2 %, SRSS modes et directions, sans correction statique) — déplacements de référence en mm : point 3 (C1A) DX 4,847, DY 2,192 ; point 7 DX 3,588, DY 2,914 ; ' +
    'réactions au point 1 : 2132, 1241, 564,6 N et 2352, 4746, 937,3 N·m. Maillage du modèle A de Code_Aster (tubes droits non subdivisés, 20 éléments par coude). ' +
    'Facteur de flexibilité des coudes k = 1,65/h (même formule que le RCC-M). La vérification RCC-M n’a pas de sens ici (contrainte admissible fictive).';
  m.settings = { ...m.settings, vertical: 'Z', tRef: 20, meshMaxLength: 5000, bendDivisionAngle: 4.5, shear: true };
  m.materials = [
    {
      id: 'HOVGAARD',
      name: 'Matériau du cas Hovgaard (masse volumique avec l’eau)',
      density: 13404.1,
      nu: 0.3,
      table: [
        { T: 20, E: 165800, alpha: 12.88, S: 1000, Sy: 1000 },
        { T: 500, E: 165800, alpha: 12.88, S: 1000, Sy: 1000 },
      ],
    },
  ];
  m.sections = [{ id: 'H185', name: 'Tube 185 × 6,12', od: 185, t: 6.12, millTol: 0, corrosion: 0, fluidDensity: 0, insulThk: 0, insulDensity: 0 }];
  const base = { section: 'H185', material: 'HOVGAARD', T1: 20 + 472.22, P1: 0 };
  const pipes = [
    ['1', '2', 0, 0, 1384],
    ['2', 'C1', 0, 0, 2306],
    ['C1', '6', 0, 1148.5, 0],
    ['6', '7', 0, 226.5, 0],
    ['7', '8', 0, 226.5, 0],
    ['8', 'C2', 0, 1148.5, 0],
    ['C2', '12', 1181.5, 0, 0],
    ['12', '13', 259.5, 0, 0],
    ['13', '14', 259.5, 0, 0],
    ['14', '15', 259.5, 0, 0],
  ];
  for (const [n1, n2, dx, dy, dz] of pipes) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz, ...base });
  for (const node of ['C1', 'C2']) m.components.push({ type: 'bend', node, radiusType: '', radius: 922, t: '', divisions: '' });
  m.components.push({ type: 'support', node: '1', kind: 'anchor', label: 'T1' });
  m.components.push({ type: 'support', node: '15', kind: 'anchor', label: 'T15' });
  const fz = [
    ['2', -624.897], ['C1A', -788.724], ['C1M', -327.654], ['C1B', -214.839], ['6', -102.5145], ['7', -102.5145], ['8', -102.5145],
    ['C2A', -214.839], ['C2M', -327.654], ['C2B', -222.687], ['12', -117.72], ['13', -117.72], ['14', -176.58],
  ];
  m.loadCases = [
    { id: 'W', type: 'weight', label: 'Poids propre', enabled: true, fluid: true, insulation: true },
    { id: 'T1', type: 'thermal', label: 'Dilatation (ΔT = 472,22 °C)', enabled: true, imposed: true },
    { id: 'F1', type: 'forces', label: 'Forces nodales', enabled: true, forces: fz.map(([node, FZ]) => ({ node, FX: 0, FY: 0, FZ, MX: 0, MY: 0, MZ: 0 })) },
    {
      id: 'S1',
      type: 'seismic',
      label: 'Séisme (SDLX02)',
      enabled: true,
      method: 'spectral',
      dampingLaw: 'constant',
      damping: 2,
      cutoff: 200,
      maxModes: 60,
      modal: 'SRSS',
      directional: 'SRSS',
      rigid: 'none',
      interp: 'loglog',
      sameHorizontal: true,
      missingMass: false,
      levels: [{ level: 'C', enabled: true, factor: 1 }],
      // accélérations (g) suivant X et Y ; moitié suivant Z
      spectra: Object.fromEntries(['X', 'Y', 'Z'].map((d) => [d, { factor: d === 'Z' ? 0.5 : 1, points: [[1, 0.2], [10, 2], [30, 2], [100, 0.2], [10000, 0.2]] }])),
    },
  ];
  return ensureIds(m);
}

/**
 * Cas test complet (à reproduire dans un autre logiciel) : collecteur DN200
 * d'un réservoir vers l'aspiration d'une pompe (descente verticale sur la bride),
 * réduction concentrique DN200 × DN150, robinet,
 * piquage DN100 par té forgé vers un second équipement ; points fixes, supports
 * variables, appui-guide, guide, butée axiale. Poids, dilatation à 300 °C et
 * séisme spectral niveau C ; la dilatation dépasse l'admissible de l'éq. (7) au té
 * et aux coudes 60 et 70, ce qui fait jouer l'éq. (8).
 */
function fullBenchmark() {
  const m = emptyModel();
  m.meta.title = 'Cas test – collecteur DN200, té, réduction, robinet, supports variables';
  m.meta.notes =
    'Cas destiné à la comparaison avec un logiciel de référence. P265GH, 300 °C, 3 MPa, eau, calorifuge. ' +
    'Coudes vérifiés à leurs extrémités. Séisme : spectre ξ = 5 %, interpolation linéaire, modes jusqu’à 100 Hz + masse manquante, CQC, SRSS des directions, vertical = 2/3 horizontal.';
  m.settings.bendInnerPoints = false;
  m.sections = [
    { id: 'DN200', name: 'DN200 Sch 40 (219,1 × 8,18)', od: 219.1, t: 8.18, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 80, insulDensity: 120 },
    { id: 'DN150', name: 'DN150 Sch 40 (168,3 × 7,11)', od: 168.3, t: 7.11, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 80, insulDensity: 120 },
    { id: 'DN100', name: 'DN100 Sch 40 (114,3 × 6,02)', od: 114.3, t: 6.02, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 60, insulDensity: 120 },
  ];
  const cond = { material: 'P265GH', T1: 300, P1: 3 };
  const pipes = [
    // collecteur DN200 : réservoir (10) → té (30)
    ['10', '20', 3000, 0, 0, 'DN200'],
    ['20', '25', 0, 1250, 0, 'DN200'],
    ['25', '30', 0, 1250, 0, 'DN200'],
    ['30', '40', 0, 1500, 0, 'DN200'],
    // DN150 après la réduction (40 → 41)
    ['41', '45', 0, 500, 0, 'DN150'],
    ['45', '50', 0, 500, 0, 'DN150'],
    ['51', '60', 0, 1000, 0, 'DN150'],
    ['60', '65', 0, 0, 1000, 'DN150'],
    ['65', '70', 0, 0, 1000, 'DN150'],
    ['70', '75', 2000, 0, 0, 'DN150'],
    ['75', '78', 1000, 0, 0, 'DN150'],
    ['78', '80', 1000, 0, 0, 'DN150'],
    ['80', '85', 0, 1000, 0, 'DN150'],
    ['85', '90', 0, 1000, 0, 'DN150'],
    // descente vers la bride d'aspiration de la pompe (100)
    ['90', '100', 0, 0, -1500, 'DN150'],
    // piquage DN100 : té (30) → second équipement (120)
    ['30', '110', 0, 0, -700, 'DN100'],
    ['110', '120', 600, 0, 0, 'DN100'],
  ];
  for (const [n1, n2, dx, dy, dz, section] of pipes) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz, section, ...cond });
  m.components.push({ type: 'reducer', n1: '40', n2: '41', dx: 0, dy: 152, dz: 0, kind: 'concentric', section: 'DN200', section2: 'DN150', alpha: '', ...cond });
  m.components.push({ type: 'valve', n1: '50', n2: '51', dx: 0, dy: 400, dz: 0, mass: 150, stiffFactor: 10, section: 'DN150', label: 'Robinet DN150' });
  for (const node of ['20', '60', '70', '80', '90', '110']) m.components.push({ type: 'bend', node, radiusType: 'LR', radius: '', t: '', divisions: '' });
  m.components.push({ type: 'tee', node: '30', teeType: 'welding', pad: '', sif: '', label: 'Té DN200 × DN100' });
  m.components.push({ type: 'support', node: '10', kind: 'anchor', label: 'Réservoir' });
  m.components.push({ type: 'support', node: '25', kind: 'variable', stiffness: 100, preload: PRELOADS.V1, label: 'V1' });
  m.components.push({ type: 'support', node: '45', kind: 'restguide', label: 'AG1' });
  m.components.push({ type: 'support', node: '65', kind: 'guide', label: 'G1' });
  m.components.push({ type: 'support', node: '75', kind: 'variable', stiffness: 100, preload: PRELOADS.V2, label: 'V2' });
  m.components.push({ type: 'support', node: '78', kind: 'axial', label: 'BA1' });
  m.components.push({ type: 'support', node: '85', kind: 'restguide', label: 'AG2' });
  m.components.push({ type: 'support', node: '100', kind: 'anchor', label: 'Pompe' });
  m.components.push({ type: 'support', node: '120', kind: 'anchor', label: 'Équipement' });
  const seismic = m.loadCases.find((c) => c.type === 'seismic');
  const pts = [[0.5, 0.1], [1, 0.25], [2, 0.6], [3, 1], [8, 1], [15, 0.55], [33, 0.3], [50, 0.3]];
  Object.assign(seismic, {
    levels: [
      { level: 'B', enabled: false, factor: 1 },
      { level: 'C', enabled: true, factor: 1, name: 'SMS' },
      { level: 'D', enabled: false, factor: 1 },
    ],
    damping: 5,
    cutoff: 100,
    modal: 'CQC',
    directional: 'SRSS',
    missingMass: true,
    rigid: 'none',
    interp: 'linear',
    sameHorizontal: false,
    spectra: { X: { factor: 1, points: pts.map((p) => [...p]) }, Y: { factor: 1, points: pts.map((p) => [...p]) }, Z: { factor: 0.6667, points: pts.map((p) => [...p]) } },
  });
  return ensureIds(m);
}
const PRELOADS = { V1: 3490, V2: 2990 }; // réglées sur le poids repris (supports bloqués verticalement)

export const EXAMPLES = [
  { id: 'dn150', title: 'Ligne DN150 inox entre trois piquages', description: 'Trois coudes LR, un té forgé, un robinet, une masse ponctuelle, appui-guide, déplacement imposé de piquage ; poids, pression, dilatation, séisme B/C/D.', build: exampleModel },
  { id: 'pipestress', title: 'Ligne DN100 × 3,6 inox – séisme niveau C', description: 'Trois coudes, un appui-guide, deux points fixes (coudes vérifiés aux extrémités, Sc = 117 MPa). Poids, dilatation, modal et séisme niveau C (SMS).', build: pipestressBenchmark },
  { id: 'springs', title: 'Ligne DN200 acier carbone – supports à ressort', description: 'Pompe → échangeur : colonne montante, robinet de 350 kg, débitmètre de 60 kg, deux supports variables et un support constant réglés sur le poids.', build: springSupportedLine },
  { id: 'benchmark', title: 'Cas test – collecteur DN200 (té, réduction, robinet, supports variables)', description: 'Poids, dilatation à 300 °C (éq. (7) dépassée au té et aux coudes, éq. (8) jouée), séisme spectral niveau C ; points fixes, supports variables, appui-guide, guide, butée axiale ; té forgé, réduction concentrique, robinet.', build: fullBenchmark },
  { id: 'hovgaard', title: 'Validation – problème de Hovgaard (SSLL101, SDLX02)', description: 'Cas test Code_Aster SSLL101 (Kellogg 1956) : tuyauterie non plane à deux coudes, encastrée aux extrémités ; poids, dilatation et forces nodales (SSLL101), analyse modale et réponse spectrale (SDLX02) comparées aux valeurs de référence.', build: hovgaard },
];
