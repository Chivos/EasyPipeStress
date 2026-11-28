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
// Poids dans la configuration de service : quand l'état des contacts d'un état de
// service diffère de celui de l'état froid (appui décollé, jeu fermé, butée
// atteinte), le poids est recalculé sur la tuyauterie dont les contacts sont figés
// dans cet état, effets thermiques exclus. Ces cas supplémentaires servent à
// vérifier les équations du code dans chaque configuration de supportage
// (ASME B31.3, annexe S, exemple 2 ; docs/THEORIE.md, § 7.3).
// Le séisme n'est pas concerné : il reste calculé sur le système linéaire, tous
// supports actifs (docs/THEORIE.md, § 7).

import { buildContacts, branch } from './fem/contact.js';
import { solveContactState } from './fem/nonlinear.js';
import { FeSystem } from './fem/system.js';
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
 * @returns { cases: Map<idCas, résultat>, contacts, states, configurations, warnings }
 *   states : [{ name, iterations, contacts: [{ zone, status, d, force }], friction: [...] }] pour
 *   l'état froid puis chaque état de service (friction : un élément par support frottant) ;
 *   configurations : poids recalculé dans chaque configuration de supportage de service qui
 *   diffère de l'état froid : [{ id, weight, states: [noms], thermal: [idCas], changes, u,
 *   elemForces, supportLoads }], changes = [{ contact, from, to }] (états d'un contact, à froid
 *   et en service).
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
  const services = [];
  for (const tc of tCases) {
    const tl = thermalLoads(meshHot, model, tc);
    const name = `${wName}${wName ? '+' : ''}${tc.id}`;
    const service = solve(meshHot, { F: wLoads.F, elemEq: addElemEq(wLoads.elemEq, tl.elemEq), imposed: tl.imposed }, name, cold.zones);
    // même chargement que l'état froid : ses contacts et son frottement servent de départ
    hotW ??= hot ? solve(meshHot, wLoads, `${wName || 'montage'} au module à chaud`, cold.zones, cold.kf) : cold;
    states.push({ name, iterations: service.iterations, contacts: service.states, friction: service.friction });
    services.push({ name, tc, zones: service.zones, states: service.states });
    cases.set(tc.id, {
      signed: true,
      u: diff(service.u, hotW.u),
      elemForces: diff(service.elemForces, hotW.elemForces),
      supportLoads: diff(service.supportLoads, hotW.supportLoads),
      info: { tRef: refTemperature(model.settings), modulus: hot ? 'hot' : 'cold', nonlinear: true, iterations: service.iterations },
    });
  }

  // poids dans les configurations de service qui diffèrent de l'état froid
  const configurations = [];
  const warnings = [];
  if (wc && contacts.length) {
    /** Raideur active de chaque contact dans des zones données : c'est la configuration de supportage. */
    const signature = (zones) => contacts.map((c, i) => branch(c, zones[i]).k);
    const ref = signature(cold.zones);
    const groups = new Map();
    for (const sv of services) {
      const sig = signature(sv.zones);
      if (sig.every((k, i) => k === ref[i])) continue;
      const key = sig.join(',');
      if (!groups.has(key)) groups.set(key, { sig, list: [] });
      groups.get(key).list.push(sv);
    }
    const label = (c) => mesh.supports[c.support]?.label ?? `nœud ${mesh.nodes[c.node]?.label}`;
    for (const { sig, list } of groups.values()) {
      const id = `${wc.id}(${list.map((sv) => sv.tc.id).join(',')})`;
      // contacts figés : un contact actif devient un blocage ordinaire dans les deux sens, un contact
      // inactif est retiré ; pas de frottement (ce n'est pas un appui pour les charges permanentes)
      const springs = [...baseSprings];
      contacts.forEach((c, i) => {
        if (sig[i] > 0) springs.push({ node: c.node, rot: false, dir: c.dir, k: sig[i], support: c.support });
      });
      let r;
      try {
        r = new FeSystem({ ...mesh, springs }, { shear }).solveStatic(wLoads);
      } catch (err) {
        warnings.push(`Poids dans la configuration de service ${list.map((sv) => sv.name).join(', ')} : la tuyauterie n'est pas retenue sans les supports inactifs dans cet état ; vérification non faite. ${err.message}`);
        continue;
      }
      applyPreload(r.supportLoads, mesh);
      const changes = contacts
        .map((c, i) => ({ contact: i, from: cold.states[i].status, to: list[0].states[i].status, moved: sig[i] !== ref[i] }))
        .filter((x) => x.moved)
        .map(({ contact, from, to }) => ({ contact, from, to }));
      // contact à un seul sens gardé actif, mais que le poids seul solliciterait dans l'autre sens
      const reversed = [];
      contacts.forEach((c, i) => {
        if (!(sig[i] > 0) || c.kind === 'fixed') return;
        const d = c.dir[0] * r.u[c.node * 6] + c.dir[1] * r.u[c.node * 6 + 1] + c.dir[2] * r.u[c.node * 6 + 2];
        const zone = list[0].zones[i];
        const f = sig[i] * d;
        if (((zone === 1 && d > 0) || (zone === 4 && d < 0)) && Math.abs(f) > 1) reversed.push(`${label(c)} (${Math.round(Math.abs(f))} N)`);
      });
      if (reversed.length) {
        warnings.push(`Poids dans la configuration de service ${id} : support(s) en contact en service, mais que le poids seul solliciterait en sens inverse — ${[...new Set(reversed)].join(', ')}. Ils sont gardés actifs dans cette vérification (contacts figés).`);
      }
      configurations.push({ id, weight: wc.id, states: list.map((sv) => sv.name), thermal: list.map((sv) => sv.tc.id), changes, u: r.u, elemForces: r.elemForces, supportLoads: r.supportLoads });
    }
  }
  return { cases, contacts, states, configurations, warnings };
}
