// Catalogue de tubes et de coudes normalisés ASME (valeurs en mm).
//  - ASME B36.10M : tubes en acier carbone et faiblement allié (soudés et sans soudure) ;
//  - ASME B36.19M : tubes en acier inoxydable (schedules « S ») ;
//  - ASME B16.9   : rayons des coudes à souder (petit rayon 1D, grand rayon 1,5D, 3D).
// Les épaisseurs sont les épaisseurs nominales des tables (conversion des pouces
// arrondie au centième de mm comme dans les normes).

// Schedules de B36.10M, dans l'ordre des tables.
export const B3610_SCHEDULES = ['10', '20', '30', 'STD', '40', '60', 'XS', '80', '100', '120', '140', '160', 'XXS'];
export const B3619_SCHEDULES = ['5S', '10S', '40S', '80S'];

// [NPS, DN, De, épaisseurs B36.10M { schedule: e }, épaisseurs 5S / 10S de B36.19M]
const S = (nps, dn, od, sch, s5, s10) => ({ nps, dn, od, sch, s5, s10 });
export const PIPE_SIZES = [
  S('1/2', 15, 21.3, { 10: 2.11, 30: 2.41, STD: 2.77, 40: 2.77, XS: 3.73, 80: 3.73, 160: 4.78, XXS: 7.47 }, 1.65, 2.11),
  S('3/4', 20, 26.7, { 10: 2.11, 30: 2.41, STD: 2.87, 40: 2.87, XS: 3.91, 80: 3.91, 160: 5.56, XXS: 7.82 }, 1.65, 2.11),
  S('1', 25, 33.4, { 10: 2.77, 30: 2.9, STD: 3.38, 40: 3.38, XS: 4.55, 80: 4.55, 160: 6.35, XXS: 9.09 }, 1.65, 2.77),
  S('1 1/4', 32, 42.2, { 10: 2.77, 30: 2.97, STD: 3.56, 40: 3.56, XS: 4.85, 80: 4.85, 160: 6.35, XXS: 9.7 }, 1.65, 2.77),
  S('1 1/2', 40, 48.3, { 10: 2.77, 30: 3.18, STD: 3.68, 40: 3.68, XS: 5.08, 80: 5.08, 160: 7.14, XXS: 10.15 }, 1.65, 2.77),
  S('2', 50, 60.3, { 10: 2.77, 30: 3.18, STD: 3.91, 40: 3.91, XS: 5.54, 80: 5.54, 160: 8.74, XXS: 11.07 }, 1.65, 2.77),
  S('2 1/2', 65, 73.0, { 10: 3.05, 30: 4.78, STD: 5.16, 40: 5.16, XS: 7.01, 80: 7.01, 160: 9.53, XXS: 14.02 }, 2.11, 3.05),
  S('3', 80, 88.9, { 10: 3.05, 30: 4.78, STD: 5.49, 40: 5.49, XS: 7.62, 80: 7.62, 160: 11.13, XXS: 15.24 }, 2.11, 3.05),
  S('3 1/2', 90, 101.6, { 10: 3.05, 30: 4.78, STD: 5.74, 40: 5.74, XS: 8.08, 80: 8.08, XXS: 16.15 }, 2.11, 3.05),
  S('4', 100, 114.3, { 10: 3.05, 30: 4.78, STD: 6.02, 40: 6.02, XS: 8.56, 80: 8.56, 120: 11.13, 160: 13.49, XXS: 17.12 }, 2.11, 3.05),
  S('5', 125, 141.3, { 10: 3.4, STD: 6.55, 40: 6.55, XS: 9.53, 80: 9.53, 120: 12.7, 160: 15.88, XXS: 19.05 }, 2.77, 3.4),
  S('6', 150, 168.3, { 10: 3.4, STD: 7.11, 40: 7.11, XS: 10.97, 80: 10.97, 120: 14.27, 160: 18.26, XXS: 21.95 }, 2.77, 3.4),
  S('8', 200, 219.1, { 10: 3.76, 20: 6.35, 30: 7.04, STD: 8.18, 40: 8.18, 60: 10.31, XS: 12.7, 80: 12.7, 100: 15.09, 120: 18.26, 140: 20.62, 160: 23.01, XXS: 22.23 }, 2.77, 3.76),
  S('10', 250, 273.1, { 10: 4.19, 20: 6.35, 30: 7.8, STD: 9.27, 40: 9.27, 60: 12.7, XS: 12.7, 80: 15.09, 100: 18.26, 120: 21.44, 140: 25.4, 160: 28.58, XXS: 25.4 }, 3.4, 4.19),
  S('12', 300, 323.9, { 10: 4.57, 20: 6.35, 30: 8.38, STD: 9.53, 40: 10.31, 60: 14.27, XS: 12.7, 80: 17.48, 100: 21.44, 120: 25.4, 140: 28.58, 160: 33.32, XXS: 25.4 }, 3.96, 4.57),
  S('14', 350, 355.6, { 10: 6.35, 20: 7.92, 30: 9.53, STD: 9.53, 40: 11.13, 60: 15.09, XS: 12.7, 80: 19.05, 100: 23.83, 120: 27.79, 140: 31.75, 160: 35.71 }, 3.96, 4.78),
  S('16', 400, 406.4, { 10: 6.35, 20: 7.92, 30: 9.53, STD: 9.53, 40: 12.7, 60: 16.66, XS: 12.7, 80: 21.44, 100: 26.19, 120: 30.96, 140: 36.53, 160: 40.49 }, 4.19, 4.78),
  S('18', 450, 457, { 10: 6.35, 20: 7.92, 30: 11.13, STD: 9.53, 40: 14.27, 60: 19.05, XS: 12.7, 80: 23.83, 100: 29.36, 120: 34.93, 140: 39.67, 160: 45.24 }, 4.19, 4.78),
  S('20', 500, 508, { 10: 6.35, 20: 9.53, 30: 12.7, STD: 9.53, 40: 15.09, 60: 20.62, XS: 12.7, 80: 26.19, 100: 32.54, 120: 38.1, 140: 44.45, 160: 50.01 }, 4.78, 5.54),
  S('22', 550, 559, { 10: 6.35, 20: 9.53, 30: 12.7, STD: 9.53, 60: 22.23, XS: 12.7, 80: 28.58, 100: 34.93, 120: 41.28, 140: 47.63, 160: 53.98 }, 4.78, 5.54),
  S('24', 600, 610, { 10: 6.35, 20: 9.53, 30: 14.27, STD: 9.53, 40: 17.48, 60: 24.61, XS: 12.7, 80: 30.96, 100: 38.89, 120: 46.02, 140: 52.37, 160: 59.54 }, 5.54, 6.35),
];

