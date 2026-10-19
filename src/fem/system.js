// Système éléments finis global : assemblage, résolution statique, réponses
// (efforts d'extrémité des éléments, efforts sur supports) et analyse modale.

import { ProfileCholesky, SingularMatrixError, symmetricEigen } from '../core/linalg.js';
import { localStiffness, toGlobalMatrix, toLocalVector, toGlobalVector } from './beam3d.js';
import { DOF_NAMES } from '../core/units.js';

const LANCZOS_THRESHOLD = 120; // DDL massiques au-delà desquels Lanczos remplace la résolution complète

export class FeSystem {
  constructor(mesh, { shear = true } = {}) {
    this.mesh = mesh;
    const n = mesh.nodes.length * 6;
    this.n = n;
    this.kLocal = mesh.elements.map((e) => {
      const { sec, E, nu, L } = e;
      const G = E / (2 * (1 + nu));
      const k = e.factors?.k ?? 1; // flexibilité des coudes : I_eff = I / k
      return localStiffness({ E, G, A: sec.A, Iy: sec.I / k, Iz: sec.I / k, J: sec.J, L, Asy: shear ? sec.As : 0, Asz: shear ? sec.As : 0 });
    });
    const K = new Float64Array(n * n);
    mesh.elements.forEach((e, ie) => {
      const kg = toGlobalMatrix(this.kLocal[ie], e.R);
      const dofs = elemDofs(e);
      for (let a = 0; a < 12; a++) {
        const ra = dofs[a] * n;
        for (let b = 0; b < 12; b++) K[ra + dofs[b]] += kg[a * 12 + b];
      }
    });
    for (const s of mesh.springs) {
      const base = s.node * 6 + (s.rot ? 3 : 0);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) K[(base + a) * n + base + b] += s.k * s.dir[a] * s.dir[b];
    }
    try {
      this.chol = new ProfileCholesky(K, n);
    } catch (err) {
      if (err instanceof SingularMatrixError) {
        const node = mesh.nodes[Math.floor(err.dof / 6)];
        throw new Error(`Modèle instable (mécanisme) : le degré de liberté ${DOF_NAMES[err.dof % 6]} du nœud ${node?.label} n'est pas retenu. Vérifier les supports (au moins un ancrage ou des blocages suffisants dans les 6 directions).`);
      }
      throw err;
    }
  }

  /**
   * Résolution statique.
   * @param F vecteur global des charges nodales
   * @param elemEq tableau (par élément) de forces équivalentes locales (12) ou null
   * @param imposed Map indexSupport → [dx,dy,dz] déplacement imposé (translations)
   */
  solveStatic({ F, elemEq = null, imposed = null }) {
    const { n, mesh } = this;
    const b = F ? Float64Array.from(F) : new Float64Array(n);
    if (elemEq) {
      mesh.elements.forEach((e, ie) => {
        const fe = elemEq[ie];
        if (!fe) return;
        const fg = toGlobalVector(fe, e.R);
        const dofs = elemDofs(e);
        for (let a = 0; a < 12; a++) b[dofs[a]] += fg[a];
      });
    }
    if (imposed) {
      for (const s of mesh.springs) {
        const d = imposed.get(s.support);
        if (!d || s.rot) continue;
        const proj = s.k * (s.dir[0] * d[0] + s.dir[1] * d[1] + s.dir[2] * d[2]);
        for (let a = 0; a < 3; a++) b[s.node * 6 + a] += proj * s.dir[a];
      }
    }
    const u = this.chol.solve(b);
    return { u, ...this.responses(u, elemEq, imposed) };
  }

  /** Efforts d'extrémité locaux (12 par élément) et efforts sur supports (6 par support). */
  responses(u, elemEq = null, imposed = null) {
    const { mesh } = this;
    const ne = mesh.elements.length;
    const elemForces = new Float64Array(ne * 12);
    mesh.elements.forEach((e, ie) => {
      const dofs = elemDofs(e);
      const ug = new Float64Array(12);
      for (let a = 0; a < 12; a++) ug[a] = u[dofs[a]];
      const ul = toLocalVector(ug, e.R);
      const k = this.kLocal[ie];
      const fe = elemEq?.[ie];
      for (let a = 0; a < 12; a++) {
        let s = 0;
        for (let b = 0; b < 12; b++) s += k[a * 12 + b] * ul[b];
        elemForces[ie * 12 + a] = s - (fe ? fe[a] : 0);
      }
    });
    const supportLoads = new Float64Array(mesh.supports.length * 6);
    for (const s of mesh.springs) {
      const base = s.node * 6 + (s.rot ? 3 : 0);
      let rel = s.dir[0] * u[base] + s.dir[1] * u[base + 1] + s.dir[2] * u[base + 2];
      const d = !s.rot && imposed?.get(s.support);
      if (d) rel -= s.dir[0] * d[0] + s.dir[1] * d[1] + s.dir[2] * d[2];
      // effort exercé PAR la tuyauterie SUR le support
      const f = s.k * rel;
      for (let a = 0; a < 3; a++) supportLoads[s.support * 6 + (s.rot ? 3 : 0) + a] += f * s.dir[a];
    }
    return { elemForces, supportLoads };
  }

  /** Masses nodales concentrées (translations) : éléments + masses ponctuelles. */
  lumpedMass() {
    const { mesh, n } = this;
    const m = new Float64Array(n);
    for (const e of mesh.elements) {
      const me = (e.mpl.metal + e.mpl.fluid + e.mpl.insul) * e.massLength;
      for (const node of [e.n1, e.n2]) for (let a = 0; a < 3; a++) m[node * 6 + a] += me / 2;
    }
    for (const pm of mesh.pointMasses) for (let a = 0; a < 3; a++) m[pm.node * 6 + a] += pm.m;
    return m;
  }

  /**
   * Analyse modale K·φ = ω²·M·φ par condensation exacte sur les DDL massiques :
   * C = M^½ · K⁻¹_mm · M^½ (symétrique), μ = 1/ω². Les modes sont normés à la
   * masse (φᵀMφ = 1). Robuste aux DDL de rotation sans inertie.
   */
  /**
   * @param maxModes nombre maximal de modes
   * @param fmax fréquence (Hz) au-delà de laquelle les modes ne sont plus utiles
   *   (fréquence de coupure sismique) : le calcul s'arrête au premier mode
   *   convergé au-dessus de fmax (conservé pour information).
   */
  modal({ maxModes = 100, method = 'auto', fmax = Infinity } = {}) {
    const c = this._modal;
    if (c && c.maxModes >= maxModes && c.fmax >= fmax && (method === 'auto' || c.method === method)) return c;
    const { n } = this;
    const m = this.lumpedMass();
    const mdofs = [];
    for (let i = 0; i < n; i++) if (m[i] > 0) mdofs.push(i);
    const nm = mdofs.length;
    const sq = mdofs.map((j) => Math.sqrt(m[j]));
    // Petits modèles : résolution complète (exacte) ; au-delà, Lanczos (seuls les
    // premiers modes sont calculés : coût ~ nombre de modes × résolution).
    const useLanczos = method === 'lanczos' || (method === 'auto' && nm > LANCZOS_THRESHOLD && maxModes < nm / 2);
    const muMin = Number.isFinite(fmax) && fmax > 0 ? 1 / (2 * Math.PI * fmax) ** 2 : 0;
    let pairs = useLanczos ? this.lanczosPairs(mdofs, sq, Math.min(maxModes, nm), muMin) : this.densePairs(mdofs, sq, maxModes);
    // modes utiles : jusqu'au premier mode au-dessus de fmax inclus
    const cut = pairs.findIndex((pr) => pr.mu < muMin);
    if (cut >= 0) pairs = pairs.slice(0, cut + 1);
    const modes = [];
    const totalMass = [0, 1, 2].map((d) => {
      let s = 0;
      for (let k = 0; k < this.mesh.nodes.length; k++) s += m[k * 6 + d];
      return s;
    });
    for (const { mu, phi } of pairs) {
      if (modes.length >= maxModes) break;
      const omega = 1 / Math.sqrt(mu);
      const gamma = [0, 1, 2].map((d) => {
        let s = 0;
        for (let node = 0; node < this.mesh.nodes.length; node++) s += m[node * 6 + d] * phi[node * 6 + d];
        return s;
      });
      modes.push({ omega, freq: omega / (2 * Math.PI), phi, gamma, effMass: gamma.map((g) => g * g) });
    }
    // masse portée directement par les supports rigides (ne participe à aucun mode)
    const supportedMass = [0, 1, 2].map((d) => {
      const fixed = new Set();
      for (const s of this.mesh.springs) if (!s.rot && s.k >= 1e9 && Math.abs(s.dir[d]) > 0.999) fixed.add(s.node);
      let sum = 0;
      for (const node of fixed) sum += m[node * 6 + d];
      return sum;
    });
    this._modal = { maxModes, fmax, modes, mass: m, totalMass, supportedMass, method: useLanczos ? 'lanczos' : 'dense' };
    return this._modal;
  }

  /**
   * Résolution complète : C = M^½·K⁻¹ₘₘ·M^½ (DDL massiques), toutes les valeurs
   * propres μ = 1/ω². Renvoie les paires { μ, φ } par μ décroissant.
   */
  densePairs(mdofs, sq, maxModes) {
    const { n } = this;
    const nm = mdofs.length;
    const X = mdofs.map((j) => {
      const e = new Float64Array(n);
      e[j] = 1;
      return this.chol.solve(e);
    });
    const C = Array.from({ length: nm }, () => new Float64Array(nm));
    for (let a = 0; a < nm; a++) {
      for (let b = 0; b <= a; b++) {
        const v = 0.5 * (X[b][mdofs[a]] + X[a][mdofs[b]]) * sq[a] * sq[b];
        C[a][b] = v;
        C[b][a] = v;
      }
    }
    const { values, vectors } = symmetricEigen(C);
    const pairs = [];
    const top = values[values.length - 1];
    for (let k = values.length - 1; k >= 0 && pairs.length < maxModes; k--) {
      const mu = values[k];
      if (!(mu > 1e-14 * top)) break;
      const psi = vectors[k];
      const phi = new Float64Array(n);
      for (let a = 0; a < nm; a++) {
        const c = (sq[a] * psi[a]) / mu;
        if (c === 0) continue;
        const xa = X[a];
        for (let i = 0; i < n; i++) phi[i] += c * xa[i];
      }
      pairs.push({ mu, phi });
    }
    return pairs;
  }

  /**
   * Méthode de Lanczos avec réorthogonalisation complète (Paige 1972 ; Parlett,
   * « The Symmetric Eigenvalue Problem ») sur l'opérateur A = M^½·K⁻¹·M^½ dont
   * les plus grandes valeurs propres μ = 1/ω² donnent les plus basses fréquences.
   * Chaque itération coûte une résolution avec la factorisation de K ; le
   * sous-espace est agrandi jusqu'à convergence des p modes demandés
   * (résidu |βₘ·sₘ| ≤ 10⁻⁸·μ).
   */
  lanczosPairs(mdofs, sq, p, muMin = 0) {
    const { n } = this;
    const nm = mdofs.length;
    const apply = (x) => {
      const b = new Float64Array(n);
      for (let a = 0; a < nm; a++) b[mdofs[a]] = sq[a] * x[a];
      const u = this.chol.solve(b);
      const y = new Float64Array(nm);
      for (let a = 0; a < nm; a++) y[a] = sq[a] * u[mdofs[a]];
      return { y, u };
    };
    const dot = (x, y) => {
      let s = 0;
      for (let i = 0; i < x.length; i++) s += x[i] * y[i];
      return s;
    };
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
    const Q = [];
    const U = [];
    const alpha = [];
    const beta = [];
    const orthonormalize = (w) => {
      for (let pass = 0; pass < 2; pass++) {
        for (const q of Q) {
          const c = dot(q, w);
          for (let i = 0; i < nm; i++) w[i] -= c * q[i];
        }
      }
      return Math.sqrt(dot(w, w));
    };
    // vecteur de départ : excitation des trois directions + bruit déterministe
    let q = new Float64Array(nm);
    for (let a = 0; a < nm; a++) q[a] = sq[a] * (1 + 0.5 * (mdofs[a] % 3)) + rand() * sq[a];
    let nq = Math.sqrt(dot(q, q));
    q = q.map((v) => v / nq);
    // sous-espace initial : réduit si seuls les modes sous fmax sont utiles
    let mMax = Math.min(nm, muMin > 0 ? 40 : 2 * p + 20);
    let result = null;
    for (;;) {
      while (Q.length < mMax) {
        Q.push(q);
        const { y: w, u } = apply(q);
        U.push(u);
        alpha.push(dot(q, w));
        const b = orthonormalize(w);
        if (Q.length >= nm) break;
        if (b <= 1e-10 * Math.abs(alpha[alpha.length - 1])) {
          // sous-espace invariant : nouveau vecteur orthogonal aux précédents
          let r = new Float64Array(nm).map(() => rand());
          const nr = orthonormalize(r);
          beta.push(0);
          q = r.map((v) => v / nr);
        } else {
          beta.push(b);
          q = w.map((v) => v / b);
        }
      }
      const j = Q.length;
      const T = Array.from({ length: j }, () => new Float64Array(j));
      for (let i = 0; i < j; i++) {
        T[i][i] = alpha[i];
        if (i + 1 < j) T[i][i + 1] = T[i + 1][i] = beta[i];
      }
      const { values, vectors } = symmetricEigen(T);
      const bLast = j < nm ? beta[j - 1] ?? 0 : 0;
      // convergence des Ritz par fréquence croissante, jusqu'à p modes ou au
      // premier mode convergé au-dessus de fmax (μ < μmin)
      let converged = true;
      let count = 0;
      let beyond = false;
      for (let k = j - 1; k >= 0 && count < p; k--) {
        if (Math.abs(bLast * vectors[k][j - 1]) > 1e-8 * Math.abs(values[k])) {
          converged = false;
          break;
        }
        count++;
        if (values[k] < muMin) {
          beyond = true;
          break;
        }
      }
      result = { values, vectors, j };
      if ((converged && (beyond || count >= p)) || j >= nm) break;
      mMax = Math.min(nm, mMax + Math.max(20, Math.ceil(mMax / 2)));
    }
    const { values, vectors, j } = result;
    const pairs = [];
    const top = values[j - 1];
    for (let k = j - 1; k >= 0 && pairs.length < p; k--) {
      const mu = values[k];
      if (!(mu > 1e-14 * top)) break;
      const s = vectors[k];
      const phi = new Float64Array(n);
      for (let i = 0; i < j; i++) {
        const c = s[i] / mu;
        if (c === 0) continue;
        const ui = U[i];
        for (let r = 0; r < n; r++) phi[r] += c * ui[r];
      }
      pairs.push({ mu, phi });
    }
    return pairs;
  }
}

export function elemDofs(e) {
  const d = new Int32Array(12);
  for (let a = 0; a < 6; a++) {
    d[a] = e.n1 * 6 + a;
    d[6 + a] = e.n2 * 6 + a;
  }
  return d;
}
