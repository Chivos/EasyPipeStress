// Repères locaux de résultats (U, V, W) aux nœuds, pour présenter efforts sur
// supports et déplacements suivant l'orientation de la tuyauterie :
//  - W : axe de l'élément de référence du nœud, même orientation que lui ;
//  - W non vertical : V dans le plan (W, verticale), d'angle minimal avec la
//    verticale du projet (V = verticale projetée orthogonalement à W) ;
//  - W vertical : U = premier axe global horizontal (X, ou Y si X est vertical) ;
//  - troisième axe par la règle de la main droite (U × V = W).
// Pour une tuyauterie horizontale suivant +X avec Z vertical : U = +Y, V = +Z, W = +X.
// Élément de référence d'un nœud : de préférence un tube droit (pas une corde de
// coude, ni un robinet), celui qui arrive au nœud, sinon celui qui en part.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const n = Math.hypot(...a);
  return a.map((v) => v / n);
};

/** Axes U, V, W pour une direction d'élément w (unitaire) et une verticale up. */
export function localAxes(w, up) {
  let U;
  let V;
  if (Math.abs(dot(w, up)) > 1 - 1e-9) {
    U = up[0] === 1 ? [0, 1, 0] : [1, 0, 0];
    V = cross(w, U);
  } else {
    V = unit(up.map((u, i) => u - dot(up, w) * w[i]));
    U = cross(V, w);
  }
  return { U, V, W: [...w] };
}

/** Repère de résultats de chaque nœud : { U, V, W, elem } (null si nœud isolé). */
export function nodeFrames(mesh) {
  const rank = (e) => (e.kind === 'valve' ? 2 : e.bend ? 1 : 0);
  return mesh.nodes.map((_, i) => {
    const list = (mesh.nodeElems?.[i] ?? mesh.elements.filter((e) => e.n1 === i || e.n2 === i)).slice();
    if (!list.length) return null;
    list.sort((a, b) => rank(a) - rank(b) || (b.n2 === i) - (a.n2 === i) || a.index - b.index);
    const e = list[0];
    return { ...localAxes(e.R.slice(0, 3), mesh.up), elem: e.index };
  });
}

/** Projection d'un vecteur nodal (6 DDL par nœud, global) dans les repères des nœuds. */
export function nodalToLocal(v, frames, nodeOf = (k) => k) {
  const out = new Float64Array(v.length);
  for (let k = 0; k < v.length / 6; k++) {
    const f = frames[nodeOf(k)];
    for (let b = 0; b < 6; b += 3) {
      const g = [v[k * 6 + b], v[k * 6 + b + 1], v[k * 6 + b + 2]];
      if (!f) out.set(g, k * 6 + b);
      else out.set([dot(f.U, g), dot(f.V, g), dot(f.W, g)], k * 6 + b);
    }
  }
  return out;
}

/** Déplacements et efforts sur supports dans les repères locaux des nœuds. */
export function localResponses(r, mesh) {
  const frames = mesh.frames ?? (mesh.frames = nodeFrames(mesh));
  return {
    uLocal: nodalToLocal(r.u, frames),
    supportLoadsLocal: nodalToLocal(r.supportLoads, frames, (k) => mesh.supports[k].node),
  };
}

/**
 * Normale (unitaire, repère global) au plan du composant à une extrémité
 * d'élément : té au nœud s'il gouverne (même règle que le choix du facteur i),
 * sinon plan du coude ; null pour un tube droit hors jonction.
 */
export function endPlane(e, end) {
  const local = e.endFactors?.[end];
  if (local?.plane && local.i >= e.factors.i) return local.plane;
  const n = e.bend?.normal;
  if (n) {
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l > 1e-12) return [n[0] / l, n[1] / l, n[2] / l];
  }
  return local?.plane ?? null;
}

/**
 * Moments de flexion dans le plan (Mi) et hors plan (Mo) du composant aux deux
 * extrémités de chaque élément : [Mi₁, Mo₁, Mi₂, Mo₂] par élément (N·mm). Mi est
 * le moment porté par la normale au plan (coude, té). Sans plan défini (tube
 * droit), les deux flexions locales My, Mz sont reprises telles quelles. La
 * projection est linéaire : pour un séisme, elle est faite mode par mode avant
 * les combinaisons (src/loads/common.js).
 */
export function planeMoments(elemForces, mesh) {
  const proj = mesh.planeProj ?? (mesh.planeProj = mesh.elements.map((e) => [0, 1].map((end) => {
    const n = endPlane(e, end);
    if (!n) return [1, 0];
    const ny = dot(e.R.slice(3, 6), n);
    const nz = dot(e.R.slice(6, 9), n);
    const l = Math.hypot(ny, nz);
    return l > 1e-9 ? [ny / l, nz / l] : [1, 0];
  })));
  const out = new Float64Array(mesh.elements.length * 4);
  for (let ie = 0; ie < mesh.elements.length; ie++) {
    for (const end of [0, 1]) {
      const o = ie * 12 + (end === 0 ? 3 : 9);
      const [cy, cz] = proj[ie][end];
      const my = elemForces[o + 1];
      const mz = elemForces[o + 2];
      out[ie * 4 + end * 2] = my * cy + mz * cz;
      out[ie * 4 + end * 2 + 1] = -my * cz + mz * cy;
    }
  }
  return out;
}

/**
 * Axe de la tuyauterie au nœud `node` (vecteur unitaire) : moyenne des axes des
 * éléments qui y aboutissent. À une jonction (té), seul le collecteur compte —
 * les deux éléments les plus alignés — pour que « axial » et « latéral » ne
 * soient pas faussés par le piquage.
 */
export function pipeAxisAtNode(elems, node) {
  let list = elems ?? [];
  if (list.length >= 3) {
    const out = list.map((e) => (e.n1 === node ? e.R.slice(0, 3) : e.R.slice(0, 3).map((v) => -v)));
    let best = null;
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) if (!best || dot(out[a], out[b]) < best.d) best = { a, b, d: dot(out[a], out[b]) };
    list = [list[best.a], list[best.b]];
  }
  let a = [0, 0, 0];
  for (const e of list) {
    let x = e.R.slice(0, 3);
    if (dot(x, a) < 0) x = x.map((v) => -v);
    a = [a[0] + x[0], a[1] + x[1], a[2] + x[2]];
  }
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0];
}
