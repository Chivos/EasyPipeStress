// Modèle « utilisateur » : description sérialisable (JSON) de l'étude.
// Il est indépendant du maillage de calcul, construit à la demande par mesher.js.

import { DEFAULT_MATERIALS } from './materials.js';
import { DEFAULT_SECTIONS } from './sections.js';
import { DEFAULT_PARAMS as RCCM_C_PARAMS } from '../codes/rccm-c.js';

export const MODEL_VERSION = 1;

export function newId(model, prefix = 'c') {
  let max = 0;
  for (const c of model.components) {
    const m = /^[a-z]+(\d+)$/.exec(c.id ?? '');
    if (m) max = Math.max(max, +m[1]);
  }
  return `${prefix}${max + 1}`;
}

export function ensureIds(model) {
  const seen = new Set();
  for (const c of model.components) {
    if (!c.id || seen.has(c.id)) c.id = newId(model);
    seen.add(c.id);
  }
  return model;
}

export const DEFAULT_SPECTRUM = [
  [0.5, 0.1],
  [1, 0.25],
  [2, 0.6],
  [3, 1.0],
  [8, 1.0],
  [15, 0.55],
  [33, 0.3],
  [50, 0.3],
];

export function defaultLoadCases() {
  return [
    { id: 'W', type: 'weight', label: 'Poids propre', enabled: true, fluid: true, insulation: true },
    { id: 'P', type: 'pressure', label: 'Pression', enabled: true },
    { id: 'T1', type: 'thermal', label: 'Dilatation thermique', enabled: true },
    {
      id: 'S1',
      type: 'seismic',
      label: 'Séisme',
      enabled: true,
      levels: [
        { level: 'B', enabled: true, factor: 1 },
        { level: 'C', enabled: true, factor: 1 },
        { level: 'D', enabled: true, factor: 1 },
      ],
      method: 'spectral',
      damping: 5,
      cutoff: 33,
      modal: 'CQC',
      directional: 'SRSS',
      missingMass: true,
      rigid: 'gupta',
      maxModes: 60,
      spectra: {
        X: { factor: 1, points: DEFAULT_SPECTRUM.map((p) => [...p]) },
        Y: { factor: 1, points: DEFAULT_SPECTRUM.map((p) => [...p]) },
        Z: { factor: 2 / 3, points: DEFAULT_SPECTRUM.map((p) => [...p]) },
      },
      staticAcc: { X: 1.5, Y: 1.5, Z: 1.0 },
    },
  ];
}

export function emptyModel() {
  return {
    version: MODEL_VERSION,
    meta: { title: 'Nouvelle étude', author: '', notes: '' },
    settings: { vertical: 'Z', tRef: 20, meshMaxLength: 500, bendDivisionAngle: 10, shear: true, checkThickness: false, allowances: false },
    materials: structuredClone(DEFAULT_MATERIALS),
    sections: structuredClone(DEFAULT_SECTIONS),
    nodeCoords: [{ node: '10', x: 0, y: 0, z: 0 }],
    components: [],
    loadCases: defaultLoadCases(),
    code: { id: 'rccm-c', params: { ...RCCM_C_PARAMS } },
  };
}

/** Exemple : ligne DN150 inox entre deux piquages, trois coudes, une vanne. */
export function exampleModel() {
  const m = emptyModel();
  m.meta.title = 'Exemple – ligne DN150 inox entre deux piquages';
  const base = { section: 'DN150-40S', material: 'Z2CN18-10', T1: 250, P1: 4 };
  const pipes = [
    ['10', '15', 1500, 0, 0],
    ['15', '20', 1500, 0, 0],
    ['20', '30', 0, 0, -2500],
    ['30', '35', 0, 2000, 0],
    ['35', '40', 0, 2000, 0],
    ['40', '45', 1000, 0, 0],
    ['46', '50', 1000, 0, 0],
  ];
  for (const [n1, n2, dx, dy, dz] of pipes) m.components.push({ type: 'pipe', n1, n2, dx, dy, dz, ...base });
  // dérivation DN100 vers un troisième piquage, par un té forgé au nœud 15
  m.components.push({ type: 'pipe', n1: '15', n2: '55', dx: 0, dy: -2500, dz: 0, ...base, section: 'DN100-40S' });
  m.components.push({ type: 'pipe', n1: '55', n2: '60', dx: 0, dy: 0, dz: -2500, ...base, section: 'DN100-40S' });
  m.components.push({ type: 'bend', node: '55', radiusType: 'LR', radius: '', t: '', divisions: '' });
  m.components.push({ type: 'tee', node: '15', teeType: 'welding', pad: '', sif: '', label: 'Té DN150×100' });
  for (const node of ['20', '30', '40']) m.components.push({ type: 'bend', node, radiusType: 'LR', radius: '', t: '', divisions: '' });
  m.components.push({ type: 'valve', n1: '45', n2: '46', dx: 400, dy: 0, dz: 0, mass: 180, stiffFactor: 10, section: 'DN150-40S', label: 'Robinet DN150' });
  m.components.push({ type: 'mass', node: '35', mass: 25, label: 'Instrument' });
  m.components.push({ type: 'support', node: '10', kind: 'anchor', stiffness: '', dofs: '', imposed: '', label: 'Piquage A' });
  m.components.push({ type: 'support', node: '35', kind: 'restguide', stiffness: '', dofs: '', imposed: '', label: 'S1' });
  m.components.push({ type: 'support', node: '50', kind: 'anchor', stiffness: '', dofs: '', imposed: '0 0 3', label: 'Piquage B' });
  m.components.push({ type: 'support', node: '60', kind: 'anchor', stiffness: '', dofs: '', imposed: '', label: 'Piquage C' });
  return ensureIds(m);
}

