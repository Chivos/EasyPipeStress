// Frottement des supports : résolution condensée aux nœuds frottants.
//
// L'état des contacts (zones) étant fixé, le frottement n'agit qu'aux nœuds des
// supports frottants, et la réponse de la tuyauterie à ces nœuds est linéaire :
// avec C la souplesse du système courant aux translations de ces nœuds, les
// déplacements valent w = w₀ − C·g, g étant les forces que le frottement ajoute
// à celles du système courant. Pour chaque support frottant,
//     g = (κ − k_f⁰)·t
// t : déplacement de la tuyauterie dans les directions libres du support (depuis
// la position de montage), k_f⁰ : raideur de frottement déjà dans le système,
// κ : raideur sécante de la loi de frottement,
//     adhérence   k_max·|t| ≤ L   force k_max·t      κ = k_max
//     glissement  sinon           force L·t/|t|      κ = L/|t|
// avec L = μ·Σ|R| la limite de frottement, somme des réactions des directions
// actives du support. La force est une fonction explicite des déplacements,
// régulière jusqu'à |t| = 0 : l'équation Ξ(g) = g − g(w₀ − C·g) = 0 se résout par
// la méthode de Newton (jacobien exact, recherche linéaire sur le résidu de
// force), sur un petit système dense.
//
// Le résultat est rendu sous forme de raideurs κ, que le calcul complet suivant
// applique et contrôle (fem/nonlinear.js) : cette résolution ne fait que les proposer.

import { DenseLU } from '../core/linalg.js';
import { FRICTION } from './contact.js';

const TOL = 1e-11; // résidu de force visé, rapporté à la plus grande force de frottement
const ACCEPT = 1e-7; // résidu admis quand le bruit d'arrondi empêche d'aller plus loin

/**
 * @param sys système éléments finis courant (raideurs de frottement kf comprises), factorisé
 * @param u déplacements calculés avec ce système
 * @param units supports frottants actifs : { index, node, mu, x0 (raideur courante), free (base des directions
 *   libres), normals: [{ n, k, f0 }] (directions actives : raideur et terme de charge), imp (déplacement imposé) }
 * @returns Map index → raideur de frottement cohérente, ou null si la résolution n'aboutit pas
 */
