// Restitution des résultats : synthèse, tableaux détaillés et données de
// coloration de la vue 3D.

import { h } from './dom.js';
import { fmt } from '../core/units.js';
import { combineSigned } from '../analysis.js';
import { SUPPORT_KINDS } from '../components/support.js';

export function ratioColor(r) {
  if (!Number.isFinite(r)) return '#888';
  if (r > 1) return '#c2185b';
  const hue = 120 * (1 - Math.min(1, r));
  return `hsl(${hue.toFixed(0)}, 70%, 42%)`;
}

const RATIO_LEGEND = { title: 'Taux de travail', items: [[ratioColor(0.2), '< 0,5'], [ratioColor(0.65), '0,5 – 0,8'], [ratioColor(0.9), '0,8 – 1,0'], ['#c2185b', '> 1,0 (non conforme)']] };

/** Cas affichables (cas EF + combinaison de service W + T). */
export function displayCases(result) {
  if (!result) return [];
  const list = result.cases.filter((c) => c.fe !== false);
  const w = result.cases.find((c) => c.type === 'weight');
  for (const t of result.cases.filter((c) => c.type === 'thermal')) {
    if (w) {
      const ope = combineSigned(result.cases, [w.id, t.id], `Service (${w.id} + ${t.id})`);
      if (ope) list.push(ope);
    }
  }
  return list;
}

/** Description de la scène 3D selon le mode d'affichage choisi. */
export function buildScene(state) {
  const { result, preview, display } = state;
  const mesh = result?.mesh ?? preview;
  const scene = { mesh, selected: state.selected, labels: display.labels, showAllNodes: display.showAll, render: display.render };
  if (!result || !mesh) return scene;
  const [kind, arg] = display.mode.split(':');
  const size = modelSize(mesh);
  if (kind === 'case') {
    const c = displayCases(result).find((x) => x.id === arg);
    if (c) {
      const umax = maxDisp(c.u);
      const at = maxDispNode(mesh, c.u);
      const digits = umax >= 10 ? 1 : 2;
      if (c.signed) {
        const scale = umax > 0 ? ((0.06 * size) / umax) * display.scale : 0;
        scene.displacement = { u: c.u, signed: true, scale, colorOf: dispColor, colorMax: umax };
        scene.legend = {
          title: `Déplacement total — ${c.id}`,
          gradient: { max: umax, unit: 'mm', colorOf: dispColor, digits },
          notes: [`max ${fmt(umax, digits)} mm au nœud ${at}`, `déformée amplifiée ×${fmtScale(scale)}`],
        };
      } else {
        scene.elementColors = mesh.elements.map((e) => dispColor(Math.max(nodeDisp(c.u, e.n1), nodeDisp(c.u, e.n2)) / (umax || 1)));
        scene.legend = {
          title: `Enveloppe |u| — ${c.id}`,
          gradient: { max: umax, unit: 'mm', colorOf: dispColor, digits },
          notes: [`max ${fmt(umax, digits)} mm au nœud ${at}`, 'valeurs non signées : pas de déformée'],
        };
      }
    }
  } else if (kind === 'mode' && result.modal) {
    const md = result.modal.modes[+arg];
    if (md) {
      const umax = maxDisp(md.phi);
      scene.displacement = { u: md.phi, signed: true, scale: ((0.08 * size) / (umax || 1)) * display.scale, colorOf: dispColor, colorMax: umax };
      scene.animate = display.animate;
      scene.legend = {
        title: `Mode ${+arg + 1} — ${fmt(md.freq, 2)} Hz`,
        gradient: { max: 1, unit: '', colorOf: dispColor, digits: 2 },
        notes: ['amplitude relative (mode normé)', `maximum au nœud ${maxDispNode(mesh, md.phi)}`],
      };
    }
  } else if (kind === 'ratio' && result.check) {
    const per = new Float64Array(mesh.elements.length);
    for (const r of result.check.rows) {
      if (arg !== 'max' && r.eq !== arg) continue;
      const v = r.coveredBy ? 0 : r.ratio;
      if (v > per[r.ie]) per[r.ie] = v;
    }
    scene.elementColors = Array.from(per, (v, ie) => (mesh.elements[ie].kind === 'valve' ? null : ratioColor(v)));
    scene.legend = RATIO_LEGEND;
  }
  return scene;
}

