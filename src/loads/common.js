// Outils partagés par les types de chargement.

import { rotateToLocal, uniformLoadEquivalent } from '../fem/beam3d.js';
import { localResponses } from '../core/frames.js';

/**
 * Charges dues à un champ d'accélération uniforme a (mm/s², repère global) :
 * charge répartie m·a sur chaque élément et forces m·a aux masses ponctuelles.
 * @param parts quelles masses linéiques prendre en compte { metal, fluid, insul }
 */
export function bodyForceLoads(sys, a, parts = { metal: true, fluid: true, insul: true }) {
  const { mesh, n } = sys;
  const F = new Float64Array(n);
  const elemEq = mesh.elements.map((e) => {
    const mpl = (parts.metal ? e.mpl.metal : 0) + (parts.fluid ? e.mpl.fluid : 0) + (parts.insul ? e.mpl.insul : 0);
    // la masse portée par la longueur d'arc est répartie sur la corde
    const w = (mpl * e.massLength) / e.L;
    const qg = [w * a[0], w * a[1], w * a[2]];
    return uniformLoadEquivalent(rotateToLocal(qg, e.R), e.L);
  });
  if (parts.points !== false) {
    for (const pm of mesh.pointMasses) for (let d = 0; d < 3; d++) F[pm.node * 6 + d] += pm.m * a[d];
  }
  return { F, elemEq };
}

/** Concatène les réponses en un seul vecteur (pour les combinaisons). */
/**
 * Réponse sous forme d'un vecteur unique (combinaisons modales et directionnelles).
 * Avec `sys`, les déplacements et efforts sur supports projetés dans les repères
 * locaux des nœuds sont ajoutés : la projection étant linéaire, elle est faite
 * avant la combinaison (mode par mode), seule manière correcte d'obtenir les
 * valeurs enveloppes d'un séisme dans un autre repère.
 */
export function pack(r, sys = null) {
  const loc = sys ? localResponses(r, sys.mesh) : null;
  const parts = [r.u, r.elemForces, r.supportLoads, ...(loc ? [loc.uLocal, loc.supportLoadsLocal] : [])];
  const out = new Float64Array(parts.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of parts) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

export function unpack(v, sys) {
  const n = sys.n;
  const ne = sys.mesh.elements.length * 12;
  const ns = sys.mesh.supports.length * 6;
  const out = {
    u: v.slice(0, n),
    elemForces: v.slice(n, n + ne),
    supportLoads: v.slice(n + ne, n + ne + ns),
  };
  if (v.length > n + ne + ns) {
    out.uLocal = v.slice(n + ne + ns, 2 * n + ne + ns);
    out.supportLoadsLocal = v.slice(2 * n + ne + ns);
  }
  return out;
}

export function emptyResponse(sys) {
  return {
    u: new Float64Array(sys.n),
    elemForces: new Float64Array(sys.mesh.elements.length * 12),
    supportLoads: new Float64Array(sys.mesh.supports.length * 6),
  };
}
