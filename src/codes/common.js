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
  // ordre : `order` fourni par le code, sinon numéro de l'équation
  const rank = (r) => (r.eq === 'e' ? -1 : r.order ?? (Number.isFinite(parseFloat(r.eq)) ? parseFloat(r.eq) : 1e9));
  const list = [...groups.values()].sort((a, b) => rank(a) - rank(b));
  const eff = rows.map((r) => (r.coveredBy ? 0 : r.ratio));
  const ok = eff.every((x) => x <= 1 + 1e-9);
  const coveredRows = rows.filter((r) => r.coveredBy && r.ratio > 1);
  // points couverts, par couple (équation dépassée, équation qui la couvre)
  const pairs = new Map();
  for (const r of coveredRows) pairs.set(`${r.eq}|${r.coveredBy}`, { eq: r.eq, by: r.coveredBy, n: (pairs.get(`${r.eq}|${r.coveredBy}`)?.n ?? 0) + 1 });
  return { ok, governing: list, covered: coveredRows.length, coveredPairs: [...pairs.values()], maxRatio: Math.max(0, ...eff) };
}

/** Nom court d'une équation pour les listes et messages : fourni par le code, « Éq. (n) » à défaut. */
export function eqName(code, eq) {
  if (eq === 'e') return 'Épaisseur';
  return code?.eqName?.(eq) ?? `Éq. (${eq})`;
}

/** Phrase « éq. (7) dépassée en n point(s), où l'éq. (8) est satisfaite » de la synthèse. */
export function coveredText(code, summary) {
  // numérotation par défaut : « éq. (7) … l’éq. (8) » ; sinon le nom donné par le code
  const name = (eq, article) => (code?.eqName ? eqName(code, eq) : `${article ? 'l’' : ''}éq. (${eq})`);
  const pairs = summary.coveredPairs ?? [];
  if (!pairs.length) return '';
  return pairs.map((p) => `${name(p.eq, false)} dépassée en ${p.n} point(s), où ${name(p.by, true)} est satisfaite`).join(' ; ');
}

/**
 * Niveaux d'un cas sismique effectivement vérifiés par le code : niveaux cochés
 * et reconnus. Un code à critère occasionnel unique (`singleLevel`) ne retient
 * que le premier niveau coché, quel qu'il soit.
 */
export function verifiedLevels(code, model, levels) {
  const on = levels.filter((x) => x.enabled !== false);
  if (code?.singleLevel) return on.slice(0, 1).map((lv) => ({ lv, info: code.singleLevel }));
  const known = codeLevels(code, model);
  return on.filter((x) => known[x.level]).map((lv) => ({ lv, info: known[lv.level] }));
}

/** Niveaux de critère sismique reconnus par le code : { B: { label, k }, … } (RCC-M par défaut). */
export function codeLevels(code, model = null) {
  // certains codes laissent le choix du coefficient par niveau (paramètres du projet)
  if (code?.levelsFor) return code.levelsFor({ ...code.defaults, ...(model?.code?.id === code.id ? model.code.params : {}) });
  return code?.levels ?? { B: { label: '10B' }, C: { label: '10C' }, D: { label: '10D' } };
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
