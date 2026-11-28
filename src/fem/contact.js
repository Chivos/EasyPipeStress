// Contacts des supports pour le solveur non linéaire : raideur par zones.
//
// Chaque contact agit suivant une direction `dir` au nœud du support. Le
// déplacement d de la tuyauterie le long de cette direction (déplacement imposé
// du support déduit) est découpé en quatre zones par d₁ ≤ 0 ≤ d₂, chacune avec sa
// raideur :
//     zone 1 : d < d₁        raideur k₁
//     zone 2 : d₁ ≤ d < 0    raideur k₂
//     zone 3 : 0 ≤ d < d₂    raideur k₃
//     zone 4 : d₂ ≤ d        raideur k₄
// L'effort exercé par la tuyauterie sur le support, F(d), est continu, nul en
// d = 0 et de pente k dans chaque zone : le problème reste linéaire par morceaux.
// C'est le modèle des supports non linéaires du logiciel de comparaison.
//
//   appui simple (tuyauterie posée)   d₁ = 0        k₁ rigide : n'agit que contre la descente
//   jeu de part et d'autre            d₁ = −j, d₂ = +j   k₁ = k₄ rigides, k₂ = k₃ = 0
//   butées d'un support à ressort     courses basse et haute, k₁ = k₄ rigides
//                                     (le ressort lui-même reste un ressort linéaire)
//   blocage dans les deux sens        k₁ = k₂ = k₃ = k₄ : linéaire ; contact seulement
//                                     s'il frotte (sinon il reste un ressort ordinaire)
//
// Frottement (coefficient μ du support) : un frottement par support, dans les
// directions que le support laisse libres (le plan transversal d'un appui simple,
// le seul axe du tube pour un appui guidé). La force s'oppose au déplacement de la
// tuyauterie dans ces directions ; quand le support glisse, elle vaut μ fois la
// somme des réactions de ses directions actives. Elle est produite par une raideur
// ajoutée dans les directions libres, ajustée par le solveur (fem/nonlinear.js,
// fem/friction.js) : force et déplacement sont alors colinéaires par construction.

import { rigidStiffness } from '../components/support.js';
import { vec } from '../core/linalg.js';

// Frottement : critère de convergence et raideur d'adhérence.
//  - ratio : écart relatif admis entre la force de frottement calculée et sa limite μ·Σ|R| ;
//  - kMax : raideur (N/mm) d'un support qui adhère : il ne glisse pas tant que la force
//    reste sous la limite. Valeur du logiciel de comparaison (10⁷ lb/in), pour des
//    résultats comparables en adhérence.
export const FRICTION = { ratio: 1e-6, kMax: 1.75e6 };

/**
 * Base orthonormée des directions laissées libres par des blocages de directions
 * `normals` (unitaires, quelconques) : 2 vecteurs pour une direction bloquée, 1 pour
 * deux, aucun pour trois.
 */
