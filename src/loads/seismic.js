// Séisme (effets d'inertie). Deux méthodes :
//  - 'spectral' : analyse modale spectrale, combinaison SRSS/CQC, masse
//    manquante, combinaison directionnelle SRSS ou 100-40-40 ;
//  - 'static'   : méthode statique équivalente (accélérations uniformes par
//    direction, typiquement 1,5 × pic du spectre), combinaison directionnelle.
// Le niveau de critère (B, C, D) sert au dépouillement (éq. 9).
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
    { key: 'damping', label: 'Amortissement', unit: '%', type: 'number' },
    { key: 'cutoff', label: 'Fréquence de coupure', unit: 'Hz', type: 'number' },
    { key: 'maxModes', label: 'Nombre maximal de modes', type: 'number' },
    { key: 'modal', label: 'Combinaison modale', type: 'select', options: () => ['CQC', 'SRSS'] },
    { key: 'directional', label: 'Combinaison directionnelle', type: 'select', options: () => ['SRSS', '100-40-40'] },
    { key: 'rigid', label: 'Réponse rigide des modes', type: 'select', options: () => ['gupta', 'none'],
      default: 'gupta', optionLabel: (v) => (v === 'gupta' ? 'Méthode de Gupta (RG 1.92 rév. 3)' : 'Aucune (tous les modes périodiques)'), title: 'Part rigide des modes entre f1 et f_ZPA, cumulée algébriquement avec la masse manquante' },
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

function runSpectral(sys, lc) {
  const maxModes = Math.max(1, +lc.maxModes || 60);
  const cutoff = +lc.cutoff > 0 ? +lc.cutoff : 33;
  const xi = (+lc.damping || 5) / 100;
  const modal = sys.modal({ maxModes });
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
      const sa = factor * spectrumAt(sp.points, m.freq) * G_STD;
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
    let resp = modeVectors.length ? combineModal(modeVectors, omegas, lc.modal, xi) : null;
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
