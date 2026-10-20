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
