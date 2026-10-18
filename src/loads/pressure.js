// Pression intérieure. Les pressions (de calcul Pd et maximale de service P1) sont
// portées par les éléments ; elles interviennent directement dans les équations
// de contraintes du code (contrainte longitudinale de pression) et, en option,
// dans la correction de flexibilité des coudes. Dans un système fermé, l'effet
// de fond est équilibré en interne et ne produit pas d'effort de poutre.
// Évolutions prévues : allongement de Bourdon, poussée sur compensateurs.

import { emptyResponse } from './common.js';

export const pressure = {
  id: 'pressure',
  label: 'Pression',
  description: 'Pressions de calcul et de service définies par tube (colonnes « P max » et « P calc. »). Utilisées par les équations du code.',
  fields: [],
  create: () => ({ type: 'pressure', label: 'Pression', enabled: true }),

  run(ctx) {
    const pmax = Math.max(0, ...ctx.sys.mesh.elements.map((e) => Math.max(e.P1, e.Pd)));
    return { signed: true, fe: false, ...emptyResponse(ctx.sys), info: { pmax } };
  },
};
