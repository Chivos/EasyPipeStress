// Registre des types de chargement élémentaires.
//
// Un type de chargement est { id, label, description, fields, create, run } :
//  - `fields` décrit les paramètres saisis dans l'interface ;
//  - `run(ctx, lc)` reçoit le système éléments finis (ctx.sys) et renvoie un
//    résultat de cas { signed, u, elemForces, supportLoads, info } :
//      signed = true  → réponse statique signée (combinable algébriquement) ;
//      signed = false → enveloppe positive (séisme spectral, combinaisons SRSS).
// Évolutions prévues : vent, coup de bélier / forces de fluide (histoires
// temporelles), poids en épreuve hydraulique, mouvements sismiques différentiels.

import { Registry } from '../core/registry.js';
import { weight } from './weight.js';
import { pressure } from './pressure.js';
import { thermal } from './thermal.js';
import { seismic } from './seismic.js';

export const loadTypes = new Registry('Type de chargement');
loadTypes.register(weight);
loadTypes.register(pressure);
loadTypes.register(thermal);
loadTypes.register(seismic);
