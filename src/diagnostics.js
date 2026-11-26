// Contrôles de validité des résultats : avertissements sur les situations où les
// hypothèses du calcul (linéaire, spectral) ne sont plus respectées ou conduisent
// à un résultat à interpréter avec prudence. Aucun résultat n'est modifié.

import { spectrumAt, zpa } from './fem/spectral.js';
import { spectrumFor } from './loads/seismic.js';

const DIRS = ['X', 'Y', 'Z'];
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Contrôles propres à un cas sismique spectral (lc : données du cas, r : résultat). */
export function seismicDiagnostics(lc, r, mesh) {
  const out = [];
  if (r.info?.method !== 'spectral' || !r.modal) return out;
  const name = lc.label || lc.id;
  const cutoff = r.info.cutoff;
  const { modal } = r;
  // 1. modes omis sous la coupure (contrôle de Sturm non corrigé)
  if (modal.sturm?.missing > 0 && !modal.sturm.corrected) {
    out.push(`${name} : le contrôle de Sturm compte ${modal.sturm.expected} modes sous ${cutoff} Hz, ${modal.sturm.found} ont été calculés ; résultat sismique non fiable (réduire la taille du modèle ou la fréquence de coupure).`);
  }
  // 2. coupure placée dans la zone amplifiée du spectre : la masse manquante, prise
  //    à l'accélération à période nulle, sous-estime la réponse des modes non retenus
  const vertical = DIRS[mesh.up.indexOf(1)];
  const amplified = [];
  for (const d of DIRS) {
    const sp = spectrumFor(lc, d, vertical);
    if (!sp?.points?.length || !+sp.factor) continue;
    const a0 = zpa(sp.points);
    const ac = spectrumAt(sp.points, cutoff, lc.interp);
    if (a0 > 0 && ac > 1.05 * a0) amplified.push(`${d} : ${round(ac, 3)} g à ${cutoff} Hz pour ${round(a0, 3)} g à période nulle`);
  }
  if (amplified.length) {
    out.push(
      `${name} : la fréquence de coupure (${cutoff} Hz) est dans la zone amplifiée du spectre (${[...new Set(amplified)].join(' ; ')}). ` +
        (lc.missingMass !== false ? 'La masse manquante est calculée à l’accélération à période nulle : réponse des modes non retenus sous-estimée. ' : '') +
        'Porter la coupure à la fréquence où le spectre rejoint l’accélération à période nulle.',
    );
  }
  // 3. combinaison quadratique simple (SRSS) avec des modes de fréquences voisines
  const used = modal.modes.filter((m) => m.freq <= cutoff);
  if (lc.modal === 'SRSS') {
    const close = [];
    for (let k = 1; k < used.length; k++) if (used[k].freq <= 1.1 * used[k - 1].freq) close.push(`${round(used[k - 1].freq, 2)} et ${round(used[k].freq, 2)} Hz`);
    if (close.length) out.push(`${name} : combinaison SRSS avec des modes de fréquences voisines (écart ≤ 10 % : ${close.slice(0, 3).join(' ; ')}${close.length > 3 ? '…' : ''}) ; la combinaison CQC est recommandée dans ce cas.`);
  }
  // 4. maillage trop lâche pour les modes jusqu'à la coupure : moins de deux
  //    éléments par demi-onde de flexion, λ/2 = √(π/(2f))·(EI/m)^¼
  const coarse = [];
  for (const e of mesh.elements) {
    if (e.kind !== 'pipe' || e.rigid) continue;
    const mpl = e.mpl.metal + e.mpl.fluid + e.mpl.insul;
    if (!(mpl > 0)) continue;
    const half = Math.sqrt(Math.PI / (2 * cutoff)) * ((e.E * e.sec.I) / mpl) ** 0.25;
    if (e.L > half / 2) coarse.push({ e, half });
  }
  if (coarse.length) {
    const worst = coarse.reduce((a, b) => (b.e.L / b.half > a.e.L / a.half ? b : a));
    out.push(
      `${name} : ${coarse.length} élément(s) trop long(s) pour représenter les modes jusqu’à ${cutoff} Hz (par ex. ${worst.e.label} : ${round(worst.e.L, 0)} mm pour une demi-onde de flexion de ${round(worst.half, 0)} mm) ; ` +
        'fréquences des modes élevés sous-estimées. Réduire la longueur maximale d’élément (onglet Projet).',
    );
  }
  return out;
}

/** Contrôles sur l'ensemble des cas calculés. */
export function resultDiagnostics({ mesh, cases }) {
  const out = [];
  const W = cases.filter((c) => c.type === 'weight' && c.fe !== false);
  const T = cases.filter((c) => c.type === 'thermal');
  // 1. plusieurs cas de poids : cumulés dans M_A (éq. 6, 8, 10)
  if (W.length > 1) out.push(`${W.length} cas de poids propre actifs (${W.map((c) => c.id).join(', ')}) : leurs moments sont cumulés dans M_A (éq. 6, 8 et 10). N’activer qu’un seul cas de poids par calcul.`);
  // 2. appuis simples soulevés : le calcul est linéaire (appui bilatéral), alors
  //    qu'un appui réel ne retient pas la tuyauterie vers le haut
  const up = mesh.up;
  const vert = (c, k) => c.supportLoads[k * 6] * up[0] + c.supportLoads[k * 6 + 1] * up[1] + c.supportLoads[k * 6 + 2] * up[2];
  const lifted = [];
  mesh.supports.forEach((s, k) => {
    if (s.kind !== 'rest' && s.kind !== 'restguide') return;
    const w = W.reduce((a, c) => a + vert(c, k), 0);
    const states = [[W.map((c) => c.id).join('+') || '—', w], ...T.map((t) => [`${W.map((c) => c.id).join('+')}${W.length ? '+' : ''}${t.id}`, w + vert(t, k)])];
    // effort de la tuyauterie sur le support dirigé vers le haut : l'appui devrait décoller
    const bad = states.filter(([, f]) => f > 1).sort((a, b) => b[1] - a[1])[0];
    if (bad) lifted.push(`${s.label} (nœud ${mesh.nodes[s.node].label}) : ${round(bad[1], 0)} N vers le haut sous ${bad[0]}`);
  });
  if (lifted.length) {
    out.push(
      `Appui(s) soulevé(s) — ${lifted.join(' ; ')}. Le calcul est linéaire : l’appui retient la tuyauterie vers le haut alors qu’un appui simple décollerait. ` +
        'Résultats à confirmer en supprimant cet appui dans les cas concernés, ou en le remplaçant par un support adapté (bilatéral, variable).',
    );
  }
  return out;
}
