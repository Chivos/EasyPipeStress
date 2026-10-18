// Dilatation thermique : déformation libre ε = α_moy(T) · (T − T_réf) imposée à
// chaque élément (forces de blocage équivalentes), plus déplacements imposés
// des supports (mouvements de piquages). La raideur est évaluée au module
// d'Young à froid, conformément à la pratique des codes (étendue de moments
// d'expansion calculée avec Ec, RCC-M C 3653.3 / ASME NC-3653.3).

import { axialStrainEquivalent } from '../fem/beam3d.js';
import { materialAt } from '../core/materials.js';

export const thermal = {
  id: 'thermal',
  label: 'Dilatation thermique',
  description: 'Températures de service (colonne « T service ») par rapport à la température de référence, et déplacements imposés des supports.',
  fields: [
    { key: 'imposed', label: 'Appliquer les déplacements imposés des supports', type: 'checkbox', default: true },
  ],
  create: () => ({ type: 'thermal', label: 'Dilatation thermique', enabled: true, imposed: true }),

  run(ctx, lc) {
    const { sys, model } = ctx;
    const tRef = +model.settings.tRef || 20;
    const elemEq = sys.mesh.elements.map((e) => {
      const { alpha } = materialAt(e.mat, e.T1);
      const eps = alpha * (e.T1 - tRef);
      return axialStrainEquivalent(e.E, e.sec.A, eps);
    });
    let imposed = null;
    if (lc.imposed !== false) {
      imposed = new Map();
      sys.mesh.supports.forEach((s, i) => s.imposed && imposed.set(i, s.imposed));
    }
    const r = sys.solveStatic({ F: null, elemEq, imposed });
    return { signed: true, ...r, info: { tRef } };
  },
};
