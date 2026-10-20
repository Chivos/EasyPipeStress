// Export des résultats vers Excel : une feuille par donnée (une par équation du
// code, une par support, une par cas pour les déplacements et efforts internes,
// modes propres), au choix de l'utilisateur.

import { h, download } from './dom.js';
import { buildXlsx } from '../core/xlsx.js';
import { displayCases, pointResults, supportPoint, forcePoint, modalSums, showModal } from './results.js';
import { SUPPORT_KINDS } from '../components/support.js';

/** Contenus exportables : [clé, libellé, disponible ?] */
export function exportChoices(r) {
  return [
    ['summary', 'Synthèse (projet, taux maximaux par critère, avertissements)', true],
    ['code', 'Vérification du code : contraintes et taux (une feuille par équation)', !!r.check?.rows.length],
    ['supports', 'Efforts sur supports : une feuille par support (cas, combinaisons, enveloppe)', r.mesh.supports.length > 0],
    ['supportsCases', 'Efforts sur supports : une feuille par cas (tous les supports)', r.mesh.supports.length > 0],
    ['disp', 'Déplacements : une feuille par cas', true],
    ['forces', 'Efforts internes : une feuille par cas', true],
    ['modes', 'Modes propres et masses modales', !!r.modal],
  ];
}

const r3 = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : v);

function summarySheet(state, r) {
  const m = state.model;
  const rows = [
    ['Rubrique', 'Valeur'],
    ['Étude', m.meta.title],
    ['Auteur', m.meta.author],
    ['Code', r.code?.label ?? m.code.id],
    ['Date d’export', new Date().toLocaleString('fr-FR')],
    ['Nœuds / éléments', `${r.mesh.nodes.length} / ${r.mesh.elements.length}`],
    [],
    ['Critère', 'Cas', 'Nœud', 'Élément', 'Composant', 'σ (MPa)', 'Admissible (MPa)', 'Taux'],
  ];
  for (const g of r.check?.summary.governing ?? []) rows.push([g.eqLabel, g.case, g.node, g.elem, g.comp, r3(g.stress, 2), r3(g.allow, 2), r3(g.effRatio)]);
  if (r.check) rows.push([], ['Conclusion', r.check.summary.ok ? 'Critères satisfaits' : 'Critère(s) non satisfait(s)', '', '', '', '', 'Taux max', r3(r.check.summary.maxRatio)]);
  if (r.warnings.length) rows.push([], ['Avertissements'], ...r.warnings.map((w) => [w]));
  return { name: 'Synthèse', rows, header: 1, widths: [34, 30, 10, 18, 16, 12, 16, 10] };
}

function codeSheets(r) {
  const groups = new Map();
  for (const x of r.check.rows) (groups.get(x.eq) ?? groups.set(x.eq, []).get(x.eq)).push(x);
  return [...groups].map(([eq, list]) => {
    const thick = eq === 'e';
    const head = thick
      ? ['Nœud', 'Élément', 'Composant', 'eₘ requise (mm)', 'e disponible (mm)', 'Taux', 'P (MPa)', 'S (MPa)', 'I']
      : ['Critère', 'Cas', 'Nœud', 'Élément', 'Composant', 'σ (MPa)', 'Admissible (MPa)', 'Taux', 'Couvert par', 'i', '0,75i', 'Z (mm³)', 'P (MPa)', 'M_A (N·m)', 'M_B (N·m)', 'M_C (N·m)', 'S_A (MPa)'];
    const rows = [head];
    for (const x of list) {
      const d = x.detail ?? {};
      rows.push(
        thick
          ? [x.node, x.elem, x.comp, r3(x.stress), r3(x.allow), r3(x.ratio), d.P, d.S, d.I]
          : [x.eqLabel, x.case, x.node, x.elem, x.comp, r3(x.stress, 2), r3(x.allow, 2), r3(x.ratio), x.coveredBy ? `Éq. (${x.coveredBy})` : '', r3(d.i), r3(d.i75), r3(d.Z, 0), d.P, d.MA != null ? r3(d.MA / 1000, 1) : null, d.MB != null ? r3(d.MB / 1000, 1) : null, d.MC != null ? r3(d.MC / 1000, 1) : null, d.SA != null ? r3(d.SA, 2) : null],
      );
    }
    return { name: thick ? 'Épaisseur' : `Éq ${eq}`, rows };
  });
}

/** Tableau complet en un point (cas, combinaisons ± séisme, enveloppe). */
function pointRows(r, def) {
  const { elementary, combos, env } = pointResults(r, def.values, def.derived);
  const heads = ['Cas / combinaison', ...def.columns, ...def.derived.map(([l]) => l)];
  const line = (row) => [row.label, ...row.vals.map((v, j) => r3(v, def.digits[j])), ...def.derived.map((_, j) => (row.der?.[j] == null ? null : r3(row.der[j], def.digits[def.columns.length + j])))];
  return [
    heads,
    ['Cas élémentaires (séisme : enveloppe ±)'],
    ...elementary.map(line),
    ['Combinaisons'],
    ...combos.map(line),
    line(env),
  ];
}

function supportSheets(r) {
  return r.mesh.supports.map((s, k) => {
    const def = supportPoint(r, k);
    return { name: `Sup ${s.label || k + 1} (${r.mesh.nodes[s.node].label})`, rows: [[def.title], [def.subtitle], ...pointRows(r, def)], header: 3 };
  });
}