function maxDispNode(mesh, u) {
  let best = 0;
  let label = '–';
  mesh.nodes.forEach((n, i) => {
    const v = nodeDisp(u, i);
    if (v > best) {
      best = v;
      label = n.label;
    }
  });
  return label;
}
const fmtScale = (s) => (s >= 100 ? Math.round(s).toString() : s >= 1 ? s.toFixed(1) : s.toPrecision(2));
const nodeDisp = (u, i) => Math.hypot(u[i * 6], u[i * 6 + 1], u[i * 6 + 2]);
function maxDisp(u) {
  let m = 0;
  for (let i = 0; i < u.length; i += 6) m = Math.max(m, Math.hypot(u[i], u[i + 1], u[i + 2]));
  return m;
}
function modelSize(mesh) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const n of mesh.nodes) [n.x, n.y, n.z].forEach((v, d) => ((mn[d] = Math.min(mn[d], v)), (mx[d] = Math.max(mx[d], v))));
  return Math.max(...mx.map((v, d) => v - mn[d]), 1000);
}
const dispColor = (x) => `hsl(${(220 - 220 * Math.min(1, x)).toFixed(0)}, 70%, 45%)`;

// ------------------------------------------------------------ panneau latéral
export function renderResultsPanel(app) {
  const st = app.state;
  const r = st.result;
  const out = [];
  out.push(
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Calcul'),
      h('button', { class: 'primary wide', onclick: () => app.run() }, r ? 'Relancer le calcul' : 'Lancer le calcul'),
      st.runError ? h('div', { class: 'alert error' }, h('b', {}, 'Calcul impossible'), h('pre', {}, st.runError)) : null,
      r ? h('p', { class: 'muted' }, `${r.mesh.nodes.length} nœuds, ${r.mesh.elements.length} éléments, ${r.sys.n} DDL — ${r.elapsed} ms`) : h('p', { class: 'muted' }, 'Aucun résultat : modifiez le modèle puis lancez le calcul.'),
      r?.warnings?.length ? h('div', { class: 'alert warn' }, h('ul', {}, r.warnings.map((w) => h('li', {}, w)))) : null,
    ),
  );
  if (!r) return h('div', {}, out);
  if (r.check) {
    const s = r.check.summary;
    out.push(
      h(
        'section',
        { class: 'card' },
        h('h3', {}, `Dépouillement — ${r.code.label}`),
        h('div', { class: `verdict ${s.ok ? 'ok' : 'ko'}` }, s.ok ? '✔ Critères satisfaits' : '✘ Critère(s) non satisfait(s)', h('small', {}, ` — taux maximal ${fmt(s.maxRatio, 2)}`)),
        h(
          'table',
          { class: 'grid compact' },
          h('thead', {}, h('tr', {}, th('Critère'), th('Cas'), th('Nœud'), th('σ', true), th('Adm.', true), th('Taux', true))),
          h(
            'tbody',
            {},
            s.governing.map((g) =>
              h(
                'tr',
                { class: 'clickable', title: 'Détail du calcul', onclick: () => (app.select(g.node), openRowDetail(g)) },
                h('td', {}, g.eqLabel),
                h('td', {}, g.case),
                h('td', {}, g.node),
                h('td', { class: 'num' }, fmt(g.stress, g.unit === 'mm' ? 2 : 1)),
                h('td', { class: 'num' }, fmt(g.allow, g.unit === 'mm' ? 2 : 1)),
                h('td', { class: 'num' }, h('span', { class: 'pill', style: { background: ratioColor(g.effRatio) } }, fmt(g.effRatio, 2)), g.coveredBy ? h('small', {}, ` via (${g.coveredBy})`) : null),
              ),
            ),
          ),
        ),
      ),
    );
  }
  if (r.modal) {
    const tot = r.modal.totalMass;
    const sums = modalSums(r.modal);
    const shown = r.modal.modes.slice(0, 12);
    const pct = (v, d) => fmt((100 * v) / (tot[d] || 1), 1);
    const seis = r.cases.find((c) => c.info?.method === 'spectral');
    out.push(
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Analyse modale'),
        h('p', {}, h('b', {}, `Masse globale du système : ${fmt(tot[0] * 1000, 0)} kg`), h('small', { class: 'muted' }, ` (tube, fluide, calorifuge et masses ponctuelles)`)),
        h('p', { class: 'muted' }, 'Les % sont les masses modales effectives (masses participantes) de chaque mode, rapportées à la masse globale, pour chaque direction d’excitation.'),
        seis ? h('p', { class: 'muted' }, `${seis.info.modesUsed} mode(s) sous ${seis.info.cutoff} Hz retenus ; ${Object.entries(seis.info.directions).map(([d, v]) => `${d} : ${fmt(100 * v.captured, 0)} % de masse modale`).join(', ')}.`) : null,
        h(
          'table',
          { class: 'grid compact' },
          h('thead', {}, h('tr', {}, th('Mode'), th('f (Hz)', true), th('%X', true), th('%Y', true), th('%Z', true), th(''))),
          h(
            'tbody',
            {},
            shown.map((md, k) =>
              h(
                'tr',
                {},
                h('td', {}, k + 1),
                h('td', { class: 'num' }, fmt(md.freq, 2)),
                [0, 1, 2].map((d) => h('td', { class: 'num' }, pct(md.effMass[d], d))),
                h('td', {}, h('button', { class: 'small ghost', onclick: () => app.setDisplay(`mode:${k}`) }, 'voir')),
              ),
            ),
            r.modal.modes.length > shown.length
              ? h('tr', {}, h('td', { colspan: 6, class: 'muted' }, `… ${r.modal.modes.length - shown.length} autres modes (onglet « Modes propres »)`))
              : null,
            h('tr', { class: 'total' }, h('td', {}, `Σ ${r.modal.modes.length} modes`), h('td', {}), [0, 1, 2].map((d) => h('td', { class: 'num' }, pct(sums.eff[d], d))), h('td', {})),
            h('tr', { class: 'muted' }, h('td', { colspan: 2 }, 'Masse sur supports rigides'), [0, 1, 2].map((d) => h('td', { class: 'num' }, pct(sums.supported[d], d))), h('td', {})),
          ),
        ),
      ),
    );
  }
  return h('div', {}, out);
}

