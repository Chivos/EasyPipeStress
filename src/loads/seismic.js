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
import { spectrumAt, zpa, combineModal, combineDirectional, srss2 } from '../fem/spectral.js';

const DIRS = ['X', 'Y', 'Z'];

export const seismic = {
  id: 'seismic',
  label: 'Séisme',
  description: 'Effets d’inertie du séisme, par analyse spectrale (recommandée) ou statique équivalente.',
  fields: [
    { key: 'level', label: 'Niveau de critère', type: 'select', options: () => ['B', 'C', 'D'] },
    { key: 'method', label: 'Méthode', type: 'select', options: () => ['spectral', 'static'], optionLabel: (v) => (v === 'spectral' ? 'Spectrale (modale)' : 'Statique équivalente') },
    { key: 'damping', label: 'Amortissement', unit: '%', type: 'number' },
    { key: 'cutoff', label: 'Fréquence de coupure', unit: 'Hz', type: 'number' },
    { key: 'maxModes', label: 'Nombre maximal de modes', type: 'number' },
    { key: 'modal', label: 'Combinaison modale', type: 'select', options: () => ['CQC', 'SRSS'] },
    { key: 'directional', label: 'Combinaison directionnelle', type: 'select', options: () => ['SRSS', '100-40-40'] },
    { key: 'missingMass', label: 'Correction de masse manquante (ZPA)', type: 'checkbox', default: true },
  ],
  create: () => ({ type: 'seismic', label: 'Séisme', enabled: true }),

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
    const sp = lc.spectra?.[d];
    const factor = +(sp?.factor ?? 0);
    if (!sp || !factor || !sp.points?.length) continue;
    const di = DIRS.indexOf(d);
    const modeVectors = [];
    const omegas = [];
    const residual = new Float64Array(n); // M·r − Σ Γ·M·φ
    for (let node = 0; node < sys.mesh.nodes.length; node++) residual[node * 6 + di] = mass[node * 6 + di];
    for (const m of used) {
      const sa = factor * spectrumAt(sp.points, m.freq) * G_STD;
      const q = (m.gamma[di] * sa) / (m.omega * m.omega);
      const u = m.phi.map((v) => v * q);
      modeVectors.push(pack({ u, ...sys.responses(u) }));
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
      const r = sys.solveStatic({ F });
      const rigid = pack(r).map(Math.abs);
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
