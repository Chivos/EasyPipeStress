// Réduction concentrique ou excentrique entre deux nœuds : cône dont les
// extrémités ont les sections des tubes raccordés (De₁, e₁ côté « De », De₂, e₂
// côté « À »). Modélisée par des sous-éléments de poutre droits de diamètre et
// d'épaisseur interpolés linéairement (raideur, masse, poids, fluide) ; chaque
// extrémité est vérifiée avec sa propre section.
// RCC-M C 3673 (tableau des facteurs, identique à ASME NC-3673.2(b)-1) :
//   k = 1 ; i = 0,5 + 0,01·α·(D₂/t₂)^½, 1 ≤ i ≤ 2,0,
//   α demi-angle du cône (°), D₂, t₂ diamètre et épaisseur au petit bout ;
//   conditions : α ≤ 60°, D/t ≤ 100 aux deux extrémités ; à défaut, i = 2,0.
// Excentrique : même formule, α étant l'angle de la génératrice inclinée (côté
// opposé au plat) ; l'excentricité de l'axe est à donner, si on veut la
// représenter, dans les composantes DX, DY, DZ (axe du tube : droite entre nœuds).

export const REDUCER_TYPES = {
  concentric: { label: 'Concentrique' },
  eccentric: { label: 'Excentrique' },
};

export const REDUCER_DIVISIONS = 6; // sous-éléments du cône

/** Angle α du cône (°) : saisi, sinon déduit des diamètres et de la longueur. */
export function reducerAngle({ type, alpha }, D1, D2, L) {
  if (+alpha > 0) return +alpha;
  const dr = Math.abs(D1 - D2) / (type === 'eccentric' ? 1 : 2);
  return L > 0 ? (Math.atan(dr / L) * 180) / Math.PI : 0;
}

/** Facteur d'intensification de contraintes de la réduction (RCC-M C 3673). */
export function reducerSif({ alpha, D2, t2, D1, t1 }) {
  const ok = alpha <= 60 && D1 / t1 <= 100 && D2 / t2 <= 100;
  const i = ok ? Math.min(2, Math.max(1, 0.5 + 0.01 * alpha * Math.sqrt(D2 / t2))) : 2;
  return { i, ok };
}

export const reducer = {
  id: 'reducer',
  label: 'Réduction',
  phase: 'line',
  fields: [
    { key: 'n1', label: 'De', type: 'node', width: 52 },
    { key: 'n2', label: 'À', type: 'node', width: 52 },
    { key: 'dx', label: 'DX', unit: 'mm', type: 'number', width: 70 },
    { key: 'dy', label: 'DY', unit: 'mm', type: 'number', width: 70 },
    { key: 'dz', label: 'DZ', unit: 'mm', type: 'number', width: 70 },
    { key: 'kind', label: 'Type', type: 'select', options: () => Object.keys(REDUCER_TYPES), optionLabel: (v) => REDUCER_TYPES[v]?.label ?? v, width: 110 },
    { key: 'section', label: 'Section « De »', type: 'select', options: (m) => m.sections.map((s) => s.id), width: 100 },
    { key: 'section2', label: 'Section « À »', type: 'select', options: (m) => m.sections.map((s) => s.id), width: 100 },
    { key: 'alpha', label: 'α', unit: '°', type: 'number', width: 52, placeholder: 'auto', title: 'Demi-angle du cône (génératrice inclinée pour une excentrique). Vide : déduit des diamètres et de la longueur.' },
    { key: 'material', label: 'Matériau', type: 'select', options: (m) => m.materials.map((s) => s.id), width: 100 },
    { key: 'T1', label: 'T', unit: '°C', type: 'number', width: 58 },
    { key: 'P1', label: 'P', unit: 'MPa', type: 'number', width: 58 },
  ],

  create(model, { from, to, dx = 0, dy = 0, dz = 0 } = {}) {
    const prev = [...model.components].reverse().find((c) => c.type === 'pipe');
    const s1 = prev?.section ?? model.sections[0]?.id;
    const s2 = model.sections.find((s) => s.id !== s1)?.id ?? s1;
    return { type: 'reducer', n1: from ?? '', n2: to ?? '', dx, dy, dz, kind: 'concentric', section: s1, section2: s2, alpha: '', material: prev?.material ?? model.materials[0]?.id, T1: prev?.T1 ?? 20, P1: prev?.P1 ?? 0 };
  },

  mesh(comp, ctx) {
    const a = String(comp.n1);
    const b = String(comp.n2);
    const pa = ctx.coord(a);
    const pb = ctx.coord(b);
    const s1 = ctx.section(comp.section);
    const s2 = ctx.section(comp.section2 || comp.section);
    const name = `Réduction ${a}-${b}`;
    if (!s1 || !s2) {
      ctx.error(`${name} : section « ${!s1 ? comp.section : comp.section2} » introuvable.`);
      return;
    }
    const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const [big, small] = +s1.od >= +s2.od ? [s1, s2] : [s2, s1];
    const alpha = reducerAngle({ type: comp.kind, alpha: comp.alpha }, +big.od, +small.od, L);
    const { i, ok } = reducerSif({ alpha, D1: +big.od, t1: +big.t, D2: +small.od, t2: +small.t });
    if (!ok) ctx.warn(`${name} : hors du domaine de la formule du RCC-M (α ≤ 60°, D/t ≤ 100) : i = 2,0.`);
    if (+s1.od === +s2.od) ctx.warn(`${name} : sections de même diamètre.`);
    const T = +comp.T1 || 0;
    const P = +comp.P1 || 0;
    ctx.addSegment({
      comp: comp.id,
      kind: 'reducer',
      a,
      b,
      pa,
      pb,
      nsub: REDUCER_DIVISIONS,
      props: {
        section: s1.id,
        taper: [s1, s2],
        material: comp.material,
        T1: T,
        P1: P,
        Td: T,
        Pd: P,
        reducer: { type: comp.kind === 'eccentric' ? 'eccentric' : 'concentric', alpha, i, ok, D1: +big.od, t1: +big.t, D2: +small.od, t2: +small.t, label: name },
      },
    });
  },
};