// ------------------------------------------------------------ tableaux du bas
export const BOTTOM_TABS = [
  ['code', 'Vérification code'],
  ['disp', 'Déplacements'],
  ['supports', 'Efforts sur supports'],
  ['forces', 'Efforts internes'],
  ['modes', 'Modes propres'],
];

export function renderBottom(app) {
  const st = app.state;
  const r = st.result;
  if (!r) return h('p', { class: 'muted pad' }, 'Les tableaux de résultats apparaîtront ici après le calcul.');
  const f = st.filter;
  const cases = displayCases(r);
  if (!cases.find((c) => c.id === f.case)) f.case = cases[0]?.id;
  const c = cases.find((x) => x.id === f.case);
  const caseSel = h(
    'select',
    { onchange: (e) => app.setUi(() => (f.case = e.target.value)) },
    cases.map((x) => h('option', { value: x.id, selected: x.id === f.case }, `${x.id} — ${x.label}${x.signed ? '' : ' (enveloppe)'}`)),
  );
  const internalChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.internal, onchange: (e) => app.setUi(() => (f.internal = e.target.checked)) }), ' nœuds internes');
  const nodeOk = (label) => {
    const n = r.mesh.nodes[r.mesh.nodeIndex.get(label)];
    return f.internal || n?.kind !== 'internal';
  };
  switch (st.bottomTab) {
    case 'code':
      return codeTable(app, r, nodeOk, internalChk);
    case 'disp':
      return h(
        'div',
        {},
        h('div', { class: 'toolbar' }, caseSel, internalChk, c && !c.signed ? h('span', { class: 'muted' }, 'Valeurs enveloppes (non signées).') : null),
        simpleTable(
          ['Nœud', 'DX (mm)', 'DY (mm)', 'DZ (mm)', 'RX (°)', 'RY (°)', 'RZ (°)'],
          r.mesh.nodes
            .map((n, i) => ({ n, i }))
            .filter(({ n }) => nodeOk(n.label))
            .map(({ n, i }) => [n.label, ...[0, 1, 2].map((d) => fmt(c.u[i * 6 + d], 2)), ...[3, 4, 5].map((d) => fmt((c.u[i * 6 + d] * 180) / Math.PI, 3))]),
          (row) => app.select(row[0]),
        ),
      );
    case 'supports':
      return h(
        'div',
        {},
        h('div', { class: 'toolbar' }, caseSel, h('span', { class: 'muted' }, 'Efforts exercés par la tuyauterie sur le support (repère global).')),
        simpleTable(
          ['Nœud', 'Repère', 'Type', 'FX (N)', 'FY (N)', 'FZ (N)', 'MX (N·m)', 'MY (N·m)', 'MZ (N·m)'],
          r.mesh.supports.map((s, k) => [r.mesh.nodes[s.node].label, s.label, SUPPORT_KINDS[s.kind]?.label ?? s.kind, ...[0, 1, 2].map((d) => fmt(c.supportLoads[k * 6 + d], 0)), ...[3, 4, 5].map((d) => fmt(c.supportLoads[k * 6 + d] / 1000, 0))]),
          (row) => app.select(row[0]),
        ),
      );
    case 'forces':
      return h(
        'div',
        {},
        h('div', { class: 'toolbar' }, caseSel, internalChk, h('span', { class: 'muted' }, 'Repère local : N axial (+ traction), Mt torsion, Mf flexion, M résultant.')),
        simpleTable(
          ['Élément', 'Nœud', 'N (N)', 'Vy (N)', 'Vz (N)', 'Mt (N·m)', 'Mf (N·m)', 'M rés. (N·m)'],
          r.mesh.elements.flatMap((e, ie) =>
            [0, 1]
              .filter((end) => nodeOk(r.mesh.nodes[end ? e.n2 : e.n1].label))
              .map((end) => {
                const o = ie * 12 + end * 6;
                const sg = c.signed ? (end ? 1 : -1) : 1;
                const v = Array.from(c.elemForces.slice(o, o + 6), (x) => sg * x);
                return [e.label, r.mesh.nodes[end ? e.n2 : e.n1].label, fmt(v[0], 0), fmt(v[1], 0), fmt(v[2], 0), fmt(v[3] / 1000, 1), fmt(Math.hypot(v[4], v[5]) / 1000, 1), fmt(Math.hypot(v[3], v[4], v[5]) / 1000, 1)];
              }),
          ),
          (row) => app.select(row[1]),
        ),
      );
    case 'modes': {
      if (!r.modal) return h('p', { class: 'muted pad' }, 'Pas d’analyse modale (aucun cas sismique spectral actif).');
      const tot = r.modal.totalMass;
      const cum = [0, 0, 0];
      const sums = modalSums(r.modal);
      const pct = (v, d) => fmt((100 * v) / (tot[d] || 1), 1);
      const totalRow = ['Σ', '', '', '', '', '', ...sums.eff.map(pct), ...sums.eff.map(pct)];
      totalRow.total = true;
      const supRow = ['Supports rigides', '', '', '', '', '', ...sums.supported.map(pct), '', '', ''];
      supRow.total = true;
      return h(
        'div',
        {},
        h('p', {}, h('b', {}, `Masse globale du système : ${fmt(tot[0] * 1000, 0)} kg`), h('span', { class: 'muted' }, ' — %X, %Y, %Z : masse modale effective (participante) de chaque mode rapportée à la masse globale ; ΣX… : cumul. La masse portée par les supports rigides ne participe à aucun mode : elle est prise en compte par la correction de masse manquante.')),
        simpleTable(
          ['Mode', 'f (Hz)', 'T (s)', 'Γx', 'Γy', 'Γz', '%X', '%Y', '%Z', 'ΣX %', 'ΣY %', 'ΣZ %'],
          r.modal.modes.map((md, k) => {
            md.effMass.forEach((v, d) => (cum[d] += v));
            return [k + 1, fmt(md.freq, 3), fmt(1 / md.freq, 4), ...md.gamma.map((g) => fmt(g, 4)), ...md.effMass.map(pct), ...cum.map(pct)];
          }).concat([totalRow, supRow]),
          (row) => !row.total && app.setDisplay(`mode:${row[0] - 1}`),
        ),
      );
    }
    default:
      return h('div');
  }
}