export function solveFriction({ sys, u, units, maxIter = 80 }) {
  const KM = FRICTION.kMax;
  const nodes = [];
  const pos = new Map();
  const list = units.map((un) => {
    if (!pos.has(un.node)) {
      pos.set(un.node, nodes.length);
      nodes.push(un.node);
    }
    // projecteur sur les directions libres
    const P = new Float64Array(9);
    for (const e of un.free) for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) P[r * 3 + q] += e[r] * e[q];
    return { ...un, a: pos.get(un.node), P };
  });
  const out = new Map();
  if (!list.length) return out;
  const nn = nodes.length;
  const N = nn * 3;

  // souplesse du système courant aux translations des nœuds frottants, et déplacements courants
  const C = new Float64Array(N * N);
  const w0 = new Float64Array(N);
  nodes.forEach((nd, a) => {
    for (let d = 0; d < 3; d++) {
      w0[a * 3 + d] = u[nd * 6 + d];
      const e = new Float64Array(sys.n);
      e[nd * 6 + d] = 1;
      const x = sys.chol.solve(e);
      nodes.forEach((n2, b) => {
        for (let d2 = 0; d2 < 3; d2++) C[(b * 3 + d2) * N + a * 3 + d] = x[n2 * 6 + d2];
      });
    }
  });
  const displacements = (g) => {
    const w = Float64Array.from(w0);
    for (let r = 0; r < N; r++) {
      let v = 0;
      for (let q = 0; q < N; q++) v += C[r * N + q] * g[q];
      w[r] -= v;
    }
    return w;
  };
  /** Loi de frottement de chaque support pour les déplacements w ; `held` : adhérence imposée. */
  const law = (w, held = false) =>
    list.map((c) => {
      const rel = [w[c.a * 3] - c.imp[0], w[c.a * 3 + 1] - c.imp[1], w[c.a * 3 + 2] - c.imp[2]];
      const t = [0, 1, 2].map((r) => c.P[r * 3] * rel[0] + c.P[r * 3 + 1] * rel[1] + c.P[r * 3 + 2] * rel[2]);
      const delta = Math.hypot(t[0], t[1], t[2]);
      let limit = 0;
      const grad = [0, 0, 0]; // ∂L/∂w
      for (const nm of c.normals) {
        const fn = nm.k * (rel[0] * nm.n[0] + rel[1] * nm.n[1] + rel[2] * nm.n[2]) + nm.f0;
        limit += c.mu * Math.abs(fn);
        for (let r = 0; r < 3; r++) grad[r] += c.mu * Math.sign(fn) * nm.k * nm.n[r];
      }
      const stick = held || KM * delta <= limit;
      return { t, delta, limit, grad, stick, kappa: stick ? KM : limit / delta };
    });
  /** Forces g(w) et résidu Ξ = g − g(w). */
  const residual = (g, st) => {
    const xi = Float64Array.from(g);
    list.forEach((c, j) => {
      const s = st[j].kappa - c.x0;
      for (let d = 0; d < 3; d++) xi[c.a * 3 + d] -= s * st[j].t[d];
    });
    let norm = 0;
    for (let r = 0; r < N; r++) norm = Math.max(norm, Math.abs(xi[r]));
    return { xi, norm };
  };
  const point = (g, held = false) => {
    const w = displacements(g);
    const st = law(w, held);
    return { g, st, res: residual(g, st) };
  };
  /** Pas de Newton : (I + H·C)·Δg = −Ξ, H = ∂g/∂w (un bloc 3×3 par nœud). */
  const newtonStep = ({ st, res }) => {
    const H = new Float64Array(nn * 9);
    list.forEach((c, j) => {
      const e = st[j];
      const o = c.a * 9;
      for (let r = 0; r < 3; r++) {
        for (let q = 0; q < 3; q++) {
          let v = -c.x0 * c.P[r * 3 + q];
          if (e.stick) v += KM * c.P[r * 3 + q];
          else v += e.kappa * (c.P[r * 3 + q] - (e.t[r] * e.t[q]) / (e.delta * e.delta)) + (e.t[r] / e.delta) * e.grad[q];
          H[o + r * 3 + q] += v;
        }
      }
    });
    const A = new Float64Array(N * N);
    for (let a = 0; a < nn; a++) {
      for (let r = 0; r < 3; r++) {
        const row = a * 3 + r;
        for (let col = 0; col < N; col++) {
          let v = 0;
          for (let d = 0; d < 3; d++) v += H[a * 9 + r * 3 + d] * C[(a * 3 + d) * N + col];
          A[row * N + col] = v;
        }
        A[row * N + row] += 1;
      }
    }
    try {
      const dg = new DenseLU(A, N).solve(res.xi.map((v) => -v));
      return dg.every(Number.isFinite) ? dg : null;
    } catch {
      return null;
    }
  };

  /** Itérations de Newton depuis les forces `g` ; rend l'état convergé des supports, ou null. */
  const iterate = (start) => {
    let cur = start;
    let stalled = 0;
    const scale = () => Math.max(1e-6, ...cur.st.map((e) => e.limit), ...Array.from(cur.g, Math.abs));
    for (let it = 0; it < maxIter && cur.res.norm > TOL * scale(); it++) {
      const dg = newtonStep(cur);
      const steps = [];
      if (dg) {
        steps.push(1, 1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32, 1 / 64);
        // le long du pas, le déplacement d'un support glissant varie linéairement : s'il passe près de
        // zéro, le support peut adhérer. Deux points sont essayés aussi : l'entrée dans le domaine
        // d'adhérence (k_max·|t| = L, où la loi est continue) et le passage au plus près de zéro
        const full = point(cur.g.map((v, r) => v + dg[r])).st;
        list.forEach((c, j) => {
          if (cur.st[j].stick) return;
          const p = cur.st[j].t;
          const d = full[j].t.map((v, r) => v - p[r]);
          const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
          if (!(dd > 0)) return;
          const pd = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
          const tau = -pd / dd;
          if (tau > 0 && tau < 1) steps.push(tau);
          const rad = (0.99 * cur.st[j].limit) / KM;
          const disc = pd * pd - dd * (cur.st[j].delta * cur.st[j].delta - rad * rad);
          if (disc > 0) {
            const tin = (-pd - Math.sqrt(disc)) / dd;
            if (tin > 0 && tin < 1) steps.push(tin);
          }
        });
      }
      let best = null;
      for (const t of steps) {
        const y = point(cur.g.map((v, r) => v + t * dg[r]));
        if (Number.isFinite(y.res.norm) && (!best || y.res.norm < best.res.norm)) best = y;
      }
      if (!best || !(best.res.norm < cur.res.norm)) {
        // sans progrès par Newton : pas de point fixe g ← g(w)
        const y = point(cur.g.map((v, r) => v - cur.res.xi[r]));
        if (!best || y.res.norm < best.res.norm) best = y;
        if (!Number.isFinite(best.res.norm)) return null;
      }
      // sans progrès notable : bruit d'arrondi (résidu déjà faible) ou échec
      if (best.res.norm < 0.9 * cur.res.norm) stalled = 0;
      else if (++stalled > (cur.res.norm <= ACCEPT * scale() ? 2 : 12)) {
        if (best.res.norm < cur.res.norm) cur = best;
        break;
      }
      cur = best;
    }
    // au bruit d'arrondi près (les réactions passent par des raideurs de pénalité) : le calcul complet tranchera
    return cur.res.norm <= ACCEPT * scale() ? cur.st : null;
  };

  // départ : tous les supports frottants adhérents (problème linéaire), puis ceux qui dépassent leur
  // limite glissent ; à défaut, départ de l'état courant
  const zero = new Float64Array(N);
  const heldStart = point(zero, true);
  const dg0 = newtonStep(heldStart);
  const st = (dg0 && iterate(point(dg0))) || iterate(point(zero));
  if (!st) return null;
  list.forEach((c, j) => out.set(c.index, st[j].kappa));
  return out;
}
