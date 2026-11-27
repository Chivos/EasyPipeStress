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

import { rigidStiffness } from '../components/support.js';

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
 *   contacts : { kind: 'rest' | 'gap' | 'stop', support, node, dir, d1, d2, k: [k1..k4], zone0 }
 *   baseSprings : ressorts du système statique hors appuis simples (devenus des contacts)
 */
export function buildContacts(mesh) {
  const contacts = [];
  const baseSprings = [];
  for (const s of mesh.springs) {
    if (s.rot) {
      if (!s.dynamicOnly) baseSprings.push(s);
    } else if (s.bearing) {
      // tuyauterie posée : l'appui ne retient pas vers le haut ; supposé en contact au départ
      contacts.push({ kind: 'rest', support: s.support, node: s.node, dir: s.dir, d1: 0, d2: Infinity, k: [s.k, 0, 0, 0], zone0: 1 });
    } else if (s.gap > 0) {
      // jeu de part et d'autre de la position de montage ; supposé ouvert au départ
      contacts.push({ kind: 'gap', support: s.support, node: s.node, dir: s.dir, d1: -s.gap, d2: s.gap, k: [s.k, 0, 0, s.k], zone0: 3 });
    } else if (!s.dynamicOnly) {
      baseSprings.push(s);
    }
    // dispositifs auto-bloquants (dynamicOnly sans jeu) : libres en statique
  }
  mesh.supports.forEach((sup, k) => {
    if (sup.travelUp == null && sup.travelDown == null) return;
    // butées rigides aux fins de course d'un support variable ou constant
    const ks = rigidStiffness(mesh.nodeElems?.[sup.node]).kt;
    contacts.push({ kind: 'stop', support: k, node: sup.node, dir: sup.dir ?? mesh.up, d1: sup.travelDown != null ? -sup.travelDown : -Infinity, d2: sup.travelUp != null ? sup.travelUp : Infinity, k: [ks, 0, 0, ks], zone0: 3 });
  });
  return { contacts, baseSprings };
}

/** État d'un contact d'après sa zone : appui en contact ou décollé, jeu ouvert ou fermé, butée libre ou atteinte. */
export function contactStatus(c, zone) {
  if (c.kind === 'rest') return zone === 1 ? 'contact' : 'lifted';
  if (c.kind === 'gap') return zone === 1 ? 'closedMinus' : zone === 4 ? 'closedPlus' : 'open';
  return zone === 1 ? 'stopLow' : zone === 4 ? 'stopHigh' : 'free';
}