const MAX_ROWS = 200; // lignes affichées par défaut (les plus chargées si tri par taux)

function codeTable(app, r, nodeOk, internalChk) {
  if (!r.check) return h('p', { class: 'muted pad' }, 'Aucun code sélectionné.');
  const f = app.state.filter;
  const eqs = [...new Set(r.check.rows.map((x) => x.eq))];
  const rows = r.check.rows.filter((x) => (f.eq === 'all' || x.eq === f.eq) && nodeOk(x.node) && (!f.failOnly || (x.ratio > 1 && !x.coveredBy)));
  if (f.sort) rows.sort((a, b) => b.ratio - a.ratio);
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'toolbar' },
      h('select', { onchange: (e) => app.setUi(() => (f.eq = e.target.value)) }, h('option', { value: 'all' }, 'Toutes les équations'), eqs.map((q) => h('option', { value: q, selected: q === f.eq }, q === 'e' ? 'Épaisseur' : `Éq. (${q})`))),
      internalChk,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.sort, onchange: (e) => app.setUi(() => (f.sort = e.target.checked)) }), ' trier par taux'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.failOnly, onchange: (e) => app.setUi(() => (f.failOnly = e.target.checked)) }), ' non conformes seulement'),
      h('span', { class: 'muted' }, `${rows.length} ligne(s)`),
      rows.length > MAX_ROWS && !f.all
        ? h('button', { class: 'small ghost', onclick: () => app.setUi(() => (f.all = true)) }, `Afficher les ${rows.length} lignes`)
        : null,
    ),
    simpleTable(
      ['Critère', 'Cas', 'Nœud', 'Élément', 'Composant', 'σ (MPa)', 'Admissible', 'Taux', 'Détail'],
      rows.slice(0, f.all ? rows.length : MAX_ROWS).map((x) => Object.assign([x.eqLabel, x.case, x.node, x.elem, x.comp, fmt(x.stress, x.unit === 'mm' ? 2 : 1) + (x.unit === 'mm' ? ' mm' : ''), fmt(x.allow, x.unit === 'mm' ? 2 : 1), { ratio: x.ratio, covered: x.coveredBy }, detailText(x)], { src: x })),
      (row) => {
        app.select(row[2]);
        openRowDetail(row.src);
      },
      (cell) => (cell && typeof cell === 'object' && 'ratio' in cell ? h('span', { class: 'pill', style: { background: ratioColor(cell.covered ? 0 : cell.ratio) } }, fmt(cell.ratio, 2), cell.covered ? ` (${cell.covered} ok)` : '') : cell),
    ),
  );
}

