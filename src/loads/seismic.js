// Séisme (effets d'inertie). Deux méthodes :
//  - 'spectral' : analyse modale spectrale, combinaison SRSS/CQC, masse
//    manquante, combinaison directionnelle SRSS ou 100-40-40 ;
//  - 'static'   : méthode statique équivalente (accélérations uniformes par
//    direction, typiquement 1,5 × pic du spectre), combinaison directionnelle.
// Les niveaux de critère (B, C, D) servent au dépouillement (éq. 10B, 10C, 10D).
// Évolutions prévues : mouvements différentiels des ancrages (SAM, éq. 10a),
// spectres multiples (supports à excitations différentes), méthode de Gupta /
// Lindley-Yow pour la réponse rigide.

import { G_STD } from '../core/units.js';
import { bodyForceLoads, pack, unpack } from './common.js';
import { spectrumAt, zpa, combineModal, combineDirectional, srss2, guptaAlpha } from '../fem/spectral.js';

const DIRS = ['X', 'Y', 'Z'];

/**
 * Niveaux de critère vérifiés pour ce séisme : même spectre d'entrée, un
 * coefficient multiplicateur par niveau. La réponse étant linéaire vis-à-vis
 * du spectre, le calcul est fait une fois et mis à l'échelle par niveau.
 * Compatibilité : un ancien cas à niveau unique (`level`) donne un seul niveau.
 */
export const LEVELS = ['B', 'C', 'D'];
export function seismicLevels(lc) {
  if (Array.isArray(lc.levels) && lc.levels.length) return lc.levels;
  return [{ level: lc.level ?? 'D', enabled: true, factor: 1 }];
}
export const defaultLevels = () => LEVELS.map((level) => ({ level, enabled: true, factor: 1 }));

/** Directions horizontales et verticale, selon l'axe vertical du projet. */
export function seismicAxes(vertical = 'Z') {
  const v = DIRS.includes(vertical) ? vertical : 'Z';
  return { horizontal: DIRS.filter((d) => d !== v), vertical: v };
}

/**
 * Spectre appliqué dans la direction d. Par défaut (sameHorizontal ≠ false), les
 * deux directions horizontales partagent le spectre (et le facteur) de la
 * première d'entre elles : une seule saisie pour l'horizontal.
 */
export function spectrumFor(lc, d, vertical = 'Z') {
  const { horizontal } = seismicAxes(vertical);
  const key = lc.sameHorizontal !== false && horizontal.includes(d) ? horizontal[0] : d;
  return lc.spectra?.[key];
}

