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
// Codes inscrits : RCC-M classe 2 (par défaut), CODETI Division 1, EN 13480-3,
// ASME B31.3. Les descripteurs facultatifs `equations`, `help`, `eqName`,
// `levels` / `levelsFor`, `materialHelp`, `caveat` alimentent l'interface.
// Évolutions prévues : RCC-M classe 1 (B 3600) et classe 3 (D 3600), ASME B31.1.

import { Registry } from '../core/registry.js';
import { rccmC } from './rccm-c.js';
import { b313 } from './b31-3.js';
import { en13480 } from './en13480.js';
import { codeti } from './codeti.js';

export const codes = new Registry('Code de vérification');
codes.register(rccmC); // premier inscrit : code par défaut des nouveaux projets
codes.register(codeti);
codes.register(en13480);
codes.register(b313);
