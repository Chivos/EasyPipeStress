// Outils partagés par les codes de vérification : lecture des efforts aux
// extrémités des éléments, choix des facteurs au point vérifié, libellés.
// (Le RCC-M classe 2, src/codes/rccm-c.js, garde ses propres fonctions.)

import { seismicLevels } from '../loads/seismic.js';
import { verifiedLevels } from './common.js';

/** Moment résultant √(Mt² + My² + Mz²) à une extrémité d'élément (N·mm). */
export function resultant(f, ie, end) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  return Math.hypot(f[o], f[o + 1], f[o + 2]);
}

/** Effort normal à une extrémité d'élément (N, valeur algébrique du repère local). */
export const axialForce = (f, ie, end) => f[ie * 12 + (end === 0 ? 0 : 6)];

/** Moment de torsion à une extrémité d'élément (N·mm). */
export const torsion = (f, ie, end) => f[ie * 12 + (end === 0 ? 3 : 9)];

/** Moments de flexion dans le plan et hors plan du composant (N·mm), cf. core/frames.js. */
export const planeBending = (c, ie, end) => [c.elemPlane[ie * 4 + end * 2], c.elemPlane[ie * 4 + end * 2 + 1]];

/** Ligne du tableau des moments du détail de calcul (N·m) : torsion, deux flexions locales, résultant. */
export function momentRow(name, c, ie, end, k = 1) {
  const o = ie * 12 + (end === 0 ? 3 : 9);
  const f = c.elemForces;
  return { name, signed: c.signed !== false, mt: (k * f[o]) / 1000, my: (k * f[o + 1]) / 1000, mz: (k * f[o + 2]) / 1000, res: (k * Math.hypot(f[o], f[o + 1], f[o + 2])) / 1000 };
}

/** Même ligne, flexions exprimées dans le plan (Mi) et hors plan (Mo) du composant. */
export function planeMomentRow(name, c, ie, end, k = 1) {
  const [mi, mo] = planeBending(c, ie, end);
  const mt = torsion(c.elemForces, ie, end);
  return { name, signed: c.signed !== false, mt: (k * mt) / 1000, my: (k * mi) / 1000, mz: (k * mo) / 1000, res: (k * Math.hypot(mt, mi, mo)) / 1000 };
}

/** Cas de dilatation calculé au module à chaud : rapport Ec/Eh de l'élément (1 si calcul à froid). */
export const ecOverEh = (tc, e) => (tc.info?.modulus === 'hot' && e.Eh > 0 ? e.E / e.Eh : 1);

/**
 * Point vérifié (extrémité d'élément) : section, facteurs retenus, libellés.
 * Les facteurs sont ceux du composant de l'élément ou, s'ils sont plus sévères,
 * ceux du té au nœud. `weld` : prise en compte du facteur des soudures bout à
 * bout brutes aux extrémités des réductions (option du composant).
 * Renvoie null pour un point non vérifié (points intérieurs d'un coude si
 * l'option du projet est décochée).
 */
export function checkPoint(e, ie, end, mesh, model, { weld = true } = {}) {
  const node = mesh.nodes[end === 0 ? e.n1 : e.n2].label;
  if (e.kind === 'bend' && model.settings?.bendInnerPoints === false && node !== `${e.bend.node}A` && node !== `${e.bend.node}B`) return null;
  const sec = e.endSec?.[end] ?? e.sec;
  const local = e.endFactors?.[end];
  const fac0 = local && local.i >= e.factors.i ? local : e.factors;
  const w = weld ? e.weldI?.[end] ?? 1 : 1;
  const fac = w > fac0.i ? { ...fac0, i: w, ii: w, io: w, weld: true } : fac0;
  const atTee = fac === local;
  const comp = fac.weld
    ? `Soudure réduction ${node}`
    : atTee
      ? `Té ${node}`
      : e.kind === 'bend'
        ? `Coude ${e.bend.node}`
        : e.kind === 'reducer'
          ? `${e.reducer.type === 'eccentric' ? 'Réduction exc.' : 'Réduction'} ${e.reducer.label.replace('Réduction ', '')}`
          : 'Tube';
  return { node, sec, local, fac, weldI: w, atTee, base: { node, elem: e.label, ie, end, comp, kind: atTee ? 'tee' : e.kind } };
}

/** Tronçon réduit d'un té ou piquage réduit : section du collecteur, sinon null. */
export const reducedBranch = (pt) => (pt.local?.runSec && pt.sec.od < pt.local.runSec.od - 1e-6 ? pt.local.runSec : null);

/** Identifiants des cas par nature de chargement. */
export function loadSets(cases) {
  const weight = cases.filter((c) => c.type === 'weight' && c.fe !== false);
  return { weight, thermal: cases.filter((c) => c.type === 'thermal'), seismic: cases.filter((c) => c.type === 'seismic'), wId: weight.map((c) => c.id).join('+') };
}

/** Chargements actifs du modèle, pour la description des cumuls (onglet Code, note de calcul). */
export function activeLoads(model) {
  const active = model.loadCases.filter((c) => c.enabled !== false);
  const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);
  const W = active.filter((c) => c.type === 'weight').map((c) => c.id);
  return {
    w: W.join(' + ') || '(aucun poids)',
    T: active.filter((c) => c.type === 'thermal').map((c) => c.id),
    /** [{ s, lv, id, factor, rule }] : un élément par niveau sismique vérifié par le code */
    S(code) {
      const out = [];
      for (const s of active.filter((c) => c.type === 'seismic')) {
        for (const { lv } of verifiedLevels(code, model, seismicLevels(s))) {
          out.push({
            s,
            lv,
            id: `${s.id}-${String(lv.name ?? '').trim() || lv.level}`,
            factor: num(lv.factor, 1),
            rule: `réponse sismique ${s.method === 'static' ? 'statique équivalente' : `spectrale ${s.modal ?? 'CQC'}`}, directions ${s.directional ?? 'SRSS'}, × ${num(lv.factor, 1)}`,
          });
        }
      }
      return out;
    },
  };
}

export const num = (v, d) => (v === '' || v == null || !Number.isFinite(+v) ? d : +v);
