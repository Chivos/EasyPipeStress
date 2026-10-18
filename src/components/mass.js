// Masse ponctuelle (robinet, instrument, bride…) : participe au poids propre et
// à l'inertie sismique dans les trois directions de translation.

import { kgToT } from '../core/units.js';

export const mass = {
  id: 'mass',
  label: 'Masse ponctuelle',
  phase: 'point',
  fields: [
    { key: 'node', label: 'Nœud', type: 'node', width: 60 },
    { key: 'mass', label: 'Masse', unit: 'kg', type: 'number', width: 80 },
    { key: 'label', label: 'Désignation', type: 'text', width: 140 },
  ],

  create(model, { node } = {}) {
    return { type: 'mass', node: node ?? '', mass: 100, label: '' };
  },

  mesh(comp, ctx) {
    const idx = ctx.nodeIndex(comp.node, `Masse « ${comp.label || comp.id} »`);
    if (idx < 0) return;
    const m = kgToT(+comp.mass || 0);
    if (m <= 0) {
      ctx.warn(`Masse au nœud ${comp.node} nulle ou négative : ignorée.`);
      return;
    }
    ctx.addPointMass({ node: idx, m, comp: comp.id, label: comp.label });
  },
};
