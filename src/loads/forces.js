// Efforts imposés : forces (N) et moments (N·m) appliqués à des nœuds, dans le
// repère global. Cas élémentaire signé, présenté dans les résultats ; il n'entre
// pas dans les équations du code (sa nature — permanente, occasionnelle — n'est
// pas connue).

export const COMPONENTS = ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'];

export const forces = {
  id: 'forces',
  label: 'Forces nodales',
  description: 'Forces (N) et moments (N·m) appliqués aux nœuds, repère global. Cas présenté dans les résultats, non combiné dans les équations du code.',
  fields: [],
  create: () => ({ type: 'forces', label: 'Forces nodales', enabled: true, forces: [] }),

  run(ctx, lc) {
    const { sys } = ctx;
    const F = new Float64Array(sys.n);
    for (const row of lc.forces ?? []) {
      const node = String(row.node ?? '').trim();
      if (!node) continue;
      const i = sys.mesh.nodeIndex.get(node);
      if (i === undefined) throw new Error(`${lc.label || lc.id} : nœud « ${node} » inexistant (sommet de coude : utiliser ${node}A, ${node}M ou ${node}B).`);
      COMPONENTS.forEach((c, d) => (F[i * 6 + d] += (+row[c] || 0) * (d < 3 ? 1 : 1000)));
    }
    return { signed: true, ...sys.solveStatic({ F }), info: {} };
  },
};
