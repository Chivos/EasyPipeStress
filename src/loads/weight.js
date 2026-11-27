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
    const loads = weightLoads(sys, lc);
    const r = sys.solveStatic(loads);
    applyPreload(r.supportLoads, sys.mesh);
    return { signed: true, ...r, info: {} };
  },
};

/** Charges du poids propre { F, elemEq } : pesanteur et précharge des supports à ressort. */
export function weightLoads(sys, lc) {
  const a = sys.mesh.up.map((v) => -v * G_STD);
  const loads = bodyForceLoads(sys, a, { metal: true, fluid: lc.fluid !== false, insul: lc.insulation !== false });
  // précharge des supports variables et constants : effort vers le haut sur la tuyauterie
  for (const s of sys.mesh.supports) if (s.preload) for (let d = 0; d < 3; d++) loads.F[s.node * 6 + d] += s.preload * s.dir[d];
  return loads;
}

/** Effort exercé par la tuyauterie sur un support à ressort : précharge (vers le bas) + raideur. */
export function applyPreload(supportLoads, mesh) {
  mesh.supports.forEach((s, k) => {
    if (s.preload) for (let d = 0; d < 3; d++) supportLoads[k * 6 + d] -= s.preload * s.dir[d];
  });
}
