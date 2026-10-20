// Modèles d'exemple proposés par le bouton « Exemple » : chacun est une
// fonction qui construit un modèle complet (même format qu'un fichier .json).

import { emptyModel, ensureIds, exampleModel } from './model.js';

// Spectres du cas de comparaison PIPESTRESS (accélérations en g, ξ = 5 %)
const PS_H = [[0.2, 0.0017], [0.25, 0.00329], [0.3, 0.00564], [0.35, 0.00891], [0.4, 0.01324], [0.45, 0.01876], [0.5, 0.02564], [0.55, 0.03401], [0.6, 0.04401], [0.65, 0.0558], [0.7, 0.0695], [0.75, 0.08527], [0.8, 0.10324], [0.85, 0.12356], [0.9, 0.14636], [0.95, 0.1718], [1, 0.2], [1.2, 0.34331], [1.4, 0.5421], [1.6, 0.80526], [1.8, 1.14162], [2, 1.56], [2.2, 1.69883], [2.4, 1.83634], [2.6, 1.97264], [2.8, 2.10784], [3, 2.24202], [3.2, 2.37526], [3.4, 2.50763], [3.6, 2.63917], [3.8, 2.76995], [4, 2.9], [4.5, 2.9], [4.6, 2.87022], [4.8, 2.81342], [5, 2.76], [5.2, 2.60294], [5.4, 2.46026], [5.6, 2.33016], [5.8, 2.21116], [6, 2.10197], [6.2, 2.00149], [6.4, 1.90879], [6.6, 1.82303], [6.8, 1.74352], [7, 1.66963], [7.2, 1.60083], [7.4, 1.53663], [7.6, 1.47662], [7.8, 1.42042], [8, 1.3677], [8.2, 1.31817], [8.4, 1.27157], [8.6, 1.22765], [8.8, 1.1862], [9, 1.14704], [9.2, 1.10999], [9.4, 1.0749], [9.6, 1.04162], [9.8, 1.01003], [10, 0.98], [11, 0.93396], [12, 0.89248], [13, 0.8547], [14, 0.81995], [15, 0.78774], [16, 0.7577], [17, 0.72952], [18, 0.70297], [19, 0.67785], [20, 0.654], [21, 0.6297], [22, 0.60737], [23, 0.58677], [24, 0.5677], [25, 0.55], [90, 0.55]];
const PS_V = [[0.2, 0.032], [0.25, 0.04091], [0.3, 0.05], [0.35, 0.0593], [0.4, 0.06874], [0.45, 0.07831], [0.5, 0.088], [0.55, 0.09852], [0.6, 0.10921], [0.65, 0.12007], [0.7, 0.13109], [0.75, 0.14225], [0.8, 0.15355], [0.85, 0.16498], [0.9, 0.17654], [0.95, 0.18821], [1, 0.2], [1.2, 0.24], [1.4, 0.28], [1.6, 0.32], [1.8, 0.36], [2, 0.4], [2.2, 0.42154], [2.4, 0.44222], [2.6, 0.46213], [2.8, 0.48137], [3, 0.5], [3.2, 0.51288], [3.4, 0.52527], [3.6, 0.53723], [3.8, 0.5488], [4, 0.56], [5, 0.56], [5.2, 0.54448], [5.4, 0.52995], [5.6, 0.51631], [5.8, 0.50349], [6, 0.4914], [6.2, 0.47999], [6.4, 0.46919], [6.6, 0.45895], [6.8, 0.44924], [7, 0.44], [7.2, 0.42689], [7.4, 0.41451], [7.6, 0.40281], [7.8, 0.39173], [8, 0.38123], [8.2, 0.37125], [8.4, 0.36177], [8.6, 0.35274], [8.8, 0.34414], [9, 0.33593], [9.2, 0.3281], [9.4, 0.32061], [9.6, 0.31344], [9.8, 0.30658], [10, 0.3], [11, 0.29235], [12, 0.28495], [13, 0.27775], [14, 0.27071], [15, 0.2638], [16, 0.257], [17, 0.25031], [18, 0.24371], [19, 0.2372], [20, 0.23078], [21, 0.22367], [22, 0.21709], [23, 0.21099], [24, 0.20531], [25, 0.2], [90, 0.2]];

/** Ligne DN100 × 3,6 inox comparée à PIPESTRESS (poids, dilatation, modal, séisme 10C). */
function pipestressBenchmark() {
  const m = emptyModel();
  m.meta.title = 'Comparaison PIPESTRESS – ligne DN100 × 3,6 inox';
  m.meta.notes = 'Même modèle que le cas PIPESTRESS (CALTUY) : coudes vérifiés à leurs extrémités, Sc = 117 MPa à 20 °C comme dans les données PIPESTRESS.';
  m.settings.bendInnerPoints = false;
  m.materials = [
    {
      id: 'Z2CND17-12',
      name: 'Z2CND17-12 (données du cas PIPESTRESS)',
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

export const EXAMPLES = [
  { id: 'dn150', title: 'Ligne DN150 inox entre trois piquages', description: 'Trois coudes LR, un té forgé, un robinet, une masse ponctuelle, appui-guide, déplacement imposé de piquage ; poids, pression, dilatation, séisme B/C/D.', build: exampleModel },
  { id: 'pipestress', title: 'Comparaison PIPESTRESS – DN100 × 3,6 inox', description: 'Cas de validation : même modèle que dans PIPESTRESS (coudes vérifiés aux extrémités, Sc = 117 MPa). Poids, dilatation, modal et séisme niveau C (SMS).', build: pipestressBenchmark },
  { id: 'springs', title: 'Ligne DN200 acier carbone – supports à ressort', description: 'Pompe → échangeur : colonne montante, robinet de 350 kg, débitmètre de 60 kg, deux supports variables et un support constant réglés sur le poids.', build: springSupportedLine },
];
