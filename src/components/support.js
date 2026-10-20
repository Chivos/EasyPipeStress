// Supports et blocages. Chaque type de support se traduit par un ensemble de
// ressorts linéaires orientés (translation ou rotation) au nœud ; un blocage
// « rigide » est un ressort de très grande raideur (méthode de pénalité, comme
// dans les logiciels industriels), ce qui traite naturellement les directions
// biaises et permet d'imposer des déplacements (mouvements de piquage).
// Supports variables (ressorts) : raideur verticale k active dans tous les cas
// (poids, dilatation, séisme, modal) et précharge P appliquée vers le haut dans
// le cas poids propre ; l'effort repris vaut P − k·u (u déplacement vertical vers
// le haut depuis la position de réglage). Supports constants : précharge P seule, sans raideur.
// Évolutions prévues : supports non linéaires (jeux, unilatéraux, frottement),
// amortisseurs (actifs en séisme seulement).

import { vec } from '../core/linalg.js';

export const RIGID_T = 1e10; // N/mm
export const RIGID_R = 1e14; // N·mm/rad

const GLOBAL = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** Directions horizontales perpendiculaires à l'axe du tube. */
function lateralDirs(axis, up) {
  if (Math.abs(vec.dot(axis, up)) > 0.9) {
    // tube vertical : les deux directions horizontales
    const a = vec.unit(vec.cross(up, Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    return [a, vec.cross(up, a)];
  }
  return [vec.unit(vec.cross(up, axis))];
}

export const SUPPORT_KINDS = {
  anchor: {
    label: 'Ancrage (6 DDL bloqués)',
    springs: () => [
      ...Object.values(GLOBAL).map((d) => ({ rot: false, dir: d })),
      ...Object.values(GLOBAL).map((d) => ({ rot: true, dir: d })),
    ],
  },
  rest: {
    label: 'Appui vertical',
    springs: ({ up }) => [{ rot: false, dir: up }],
  },
  guide: {
    label: 'Guide latéral',
    springs: ({ axis, up }) => lateralDirs(axis, up).map((d) => ({ rot: false, dir: d })),
  },
  restguide: {
    label: 'Appui + guide',
    springs: ({ axis, up }) => [{ rot: false, dir: up }, ...lateralDirs(axis, up).map((d) => ({ rot: false, dir: d }))],
  },
  axial: {
    label: 'Butée axiale',
    springs: ({ axis }) => [{ rot: false, dir: axis }],
  },
  variable: {
    label: 'Support variable (précharge + raideur)',
    springs: ({ up }) => [{ rot: false, dir: up, flexible: true }],
    hanger: true,
  },
  constant: {
    label: 'Support constant (précharge)',
    springs: () => [],
    hanger: true,
  },
  custom: {
    label: 'Blocage personnalisé (DDL globaux)',
    springs: ({ comp }) => {
      const out = [];
      for (const ax of ['X', 'Y', 'Z']) if (comp.dofs?.includes(`D${ax}`)) out.push({ rot: false, dir: GLOBAL[ax] });
      for (const ax of ['X', 'Y', 'Z']) if (comp.dofs?.includes(`R${ax}`)) out.push({ rot: true, dir: GLOBAL[ax] });
      return out;
    },
  },
};

export const support = {
  id: 'support',
  label: 'Support',
  phase: 'point',
  fields: [
    { key: 'node', label: 'Nœud', type: 'node', width: 60 },
    { key: 'kind', label: 'Type', type: 'select', options: () => Object.keys(SUPPORT_KINDS), optionLabel: (k) => SUPPORT_KINDS[k]?.label ?? k, width: 170 },
    { key: 'stiffness', label: 'Raideur', unit: 'N/mm', type: 'number', width: 80, placeholder: 'rigide', title: 'Raideur en translation (vide = rigide). Obligatoire pour un support variable ; sans objet pour un support constant.' },
    { key: 'preload', label: 'Précharge', unit: 'N', type: 'number', width: 80, placeholder: '—', title: 'Supports variable et constant : effort vertical de réglage (vers le haut) exercé par le support sur la tuyauterie, appliqué dans le cas poids propre.' },
    { key: 'dofs', label: 'DDL (perso.)', type: 'text', width: 110, placeholder: 'DX DY RZ…', title: 'Pour le blocage personnalisé : DX DY DZ RX RY RZ' },
    { key: 'imposed', label: 'Dépl. imposé thermique', unit: 'mm', type: 'text', width: 120, placeholder: 'dx dy dz', title: 'Déplacement imposé appliqué dans les cas thermiques (mouvement de piquage), composantes globales' },
    { key: 'label', label: 'Repère', type: 'text', width: 90 },
  ],

  create(model, { node, kind } = {}) {
    return { type: 'support', node: node ?? '', kind: kind ?? 'rest', stiffness: '', preload: '', dofs: '', imposed: '', label: '' };
  },

  mesh(comp, ctx) {
    const kindDef = SUPPORT_KINDS[comp.kind];
    if (!kindDef) {
      ctx.error(`Support ${comp.label || comp.id} : type inconnu « ${comp.kind} ».`);
      return;
    }
    const idx = ctx.nodeIndex(comp.node, `Support « ${comp.label || comp.kind} »`);
    if (idx < 0) return;
    const axis = ctx.pipeAxisAt(idx);
    const specs = kindDef.springs({ axis, up: ctx.up, comp: { ...comp, dofs: String(comp.dofs ?? '').toUpperCase() } });
    if (!specs.length && !kindDef.hanger) ctx.warn(`Support au nœud ${comp.node} : aucun degré de liberté bloqué.`);
    const kUser = +comp.stiffness;
    if (comp.kind === 'variable' && !(kUser > 0)) {
      ctx.error(`Support variable au nœud ${comp.node} : raideur obligatoire.`);
      return;
    }
    const preload = kindDef.hanger && Number.isFinite(+comp.preload) ? +comp.preload : 0;
    if (comp.kind === 'constant' && !(preload > 0)) ctx.warn(`Support constant au nœud ${comp.node} : précharge nulle, le support ne reprend aucun effort.`);
    const imposed = parseVec(comp.imposed);
    const supIdx = ctx.addSupport({
      comp: comp.id,
      node: idx,
      kind: comp.kind,
      label: comp.label || comp.kind,
      imposed,
      ...(kindDef.hanger ? { preload, dir: ctx.up, k: comp.kind === 'variable' ? kUser : 0 } : {}),
    });
    for (const s of specs) {
      const k = s.rot ? RIGID_R : kUser > 0 ? kUser : RIGID_T;
      ctx.addSpring({ node: idx, rot: s.rot, dir: vec.unit(s.dir), k, support: supIdx });
    }
  },
};

function parseVec(text) {
  if (text == null || String(text).trim() === '') return null;
  const parts = String(text).trim().split(/[\s;]+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return parts;
}
