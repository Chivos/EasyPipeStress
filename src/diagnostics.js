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

/**
 * État des contacts des supports dans les états statiques (poids, poids +
 * dilatation) et sous séisme, d'après le calcul linéaire :
 *  - 'liftoff'  appui simple dont l'effort est dirigé vers le haut ;
 *  - 'seismicLiftoff' appui simple dont l'effort sismique dépasse la charge portée ;
 *  - 'gap'      jeu rattrapé (la direction, libre dans le calcul statique, devrait porter) ;
 *  - 'oneWay'   butée à un seul sens, au contact, sollicitée dans le sens où elle est libre ;
 *  - 'travel' / 'seismicTravel' course d'un support à ressort dépassée (butée atteinte).
 * Chaque constat : { type, support, state, value, limit }. Ces constats alimentent
 * les avertissements ; ils désignent aussi les contacts qu'un calcul non linéaire
 * aurait à modifier (appui à retirer, jeu ou butée à activer).
 */
export function contactFindings({ mesh, cases, nonlinear = null }) {
  const W = cases.filter((c) => c.type === 'weight' && c.fe !== false);
  const T = cases.filter((c) => c.type === 'thermal');
  const S = cases.filter((c) => c.type === 'seismic');
  const wName = W.map((c) => c.id).join('+');
  // états statiques : poids seul, puis poids + chaque cas de dilatation
  const states = [{ name: wName || '—', list: W }, ...T.map((t) => ({ name: `${wName}${wName ? '+' : ''}${t.id}`, list: [...W, t] }))];
  const sum = (list, f) => list.reduce((a, c) => a + f(c), 0);
  const along = (v, o, d) => v[o] * d[0] + v[o + 1] * d[1] + v[o + 2] * d[2];
  const up = mesh.up;
  const out = [];
  mesh.supports.forEach((sup, k) => {
    const springs = mesh.springs.filter((sp) => sp.support === k && !sp.rot);
    // solveur non linéaire : appui décollé dans un état calculé, compté actif (bilatéral) sous séisme
    const liftedIn = nonlinear ? nonlinear.states.filter((st) => st.contacts.some((cs, i) => cs.status === 'lifted' && nonlinear.contacts[i].support === k)) : [];
    if (liftedIn.length) {
      if (S.length) out.push({ type: 'seismicRestLifted', support: k, state: liftedIn.map((st) => st.name).join(', '), value: 0, limit: 0 });
    } else if (springs.some((sp) => sp.bearing)) {
      // appui simple : effort de la tuyauterie sur l'appui (positif vers le haut = soulèvement)
      const loads = states.map((st) => ({ st, f: sum(st.list, (c) => along(c.supportLoads, k * 6, up)) }));
      const worst = loads.reduce((a, b) => (b.f > a.f ? b : a));
      if (worst.f > 1) out.push({ type: 'liftoff', support: k, state: worst.st.name, value: worst.f, limit: 0 });
      else {
        // charge portée la plus faible, comparée à l'effort vertical sismique (enveloppe)
        const bearing = -worst.f;
        for (const sc of S) {
          const sv = Math.abs(along(sc.supportLoads, k * 6, up));
          if (sv > bearing + 1) out.push({ type: 'seismicLiftoff', support: k, state: `${worst.st.name}±${sc.id}`, value: sv, limit: bearing });
        }
      }
    }
    // jeux : déplacement libre suivant la direction, comparé au jeu du côté où il se fait
    // (solveur non linéaire : le jeu rattrapé est déjà porté par le support)
    for (const sp of springs) {
      if (!sp.gapped || nonlinear) continue;
      if (sp.oneWay) {
        // butée au contact d'un côté, prise dans les deux sens : effort de la tuyauterie sur la butée,
        // suivant sa direction ; elle ne tient que si la tuyauterie pousse du côté du contact
        const loads = states.map((st) => ({ st, f: sum(st.list, (c) => along(c.supportLoads, k * 6, sp.dir)) }));
        const worst = loads.reduce((a, b) => (b.f * sp.oneWay < a.f * sp.oneWay ? b : a));
        if (worst.f * sp.oneWay < -1) out.push({ type: 'oneWay', support: k, state: worst.st.name, value: Math.abs(worst.f), limit: 0, dir: sp.dir, side: -sp.oneWay });
        continue;
      }
      // dépassement le plus grand, d'un côté ou de l'autre
      const moves = states.map((st) => {
        const d = sum(st.list, (c) => along(c.u, sup.node * 6, sp.dir));
        const limit = d >= 0 ? sp.gapPlus : sp.gapMinus;
        return { st, d, limit, over: Math.abs(d) - limit };
      });
      const worst = moves.reduce((a, b) => (b.over > a.over ? b : a));
      if (worst.over > 1e-6) out.push({ type: 'gap', support: k, state: worst.st.name, value: Math.abs(worst.d), limit: worst.limit, dir: sp.dir, side: worst.d >= 0 ? 1 : -1, sided: sp.gapMinus !== sp.gapPlus });
    }
    // supports à ressort : course depuis la position de réglage
    if (sup.travelUp != null || sup.travelDown != null) {
      const over = (uz) => (sup.travelUp != null && uz > sup.travelUp + 1e-6 ? ['haute', uz, sup.travelUp] : sup.travelDown != null && -uz > sup.travelDown + 1e-6 ? ['basse', -uz, sup.travelDown] : null);
      const moves = states.map((st) => ({ st, uz: sum(st.list, (c) => along(c.u, sup.node * 6, up)) }));
      // solveur non linéaire : la butée est active, le déplacement s'y arrête
      const hit = nonlinear ? null : moves.map((m) => ({ ...m, o: over(m.uz) })).filter((m) => m.o).sort((a, b) => b.o[1] - b.o[2] - (a.o[1] - a.o[2]))[0];
      if (hit) out.push({ type: 'travel', support: k, state: hit.st.name, value: hit.o[1], limit: hit.o[2], side: hit.o[0] });
      else {
        for (const sc of S) {
          const su = Math.abs(along(sc.u, sup.node * 6, up));
          const o = moves.map((m) => over(m.uz + su) ?? over(m.uz - su)).filter(Boolean)[0];
          if (o) {
            out.push({ type: 'seismicTravel', support: k, state: `${states[states.length - 1].name}±${sc.id}`, value: o[1], limit: o[2], side: o[0] });
            break;
          }
        }
      }
    }
  });
  // solveur non linéaire : le séisme compte actifs des supports qui ne le sont pas en service
  if (nonlinear && S.length) {
    nonlinear.contacts.forEach((c, i) => {
      if (c.kind !== 'gap') return;
      const open = nonlinear.states.filter((st) => st.contacts[i].status === 'open');
      // jeu annoncé : le plus petit des deux côtés qui ont une butée
      const limit = Math.min(c.d2, -c.d1);
      if (open.length) out.push({ type: 'seismicGapOpen', support: c.support, state: open.map((st) => st.name).join(', '), value: Math.max(...open.map((st) => Math.abs(st.contacts[i].d))), limit, dir: c.dir, sides: c.d2 === -c.d1 ? null : [-c.d1, c.d2] });
    });
  }
  return out;
}

