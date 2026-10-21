// Tube droit défini, à la manière des logiciels de flexibilité usuels, par son
// nœud de départ, son nœud d'arrivée et les composantes DX, DY, DZ du vecteur
// départ → arrivée. Une température et une pression uniques
// sont portées par l'élément et héritées par les coudes qui le prolongent.

export const pipe = {
  id: 'pipe',
  label: 'Tube droit',
  phase: 'line',
  fields: [
    { key: 'n1', label: 'De', type: 'node', width: 52 },
    { key: 'n2', label: 'À', type: 'node', width: 52 },
    { key: 'dx', label: 'DX', unit: 'mm', type: 'number', width: 70 },
    { key: 'dy', label: 'DY', unit: 'mm', type: 'number', width: 70 },
    { key: 'dz', label: 'DZ', unit: 'mm', type: 'number', width: 70 },
    { key: 'section', label: 'Section', type: 'select', options: (m) => m.sections.map((s) => s.id), width: 100 },
    { key: 'material', label: 'Matériau', type: 'select', options: (m) => m.materials.map((s) => s.id), width: 100 },
    { key: 'T1', label: 'T', unit: '°C', type: 'number', width: 58, title: 'Température : dilatation thermique et contraintes admissibles S, Sy des équations (6), (7), (8), (10)' },
    { key: 'P1', label: 'P', unit: 'MPa', type: 'number', width: 58, title: 'Pression intérieure : terme de pression des équations (6), (8), (10) et épaisseur minimale' },
  ],

  create(model, { from, to, dx = 0, dy = 0, dz = 0 } = {}) {
    const prev = [...model.components].reverse().find((c) => c.type === 'pipe' || c.type === 'reducer');
    // après une réduction : section de son extrémité aval
    const section = prev?.type === 'reducer' ? prev.section2 || prev.section : prev?.section;
    return {
      type: 'pipe',
      n1: from ?? '',
      n2: to ?? '',
      dx,
      dy,
      dz,
      section: section ?? model.sections[0]?.id,
      material: prev?.material ?? model.materials[0]?.id,
      T1: prev?.T1 ?? 20,
      P1: prev?.P1 ?? 0,
    };
  },

  mesh(comp, ctx) {
    const pa = ctx.coord(comp.n1);
    const pb = ctx.coord(comp.n2);
    ctx.addSegment({
      comp: comp.id,
      kind: 'pipe',
      a: String(comp.n1),
      b: String(comp.n2),
      pa,
      pb,
      props: {
        section: comp.section,
        material: comp.material,
        T1: +comp.T1 || 0,
        P1: +comp.P1 || 0,
        // une seule température et une seule pression par tube (simplification) :
        // elles servent aussi de conditions de calcul (Td, Pd) pour le code
        Td: +comp.T1 || 0,
        Pd: +comp.P1 || 0,
      },
    });
  },
};