function detailText(x) {
  const d = x.detail ?? {};
  const parts = [];
  if (d.i !== undefined) parts.push(`i ${fmt(d.i, 3)}`);
  if (d.i75 !== undefined) parts.push(`0,75i ${fmt(d.i75, 3)}`);
  if (d.factor !== undefined && d.factor !== 1) parts.push(`séisme × ${fmt(d.factor, 2)}`);
  if (d.MA !== undefined) parts.push(`MA ${fmt(d.MA / 1000, 0)} N·m`);
  if (d.MB !== undefined) parts.push(`MB ${fmt(d.MB / 1000, 0)} N·m`);
  if (d.MC !== undefined) parts.push(`MC ${fmt(d.MC / 1000, 0)} N·m`);
  if (d.I !== undefined && d.I !== 1) parts.push(`I ${fmt(d.I, 3)}`);
  return parts.join(' · ');
}

/** Sommes des masses modales effectives (tous modes calculés) et masse sur supports rigides. */
export function modalSums(modal) {
  const eff = [0, 0, 0];
  for (const md of modal.modes) md.effMass.forEach((v, d) => (eff[d] += v));
  return { eff, supported: modal.supportedMass ?? [0, 0, 0] };
}

/** Fenêtre de détail d'une ligne de vérification : données, termes, moments, admissible. */
export function openRowDetail(row) {
  document.querySelector('.modal-backdrop')?.remove();
  const c = row.calc;
  const num = (v, unit) => (typeof v === 'number' ? fmt(v, Math.abs(v) >= 1000 || unit === 'mm³' ? 0 : unit === '' ? 3 : 2) : v);
  const kv = (items) =>
    h('table', { class: 'grid compact kv' }, h('tbody', {}, items.map(([k, v, u]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, num(v, u)), h('td', { class: 'muted' }, u)))));
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const ok = (row.coveredBy ? 0 : row.ratio) <= 1;
  const backdrop = h(
    'div',
    { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close() },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-label': 'Détail du calcul' },
      h('div', { class: 'modal-head' }, h('h3', {}, row.eqLabel), h('button', { class: 'icon', title: 'Fermer (Échap)', onclick: close }, '✕')),
      h('p', { class: 'muted' }, `Nœud ${row.node} — élément ${row.elem} — ${row.comp} — cas ${row.case}`),
      c?.formula ? h('p', {}, h('code', {}, c.formula)) : null,
      c?.items ? [h('h4', {}, 'Données et termes du calcul'), kv(c.items)] : null,
      c?.moments?.length
        ? [
            h('h4', {}, 'Moments à l’extrémité de l’élément (repère local, N·m)'),
            h(
              'table',
              { class: 'grid compact' },
              h('thead', {}, h('tr', {}, th('Cas'), th('Mt (torsion)', true), th('Mf,y', true), th('Mf,z', true), th('Résultant', true))),
              h('tbody', {}, c.moments.map((mo) => h('tr', {}, h('td', {}, mo.name), [mo.mt, mo.my, mo.mz, mo.res].map((v) => h('td', { class: 'num' }, fmt(v, 1)))))),
            ),
            c.moments.some((mo) => !mo.signed) ? h('p', { class: 'help' }, 'Séisme : composantes enveloppes (non signées) après combinaisons modale et directionnelle ; résultant calculé sur ces composantes.') : null,
          ]
        : null,
      c?.allow ? [h('h4', {}, 'Admissible'), kv(c.allow)] : null,
      c?.note ? h('p', { class: 'help' }, c.note) : null,
      h(
        'div',
        { class: `verdict ${ok ? 'ok' : 'ko'}` },
        `${row.unit === 'mm' ? 'eₘ' : 'σ'} = ${fmt(row.stress, 2)} ${row.unit ?? 'MPa'} ; admissible ${fmt(row.allow, 2)} ${row.unit ?? 'MPa'} ; taux ${fmt(row.ratio, 3)}`,
        row.coveredBy ? ` — couvert par l’éq. (${row.coveredBy})` : '',
      ),
    ),
  );
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
}

