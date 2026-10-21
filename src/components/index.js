// Registre des composants modélisables.
//
// Un composant est une définition { id, label, phase, fields, create, mesh } :
//  - phase 'line'   : composant entre deux nœuds (tube, réduction, robinet
//                     rigide, et demain compensateur…) → crée des segments ;
//  - phase 'corner' : composant qui transforme un sommet du tracé (coude, et
//                     demain coude à onglets) → remplace l'angle par un arc ;
//  - phase 'point'  : composant attaché à un nœud du maillage (masse, support,
//                     et demain té avec SIF, bride, amortisseur…).
// `fields` décrit les colonnes de saisie : l'interface est générée à partir de
// ces descriptions, il n'y a donc rien à coder côté UI pour un nouveau composant.

import { Registry } from '../core/registry.js';
import { pipe } from './pipe.js';
import { bend } from './bend.js';
import { mass } from './mass.js';
import { support, SUPPORT_KINDS } from './support.js';
import { tee, TEE_TYPES } from './tee.js';
import { valve } from './valve.js';
import { reducer, REDUCER_TYPES } from './reducer.js';

export const components = new Registry('Composant');
components.register(pipe);
components.register(bend);
components.register(reducer);
components.register(valve);
components.register(tee);
components.register(mass);
components.register(support);

export { SUPPORT_KINDS, TEE_TYPES, REDUCER_TYPES };
