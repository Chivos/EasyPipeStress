// Calcul statique non linéaire par états (solveur expérimental, au choix du projet).
//
// Les supports à contact (appuis simples, jeux, butées des supports à ressort)
// rendent le problème non linéaire : la superposition des cas n'est plus permise.
// Le calcul porte donc sur des états réels, chacun avec son état des contacts :
//   - état froid : poids seul, au module à froid ;
//   - état chaud : poids + dilatation, au module de la dilatation.
// Les cas de charge rendus au reste de l'application gardent leur sens habituel :
//   - cas de poids : l'état froid → moment M_A des codes ;
//   - cas de dilatation : état chaud − état « poids seul » calculé au même module
//     → étendue M_C. La somme des deux cas redonne l'état de service.
// Sans contact actif, ces cas sont ceux du solveur linéaire.
// Frottement : chaque état est calculé depuis la position de montage, avec le
// frottement de ses contacts ; l'étendue de dilatation, différence de deux états,
// le contient donc.
// Le séisme n'est pas concerné : il reste calculé sur le système linéaire, tous
// supports actifs (docs/THEORIE.md, § 7).

import { buildContacts } from './fem/contact.js';
import { solveContactState } from './fem/nonlinear.js';
import { weightLoads, applyPreload } from './loads/weight.js';
import { thermalLoads, hotMesh } from './loads/thermal.js';
import { refTemperature } from './core/materials.js';

const diff = (a, b) => a.map((v, i) => v - b[i]);

/** Somme, élément par élément, de deux jeux de forces équivalentes locales. */
function addElemEq(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.map((fa, i) => {
    const fb = b[i];
    if (!fa) return fb;
    if (!fb) return fa;
    return fa.map((v, k) => v + fb[k]);
  });
}

/**
 * @returns { cases: Map<idCas, résultat>, contacts, states }
 *   states : [{ name, iterations, contacts: [{ zone, status, d, force }], friction: [...] }] pour
 *   l'état froid puis chaque état de service (friction : un élément par support frottant).
 */
export function runNonlinearStatics(ctx) {
  const { model, mesh, sys } = ctx;
  const shear = model.settings.shear !== false;
  const active = model.loadCases.filter((c) => c.enabled !== false);
  const wCases = active.filter((c) => c.type === 'weight');
  const tCases = active.filter((c) => c.type === 'thermal');
  if (wCases.length > 1) throw new Error(`Solveur non linéaire : un seul cas de poids propre actif est admis (${wCases.map((c) => c.id).join(', ')} actifs).`);
  const { contacts, baseSprings } = buildContacts(mesh);
  const hot = model.settings.thermalModulus !== 'cold';
  const meshHot = hot ? hotMesh(mesh) : mesh;
  const wc = wCases[0] ?? null;
  const wName = wc?.id ?? '';
  const wLoads = wc ? weightLoads(sys, wc) : { F: new Float64Array(sys.n), elemEq: null };
  const solve = (m, loads, name, guess, guessFriction) => {
    const r = solveContactState({ mesh: m, shear, loads, contacts, baseSprings, guess, guessFriction, name });
    if (wc) applyPreload(r.supportLoads, mesh);
    return r;
  };

  const cases = new Map();
  const states = [];
  // état froid : poids seul
  const cold = solve(mesh, wLoads, wName || 'montage');
  states.push({ name: wName || 'montage', iterations: cold.iterations, contacts: cold.states, friction: cold.friction });
  if (wc) cases.set(wc.id, { signed: true, u: cold.u, elemForces: cold.elemForces, supportLoads: cold.supportLoads, info: { nonlinear: true, iterations: cold.iterations } });

  // états de service : poids + dilatation, et poids seul au même module pour l'étendue
  let hotW = null;
  for (const tc of tCases) {
    const tl = thermalLoads(meshHot, model, tc);
    const name = `${wName}${wName ? '+' : ''}${tc.id}`;
    const service = solve(meshHot, { F: wLoads.F, elemEq: addElemEq(wLoads.elemEq, tl.elemEq), imposed: tl.imposed }, name, cold.zones);
    // même chargement que l'état froid : ses contacts et son frottement servent de départ
    hotW ??= hot ? solve(meshHot, wLoads, `${wName || 'montage'} au module à chaud`, cold.zones, cold.kf) : cold;
    states.push({ name, iterations: service.iterations, contacts: service.states, friction: service.friction });
    cases.set(tc.id, {
      signed: true,
      u: diff(service.u, hotW.u),
      elemForces: diff(service.elemForces, hotW.elemForces),
      supportLoads: diff(service.supportLoads, hotW.supportLoads),
      info: { tRef: refTemperature(model.settings), modulus: hot ? 'hot' : 'cold', nonlinear: true, iterations: service.iterations },
    });
  }
  return { cases, contacts, states };
}