/** Migration / complétion d'un modèle chargé depuis un fichier. */
export function normalizeModel(raw) {
  const base = emptyModel();
  const m = { ...base, ...raw };
  m.meta = { ...base.meta, ...(raw.meta ?? {}) };
  m.settings = { ...base.settings, ...(raw.settings ?? {}) };
  m.code = { ...base.code, ...(raw.code ?? {}), params: { ...base.code.params, ...(raw.code?.params ?? {}) } };
  // paramètres retirés du code (anciens projets) : supprimés
  if (m.code.id === base.code.id) for (const k of Object.keys(m.code.params)) if (!(k in base.code.params)) delete m.code.params[k];
  m.components = raw.components ?? [];
  m.nodeCoords = raw.nodeCoords ?? base.nodeCoords;
  m.loadCases = raw.loadCases ?? base.loadCases;
  m.version = MODEL_VERSION;
  return ensureIds(m);
}

/**
 * Coordonnées des nœuds utilisateur, obtenues par parcours du graphe des
 * composants « ligne » (DX, DY, DZ) depuis les nœuds de coordonnées imposées.
 */
export function resolveCoordinates(model, lineTypes = ['pipe']) {
  const errors = [];
  const coords = new Map();
  const adj = new Map();
  const lines = model.components.filter((c) => lineTypes.includes(c.type));
  const link = (a, b, d) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, d });
  };
  for (const c of lines) {
    const a = String(c.n1 ?? '').trim();
    const b = String(c.n2 ?? '').trim();
    if (!a || !b) {
      errors.push(`Tube ${c.id} : nœuds de départ et d'arrivée obligatoires.`);
      continue;
    }
    if (a === b) {
      errors.push(`Tube ${c.id} : nœuds de départ et d'arrivée identiques (${a}).`);
      continue;
    }
    const d = [+c.dx || 0, +c.dy || 0, +c.dz || 0];
    if (Math.hypot(...d) < 1e-6) {
      errors.push(`Tube ${a}-${b} : longueur nulle.`);
      continue;
    }
    link(a, b, d);
    link(b, a, d.map((v) => -v));
  }
  const fixed = (model.nodeCoords ?? []).filter((n) => adj.has(String(n.node)));
  const queue = [];
  for (const n of fixed) {
    coords.set(String(n.node), [+n.x || 0, +n.y || 0, +n.z || 0]);
    queue.push(String(n.node));
  }
  const visit = () => {
    while (queue.length) {
      const a = queue.shift();
      const pa = coords.get(a);
      for (const { to, d } of adj.get(a) ?? []) {
        const pb = [pa[0] + d[0], pa[1] + d[1], pa[2] + d[2]];
        if (!coords.has(to)) {
          coords.set(to, pb);
          queue.push(to);
        } else {
          const q = coords.get(to);
          if (Math.hypot(q[0] - pb[0], q[1] - pb[1], q[2] - pb[2]) > 1) {
            errors.push(`Incohérence géométrique au nœud ${to} (boucle non fermée ou coordonnée imposée contradictoire).`);
          }
        }
      }
    }
  };
  visit();
  // Sous-réseaux sans coordonnée imposée : premier nœud placé à l'origine.
  for (const c of lines) {
    const a = String(c.n1 ?? '').trim();
    if (a && adj.has(a) && !coords.has(a)) {
      coords.set(a, [0, 0, 0]);
      queue.push(a);
      visit();
    }
  }
  return { coords, errors };
}
