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
    // précharge des supports variables et constants : effort vers le haut sur la tuyauterie
    const hangers = sys.mesh.supports.map((s, k) => ({ s, k })).filter(({ s }) => s.preload);
    for (const { s } of hangers) for (let d = 0; d < 3; d++) loads.F[s.node * 6 + d] += s.preload * s.dir[d];
    const r = sys.solveStatic(loads);
    // effort exercé par la tuyauterie sur le support : précharge (vers le bas) + raideur
    for (const { s, k } of hangers) for (let d = 0; d < 3; d++) r.supportLoads[k * 6 + d] -= s.preload * s.dir[d];
    return { signed: true, ...r, info: {} };
  },
};