/** Pouces (nombre) d'une désignation NPS (« 1 1/2 » → 1,5). */
export function npsInches(nps) {
  return String(nps)
    .split(' ')
    .reduce((s, p) => {
      const [a, b] = p.split('/');
      return s + (b ? +a / +b : +a);
    }, 0);
}

/** Épaisseurs disponibles pour une dimension : [[schedule, e], …] selon la norme. */
export function schedulesOf(standard, size) {
  if (!size) return [];
  if (standard === 'B36.19M') {
    // 40S et 80S : égales aux Sch 40 / Sch 80 jusqu'au NPS 10, puis 9,53 / 12,70
    const n = npsInches(size.nps);
    const t40 = n <= 10 ? size.sch[40] : 9.53;
    const t80 = n <= 8 ? size.sch[80] : 12.7;
    return [['5S', size.s5], ['10S', size.s10], ['40S', t40], ['80S', t80]].filter(([, t]) => t > 0);
  }
  return B3610_SCHEDULES.filter((k) => size.sch[k] > 0).map((k) => [k, size.sch[k]]);
}

/** Dimension normalisée correspondant à un diamètre extérieur (à 0,6 mm près). */
export function sizeFromOD(od) {
  return PIPE_SIZES.find((s) => Math.abs(s.od - +od) <= 0.6) ?? null;
}

// Rayons des coudes à souder ASME B16.9 (distance centre-extrémité du coude à 90°)
const B169_LR = { '1/2': 38, '3/4': 29, 1: 38, '1 1/4': 48, '1 1/2': 57, 2: 76, '2 1/2': 95, 3: 114, '3 1/2': 133, 4: 152, 5: 190, 6: 229, 8: 305, 10: 381, 12: 457, 14: 533, 16: 610, 18: 686, 20: 762, 22: 838, 24: 914 };
const B169_SR = { 1: 25, '1 1/4': 32, '1 1/2': 38, 2: 51, '2 1/2': 64, 3: 76, '3 1/2': 89, 4: 102, 5: 127, 6: 152, 8: 203, 10: 254, 12: 305, 14: 356, 16: 406, 18: 457, 20: 508, 22: 559, 24: 610 };
const B169_3D = { '3/4': 57, 1: 76, '1 1/4': 95, '1 1/2': 114, 2: 152, '2 1/2': 190, 3: 229, '3 1/2': 267, 4: 305, 5: 381, 6: 457, 8: 610, 10: 762, 12: 914, 14: 1067, 16: 1219, 18: 1372, 20: 1524, 22: 1676, 24: 1829 };

/** Types de rayon de coude proposés ('' : 1,5 De, comportement historique). */
export const BEND_RADIUS_TYPES = {
  '': '1,5 De',
  LR: 'LR 1,5D (B16.9)',
  SR: 'SR 1D (B16.9)',
  '3D': '3D (B16.9)',
  '5D': '5D cintré',
};

/**
 * Rayon de cintrage d'un coude normalisé pour un diamètre extérieur donné.
 * @returns { R, size } ou { R: null, reason } si le type n'existe pas pour ce diamètre
 */
export function elbowRadius(type, od) {
  if (!type) return { R: Math.round(1.5 * od) };
  const size = sizeFromOD(od);
  if (!size) return { R: null, reason: `diamètre ${od} mm absent du catalogue ASME B36.10M/B36.19M` };
  const table = { LR: B169_LR, SR: B169_SR, '3D': B169_3D }[type];
  const R = table ? table[size.nps] : type === '5D' ? Math.round(5 * npsInches(size.nps) * 25.4) : undefined;
  if (!(R > 0)) return { R: null, reason: `coude ${BEND_RADIUS_TYPES[type] ?? type} non défini pour le NPS ${size.nps}` };
  return { R, size };
}