export function freeBasis(normals) {
  // base des directions bloquées (Gram-Schmidt)
  const q = [];
  for (const n of normals) {
    let v = [...n];
    for (const e of q) v = vec.sub(v, vec.scale(e, vec.dot(v, e)));
    if (vec.norm(v) > 1e-8) q.push(vec.unit(v));
  }
  if (q.length >= 3) return [];
  if (q.length === 2) return [vec.unit(vec.cross(q[0], q[1]))];
  if (q.length === 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const a = Math.abs(q[0][0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = vec.unit(vec.cross(q[0], a));
  return [t1, vec.cross(q[0], t1)];
}

/** Supports frottants : { support, node, mu, contacts: indices de leurs contacts }. */
export function frictionUnits(contacts) {
  const units = new Map();
  contacts.forEach((c, i) => {
    if (!(c.mu > 0)) return;
    if (!units.has(c.support)) units.set(c.support, { support: c.support, node: c.node, mu: c.mu, contacts: [] });
    units.get(c.support).contacts.push(i);
  });
  return [...units.values()];
}

/** Zone (1 à 4) du déplacement d pour le contact c. */
export function zoneOf(c, d) {
  if (d < c.d1) return 1;
  if (d < 0) return 2;
  if (d < c.d2) return 3;
  return 4;
}

/** Branche linéaire de la zone z : F(d) = k·d + f0. */
export function branch(c, z) {
  const [k1, k2, k3, k4] = c.k;
  if (z === 1) return { k: k1, f0: (k2 - k1) * c.d1 };
  if (z === 2) return { k: k2, f0: 0 };
  if (z === 3) return { k: k3, f0: 0 };
  return { k: k4, f0: (k3 - k4) * c.d2 };
}

/** Effort de la tuyauterie sur le support pour le déplacement d (linéaire par morceaux, continu). */
export function contactForce(c, d) {
  const { k, f0 } = branch(c, zoneOf(c, d));
  return k * d + f0;
}

/**
 * Contacts du maillage et ressorts qui restent linéaires en statique.
 * @returns {{ contacts: object[], baseSprings: object[] }}
 *   contacts : { kind: 'rest' | 'gap' | 'stop' | 'fixed', support, node, dir, d1, d2, k: [k1..k4], zone0, mu }
 *     mu : coefficient de frottement du contact (0 = sans frottement)
 *   baseSprings : ressorts du système statique hors contacts
 */
export function buildContacts(mesh) {
  const contacts = [];
  const baseSprings = [];
  for (const s of mesh.springs) {
    const mu = mesh.supports[s.support]?.mu > 0 ? mesh.supports[s.support].mu : 0;
    if (s.rot) {
      if (!s.dynamicOnly) baseSprings.push(s);
    } else if (s.bearing) {
      // tuyauterie posée : l'appui ne retient pas vers le haut ; supposé en contact au départ
      contacts.push({ kind: 'rest', support: s.support, node: s.node, dir: s.dir, d1: 0, d2: Infinity, k: [s.k, 0, 0, 0], zone0: 1, mu });
    } else if (s.gap > 0) {
      // jeu de part et d'autre de la position de montage ; supposé ouvert au départ
      contacts.push({ kind: 'gap', support: s.support, node: s.node, dir: s.dir, d1: -s.gap, d2: s.gap, k: [s.k, 0, 0, s.k], zone0: 3, mu });
    } else if (!s.dynamicOnly) {
      // blocage dans les deux sens : ressort ordinaire, sauf s'il frotte (sa réaction donne la force de frottement)
      if (mu > 0) contacts.push({ kind: 'fixed', support: s.support, node: s.node, dir: s.dir, d1: 0, d2: 0, k: [s.k, s.k, s.k, s.k], zone0: 4, mu });
      else baseSprings.push(s);
    }
    // dispositifs auto-bloquants (dynamicOnly sans jeu) : libres en statique
  }
  mesh.supports.forEach((sup, k) => {
    if (sup.travelUp == null && sup.travelDown == null) return;
    // butées rigides aux fins de course d'un support variable ou constant
    const ks = rigidStiffness(mesh.nodeElems?.[sup.node]).kt;
    contacts.push({ kind: 'stop', support: k, node: sup.node, dir: sup.dir ?? mesh.up, d1: sup.travelDown != null ? -sup.travelDown : -Infinity, d2: sup.travelUp != null ? sup.travelUp : Infinity, k: [ks, 0, 0, ks], zone0: 3, mu: 0 });
  });
  return { contacts, baseSprings };
}

/** État d'un contact d'après sa zone : appui en contact ou décollé, jeu ouvert ou fermé, butée libre ou atteinte, blocage actif. */
export function contactStatus(c, zone) {
  if (c.kind === 'fixed') return 'held';
  if (c.kind === 'rest') return zone === 1 ? 'contact' : 'lifted';
  if (c.kind === 'gap') return zone === 1 ? 'closedMinus' : zone === 4 ? 'closedPlus' : 'open';
  return zone === 1 ? 'stopLow' : zone === 4 ? 'stopHigh' : 'free';
}
