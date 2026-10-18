// Poids propre : métal, fluide, calorifuge et masses ponctuelles, sous la
// pesanteur dirigée suivant -axe vertical.

import { G_STD } from '../core/units.js';
import { bodyForceLoads } from './common.js';

export const weight = {
  id: 'weight',
  label: 'Poids propre',
  description: 'Poids du tube, du fluide, du calorifuge et des masses ponctuelles (pesanteur suivant –vertical).',
  fields: [
    { key: 'fluid', label: 'Inclure le fluide', type: 'checkbox', default: true },
    { key: 'insulation', label: 'Inclure le calorifuge', type: 'checkbox', default: true },
  ],
  create: () => ({ type: 'weight', label: 'Poids propre', enabled: true, fluid: true, insulation: true }),

  run(ctx, lc) {
    const { sys } = ctx;
    const a = sys.mesh.up.map((v) => -v * G_STD);
    const loads = bodyForceLoads(sys, a, { metal: true, fluid: lc.fluid !== false, insul: lc.insulation !== false });
    const r = sys.solveStatic(loads);
    return { signed: true, ...r, info: {} };
  },
};
