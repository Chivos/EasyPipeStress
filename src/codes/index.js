// Registre des codes de vérification (dépouillement).
//
// Un code est { id, label, reference, params, componentFactors, check } :
//  - componentFactors(desc) fournit au mailleur les facteurs de flexibilité k,
//    d'intensification i et les indices B1/B2 propres au code (EN 13480 ou
//    ASME B31.1 ont des formules différentes) ;
//  - check({ model, mesh, cases }) renvoie { rows, summary, notes } ;
//  - thickness (facultatif) { ref, formula, compute(elem, model) → { tm, tAvail, detail } } :
//    formule d'épaisseur minimale par tenue à la pression seule, utilisée quand
//    l'option du projet est cochée (src/codes/common.js).
// Évolutions prévues : RCC-M classe 1 (B 3600) et classe 3 (D 3600), EN 13480-3,
// ASME B31.1 / B31.3.

import { Registry } from '../core/registry.js';
import { rccmC } from './rccm-c.js';

export const codes = new Registry('Code de vérification');
codes.register(rccmC);
