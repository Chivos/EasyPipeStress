// Caractéristiques géométriques d'une section tubulaire circulaire.

/**
 * @param {object} sec { od, t, corrosion?, millTol?, fluidDensity?, insulThk?, insulDensity? }
 * @returns grandeurs en mm, mm², mm⁴, mm³
 */
export function pipeSection(sec, tOverride) {
  const od = +sec.od;
  const t = +(tOverride ?? sec.t);
  if (!(od > 0) || !(t > 0) || 2 * t >= od) {
    throw new Error(`Section « ${sec.id ?? '?'} » invalide (De = ${od}, e = ${t})`);
  }
  const di = od - 2 * t;
  const A = (Math.PI / 4) * (od * od - di * di);
  const I = (Math.PI / 64) * (od ** 4 - di ** 4);
  return {
    od,
    t,
    di,
    rm: (od - t) / 2, // rayon moyen
    A,
    I,
    J: 2 * I,
    Z: (2 * I) / od, // module de flexion
    As: A / 2, // aire réduite de cisaillement d'un tube mince (κ ≈ 0,5)
    Ai: (Math.PI / 4) * di * di, // section de passage du fluide
    Ains: sec.insulThk > 0 ? (Math.PI / 4) * ((od + 2 * sec.insulThk) ** 2 - od * od) : 0,
  };
}

export const DEFAULT_SECTIONS = [
  { id: 'DN150-40S', name: 'DN150 Sch 40S (168,3 × 7,11)', od: 168.3, t: 7.11, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 60, insulDensity: 130 },
  { id: 'DN100-40S', name: 'DN100 Sch 40S (114,3 × 6,02)', od: 114.3, t: 6.02, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 50, insulDensity: 130 },
  { id: 'DN80-40S', name: 'DN80 Sch 40S (88,9 × 5,49)', od: 88.9, t: 5.49, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 40, insulDensity: 130 },
];
