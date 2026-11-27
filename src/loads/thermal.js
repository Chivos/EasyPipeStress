// Dilatation thermique : déformation libre ε = α_moy(T) · (T − T_réf) imposée à
// chaque élément (forces de blocage équivalentes), plus déplacements imposés
// des supports (mouvements de piquages). Module (option du projet) :
//  - 'hot' (défaut, comme PIPESTRESS) : raideur au module à chaud Eh de chaque
//    tube → déplacements et réactions réels à chaud ; le code ramène l'étendue de
//    moments à Ec (× Ec/Eh par élément, RCC-M C 3653.3 / ASME NC-3653.3) ;
//  - 'cold' : raideur au module à froid Ec → contraintes directement à Ec,
//    réactions « à froid » (majorées de Ec/Eh).

import { axialStrainEquivalent } from '../fem/beam3d.js';
import { FeSystem } from '../fem/system.js';
import { materialAt, refTemperature } from '../core/materials.js';

const T_TABLE = 20; // température de référence des coefficients moyens de dilatation

export const thermal = {
  id: 'thermal',
  label: 'Dilatation thermique',
  description: 'Température de chaque tube (colonne « T ») par rapport à la température de référence, et déplacements imposés des supports.',
  fields: [
    { key: 'imposed', label: 'Appliquer les déplacements imposés des supports', type: 'checkbox', default: true },
  ],
  create: () => ({ type: 'thermal', label: 'Dilatation thermique', enabled: true, imposed: true }),

  run(ctx, lc) {
    const { model } = ctx;
    const hot = model.settings.thermalModulus !== 'cold';
    // système au module à chaud, construit une fois par calcul (partagé entre cas thermiques)
    const sys = hot ? (ctx.hotSys ??= new FeSystem(hotMesh(ctx.sys.mesh), { shear: model.settings.shear !== false })) : ctx.sys;
    const r = sys.solveStatic({ F: null, ...thermalLoads(sys.mesh, model, lc) });
    return { signed: true, ...r, info: { tRef: refTemperature(model.settings), modulus: hot ? 'hot' : 'cold' } };
  },
};

/** Maillage au module à chaud E_h de chaque élément. */
export const hotMesh = (mesh) => ({ ...mesh, elements: mesh.elements.map((e) => ({ ...e, E: e.Eh })) });

/** Charges de la dilatation { elemEq, imposed } pour le maillage donné (module des éléments du maillage). */
export function thermalLoads(mesh, model, lc) {
  const tRef = refTemperature(model.settings);
  const elemEq = mesh.elements.map((e) => {
    // α des tables = coefficient MOYEN entre 20 °C (référence des tables) et T :
    // la déformation entre l'état de montage T_réf et l'état chaud T est donc
    // ε = ᾱ(T)·(T − 20) − ᾱ(T_réf)·(T_réf − 20)
    const eps = materialAt(e.mat, e.T1).alpha * (e.T1 - T_TABLE) - materialAt(e.mat, tRef).alpha * (tRef - T_TABLE);
    return axialStrainEquivalent(e.E, e.sec.A, eps);
  });
  let imposed = null;
  if (lc.imposed !== false) {
    imposed = new Map();
    mesh.supports.forEach((s, i) => s.imposed && imposed.set(i, s.imposed));
  }
  return { elemEq, imposed };
}
