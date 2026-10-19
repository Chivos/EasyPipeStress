// Outils communs aux codes de vérification.

/**
 * Synthèse : critère le plus chargé par (équation, cas). L'épaisseur ('e') est
 * listée en premier, puis les équations dans l'ordre de leur numéro.
 */
export function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.eqLabel}|${r.case}`;
    const g = groups.get(key);
    const eff = r.coveredBy ? 0 : r.ratio;
    if (!g || eff > g.effRatio) groups.set(key, { ...r, effRatio: eff });
  }
  const rank = (eq) => (eq === 'e' ? -1 : Number.isFinite(+eq) ? +eq : 1e9);
  const list = [...groups.values()].sort((a, b) => rank(a.eq) - rank(b.eq));
  const ok = list.every((g) => g.effRatio <= 1 + 1e-9);
  return { ok, governing: list, maxRatio: Math.max(0, ...list.map((g) => g.effRatio)) };
}

/**
 * Vérification d'épaisseur minimale par tenue à la pression seule, indépendante
 * du code : la formule est fournie par `code.thickness.compute(elem, model)`,
 * qui renvoie { tm, tAvail, detail } (mm). Une ligne par élément sous pression.
 */
export function thicknessRows(code, { model, mesh }) {
  const spec = code.thickness;
  if (!spec) return [];
  const rows = [];
  for (const e of mesh.elements) {
    if (!(e.Pd > 0)) continue;
    const res = spec.compute(e, model);
    if (!res) continue;
    rows.push({
      node: mesh.nodes[e.n1].label,
      elem: e.label,
      ie: e.index,
      end: null,
      comp: e.kind === 'bend' ? `Coude ${e.bend.node}` : 'Tube',
      kind: e.kind,
      eq: 'e',
      eqLabel: `Épaisseur minimale (${spec.ref})`,
      case: 'Pd',
      stress: res.tm,
      allow: res.tAvail,
      ratio: res.tm / res.tAvail,
      unit: 'mm',
      detail: res.detail ?? {},
    });
  }
  return rows;
}
