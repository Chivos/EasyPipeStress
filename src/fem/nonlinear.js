// Résolution statique non linéaire : supports à raideur par zones (contact.js).
//
// À chaque itération, une zone est supposée pour chaque contact ; le problème est
// alors linéaire (raideur de la zone, plus un terme de charge qui assure la
// continuité de l'effort) et se résout avec le système éléments finis ordinaire.
// Les hypothèses sont ensuite contrôlées : un contact est cohérent si l'effort de
// la branche supposée est celui de la loi par morceaux au déplacement calculé.
// Les zones fausses sont corrigées et le calcul repris, jusqu'à cohérence de tous
// les contacts ou échec explicite (nombre maximal d'itérations, cycle, tuyauterie
// qui n'est plus retenue). Aucun résultat non convergé n'est rendu.

import { FeSystem } from './system.js';
import { zoneOf, branch, contactForce, contactStatus } from './contact.js';

export class NonlinearError extends Error {}

const dot3 = (v, o, d) => v[o] * d[0] + v[o + 1] * d[1] + v[o + 2] * d[2];

/**
 * @param mesh maillage (éléments au module voulu)
 * @param loads { F, elemEq, imposed } comme FeSystem.solveStatic
 * @param contacts, baseSprings : voir buildContacts
 * @param guess zones de départ (une par contact) ; à défaut la zone initiale de chaque contact
 * @returns { u, elemForces, supportLoads, zones, iterations, states }
 *   states[i] = { zone, status, d, force } pour chaque contact
 */
export function solveContactState({ mesh, shear = true, loads, contacts, baseSprings, guess = null, maxIter = 60, name = '' }) {
  const n = mesh.nodes.length * 6;
  let zones = contacts.map((c, i) => guess?.[i] ?? c.zone0);
  const seen = new Set();
  let single = false; // après un cycle : une seule correction par itération (contact le plus en défaut)
  const where = name ? ` (état ${name})` : '';
  const label = (c) => mesh.supports[c.support]?.label ?? `nœud ${mesh.nodes[c.node]?.label}`;

  for (let iter = 1; iter <= maxIter; iter++) {
    // ressorts actifs et terme de charge des contacts dans leur zone supposée
    const springs = [...baseSprings];
    const F = loads.F ? Float64Array.from(loads.F) : new Float64Array(n);
    const br = contacts.map((c, i) => branch(c, zones[i]));
    contacts.forEach((c, i) => {
      const { k, f0 } = br[i];
      if (k > 0) springs.push({ node: c.node, rot: false, dir: c.dir, k, support: c.support });
      if (f0) for (let a = 0; a < 3; a++) F[c.node * 6 + a] -= f0 * c.dir[a];
    });
    let sys;
    try {
      sys = new FeSystem({ ...mesh, springs }, { shear });
    } catch (err) {
      const open = contacts.filter((c, i) => br[i].k === 0).map(label);
      throw new NonlinearError(
        `Calcul non linéaire${where} : la tuyauterie n'est plus retenue${open.length ? ` quand ces supports n'agissent pas : ${[...new Set(open)].join(', ')}` : ''}. ${err.message}`,
      );
    }
    const r = sys.solveStatic({ F, elemEq: loads.elemEq ?? null, imposed: loads.imposed ?? null });

    // contrôle des hypothèses : écart entre l'effort de la branche supposée et celui de la loi
    const disp = contacts.map((c) => {
      const imp = loads.imposed?.get(c.support);
      return dot3(r.u, c.node * 6, c.dir) - (imp ? imp[0] * c.dir[0] + imp[1] * c.dir[1] + imp[2] * c.dir[2] : 0);
    });
    const assumed = contacts.map((c, i) => br[i].k * disp[i] + br[i].f0);
    const actual = contacts.map((c, i) => contactForce(c, disp[i]));
    const scale = Math.max(1, ...actual.map(Math.abs), ...assumed.map(Math.abs));
    const tol = Math.max(1e-3, 1e-9 * scale);
    const errs = contacts.map((c, i) => Math.abs(assumed[i] - actual[i]));
    const wrong = errs.map((e, i) => (e > tol ? i : -1)).filter((i) => i >= 0);

    if (!wrong.length) {
      // l'effort des contacts actifs calculé par le système ne compte pas le terme f0 : rétabli ici
      contacts.forEach((c, i) => {
        if (br[i].f0) for (let a = 0; a < 3; a++) r.supportLoads[c.support * 6 + a] += br[i].f0 * c.dir[a];
      });
      return {
        u: r.u,
        elemForces: r.elemForces,
        supportLoads: r.supportLoads,
        zones,
        iterations: iter,
        states: contacts.map((c, i) => ({ zone: zones[i], status: contactStatus(c, zones[i]), d: disp[i], force: assumed[i] })),
      };
    }

    // correction : toutes les zones fausses, ou la plus en défaut après un cycle
    const key = zones.join('');
    if (seen.has(key)) {
      if (single) throw new NonlinearError(`Calcul non linéaire${where} : l'état des contacts ne se stabilise pas (cycle après ${iter} itérations). Supports concernés : ${[...new Set(wrong.map((i) => label(contacts[i])))].join(', ')}.`);
      single = true;
      seen.clear();
    }
    seen.add(key);
    const next = zones.slice();
    const fix = single ? [wrong.reduce((a, b) => (errs[b] > errs[a] ? b : a))] : wrong;
    for (const i of fix) next[i] = zoneOf(contacts[i], disp[i]);
    zones = next;
  }
  throw new NonlinearError(`Calcul non linéaire${where} : pas de convergence de l'état des contacts en ${maxIter} itérations.`);
}
