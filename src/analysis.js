// Orchestration d'un calcul : maillage → système EF → cas de charge → code.
// Ce module ne dépend pas du navigateur : il est utilisé tel quel par les tests.

import { buildMesh } from './core/mesher.js';
import { FeSystem } from './fem/system.js';
import { loadTypes } from './loads/index.js';
import { codes } from './codes/index.js';
import { summarize, thicknessRows } from './codes/common.js';
import { seismicLevels } from './loads/seismic.js';
import { localResponses } from './core/frames.js';

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
    const run = type.run(ctx, lc);
    if (lc.type === 'forces' && code) warnings.push(`Cas ${lc.id}${lc.label ? ` (${lc.label})` : ''} : forces nodales non attribuées à un chargement du code (poids, dilatation, séisme), sans effet sur les équations de ${code.label}.`);
    // déplacements et efforts sur supports en repères locaux (déjà combinés pour le séisme)
    const r = run.uLocal ? run : { ...run, ...localResponses(run, mesh) };
    if (lc.type === 'seismic') {
      // un cas par niveau de critère : même réponse, mise à l'échelle par le coefficient du niveau
      const used = new Set();
      for (const lv of seismicLevels(lc).filter((x) => x.enabled !== false)) {
        const k = Number.isFinite(+lv.factor) && lv.factor !== '' ? +lv.factor : 1;
        // repère du cas : nom du séisme s'il est donné (ex. S1-SMHV), sinon niveau (S1-B)
        const name = String(lv.name ?? '').trim();
        const suffix = name && !used.has(name) ? name : lv.level;
        used.add(suffix);
        const scale = (a) => a.map((v) => v * k);
        cases.push({
          ...r,
          id: `${lc.id}-${suffix}`,
          label: `${lc.label || type.label}${name ? ` ${name}` : ''} — niveau ${lv.level} (× ${k})`,
          levelName: name,
          type: lc.type,
          level: lv.level,
          factor: k,
          base: lc.id,
          fe: true,
          u: scale(r.u),
          elemForces: scale(r.elemForces),
          supportLoads: scale(r.supportLoads),
          uLocal: scale(r.uLocal),
          supportLoadsLocal: scale(r.supportLoadsLocal),
        });
      }
    } else {
      cases.push({ id: lc.id, label: lc.label || type.label, type: lc.type, level: lc.level, fe: r.fe !== false, ...r });
    }
    if (r.info?.method === 'spectral' && r.modal) {
      const last = r.modal.modes[r.modal.modes.length - 1];
      if (last && last.freq < (r.info.cutoff ?? 33) && r.modal.modes.length >= (+lc.maxModes || 60)) {
        warnings.push(`${lc.label} : le nombre maximal de modes (${lc.maxModes}) est atteint avant la fréquence de coupure (${last.freq.toFixed(1)} Hz < ${r.info.cutoff} Hz) ; augmenter le nombre de modes.`);
      }
    }
  }
  const modal = cases.find((c) => c.modal)?.modal ?? null;
  let check = code ? code.check({ model, mesh, cases }) : null;
  // épaisseur minimale (pression seule) : option du projet, formule fournie par le code
  if (check && model.settings.checkThickness === true) {
    if (code.thickness) {
      const rows = [...thicknessRows(code, { model, mesh }), ...check.rows];
      check = { ...check, rows, summary: summarize(rows) };
    } else {
      warnings.push(`Le code « ${code.label} » ne fournit pas de formule d’épaisseur minimale : vérification non faite.`);
    }
  }
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
  return { id: list.map((c) => c.id).join('+'), label, type: 'combination', signed: true, fe: true, u: add('u'), elemForces: add('elemForces'), supportLoads: add('supportLoads'), uLocal: add('uLocal'), supportLoadsLocal: add('supportLoadsLocal') };
}