export const seismic = {
  id: 'seismic',
  label: 'Séisme',
  description: 'Effets d’inertie du séisme, par analyse spectrale (recommandée) ou statique équivalente.',
  fields: [
    { key: 'method', label: 'Méthode', type: 'select', options: () => ['spectral', 'static'], optionLabel: (v) => (v === 'spectral' ? 'Spectrale (modale)' : 'Statique équivalente') },
    {
      key: 'dampingLaw',
      label: 'Amortissement (combinaison CQC)',
      type: 'select',
      options: () => ['constant', 'variable'],
      default: 'constant',
      optionLabel: (v) => (v === 'variable' ? 'Variable selon la fréquence' : 'Constant'),
      title: 'Amortissement associé au spectre saisi. Il ne modifie pas les accélérations (le spectre saisi les fixe) : il sert aux coefficients de corrélation de la combinaison CQC, mode par mode.',
      show: (lc) => lc.modal !== 'SRSS',
    },
    { key: 'damping', label: 'Amortissement du spectre', unit: '%', type: 'number', show: (lc) => lc.modal !== 'SRSS' && lc.dampingLaw !== 'variable' },
    { key: 'dampLow', label: 'Amortissement ξ₁ (basses fréquences)', unit: '%', type: 'number', placeholder: '5', show: (lc) => lc.modal !== 'SRSS' && lc.dampingLaw === 'variable' },
    { key: 'fLow', label: 'jusqu’à f₁', unit: 'Hz', type: 'number', placeholder: '10', show: (lc) => lc.modal !== 'SRSS' && lc.dampingLaw === 'variable' },
    { key: 'dampHigh', label: 'Amortissement ξ₂ (hautes fréquences)', unit: '%', type: 'number', placeholder: '2', show: (lc) => lc.modal !== 'SRSS' && lc.dampingLaw === 'variable' },
    { key: 'fHigh', label: 'à partir de f₂ (variation linéaire entre f₁ et f₂)', unit: 'Hz', type: 'number', placeholder: '20', show: (lc) => lc.modal !== 'SRSS' && lc.dampingLaw === 'variable' },
    { key: 'cutoff', label: 'Fréquence de coupure', unit: 'Hz', type: 'number' },
    { key: 'maxModes', label: 'Nombre maximal de modes', type: 'number' },
    { key: 'modal', label: 'Combinaison modale', type: 'select', options: () => ['CQC', 'SRSS'] },
    { key: 'directional', label: 'Combinaison directionnelle', type: 'select', options: () => ['SRSS', '100-40-40'] },
    { key: 'rigid', label: 'Réponse rigide des modes', type: 'select', options: () => ['gupta', 'none'],
      default: 'gupta', optionLabel: (v) => (v === 'gupta' ? 'Méthode de Gupta (RG 1.92 rév. 3)' : 'Aucune (tous les modes périodiques)'), title: 'Part rigide des modes entre f1 et f_ZPA, cumulée algébriquement avec la masse manquante' },
    {
      key: 'interp',
      label: 'Interpolation du spectre',
      type: 'select',
      options: () => ['loglog', 'linear'],
      default: 'loglog',
      optionLabel: (v) => (v === 'linear' ? 'Linéaire (fréquence, accélération)' : 'Log-log'),
      title: 'Interpolation de l’accélération entre deux points du spectre : log-log (usuelle) ou linéaire en fréquence et en accélération (certains logiciels).',
    },
    { key: 'sameHorizontal', label: 'Même spectre pour les deux directions horizontales', type: 'checkbox', default: true },
    { key: 'missingMass', label: 'Correction de masse manquante (ZPA)', type: 'checkbox', default: true },
  ],
  create: () => ({ type: 'seismic', label: 'Séisme', enabled: true, rigid: 'gupta', levels: defaultLevels() }),

  run(ctx, lc) {
    const { sys } = ctx;
    if (lc.method === 'static') return runStatic(sys, lc);
    return runSpectral(sys, lc);
  },
};

function runStatic(sys, lc) {
  const perDir = {};
  const vectors = [];
  for (const d of DIRS) {
    const g = +(lc.staticAcc?.[d] ?? 0);
    if (!g) continue;
    const a = [0, 0, 0];
    a[DIRS.indexOf(d)] = g * G_STD;
    const r = sys.solveStatic(bodyForceLoads(sys, a));
    const v = pack(r).map(Math.abs);
    perDir[d] = v;
    vectors.push(v);
  }
  if (!vectors.length) throw new Error(`Séisme « ${lc.label} » : aucune accélération statique définie.`);
  const comb = combineDirectional(vectors, lc.directional);
  return { signed: false, ...unpack(comb, sys), info: { method: 'static', directions: Object.keys(perDir) } };
}

/**
 * Amortissement réduit d'un mode de fréquence f : constant, ou variable (ξ₁ jusqu'à
 * f₁, ξ₂ au-delà de f₂, interpolation linéaire en fréquence entre les deux, par ex.
 * 5 % → 2 % entre 10 et 20 Hz). Le spectre saisi doit être le spectre composite
 * correspondant (construit par l'utilisateur à partir des spectres à ξ₁ et ξ₂).
 */
