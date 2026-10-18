// Orchestration d'un calcul : maillage → système EF → cas de charge → code.
// Ce module ne dépend pas du navigateur : il est utilisé tel quel par les tests.

import { buildMesh } from './core/mesher.js';
import { FeSystem } from './fem/system.js';
import { loadTypes } from './loads/index.js';
import { codes } from './codes/index.js';

export function runAnalysis(model) {
  const t0 = Date.now();
  const code = codes.has(model.code?.id) ? codes.get(model.code.id) : null;
  const mesh = buildMesh(model, { factors: code?.componentFactors });
  const sys = new FeSystem(mesh, { shear: model.settings.shear !== false });
  const warnings = [...mesh.warnings];
  const cases = [];
  const ctx = { model, mesh, sys };
  for (const lc of model.loadCases) {
    if (lc.enabled === false) continue;
    const type = loadTypes.get(lc.type);
    const r = type.run(ctx, lc);
    cases.push({ id: lc.id, label: lc.label || type.label, type: lc.type, level: lc.level, fe: r.fe !== false, ...r });
    if (r.info?.method === 'spectral' && r.modal) {
      const last = r.modal.modes[r.modal.modes.length - 1];
      if (last && last.freq < (r.info.cutoff ?? 33) && r.modal.modes.length >= (+lc.maxModes || 60)) {
        warnings.push(`${lc.label} : le nombre maximal de modes (${lc.maxModes}) est atteint avant la fréquence de coupure (${last.freq.toFixed(1)} Hz < ${r.info.cutoff} Hz) ; augmenter le nombre de modes.`);
      }
    }
  }
  const modal = cases.find((c) => c.modal)?.modal ?? null;
  const check = code ? code.check({ model, mesh, cases }) : null;
  return { mesh, sys, cases, modal, check, code, warnings, elapsed: Date.now() - t0 };
}

/** Combinaison algébrique de cas signés (ex. état de service W + T1). */
export function combineSigned(cases, ids, label) {
  const list = ids.map((id) => cases.find((c) => c.id === id)).filter((c) => c && c.signed && c.fe);
  if (!list.length) return null;
  const add = (key) => {
    const out = new Float64Array(list[0][key].length);
    for (const c of list) for (let i = 0; i < out.length; i++) out[i] += c[key][i];
    return out;
  };
  return { id: list.map((c) => c.id).join('+'), label, type: 'combination', signed: true, fe: true, u: add('u'), elemForces: add('elemForces'), supportLoads: add('supportLoads') };
}
