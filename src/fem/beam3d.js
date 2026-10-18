// Élément de poutre 3D à 2 nœuds et 12 DDL (Timoshenko, Przemieniecki 1968).
// Ordre des DDL par nœud : ux, uy, uz, θx, θy, θz.
// Repère local : x suivant l'axe du tube ; y et z dans le plan de section.

import { vec } from '../core/linalg.js';

/**
 * Repère local de l'élément. R est la matrice 3×3 (ligne majeure) dont les lignes
 * sont les vecteurs unitaires x, y, z locaux exprimés dans le repère global.
 */
export function elementFrame(p1, p2, up) {
  const d = vec.sub(p2, p1);
  const L = vec.norm(d);
  if (!(L > 1e-9)) throw new Error('Élément de longueur nulle');
  const x = vec.scale(d, 1 / L);
  let ref = up;
  if (Math.abs(vec.dot(x, ref)) > 0.999) ref = Math.abs(x[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const y = vec.unit(vec.sub(ref, vec.scale(x, vec.dot(ref, x))));
  const z = vec.cross(x, y);
  return { L, R: [...x, ...y, ...z] };
}

/**
 * Matrice de raideur locale 12×12.
 * @param p { E, G, A, Iy, Iz, J, L, Asy, Asz } — As = 0 néglige le cisaillement.
 */
export function localStiffness({ E, G, A, Iy, Iz, J, L, Asy = 0, Asz = 0 }) {
  const k = new Float64Array(144);
  const set = (i, j, v) => {
    k[i * 12 + j] += v;
    if (i !== j) k[j * 12 + i] += v;
  };
  const EA = (E * A) / L;
  set(0, 0, EA);
  set(0, 6, -EA);
  set(6, 6, EA);
  const GJ = (G * J) / L;
  set(3, 3, GJ);
  set(3, 9, -GJ);
  set(9, 9, GJ);
  // Flexion dans le plan xy (v, θz) : inertie Iz
  {
    const phi = Asy > 0 ? (12 * E * Iz) / (G * Asy * L * L) : 0;
    const c = (E * Iz) / ((1 + phi) * L ** 3);
    set(1, 1, 12 * c);
    set(1, 5, 6 * L * c);
    set(1, 7, -12 * c);
    set(1, 11, 6 * L * c);
    set(5, 5, (4 + phi) * L * L * c);
    set(5, 7, -6 * L * c);
    set(5, 11, (2 - phi) * L * L * c);
    set(7, 7, 12 * c);
    set(7, 11, -6 * L * c);
    set(11, 11, (4 + phi) * L * L * c);
  }
  // Flexion dans le plan xz (w, θy) : inertie Iy
  {
    const phi = Asz > 0 ? (12 * E * Iy) / (G * Asz * L * L) : 0;
    const c = (E * Iy) / ((1 + phi) * L ** 3);
    set(2, 2, 12 * c);
    set(2, 4, -6 * L * c);
    set(2, 8, -12 * c);
    set(2, 10, -6 * L * c);
    set(4, 4, (4 + phi) * L * L * c);
    set(4, 8, 6 * L * c);
    set(4, 10, (2 - phi) * L * L * c);
    set(8, 8, 12 * c);
    set(8, 10, 6 * L * c);
    set(10, 10, (4 + phi) * L * L * c);
  }
  return k;
}

/** k_global = Tᵀ · k_local · T, avec T = diag(R, R, R, R). */
export function toGlobalMatrix(kl, R) {
  const kg = new Float64Array(144);
  for (let bi = 0; bi < 4; bi++) {
    for (let bj = 0; bj < 4; bj++) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          let s = 0;
          for (let p = 0; p < 3; p++) {
            const rpa = R[p * 3 + a];
            if (rpa === 0) continue;
            for (let q = 0; q < 3; q++) s += rpa * kl[(bi * 3 + p) * 12 + bj * 3 + q] * R[q * 3 + b];
          }
          kg[(bi * 3 + a) * 12 + bj * 3 + b] = s;
        }
      }
    }
  }
  return kg;
}

/** v_local = T · v_global (vecteur de 12). */
export function toLocalVector(vg, R) {
  const vl = new Float64Array(12);
  for (let b = 0; b < 4; b++) {
    for (let p = 0; p < 3; p++) {
      vl[b * 3 + p] = R[p * 3] * vg[b * 3] + R[p * 3 + 1] * vg[b * 3 + 1] + R[p * 3 + 2] * vg[b * 3 + 2];
    }
  }
  return vl;
}

/** v_global = Tᵀ · v_local (vecteur de 12). */
export function toGlobalVector(vl, R) {
  const vg = new Float64Array(12);
  for (let b = 0; b < 4; b++) {
    for (let a = 0; a < 3; a++) {
      vg[b * 3 + a] = R[a] * vl[b * 3] + R[3 + a] * vl[b * 3 + 1] + R[6 + a] * vl[b * 3 + 2];
    }
  }
  return vg;
}

/** Rotation d'un vecteur 3 du repère global au repère local. */
export function rotateToLocal(v, R) {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}

/**
 * Forces nodales équivalentes (repère local) d'une charge répartie uniforme
 * q = (qx, qy, qz) en N/mm, exprimée en repère local.
 */
export function uniformLoadEquivalent(q, L) {
  const f = new Float64Array(12);
  const [qx, qy, qz] = q;
  f[0] = (qx * L) / 2;
  f[6] = (qx * L) / 2;
  f[1] = (qy * L) / 2;
  f[7] = (qy * L) / 2;
  f[5] = (qy * L * L) / 12;
  f[11] = (-qy * L * L) / 12;
  f[2] = (qz * L) / 2;
  f[8] = (qz * L) / 2;
  f[4] = (-qz * L * L) / 12;
  f[10] = (qz * L * L) / 12;
  return f;
}

/** Forces nodales équivalentes (repère local) d'une déformation axiale libre ε. */
export function axialStrainEquivalent(E, A, eps) {
  const f = new Float64Array(12);
  f[0] = -E * A * eps;
  f[6] = E * A * eps;
  return f;
}
