// Analyse sismique par spectre de réponse (état de l'art : USNRC RG 1.92 rév. 3,
// ASCE 4-16, RCC-M / ASME III Annexe N-1200) :
//  - réponse modale par direction : q = Γ·Sa(f)/ω² ;
//  - combinaison modale SRSS ou CQC (Der Kiureghian 1981) ;
//  - correction de masse manquante (réponse rigide « ZPA » des modes non
//    retenus, méthode de la masse manquante, combinée SRSS avec la réponse modale) ;
//  - combinaison directionnelle SRSS ou 100-40-40 (Newmark).

/** Interpolation log-log d'un spectre [[f (Hz), a (g)], …]. */
export function spectrumAt(points, f) {
  const p = [...points].filter((x) => x[0] > 0 && x[1] >= 0).sort((a, b) => a[0] - b[0]);
  if (!p.length) return 0;
  if (f <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (f <= p[i][0]) {
      const [f0, a0] = p[i - 1];
      const [f1, a1] = p[i];
      if (a0 > 0 && a1 > 0) {
        const w = Math.log(f / f0) / Math.log(f1 / f0);
        return Math.exp(Math.log(a0) + w * (Math.log(a1) - Math.log(a0)));
      }
      return a0 + ((f - f0) / (f1 - f0)) * (a1 - a0);
    }
  }
  return p[p.length - 1][1];
}

/** Accélération à période nulle : dernière valeur du spectre (haute fréquence). */
export function zpa(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  return p.length ? p[p.length - 1][1] : 0;
}

/** Coefficient de corrélation CQC pour un amortissement réduit ξ commun. */
export function cqcRho(wi, wj, xi) {
  const r = wj / wi;
  const num = 8 * xi * xi * (1 + r) * r ** 1.5;
  const den = (1 - r * r) ** 2 + 4 * xi * xi * r * (1 + r) ** 2;
  return num / den;
}

/** Combinaison modale d'une liste de vecteurs réponse (signés) → vecteur ≥ 0. */
export function combineModal(vectors, omegas, method = 'SRSS', xi = 0.05) {
  const len = vectors[0]?.length ?? 0;
  const out = new Float64Array(len);
  const nm = vectors.length;
  if (method === 'CQC') {
    const rho = [];
    for (let i = 0; i < nm; i++) {
      rho.push(new Float64Array(nm));
      for (let j = 0; j < nm; j++) rho[i][j] = i === j ? 1 : cqcRho(omegas[i], omegas[j], xi);
    }
    for (let q = 0; q < len; q++) {
      let s = 0;
      for (let i = 0; i < nm; i++) {
        const ri = vectors[i][q];
        if (ri === 0) continue;
        s += ri * ri;
        for (let j = i + 1; j < nm; j++) s += 2 * rho[i][j] * ri * vectors[j][q];
      }
      out[q] = Math.sqrt(Math.max(0, s));
    }
  } else {
    for (const v of vectors) for (let q = 0; q < len; q++) out[q] += v[q] * v[q];
    for (let q = 0; q < len; q++) out[q] = Math.sqrt(out[q]);
  }
  return out;
}

/** Combinaison directionnelle de vecteurs positifs. */
export function combineDirectional(vectors, method = 'SRSS') {
  const list = vectors.filter(Boolean);
  const len = list[0]?.length ?? 0;
  const out = new Float64Array(len);
  if (method === '100-40-40') {
    for (let q = 0; q < len; q++) {
      let best = 0;
      for (let i = 0; i < list.length; i++) {
        let s = list[i][q];
        for (let j = 0; j < list.length; j++) if (j !== i) s += 0.4 * list[j][q];
        best = Math.max(best, s);
      }
      out[q] = best;
    }
  } else {
    for (const v of list) for (let q = 0; q < len; q++) out[q] += v[q] * v[q];
    for (let q = 0; q < len; q++) out[q] = Math.sqrt(out[q]);
  }
  return out;
}

/** Combinaison quadratique terme à terme de deux vecteurs positifs. */
export function srss2(a, b) {
  const out = new Float64Array(a.length);
  for (let q = 0; q < a.length; q++) out[q] = Math.hypot(a[q], b[q]);
  return out;
}
