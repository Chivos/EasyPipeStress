// Orchestration d'un calcul : maillage → système EF → cas de charge → code.
// Ce module ne dépend pas du navigateur : il est utilisé tel quel par les tests.

import { buildMesh } from './core/mesher.js';
import { FeSystem } from './fem/system.js';
import { loadTypes } from './loads/index.js';
import { codes } from './codes/index.js';
import { summarize, thicknessRows, verifiedLevels } from './codes/common.js';
import { seismicLevels } from './loads/seismic.js';
import { localResponses, planeMoments } from './core/frames.js';
import { runNonlinearStatics } from './nonlinear.js';
import { seismicDiagnostics, resultDiagnostics, contactFindings } from './diagnostics.js';

export function runAnalysis(model) {
  const t0 = Date.now();
  const code = codes.has(model.code?.id) ? codes.get(model.code.id) : null;
  const mesh = buildMesh(model, { factors: code?.componentFactors });
  const sys = new FeSystem(mesh, { shear: model.settings.shear !== false });
  const warnings = [...mesh.warnings];
  const cases = [];
  const ctx = { model, mesh, sys };
  // solveur non linéaire (expérimental) : poids et dilatation calculés par états
  const nonlinear = model.settings.solver === 'nonlinear' ? runNonlinearStatics(ctx) : null;
  for (const lc of model.loadCases) {
    if (lc.enabled === false) continue;
    const type = loadTypes.get(lc.type);
    const run = nonlinear?.cases.get(lc.id) ?? type.run(ctx, lc);
    if (nonlinear?.contacts.length && lc.type === 'forces') warnings.push(`Cas ${lc.id}${lc.label ? ` (${lc.label})` : ''} : forces nodales calculées en linéaire, hors des états du solveur non linéaire (appuis simples bilatéraux, jeux ouverts).`);
    if (lc.type === 'forces' && code) warnings.push(`Cas ${lc.id}${lc.label ? ` (${lc.label})` : ''} : forces nodales non attribuées à un chargement du code (poids, dilatation, séisme), sans effet sur les équations de ${code.label}.`);
    // déplacements et efforts sur supports en repères locaux (déjà combinés pour le séisme)
    const r0 = run.uLocal ? run : { ...run, ...localResponses(run, mesh) };
    // moments dans le plan / hors plan des coudes et tés (codes à facteurs i séparés)
    const r = r0.elemPlane ? r0 : { ...r0, elemPlane: planeMoments(r0.elemForces, mesh) };
    if (lc.type === 'seismic') {
      // un cas par niveau de critère : même réponse, mise à l'échelle par le coefficient du niveau
      const used = new Set();
      for (const { lv, info } of verifiedLevels(code, model, seismicLevels(lc))) {
        const k = Number.isFinite(+lv.factor) && lv.factor !== '' ? +lv.factor : 1;
        // repère du cas : nom du séisme s'il est donné (ex. S1-SMHV), sinon niveau (S1-B)
        const name = String(lv.name ?? '').trim();
        const suffix = name && !used.has(name) ? name : lv.level;
        used.add(suffix);
        const scale = (a) => a.map((v) => v * k);
        cases.push({
          ...r,
          id: `${lc.id}-${suffix}`,
          label: `${lc.label || type.label}${name ? ` ${name}` : ''} — ${code?.levels || code?.levelsFor || code?.singleLevel ? info.label : `niveau ${lv.level}`} (× ${k})`,
          levelName: name,
          type: lc.type,
          level: lv.level,
          factor: k,
          base: lc.id,
          fe: true,
          u: scale(r.u),
          elemForces: scale(r.elemForces),
          elemPlane: scale(r.elemPlane),
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
        warnings.push(`${lc.label} : le nombre maximal de modes (${+lc.maxModes || 60}) est atteint avant la fréquence de coupure (${last.freq.toFixed(1)} Hz < ${r.info.cutoff} Hz) ; augmenter le nombre de modes.`);
      }
    }
    if (lc.type === 'seismic') warnings.push(...seismicDiagnostics(lc, r, mesh));
  }
  // état des contacts (appuis simples, jeux, courses) d'après le calcul linéaire
  const contacts = contactFindings({ mesh, cases, nonlinear: nonlinear ? { contacts: nonlinear.contacts, states: nonlinear.states } : null });
  warnings.push(...resultDiagnostics({ mesh, cases, contacts }));
  const modal = cases.find((c) => c.modal)?.modal ?? null;
  let check = code ? code.check({ model, mesh, cases }) : null;
  if (check?.warnings?.length) warnings.push(...check.warnings);
  // code dont l'implémentation n'a pas pu être contrôlée sur le texte : rappel à chaque calcul
  if (code?.caveat) warnings.push(`${code.short ?? code.label} : ${code.caveat}`);
  // épaisseur minimale (pression seule) : option du projet, formule fournie par le code
  if (check && model.settings.checkThickness === true) {
    if (code.thickness) {
      const rows = [...thicknessRows(code, { model, mesh }), ...check.rows];
      check = { ...check, rows, summary: summarize(rows) };
    } else {
      warnings.push(`Le code « ${code.label} » ne fournit pas de formule d’épaisseur minimale : vérification non faite.`);
    }
  }
  return { mesh, sys, dynSys: ctx.dynSys ?? sys, contacts, nonlinear: nonlinear ? { contacts: nonlinear.contacts, states: nonlinear.states } : null, cases, modal, check, code, warnings, elapsed: Date.now() - t0 };
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
