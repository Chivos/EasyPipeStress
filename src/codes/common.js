// Outils communs aux codes de vérification.

/**
 * Synthèse : critère le plus chargé par (équation, cas), avec son taux propre
 * (une éq. (7) dépassée reste affichée dépassée, même si l'éq. (8) la couvre).
 * L'épaisseur ('e') est listée en premier, puis les équations dans l'ordre de
 * leur numéro. Conformité : chaque point satisfait son équation, ou celle qui la
 * couvre (éq. (7) non satisfaite → éq. (8)) ; `covered` compte ces points et
 * `maxRatio` est le taux maximal hors points couverts.
 */
export function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.eqLabel}|${r.case}`;
    const g = groups.get(key);
    if (!g || r.ratio > g.ratio) groups.set(key, r);
  }
  const rank = (eq) => (eq === 'e' ? -1 : Number.isFinite(parseFloat(eq)) ? parseFloat(eq) : 1e9);
  const list = [...groups.values()].sort((a, b) => rank(a.eq) - rank(b.eq));
  const eff = rows.map((r) => (r.coveredBy ? 0 : r.ratio));
  const ok = eff.every((x) => x <= 1 + 1e-9);
  const covered = rows.filter((r) => r.coveredBy && r.ratio > 1).length;
  return { ok, governing: list, covered, maxRatio: Math.max(0, ...eff) };
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
      calc: res.calc,
    });
  }
  return rows;
}
