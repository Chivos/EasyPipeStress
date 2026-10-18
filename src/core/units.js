// Système d'unités interne cohérent : mm, N, MPa (N/mm²), tonne (t), s.
// 1 N = 1 t·mm/s². Les saisies utilisateur en kg et kg/m³ sont converties ici.

export const G_STD = 9806.65; // accélération de la pesanteur, mm/s²
export const kgToT = (kg) => kg * 1e-3;
export const tToKg = (t) => t * 1e3;
export const densityToInternal = (kgPerM3) => kgPerM3 * 1e-12; // kg/m³ → t/mm³

export const DOF_NAMES = ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ'];
export const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

export function fmt(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  const a = Math.abs(v);
  if (a >= 1e9) return v.toExponential(3);
  const s = v.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}
