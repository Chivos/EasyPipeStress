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
//
// Frottement : une seconde hypothèse par support frottant, la raideur k_f ajoutée
// dans les directions qu'il laisse libres. La force de frottement calculée vaut
// k_f·δ (δ : déplacement de la tuyauterie dans ces directions depuis la position
// de montage) ; elle doit égaler la limite μ·Σ|R| si le support glisse, ou rester
// en dessous avec k_f à son plafond s'il adhère. Quand les zones sont cohérentes
// mais pas le frottement, les raideurs k_f sont recalculées par une résolution
// condensée aux nœuds frottants (fem/friction.js), puis contrôlées par le calcul
// complet suivant.

import { FeSystem } from './system.js';
import { zoneOf, branch, contactForce, contactStatus, frictionUnits, freeBasis, FRICTION } from './contact.js';
import { solveFriction } from './friction.js';

export class NonlinearError extends Error {}

const dot3 = (v, o, d) => v[o] * d[0] + v[o + 1] * d[1] + v[o + 2] * d[2];

/**
 * @param mesh maillage (éléments au module voulu)
 * @param loads { F, elemEq, imposed } comme FeSystem.solveStatic
 * @param contacts, baseSprings : voir buildContacts
 * @param guess zones de départ (une par contact) ; à défaut la zone initiale de chaque contact
 * @param guessFriction raideurs de frottement de départ (une par support frottant) ; à défaut 0 (calcul sans frottement d'abord)
 * @param trace tableau facultatif, rempli d'un compte rendu par itération (mise au point)
 * @returns { u, elemForces, supportLoads, zones, kf, iterations, states, friction }
 *   states[i] = { zone, status, d, force } pour chaque contact ;
 *   friction[j] = { support, mu, active, slip, force, limit, delta, dir, k } pour chaque support frottant :
 *   force exercée par la tuyauterie sur le support (N), limite μ·Σ|R|, déplacement δ dans les directions libres (mm)
 */