function supportCaseSheets(r) {
  return displayCases(r).map((c) => ({
    name: `Supports ${c.id}`,
    rows: [
      ['Nœud', 'Repère', 'Type', 'FX (N)', 'FY (N)', 'FZ (N)', 'MX (N·m)', 'MY (N·m)', 'MZ (N·m)', 'DX (mm)', 'DY (mm)', 'DZ (mm)'],
      ...r.mesh.supports.map((s, k) => [
        r.mesh.nodes[s.node].label,
        s.label,
        SUPPORT_KINDS[s.kind]?.label ?? s.kind,
        ...[0, 1, 2].map((d) => r3(c.supportLoads[k * 6 + d], 0)),
        ...[3, 4, 5].map((d) => r3(c.supportLoads[k * 6 + d] / 1000, 1)),
        ...[0, 1, 2].map((d) => r3(c.u[s.node * 6 + d], 3)),
      ]),
    ],
  }));
}

function dispSheets(r) {
  return displayCases(r).map((c) => ({
    name: `Dépl ${c.id}`,
    rows: [
      ['Nœud', 'DX (mm)', 'DY (mm)', 'DZ (mm)', 'RX (°)', 'RY (°)', 'RZ (°)', 'D total (mm)'],
      ...r.mesh.nodes.map((n, i) => [n.label, ...[0, 1, 2].map((d) => r3(c.u[i * 6 + d], 3)), ...[3, 4, 5].map((d) => r3((c.u[i * 6 + d] * 180) / Math.PI, 4)), r3(Math.hypot(c.u[i * 6], c.u[i * 6 + 1], c.u[i * 6 + 2]), 3)]),
    ],
  }));
}

function forceSheets(r) {
  return displayCases(r).map((c) => ({
    name: `Efforts ${c.id}`,
    rows: [
      ['Élément', 'Nœud', 'N (N)', 'Vy (N)', 'Vz (N)', 'Mt (N·m)', 'My (N·m)', 'Mz (N·m)', 'Mf (N·m)', 'M rés. (N·m)'],
      ...r.mesh.elements.flatMap((e, ie) =>
        [0, 1].map((end) => {
          const v = forcePoint(r, ie, end).values(c);
          return [e.label, r.mesh.nodes[end ? e.n2 : e.n1].label, ...v.map((x, d) => r3(x, d < 3 ? 0 : 1)), r3(Math.hypot(v[4], v[5]), 1), r3(Math.hypot(v[3], v[4], v[5]), 1)];
        }),
      ),
    ],
  }));
}

function modeSheet(r) {
  const md = r.modal;
  const tot = md.totalMass;
  const pct = (v, d) => r3((100 * v) / (tot[d] || 1), 2);
  const cum = [0, 0, 0];
  const sums = modalSums(md);
  return {
    name: 'Modes propres',
    rows: [
      ['Mode', 'f (Hz)', 'T (s)', 'Γx', 'Γy', 'Γz', '%X', '%Y', '%Z', 'ΣX %', 'ΣY %', 'ΣZ %'],
      ...md.modes.map((m, k) => {
        m.effMass.forEach((v, d) => (cum[d] += v));
        return [k + 1, r3(m.freq, 4), r3(1 / m.freq, 5), ...m.gamma.map((g) => r3(g, 5)), ...m.effMass.map(pct), ...cum.map(pct)];
      }),
      ['Σ', null, null, null, null, null, ...sums.eff.map(pct), ...sums.eff.map(pct)],
      ['Supports rigides', null, null, null, null, null, ...sums.supported.map(pct)],
      [],
      ['Masse globale (kg)', r3(tot[0] * 1000, 1)],
    ],
  };
}

/** Feuilles du classeur pour les contenus choisis. */
export function exportSheets(state, keys) {
  const r = state.result;
  const sel = new Set(keys);
  const sheets = [];
  if (sel.has('summary')) sheets.push(summarySheet(state, r));
  if (sel.has('code') && r.check) sheets.push(...codeSheets(r));
  if (sel.has('supports')) sheets.push(...supportSheets(r));
  if (sel.has('supportsCases')) sheets.push(...supportCaseSheets(r));
  if (sel.has('disp')) sheets.push(...dispSheets(r));
  if (sel.has('forces')) sheets.push(...forceSheets(r));
  if (sel.has('modes') && r.modal) sheets.push(modeSheet(r));
  return sheets;
}

const PREF_KEY = 'easypipestress:export';

/** Fenêtre de choix des contenus, puis téléchargement du classeur. */
export function openExportDialog(state) {
  const r = state.result;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
  } catch {
    /* préférences indisponibles */
  }
  const boxes = exportChoices(r).map(([key, label, ok]) => {
    const input = h('input', { type: 'checkbox', checked: ok && (saved ? saved.includes(key) : key !== 'forces'), disabled: !ok });
    return { key, input, el: h('label', { class: `check block${ok ? '' : ' muted'}` }, input, ' ', label) };
  });
  const go = () => {
    const keys = boxes.filter((b) => b.input.checked && !b.input.disabled).map((b) => b.key);
    if (!keys.length) return;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(keys));
    } catch {
      /* préférences non mémorisées */
    }
    const data = buildXlsx(exportSheets(state, keys));
    const base = (state.model.meta.title || 'resultats').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
    download(`${base}.xlsx`, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    document.querySelector('.modal-backdrop')?.remove();
  };
  const all = (v) => boxes.forEach((b) => !b.input.disabled && (b.input.checked = v));
  showModal(
    'Export Excel des résultats',
    [
      h('p', { class: 'muted' }, 'Choisir les résultats à exporter : chaque donnée est placée dans une feuille du classeur (.xlsx).'),
      h('div', { class: 'export-list' }, boxes.map((b) => b.el)),
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'small ghost', onclick: () => all(true) }, 'Tout cocher'),
        h('button', { class: 'small ghost', onclick: () => all(false) }, 'Tout décocher'),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'primary', onclick: go }, 'Exporter (.xlsx)'),
      ),
    ],
    { label: 'Export Excel' },
  );
}