export function dampingOf(lc, f) {
  const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);
  if (lc.dampingLaw !== 'variable') return num(lc.damping, 5) / 100;
  const x1 = num(lc.dampLow, 5);
  const x2 = num(lc.dampHigh, 2);
  const f1 = num(lc.fLow, 10);
  const f2 = Math.max(f1, num(lc.fHigh, 20));
  if (f <= f1) return x1 / 100;
  if (f >= f2) return x2 / 100;
  return (x1 + ((x2 - x1) * (f - f1)) / (f2 - f1)) / 100;
}

function runSpectral(sys, lc) {
  const maxModes = Math.max(1, +lc.maxModes || 60);
  const cutoff = +lc.cutoff > 0 ? +lc.cutoff : 33;
  const modal = sys.modal({ maxModes, fmax: cutoff });
  const used = modal.modes.filter((m) => m.freq <= cutoff);
  const { mass } = modal;
  const n = sys.n;
  const dirResults = [];
  const dirInfo = {};
  for (const d of DIRS) {
    const sp = spectrumFor(lc, d, DIRS[sys.mesh.up.indexOf(1)]);
    const factor = +(sp?.factor ?? 0);
    if (!sp || !factor || !sp.points?.length) continue;
    const di = DIRS.indexOf(d);
    const modeVectors = [];
    const omegas = [];
    const gupta = lc.rigid !== 'none';
    const alphaOf = gupta ? guptaAlpha(sp.points, cutoff) : () => 0;
    let rigidSum = null; // Σ αᵢ·Rᵢ (signé) + masse manquante
    const residual = new Float64Array(n); // M·r − Σ Γ·M·φ
    for (let node = 0; node < sys.mesh.nodes.length; node++) residual[node * 6 + di] = mass[node * 6 + di];
    for (const m of used) {
      const sa = factor * spectrumAt(sp.points, m.freq, lc.interp) * G_STD;
      const q = (m.gamma[di] * sa) / (m.omega * m.omega);
      const u = m.phi.map((v) => v * q);
      const v = pack({ u, ...sys.responses(u) });
      const alpha = alphaOf(m.freq);
      if (alpha > 0) {
        rigidSum ??= new Float64Array(v.length);
        for (let k = 0; k < v.length; k++) rigidSum[k] += alpha * v[k];
      }
      const per = Math.sqrt(Math.max(0, 1 - alpha * alpha));
      modeVectors.push(per === 1 ? v : v.map((x) => x * per));
      omegas.push(m.omega);
      for (let i = 0; i < n; i++) residual[i] -= m.gamma[di] * mass[i] * m.phi[i];
    }
    const xis = used.map((m) => dampingOf(lc, m.freq));
    let resp = modeVectors.length ? combineModal(modeVectors, omegas, lc.modal, xis) : null;
    let massMissingFrac = 0;
    const total = modal.totalMass[di];
    const captured = used.reduce((s, m) => s + m.effMass[di], 0);
    massMissingFrac = total > 0 ? Math.max(0, 1 - captured / total) : 0;
    if (lc.missingMass !== false) {
      const a0 = factor * zpa(sp.points) * G_STD;
      const F = residual.map((v) => v * a0);
      const mm = pack(sys.solveStatic({ F }));
      if (rigidSum) for (let k = 0; k < mm.length; k++) rigidSum[k] += mm[k];
      else rigidSum = mm;
    }
    if (rigidSum) {
      const rigid = rigidSum.map(Math.abs);
      resp = resp ? srss2(resp, rigid) : rigid;
    }
    if (!resp) continue;
    dirResults.push(resp);
    dirInfo[d] = { modes: used.length, captured: total > 0 ? captured / total : 0, missing: massMissingFrac };
  }
  if (!dirResults.length) throw new Error(`Séisme « ${lc.label} » : aucun spectre défini.`);
  const comb = combineDirectional(dirResults, lc.directional);
  return {
    signed: false,
    ...unpack(comb, sys),
    info: { method: 'spectral', cutoff, modesUsed: used.length, modesComputed: modal.modes.length, directions: dirInfo },
    modal,
  };
}
