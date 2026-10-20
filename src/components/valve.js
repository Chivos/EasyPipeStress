// Robinet (ou tout équipement en ligne rigide : bride, clapet…) modélisé par
// un élément de poutre « rigide » entre deux nœuds :
//  - longueur et orientation données par DX, DY, DZ (face à face du robinet) ;
//  - masse totale répartie sur sa longueur (poids propre et inertie sismique),
//    plus le fluide contenu (section intérieure du tube raccordé × longueur),
//    comme PIPESTRESS ; le calorifuge éventuel est à inclure dans la masse ;
//  - raideur = facteur × raideur du tube de raccordement (10 par défaut, comme
//    dans la pratique des logiciels de flexibilité : assez raide pour ne pas
//    fléchir, sans dégrader le conditionnement numérique qu'une raideur
//    « infinie » provoquerait) ;
//  - dilatation thermique à la température du tube raccordé ;
//  - pas de vérification de contraintes du code sur le corps du robinet (les
//    extrémités des tubes raccordés sont vérifiées).

export const valve = {
  id: 'valve',
  label: 'Robinet',
  phase: 'line',
  fields: [
    { key: 'n1', label: 'De', type: 'node', width: 52 },
    { key: 'n2', label: 'À', type: 'node', width: 52 },
    { key: 'dx', label: 'DX', unit: 'mm', type: 'number', width: 70 },
    { key: 'dy', label: 'DY', unit: 'mm', type: 'number', width: 70 },
    { key: 'dz', label: 'DZ', unit: 'mm', type: 'number', width: 70 },
    { key: 'mass', label: 'Masse', unit: 'kg', type: 'number', width: 70, title: 'Masse du robinet vide (corps, chapeau, actionneur, calorifuge), répartie sur sa longueur ; le fluide contenu est ajouté automatiquement' },
    { key: 'stiffFactor', label: 'Rigidité', unit: '× tube', type: 'number', width: 64, placeholder: '10', title: 'Raideur du robinet en multiple de celle du tube raccordé (10 recommandé)' },
    { key: 'section', label: 'Raccord.', type: 'select', options: (m) => m.sections.map((s) => s.id), width: 100, title: 'Section du tube de raccordement (base de la raideur)' },
    { key: 'label', label: 'Repère', type: 'text', width: 90 },
  ],

  create(model, { from, to, dx = 0, dy = 0, dz = 0, mass = 100 } = {}) {
    const prev = [...model.components].reverse().find((c) => c.type === 'pipe');
    return { type: 'valve', n1: from ?? '', n2: to ?? '', dx, dy, dz, mass, stiffFactor: 10, section: prev?.section ?? model.sections[0]?.id, label: '' };
  },

  mesh(comp, ctx) {
    const a = String(comp.n1);
    const b = String(comp.n2);
    // conditions (matériau, T, P) reprises du tube raccordé
    const adj = ctx.model.components.find((c) => c.type === 'pipe' && [String(c.n1), String(c.n2)].some((n) => n === a || n === b));
    if (!adj) ctx.warn(`Robinet ${comp.label || `${a}-${b}`} : aucun tube raccordé, matériau et température par défaut.`);
    const T = +adj?.T1 || +ctx.model.settings.tRef || 20;
    const P = +adj?.P1 || 0;
    ctx.addSegment({
      comp: comp.id,
      kind: 'valve',
      a,
      b,
      pa: ctx.coord(a),
      pb: ctx.coord(b),
      subdivide: false,
      props: {
        section: comp.section || adj?.section,
        material: adj?.material ?? ctx.model.materials[0]?.id,
        T1: T,
        P1: P,
        Td: T,
        Pd: P,
        valve: { mass: Math.max(0, +comp.mass || 0), stiffFactor: +comp.stiffFactor > 0 ? +comp.stiffFactor : 10, label: comp.label },
      },
    });
  },
};
