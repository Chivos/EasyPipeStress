// Algèbre linéaire dense pour le solveur éléments finis.
// - Cholesky « profil » (skyline stocké en dense) : exploite la faible largeur de
//   bande des modèles de tuyauterie après renumérotation Cuthill-McKee inverse.
// - Valeurs propres symétriques : tridiagonalisation de Householder + QL implicite
//   (algorithmes tred2/tql2 d'EISPACK, d'après la version domaine public de JAMA).

export class SingularMatrixError extends Error {
  constructor(dof, message) {
    super(message || `Matrice de raideur singulière (DDL ${dof})`);
    this.dof = dof;
  }
}

/**
 * Factorisation de Cholesky K = L·Lᵀ d'une matrice symétrique définie positive
 * stockée en dense (Float64Array n×n, ligne majeure). Seule la partie inférieure
 * est lue ; L est écrit sur place. Les termes hors profil ne sont jamais touchés.
 */
export class ProfileCholesky {
  constructor(K, n, { relTol = 1e-11 } = {}) {
    this.n = n;
    const fc = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      let j = 0;
      const row = i * n;
      while (j < i && K[row + j] === 0) j++;
      fc[i] = j;
    }
    this.fc = fc;
    const L = K; // sur place
    for (let i = 0; i < n; i++) {
      const ri = i * n;
      const diag0 = Math.abs(K[ri + i]);
      for (let j = fc[i]; j <= i; j++) {
        const rj = j * n;
        let s = L[ri + j];
        const k0 = fc[i] > fc[j] ? fc[i] : fc[j];
        for (let k = k0; k < j; k++) s -= L[ri + k] * L[rj + k];
        if (j === i) {
          if (!(s > relTol * diag0) || diag0 === 0) throw new SingularMatrixError(i);
          L[ri + i] = Math.sqrt(s);
        } else {
          L[ri + j] = s / L[rj + j];
        }
      }
    }
    this.L = L;
  }

  /** Résout K·x = b (b non modifié). */
  solve(b) {
    const { n, L, fc } = this;
    const x = Float64Array.from(b);
    for (let i = 0; i < n; i++) {
      const ri = i * n;
      let s = x[i];
      for (let k = fc[i]; k < i; k++) s -= L[ri + k] * x[k];
      x[i] = s / L[ri + i];
    }
    for (let i = n - 1; i >= 0; i--) {
      const ri = i * n;
      x[i] /= L[ri + i];
      const xi = x[i];
      for (let k = fc[i]; k < i; k++) x[k] -= L[ri + k] * xi;
    }
    return x;
  }
}

/**
 * Valeurs et vecteurs propres d'une matrice symétrique A (tableau de tableaux n×n).
 * Retourne { values (croissantes), vectors } où vectors[k] est le k-ième vecteur propre.
 */
export function symmetricEigen(A) {
  const n = A.length;
  const V = A.map((r) => Float64Array.from(r));
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  if (n === 0) return { values: [], vectors: [] };
  tred2(V, d, e, n);
  tql2(V, d, e, n);
  const idx = [...Array(n).keys()].sort((a, b) => d[a] - d[b]);
  return {
    values: idx.map((k) => d[k]),
    vectors: idx.map((k) => {
      const v = new Float64Array(n);
      for (let i = 0; i < n; i++) v[i] = V[i][k];
      return v;
    }),
  };
}

function tred2(V, d, e, n) {
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0;
    let h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) {
        d[j] = V[i - 1][j];
        V[i][j] = 0;
        V[j][i] = 0;
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] /= scale;
        h += d[k] * d[k];
      }
      let f = d[i - 1];
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k][j] * d[k];
          e[k] += V[k][j] * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) {
        e[j] /= h;
        f += e[j] * d[j];
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j];
        g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[n - 1][j];
    V[n - 1][j] = 0;
  }
  V[n - 1][n - 1] = 1;
  e[0] = 0;
}

function tql2(V, d, e, n) {
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) {
      if (Math.abs(e[m]) <= eps * tst1) break;
      m++;
    }
    if (m > l) {
      let iter = 0;
      do {
        if (++iter > 200) throw new Error('Valeurs propres : non-convergence QL');
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1];
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1];
            V[k][i + 1] = s * V[k][i] + c * h;
            V[k][i] = c * V[k][i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f;
    e[l] = 0;
  }
}

// Petits utilitaires vectoriels 3D
export const vec = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
  unit(a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  },
};