/** Contrôles sur l'ensemble des cas calculés. */
export function resultDiagnostics({ mesh, cases, contacts = contactFindings({ mesh, cases }) }) {
  const out = [];
  const W = cases.filter((c) => c.type === 'weight' && c.fe !== false);
  // 1. plusieurs cas de poids : cumulés dans M_A (éq. 6, 8, 10)
  if (W.length > 1) out.push(`${W.length} cas de poids propre actifs (${W.map((c) => c.id).join(', ')}) : leurs moments sont cumulés dans M_A (éq. 6, 8 et 10). N’activer qu’un seul cas de poids par calcul.`);
  // 2. contacts : le calcul est linéaire, les supports à contact sont contrôlés après coup
  const name = (c) => `${mesh.supports[c.support].label} (nœud ${mesh.nodes[mesh.supports[c.support].node].label})`;
  const of = (type) => contacts.filter((c) => c.type === type);
  const lifted = of('liftoff').map((c) => `${name(c)} : ${round(c.value, 0)} N vers le haut sous ${c.state}`);
  if (lifted.length) {
    out.push(
      `Appui(s) soulevé(s) — ${lifted.join(' ; ')}. Le calcul est linéaire : l’appui retient la tuyauterie vers le haut alors qu’un appui simple décollerait. ` +
        'Résultats à confirmer en supprimant cet appui dans les cas concernés, ou en le remplaçant par un support adapté (bilatéral, variable).',
    );
  }
  const seismicLift = of('seismicLiftoff').map((c) => `${name(c)} : effort sismique vertical ${round(c.value, 0)} N pour ${round(c.limit, 0)} N portés (${c.state})`);
  if (seismicLift.length) out.push(`Appui(s) simple(s) qui décollerai(en)t sous séisme — ${seismicLift.join(' ; ')}. Le calcul sismique les prend bilatéraux.`);
  const axis = (d) => ['X', 'Y', 'Z'].find((_, i) => Math.abs(Math.abs(d[i]) - 1) < 1e-6) ?? `(${d.map((x) => round(x, 2)).join(' ; ')})`;
  const sideName = (c) => `${c.side > 0 ? '+' : '−'}${axis(c.dir)}`;
  const gaps = of('gap').map((c) => `${name(c)}, direction ${axis(c.dir)} : déplacement ${round(c.value, 2)} mm pour un jeu de ${round(c.limit, 2)} mm${c.sided ? ` côté ${sideName(c)}` : ''} sous ${c.state}`);
  if (gaps.length) {
    out.push(
      `Jeu(x) rattrapé(s) — ${gaps.join(' ; ')}. Le calcul statique laisse cette direction libre : le support devrait porter, efforts et contraintes sont à confirmer en supprimant le jeu de ce support.`,
    );
  }
  const oneWay = of('oneWay').map((c) => `${name(c)}, direction ${axis(c.dir)} : ${round(c.value, 0)} N vers ${sideName(c)} sous ${c.state}`);
  if (oneWay.length) {
    out.push(
      `Butée(s) à un seul sens sollicitée(s) en sens inverse — ${oneWay.join(' ; ')}. Le calcul est linéaire : la butée retient la tuyauterie du côté où elle est libre. ` +
        'Résultats à confirmer avec le solveur non linéaire, ou en supprimant cette butée dans les cas concernés.',
    );
  }
  const travel = of('travel').map((c) => `${name(c)} : butée ${c.side}, déplacement ${round(c.value, 2)} mm pour une course de ${round(c.limit, 2)} mm sous ${c.state}`);
  if (travel.length) out.push(`Course de support à ressort dépassée — ${travel.join(' ; ')}. Le calcul ne bloque pas le support sur sa butée : choisir un support de course suffisante ou revoir son réglage.`);
  const restLifted = of('seismicRestLifted').map((c) => `${name(c)} : décollé sous ${c.state}`);
  if (restLifted.length) out.push(`Appui(s) décollé(s) en service, compté(s) actif(s) sous séisme — ${restLifted.join(' ; ')}. L’analyse sismique est linéaire : elle prend l’appui bilatéral.`);
  const gapSize = (c) => (c.sides ? `${c.sides.map((g, i) => (Number.isFinite(g) ? `${i ? '+' : '−'}${round(g, 2)}` : `${i ? '+' : '−'} libre`)).join(' / ')} mm` : `${round(c.limit, 2)} mm`);
  const gapOpen = of('seismicGapOpen').map((c) => `${name(c)}, direction ${axis(c.dir)} : jeu de ${gapSize(c)} ouvert sous ${c.state}`);
  if (gapOpen.length) out.push(`Jeu(x) ouvert(s) en service, support(s) compté(s) actif(s) sous séisme — ${gapOpen.join(' ; ')}. L’analyse sismique est linéaire : elle ignore le jeu.`);
  const seismicTravel = of('seismicTravel').map((c) => `${name(c)} : butée ${c.side}, ${round(c.value, 2)} mm pour une course de ${round(c.limit, 2)} mm (${c.state})`);
  if (seismicTravel.length) out.push(`Course de support à ressort dépassée sous séisme — ${seismicTravel.join(' ; ')}.`);
  return out;
}