export function solveContactState({ mesh, shear = true, loads, contacts, baseSprings, guess = null, guessFriction = null, maxIter = null, name = '', trace = null }) {
  const n = mesh.nodes.length * 6;
  const units = frictionUnits(contacts);
  const rubbing = units.length > 0;
  maxIter ??= rubbing ? 200 : 60;
  const { ratio: E1, kMax: KM } = FRICTION;
  let zones = contacts.map((c, i) => guess?.[i] ?? c.zone0);
  let kf = units.map((un, j) => Math.min(KM, Math.max(0, guessFriction?.[j] ?? 0)));
  let rounds = 0; // résolutions du frottement de suite, sans changement de zone
  const seen = new Set();
  let single = false; // après un cycle : une seule correction par itération (contact le plus en défaut)
  const where = name ? ` (état ${name})` : '';
  const label = (c) => mesh.supports[c.support]?.label ?? `nœud ${mesh.nodes[c.node]?.label}`;
  /** Contacts actifs d'un support frottant dans les zones z, et directions qu'ils laissent libres. */
  const freedom = (un, z) => {
    const act = un.contacts.filter((i) => branch(contacts[i], z[i]).k > 0);
    return { act, free: act.length ? freeBasis(act.map((i) => contacts[i].dir)) : [] };
  };

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
    // frottement : raideur supposée dans les directions libres de chaque support frottant en contact
    const fdm = units.map((un) => freedom(un, zones));
    units.forEach((un, j) => {
      if (kf[j] > 0) for (const e of fdm[j].free) springs.push({ node: un.node, rot: false, dir: e, k: kf[j], support: un.support });
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

    // frottement : force calculée k_f·δ comparée à la limite μ·Σ|R|
    const fr = units.map((un, j) => {
      const { act, free } = fdm[j];
      const imp = loads.imposed?.get(un.support) ?? [0, 0, 0];
      const rel = [0, 1, 2].map((a) => r.u[un.node * 6 + a] - imp[a]);
      const t = [0, 0, 0];
      for (const e of free) {
        const p = rel[0] * e[0] + rel[1] * e[1] + rel[2] * e[2];
        for (let a = 0; a < 3; a++) t[a] += p * e[a];
      }
      const delta = Math.hypot(t[0], t[1], t[2]);
      const active = act.length > 0 && free.length > 0;
      const limit = active ? un.mu * act.reduce((s, i) => s + Math.abs(assumed[i]), 0) : 0;
      const force = active ? kf[j] * delta : 0;
      // cohérent : support inactif, force à la limite (glissement), ou adhérence (raideur au plafond, force sous la limite)
      const ok = !active || Math.abs(force - limit) <= tol || (limit > 0 && Math.abs(force / limit - 1) <= E1) || (kf[j] >= KM && force <= limit);
      return { t, delta, active, limit, force, ok, imp };
    });
    const sliding = fr.map((f, j) => (f.ok ? -1 : j)).filter((j) => j >= 0);
    trace?.push({ iter, zones: zones.slice(), kf: kf.slice(), wrong, friction: fr.map((f) => ({ ...f })) });

    if (!wrong.length && !sliding.length) {
      // l'effort des contacts actifs calculé par le système ne compte pas le terme f0 : rétabli ici
      contacts.forEach((c, i) => {
        if (br[i].f0) for (let a = 0; a < 3; a++) r.supportLoads[c.support * 6 + a] += br[i].f0 * c.dir[a];
      });
      return {
        u: r.u,
        elemForces: r.elemForces,
        supportLoads: r.supportLoads,
        zones,
        kf: kf.map((k, j) => (fr[j].active ? k : 0)),
        iterations: iter,
        states: contacts.map((c, i) => ({ zone: zones[i], status: contactStatus(c, zones[i]), d: disp[i], force: assumed[i] })),
        friction: units.map((un, j) => {
          const f = fr[j];
          return { support: un.support, mu: un.mu, active: f.active, slip: f.active && kf[j] < KM, force: f.force, limit: f.limit, delta: f.delta, dir: f.delta > 0 ? f.t.map((v) => v / f.delta) : [0, 0, 0], k: f.active ? kf[j] : 0 };
        }),
      };
    }

    if (!wrong.length) {
      // zones cohérentes, frottement à corriger : résolution condensée aux nœuds frottants
      const named = () => [...new Set(sliding.map((j) => mesh.supports[units[j].support]?.label ?? `nœud ${mesh.nodes[units[j].node]?.label}`))].join(', ');
      const active = units
        .map((un, j) => ({ index: j, node: un.node, mu: un.mu, x0: kf[j], free: fdm[j].free, imp: fr[j].imp, normals: fdm[j].act.map((i) => ({ n: contacts[i].dir, k: br[i].k, f0: br[i].f0 })) }))
        .filter((un, j) => fr[j].active);
      const solved = ++rounds <= 6 ? solveFriction({ sys, u: r.u, units: active }) : null;
      if (!solved) throw new NonlinearError(`Calcul non linéaire${where} : le frottement ne converge pas. Supports concernés : ${named()}.`);
      kf = kf.map((k, j) => solved.get(j) ?? 0);
      continue;
    }
    // correction : toutes les zones fausses, ou la plus en défaut après un cycle
    const key = rubbing ? `${zones.join('')}|${kf.map((k) => k.toPrecision(3)).join(',')}` : zones.join('');
    if (seen.has(key)) {
      if (single) throw new NonlinearError(`Calcul non linéaire${where} : l'état des contacts ne se stabilise pas (cycle après ${iter} itérations). Supports concernés : ${[...new Set(wrong.map((i) => label(contacts[i])))].join(', ')}.`);
      single = true;
      seen.clear();
    }
    seen.add(key);
    const next = zones.slice();
    const fix = single ? [wrong.reduce((a, b) => (errs[b] > errs[a] ? b : a))] : wrong;
    for (const i of fix) next[i] = zoneOf(contacts[i], disp[i]);
    // frottement : la raideur supposée est gardée tant que le support agit (elle sera corrigée une fois
    // les zones cohérentes) ; nulle pour un support qui n'agit plus ou qui vient d'agir
    kf = kf.map((k, j) => (fr[j].active && freedom(units[j], next).act.length ? k : 0));
    rounds = 0;
    zones = next;
  }
  if (rubbing) {
    throw new NonlinearError(`Calcul non linéaire${where} : pas de convergence de l'état des contacts et du frottement en ${maxIter} itérations. Supports à frottement : ${[...new Set(contacts.filter((c) => c.mu > 0).map(label))].join(', ')}.`);
  }
  throw new NonlinearError(`Calcul non linéaire${where} : pas de convergence de l'état des contacts en ${maxIter} itérations.`);
}
