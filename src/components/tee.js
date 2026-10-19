// Té (piquage) placé au nœud de jonction de trois tubes. Le té ne modifie pas
// la géométrie : le nœud reste commun aux trois branches. Il applique, aux
// extrémités des éléments qui aboutissent au nœud, le facteur d'intensification
// de contraintes i fourni par le code de vérification (RCC-M C 3680 /
// ASME NC-3673.2) selon le type de té :
//  - 'welding'      té forgé à souder bout à bout (B16.9) : h = 4,4·e/r
//  - 'reinforced'   té de fabrication renforcé           : h = (e + e_r/2)^(5/2) / (e^(3/2)·r)
//  - 'unreinforced' té de fabrication non renforcé       : h = e/r
//  - 'user'         facteur i saisi par l'utilisateur
// avec i = 0,9/h^(2/3) ≥ 1 et k = 1 (pas de flexibilité locale).

export const TEE_TYPES = {
  welding: 'Té forgé à souder (B16.9)',
  reinforced: 'Té de fabrication renforcé',
  unreinforced: 'Té de fabrication non renforcé',
  user: 'SIF imposé (saisie de i)',
};

export const tee = {
  id: 'tee',
  label: 'Té',
  phase: 'point',
  fields: [
    { key: 'node', label: 'Nœud', type: 'node', width: 60 },
    { key: 'teeType', label: 'Type', type: 'select', options: () => Object.keys(TEE_TYPES), optionLabel: (k) => TEE_TYPES[k] ?? k, width: 190 },
    { key: 'pad', label: 'Renfort e_r', unit: 'mm', type: 'number', width: 80, placeholder: '0', title: 'Épaisseur de la plaque de renfort (té de fabrication renforcé)' },
    { key: 'sif', label: 'i imposé', type: 'number', width: 70, placeholder: 'auto', title: 'Facteur d’intensification imposé (type « SIF imposé »)' },
    { key: 'label', label: 'Repère', type: 'text', width: 90 },
  ],

  create(model, { node } = {}) {
    return { type: 'tee', node: node ?? '', teeType: 'welding', pad: '', sif: '', label: '' };
  },

  mesh(comp, ctx) {
    const idx = ctx.nodeIndex(comp.node, `Té « ${comp.label || comp.node} »`);
    if (idx < 0) return;
    const n = ctx.elementsAt(idx).length;
    if (n < 3) ctx.warn(`Té au nœud ${comp.node} : ${n} tube(s) seulement aboutissent au nœud (3 attendus).`);
    if (comp.teeType === 'user' && !(+comp.sif >= 1)) {
      ctx.error(`Té au nœud ${comp.node} : facteur i imposé manquant ou < 1.`);
      return;
    }
    ctx.addNodeFactors(idx, { kind: 'tee', teeType: comp.teeType || 'welding', pad: +comp.pad || 0, sif: +comp.sif || null, comp: comp.id });
  },
};