// Colonnes de repères (toujours alignées à gauche, même si le repère est numérique).
const LABEL_COLUMNS = new Set(['Nœud', 'Élément', 'Repère', 'Type', 'Cas', 'Critère', 'Composant', 'Détail', 'Mode']);
const NUMERIC = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?( mm)?$/i;

/** Une colonne est numérique si toutes ses cellules non vides le sont : en-tête et valeurs alignés à droite. */
function numericColumns(headers, rows) {
  return headers.map((head, j) => {
    if (LABEL_COLUMNS.has(head)) return false;
    let seen = false;
    for (const row of rows) {
      const c = row[j];
      if (c === '' || c == null) continue;
      if (typeof c === 'object' && 'ratio' in c) return true;
      if (!(typeof c === 'number' || (typeof c === 'string' && NUMERIC.test(c.trim())))) return false;
      seen = true;
    }
    return seen;
  });
}

export function simpleTable(headers, rows, onRowClick, renderCell = (c) => c) {
  const num = numericColumns(headers, rows);
  return h(
    'div',
    { class: 'grid-wrap' },
    h(
      'table',
      { class: 'grid result' },
      h('thead', {}, h('tr', {}, headers.map((t, j) => h('th', { class: num[j] ? 'num' : '' }, t)))),
      h(
        'tbody',
        {},
        rows.map((row) => h('tr', { class: row.total ? 'total' : onRowClick ? 'clickable' : '', onclick: onRowClick ? () => onRowClick(row) : undefined }, row.map((cell, j) => h('td', { class: num[j] ? 'num' : '' }, renderCell(cell))))),
      ),
    ),
  );
}

/** En-tête de tableau ; `num` aligne à droite (colonnes de valeurs). */
export const th = (label, num = false) => h('th', { class: num ? 'num' : '' }, label);
