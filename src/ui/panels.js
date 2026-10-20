// Panneaux de saisie du modèle. Les tableaux de composants, les paramètres des
// cas de charge et ceux des codes sont générés à partir des descripteurs `fields`
// des registres : un nouveau composant / chargement / code apparaît sans
// modification de ce fichier.

import { h, editableTable, fieldForm, fieldInput, parseNumber } from './dom.js';
import { components } from '../components/index.js';
import { loadTypes } from '../loads/index.js';
import { codes } from '../codes/index.js';
import { newId } from '../core/model.js';
import { DEFAULT_SPECTRUM } from '../core/model.js';
import { seismicAxes, seismicLevels, defaultLevels, LEVELS } from '../loads/seismic.js';
import { PIPE_SIZES, schedulesOf } from '../core/pipeCatalog.js';
import { fmt } from '../core/units.js';

const section = (title, ...content) => h('section', { class: 'card' }, h('h3', {}, title), ...content);
const help = (...t) => h('p', { class: 'help' }, ...t);

// ---------------------------------------------------------------- Projet
export function renderProject(app) {
  const m = app.state.model;
  const set = (fn) => app.update(fn);
  const settingsFields = [
    { key: 'vertical', label: 'Axe vertical (pesanteur vers –)', type: 'select', options: () => ['Z', 'Y', 'X'] },
    { key: 'tRef', label: 'Température de référence (montage)', unit: '°C', type: 'number' },
    { key: 'meshMaxLength', label: 'Longueur maximale d’élément', unit: 'mm', type: 'number', title: 'Discrétisation des tubes droits (précision du poids réparti et de l’analyse modale)' },
    { key: 'bendDivisionAngle', label: 'Angle maximal par élément de coude', unit: '°', type: 'number' },
    { key: 'shear', label: 'Déformation d’effort tranchant (Timoshenko)', type: 'checkbox', default: true },
    { key: 'bendInnerPoints', label: 'Coudes : vérifier aussi les nœuds intérieurs (sinon extrémités A et B seulement)', type: 'checkbox', default: true, title: 'Coché : contraintes vérifiées à tous les nœuds du coude (A, intermédiaires, M, B). Décoché : aux seules extrémités du coude, comme certains logiciels.' },
    { key: 'checkThickness', label: 'Vérifier l’épaisseur minimale (tenue à la pression seule)', type: 'checkbox', default: false },
    { key: 'allowances', label: 'Prendre en compte la tolérance de fabrication et la surépaisseur de corrosion', type: 'checkbox', default: false, title: 'Ajoute les colonnes « Tol. » et « Corr. » aux sections ; utilisées dans la vérification d’épaisseur minimale. Les contraintes des équations du code restent calculées avec l’épaisseur nominale.' },
  ];
  return h(
    'div',
    {},
    section(
      'Étude',
      fieldForm(
        [
          { key: 'title', label: 'Titre', type: 'text' },
          { key: 'author', label: 'Auteur', type: 'text' },
          { key: 'notes', label: 'Notes', type: 'text' },
        ],
        m.meta,
        (k, v) => set((mm) => (mm.meta[k] = v)),
        { focusPrefix: 'meta' },
      ),
    ),
    section('Paramètres de calcul', fieldForm(settingsFields, m.settings, (k, v) => set((mm) => (mm.settings[k] = v)), { model: m, focusPrefix: 'settings' })),
    section(
      'Coordonnées imposées',
      help('Les coordonnées des autres nœuds sont déduites des DX, DY, DZ des tubes. Un nœud de chaque réseau non connexe doit être positionné (à défaut, il est placé à l’origine).'),
      editableTable({
        columns: [
          { key: 'node', label: 'Nœud', type: 'text', width: 60 },
          { key: 'x', label: 'X', unit: 'mm', type: 'number' },
          { key: 'y', label: 'Y', unit: 'mm', type: 'number' },
          { key: 'z', label: 'Z', unit: 'mm', type: 'number' },
        ],
        rows: m.nodeCoords,
        model: m,
        focusPrefix: 'coords',
        onEdit: (i, k, v) => set((mm) => (mm.nodeCoords[i][k] = v)),
        onDelete: (i) => set((mm) => mm.nodeCoords.splice(i, 1)),
        onAdd: () => set((mm) => mm.nodeCoords.push({ node: '', x: 0, y: 0, z: 0 })),
      }),
    ),
    renderSections(app),
    renderMaterials(app),
  );
}

function renderSections(app) {
  const m = app.state.model;
  return section(
    'Sections',
    editableTable({
      columns: [
        { key: 'id', label: 'Repère', type: 'text', width: 90 },
        { key: 'od', label: 'De', unit: 'mm', type: 'number' },
        { key: 't', label: 'e nom.', unit: 'mm', type: 'number' },
        ...(m.settings.allowances
          ? [
              { key: 'millTol', label: 'Tol.', unit: '%', type: 'number', title: 'Tolérance négative de fabrication (épaisseur minimale)' },
              { key: 'corrosion', label: 'Corr.', unit: 'mm', type: 'number', title: 'Surépaisseur de corrosion (épaisseur minimale)' },
            ]
          : []),
        { key: 'fluidDensity', label: 'ρ fluide', unit: 'kg/m³', type: 'number' },
        { key: 'insulThk', label: 'Calorifuge', unit: 'mm', type: 'number' },
        { key: 'insulDensity', label: 'ρ calo.', unit: 'kg/m³', type: 'number' },
      ],
      rows: m.sections,
      model: m,
      focusPrefix: 'sec',
      onEdit: (i, k, v) =>
        app.update((mm) => {
          const old = mm.sections[i].id;
          mm.sections[i][k] = v;
          if (k === 'id') for (const c of mm.components) if (c.section === old) c.section = v;
        }),
      onDelete: (i) => app.update((mm) => mm.sections.splice(i, 1)),
      onAdd: () => app.update((mm) => mm.sections.push({ ...structuredClone(mm.sections[mm.sections.length - 1] ?? SECTION_DEFAULTS), id: `SEC${mm.sections.length + 1}` })),
    }),
    catalogPicker(app),
  );
}

const SECTION_DEFAULTS = { od: 114.3, t: 6.02, millTol: 12.5, corrosion: 0, fluidDensity: 1000, insulThk: 0, insulDensity: 0 };

/** Ajout d'une section normalisée ASME B36.10M (acier carbone) ou B36.19M (inoxydable). */
function catalogPicker(app) {
  const cat = (app.state.pipeCatalog ??= { std: 'B36.10M', nps: '6', sch: '40' });
  const size = PIPE_SIZES.find((x) => x.nps === cat.nps) ?? PIPE_SIZES[0];
  const scheds = schedulesOf(cat.std, size);
  if (!scheds.some(([k]) => k === cat.sch)) cat.sch = (scheds.find(([k]) => k === 'STD' || k === '40S') ?? scheds[0])?.[0];
  const t = scheds.find(([k]) => k === cat.sch)?.[1];
  const set = (k) => (e) => app.setUi(() => (cat[k] = e.target.value));
  const add = () =>
    app.update((mm) => {
      const label = cat.std === 'B36.19M' ? cat.sch : `Sch${cat.sch}`;
      let id = `DN${size.dn}-${label}`;
      for (let k = 2; mm.sections.some((x) => x.id === id); k++) id = `DN${size.dn}-${label}-${k}`;
      const last = mm.sections[mm.sections.length - 1] ?? SECTION_DEFAULTS;
      mm.sections.push({
        ...structuredClone(SECTION_DEFAULTS),
        // fluide, calorifuge, tolérances : repris de la dernière section
        ...Object.fromEntries(['millTol', 'corrosion', 'fluidDensity', 'insulThk', 'insulDensity'].map((k) => [k, last[k] ?? SECTION_DEFAULTS[k]])),
        id,
        name: `DN${size.dn} (NPS ${size.nps}) ${cat.std === 'B36.19M' ? cat.sch : `Sch ${cat.sch}`} — ASME ${cat.std} (${fmt(size.od, 1)} × ${fmt(t, 2)})`,
        od: size.od,
        t,
      });
    });
  return h(
    'div',
    { class: 'toolbar catalog' },
    h('span', { class: 'muted' }, 'Catalogue :'),
    h('select', { title: 'Norme', onchange: set('std') }, ['B36.10M', 'B36.19M'].map((x) => h('option', { value: x, selected: x === cat.std }, x === 'B36.10M' ? 'ASME B36.10M (acier carbone)' : 'ASME B36.19M (inoxydable)'))),
    h('select', { title: 'Diamètre nominal', onchange: set('nps') }, PIPE_SIZES.map((x) => h('option', { value: x.nps, selected: x.nps === size.nps }, `DN${x.dn} — NPS ${x.nps} (${fmt(x.od, 1)})`))),
    h('select', { title: 'Schedule (épaisseur)', onchange: set('sch') }, scheds.map(([k, e]) => h('option', { value: k, selected: k === cat.sch }, `${cat.std === 'B36.19M' ? k : `Sch ${k}`} — ${fmt(e, 2)} mm`))),
    h('button', { class: 'small', onclick: add, disabled: !(t > 0) }, 'Ajouter la section'),
  );
}

function renderMaterials(app) {
  const m = app.state.model;
  const st = app.state;
  if (!m.materials.find((x) => x.id === st.matSel)) st.matSel = m.materials[0]?.id ?? null;
  const mat = m.materials.find((x) => x.id === st.matSel);
  const mi = m.materials.indexOf(mat);
  return section(
    'Matériaux',
    help('Valeurs par défaut indicatives : à remplacer par celles de l’Annexe Z I de l’édition du RCC-M applicable. α est le coefficient moyen de dilatation entre 20 °C et T.'),
    h(
      'div',
      { class: 'toolbar' },
      h(
        'select',
        { onchange: (e) => app.setUi(() => (st.matSel = e.target.value)) },
        m.materials.map((x) => h('option', { value: x.id, selected: x.id === st.matSel }, x.id)),
      ),
      h('button', { class: 'small', onclick: () => app.update((mm) => { const c = structuredClone(mat ?? mm.materials[0]); c.id = `${c.id}-copie`; mm.materials.push(c); st.matSel = c.id; }) }, 'Dupliquer'),
      mat && m.materials.length > 1 ? h('button', { class: 'small danger', onclick: () => app.update((mm) => mm.materials.splice(mi, 1)) }, 'Supprimer') : null,
    ),
    mat
      ? h(
          'div',
          {},
          fieldForm(
            [
              { key: 'id', label: 'Repère', type: 'text' },
              { key: 'name', label: 'Désignation', type: 'text' },
              { key: 'density', label: 'Masse volumique', unit: 'kg/m³', type: 'number' },
              { key: 'nu', label: 'Coefficient de Poisson', type: 'number' },
            ],
            mat,
            (k, v) =>
              app.update((mm) => {
                const old = mm.materials[mi].id;
                mm.materials[mi][k] = v;
                if (k === 'id') {
                  for (const c of mm.components) if (c.material === old) c.material = v;
                  st.matSel = v;
                }
              }),
            { focusPrefix: `mat${mi}` },
          ),
          editableTable({
            columns: [
              { key: 'T', label: 'T', unit: '°C', type: 'number' },
              { key: 'E', label: 'E', unit: 'MPa', type: 'number' },
              { key: 'alpha', label: 'α moy.', unit: '10⁻⁶/°C', type: 'number' },
              { key: 'S', label: 'S', unit: 'MPa', type: 'number' },
              { key: 'Sy', label: 'Sy', unit: 'MPa', type: 'number' },
            ],
            rows: mat.table,
            model: m,
            focusPrefix: `mattab${mi}`,
            onEdit: (i, k, v) => app.update((mm) => (mm.materials[mi].table[i][k] = v)),
            onDelete: (i) => app.update((mm) => mm.materials[mi].table.splice(i, 1)),
            onAdd: () => app.update((mm) => { const t = mm.materials[mi].table; t.push({ ...(t[t.length - 1] ?? { T: 20, E: 200000, alpha: 12, S: 100, Sy: 200 }), T: (t[t.length - 1]?.T ?? 0) + 50 }); }),
            addLabel: 'Ajouter une température',
          }),
        )
      : null,
  );
}

// ---------------------------------------------------------------- Géométrie
export function componentTable(app, type, { emptyText } = {}) {
  const def = components.get(type);
  const m = app.state.model;
  const rows = m.components.filter((c) => c.type === type);
  const sel = app.state.selected;
  return editableTable({
    columns: def.fields,
    rows,
    model: m,
    focusPrefix: type,
    empty: emptyText,
    rowAttrs: (row) => ({
      class: sel && (row.node === sel || row.n1 === sel || row.n2 === sel) ? 'sel' : '',
      // saisie dans la ligne : mise en évidence du composant dans la vue
      onfocusin: () => app.highlight(row.id),
      onfocusout: (e) => !e.currentTarget.contains(e.relatedTarget) && app.highlight(null),
    }),
    onEdit: (i, k, v) =>
      app.update((mm) => {
        const c = mm.components.find((x) => x.id === rows[i].id);
        c[k] = v;
      }),
    onDelete: (i) => app.update((mm) => mm.components.splice(mm.components.findIndex((x) => x.id === rows[i].id), 1)),
    onAdd: () =>
      app.update((mm) => {
        const c = def.create(mm, { node: sel ?? '', from: sel ?? '' });
        c.id = newId(mm);
        mm.components.push(c);
      }),
    addLabel: def.label.toLowerCase(),
  });
}

function nextNodeId(model, from) {
  const ids = [from, ...model.nodeCoords.map((n) => n.node)];
  for (const c of model.components) for (const k of ['n1', 'n2', 'node']) ids.push(c[k]);
  let max = 0;
  for (const id of ids) if (/^\d+$/.test(String(id ?? '').trim())) max = Math.max(max, +id);
  return String(Math.floor(max / 10) * 10 + 10);
}

export function renderGeometry(app) {
  const m = app.state.model;
  const q = app.state.quick;
  const pipes = m.components.filter((c) => c.type === 'pipe' || c.type === 'valve');
  const isValve = q.kind === 'valve';
  if (!q.from) q.from = pipes.length ? String(pipes[pipes.length - 1].n2) : String(m.nodeCoords[0]?.node ?? '10');
  const add = () => {
    const d = [parseNumber(q.dx) || 0, parseNumber(q.dy) || 0, parseNumber(q.dz) || 0];
    if (Math.hypot(...d) === 0) return app.toast('Saisir au moins une composante DX, DY ou DZ non nulle.');
    app.update((mm) => {
      const from = String(q.from).trim();
      const to = String(q.to || '').trim() || nextNodeId(mm, from);
      if (to === from) return app.toast('Nœuds de départ et d’arrivée identiques.');
      const incoming = mm.components.filter((c) => (c.type === 'pipe' || c.type === 'valve') && (String(c.n1) === from || String(c.n2) === from));
      const c = isValve
        ? components.get('valve').create(mm, { from, to, dx: d[0], dy: d[1], dz: d[2], mass: parseNumber(q.vmass) || 100 })
        : components.get('pipe').create(mm, { from, to, dx: d[0], dy: d[1], dz: d[2] });
      c.id = newId(mm);
      mm.components.push(c);
      if (q.tee && incoming.length === 2 && !mm.components.some((x) => x.type === 'tee' && String(x.node) === from)) {
        const t = components.get('tee').create(mm, { node: from });
        t.id = newId(mm);
        mm.components.push(t);
      }
      if (q.bend && !isValve && incoming.length === 1 && incoming[0].type === 'pipe' && !mm.components.some((x) => x.type === 'bend' && x.node === from)) {
        const prev = incoming[0];
        const dp = prev.n2 === from ? [prev.dx, prev.dy, prev.dz] : [-prev.dx, -prev.dy, -prev.dz];
        const cross = Math.hypot(dp[1] * d[2] - dp[2] * d[1], dp[2] * d[0] - dp[0] * d[2], dp[0] * d[1] - dp[1] * d[0]);
        if (cross > 1e-6 * Math.hypot(...dp) * Math.hypot(...d)) {
          const b = components.get('bend').create(mm, { node: from, radius: parseNumber(q.radius) || '' });
          b.id = newId(mm);
          mm.components.push(b);
        }
      }
      q.from = to;
      q.to = '';
      app.state.selected = to;
    });
  };
  const inp = (key, attrs = {}) =>
    h('input', { type: 'text', value: q[key] ?? '', class: 'num', dataset: { focus: `quick:${key}` }, oninput: (e) => (q[key] = e.target.value), onkeydown: (e) => e.key === 'Enter' && add(), ...attrs });
  const dirBtn = (label, dx, dy, dz) =>
    h('button', { class: 'small ghost', title: 'Pré-remplir la direction', onclick: () => app.setUi(() => Object.assign(q, { dx: dx || '', dy: dy || '', dz: dz || '' })) }, label);
  const L = parseNumber(q.len) || 1000;
  return h(
    'div',
    {},
    section(
      'Ajout rapide',
      help('L’élément part du nœud « De » (cliquer un nœud dans la vue pour le choisir). Pour un tube, si la direction change, un coude est inséré au nœud de départ. Pour un robinet, DX, DY, DZ donnent sa longueur (face à face) et son orientation.'),
      h(
        'div',
        { class: 'toolbar' },
        h('span', { class: 'muted' }, 'Élément :'),
        h('select', { onchange: (e) => app.setUi(() => (q.kind = e.target.value)) }, h('option', { value: 'pipe', selected: !isValve }, 'Tube droit'), h('option', { value: 'valve', selected: isValve }, 'Robinet')),
        isValve ? h('span', { class: 'muted' }, 'masse') : null,
        isValve ? h('input', { type: 'text', class: 'num tiny', value: q.vmass ?? '100', oninput: (e) => (q.vmass = e.target.value) }) : null,
        isValve ? h('small', {}, 'kg') : null,
      ),
      h(
        'div',
        { class: 'quick' },
        h('label', {}, 'De', inp('from', { class: '' })),
        h('label', {}, 'À', inp('to', { placeholder: 'auto', class: '' })),
        h('label', {}, 'DX', inp('dx')),
        h('label', {}, 'DY', inp('dy')),
        h('label', {}, 'DZ', inp('dz')),
      ),
      h(
        'div',
        { class: 'toolbar' },
        h('span', { class: 'muted' }, 'Direction :'),
        h('input', { type: 'text', class: 'num tiny', value: q.len ?? '1000', title: 'Longueur pour les boutons de direction', oninput: (e) => (q.len = e.target.value) }),
        dirBtn('+X', L, 0, 0),
        dirBtn('−X', -L, 0, 0),
        dirBtn('+Y', 0, L, 0),
        dirBtn('−Y', 0, -L, 0),
        dirBtn('+Z', 0, 0, L),
        dirBtn('−Z', 0, 0, -L),
      ),
      h(
        'div',
        { class: 'toolbar' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: q.bend, onchange: (e) => (q.bend = e.target.checked) }), ' coude au changement de direction, R ='),
        h('input', { type: 'text', class: 'num tiny', placeholder: '1,5 De', value: q.radius ?? '', oninput: (e) => (q.radius = e.target.value) }),
        h('small', {}, 'mm'),
        h('button', { class: 'primary', onclick: add }, isValve ? 'Ajouter le robinet' : 'Ajouter le tube'),
      ),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: q.tee !== false, onchange: (e) => (q.tee = e.target.checked) }), ' té automatique quand un troisième tube part d’un nœud'),
    ),
    section('Tubes droits', help('T et P : température et pression intérieure du tube, utilisées pour la dilatation, les contraintes admissibles et les termes de pression du code.'), componentTable(app, 'pipe')),
    section(
      'Robinets',
      help('Élément rigide entre deux nœuds : longueur (DX, DY, DZ), masse totale répartie, raideur égale à « Rigidité » × celle du tube de raccordement (10 recommandé). Matériau, température et pression repris du tube raccordé ; pas de vérification de contraintes sur le corps du robinet.'),
      componentTable(app, 'valve'),
    ),
    section('Coudes', help('Un coude se place au sommet de deux tubes. Ses nœuds A (début), M (milieu), B (fin) peuvent recevoir supports et masses.'), componentTable(app, 'bend')),
    section(
      'Tés',
      help('Un té se place au nœud de jonction de trois tubes (créer la dérivation en ajoutant un tube depuis un nœud qui en relie déjà deux). Son facteur d’intensification i s’applique aux extrémités des trois branches au nœud.'),
      componentTable(app, 'tee'),
    ),
  );
}

export function renderSupports(app) {
  return h(
    'div',
    {},
    section(
      'Supports et blocages',
      help('Supports linéaires bilatéraux. « Rigide » = raideur de pénalité 10¹⁰ N/mm. Le déplacement imposé (dx dy dz en mm, repère global) est appliqué dans les cas thermiques : mouvement de piquage d’équipement.'),
      componentTable(app, 'support'),
    ),
    section('Masses ponctuelles', help('Robinets, brides, instruments… Prises en compte en poids propre et en séisme.'), componentTable(app, 'mass')),
  );
}

// ---------------------------------------------------------------- Chargements
export function renderLoads(app) {
  const m = app.state.model;
  const cards = m.loadCases.map((lc, li) => {
    const type = loadTypes.has(lc.type) ? loadTypes.get(lc.type) : null;
    const set = (k, v) => app.update((mm) => (mm.loadCases[li][k] = v));
    return h(
      'section',
      { class: `card ${lc.enabled === false ? 'disabled' : ''}` },
      h(
        'div',
        { class: 'card-head' },
        h('input', { type: 'checkbox', checked: lc.enabled !== false, title: 'Actif', onchange: (e) => set('enabled', e.target.checked) }),
        h('input', { type: 'text', class: 'tiny', value: lc.id, title: 'Identifiant', dataset: { focus: `lc${li}:id` }, onchange: (e) => set('id', e.target.value.trim() || lc.id) }),
        h('input', { type: 'text', value: lc.label ?? '', dataset: { focus: `lc${li}:label` }, onchange: (e) => set('label', e.target.value) }),
        h('span', { class: 'badge' }, type?.label ?? lc.type),
        h('button', { class: 'icon danger', title: 'Supprimer le cas', onclick: () => app.update((mm) => mm.loadCases.splice(li, 1)) }, '✕'),
      ),
      type?.description ? help(type.description) : null,
      type ? fieldForm(type.fields.filter((f) => (!f.show || f.show(lc)) && !(lc.type === 'seismic' && lc.method === 'static' && ['damping', 'dampingLaw', 'dampLow', 'fLow', 'dampHigh', 'fHigh', 'cutoff', 'maxModes', 'modal', 'missingMass', 'rigid'].includes(f.key))), lc, set, { model: m, focusPrefix: `lc${li}` }) : null,
      lc.type === 'seismic' ? seismicEditor(app, lc, li) : null,
    );
  });
  const typeSel = h('select', {}, loadTypes.list().map((t) => h('option', { value: t.id }, t.label)));
  return h(
    'div',
    {},
    ...cards,
    h(
      'div',
      { class: 'toolbar' },
      typeSel,
      h(
        'button',
        {
          class: 'small',
          onclick: () =>
            app.update((mm) => {
              const t = loadTypes.get(typeSel.value);
              const lc = t.create();
              if (lc.type === 'seismic') Object.assign(lc, structuredClone(mm.loadCases.find((x) => x.type === 'seismic') ?? defaultSeismic()));
              let k = 1;
              while (mm.loadCases.some((x) => x.id === `${typeSel.value[0].toUpperCase()}${k}`)) k++;
              lc.id = `${typeSel.value[0].toUpperCase()}${k}`;
              mm.loadCases.push(lc);
            }),
        },
        '+ Ajouter un cas',
      ),
    ),
  );
}

function defaultSeismic() {
  return { levels: defaultLevels(), method: 'spectral', damping: 5, cutoff: 33, modal: 'CQC', directional: 'SRSS', missingMass: true, rigid: 'gupta', maxModes: 60, spectra: { X: { factor: 1, points: DEFAULT_SPECTRUM }, Y: { factor: 1, points: DEFAULT_SPECTRUM }, Z: { factor: 2 / 3, points: DEFAULT_SPECTRUM } }, staticAcc: { X: 1.5, Y: 1.5, Z: 1 } };
}

function seismicEditor(app, lc, li) {
  return h('div', {}, levelsEditor(app, lc, li), seismicInputEditor(app, lc, li));
}

/** Niveaux de critère vérifiés (éq. 10B, 10C, 10D) : coefficient sur le spectre par niveau. */
function levelsEditor(app, lc, li) {
  const current = seismicLevels(lc);
  const rows = LEVELS.map((L) => current.find((x) => x.level === L) ?? { level: L, enabled: false, factor: 1 });
  const set = (L, key, v) =>
    app.update((mm) => {
      const c = mm.loadCases[li];
      c.levels = rows.map((r) => ({ ...r }));
      c.levels.find((x) => x.level === L)[key] = v;
      delete c.level;
    });
  return h(
    'div',
    {},
    h('h4', {}, 'Niveaux de critère vérifiés (éq. 10)'),
    help('Même spectre d’entrée pour tous les niveaux : cocher les niveaux à vérifier, leur donner un nom (repris dans le bilan et la note de calcul) et le coefficient appliqué au séisme calculé. Les admissibles par niveau se règlent dans l’onglet Code.'),
    h(
      'table',
      { class: 'grid compact levels' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Niveau'), h('th', {}, 'Vérifié'), h('th', {}, 'Nom (bilan, rapport)'), h('th', {}, 'Coefficient sur le séisme'))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            h('td', {}, h('b', {}, `10${r.level}`)),
            h('td', {}, h('input', { type: 'checkbox', checked: r.enabled !== false, onchange: (e) => set(r.level, 'enabled', e.target.checked) })),
            h('td', {}, fieldInput({ type: 'text', placeholder: 'ex. SMHV' }, r.name ?? '', (v) => set(r.level, 'name', v), { focusKey: `lc${li}:lvlname${r.level}` })),
            h('td', {}, fieldInput({ type: 'number' }, r.factor, (v) => set(r.level, 'factor', v === '' ? 1 : v), { focusKey: `lc${li}:lvl${r.level}` })),
          ),
        ),
      ),
    ),
  );
}

function seismicInputEditor(app, lc, li) {
  if (lc.method === 'static') {
    lc.staticAcc ??= { X: 0, Y: 0, Z: 0 };
    return h(
      'div',
      {},
      h('h4', {}, 'Accélérations statiques équivalentes (g)'),
      help('Usuellement 1,5 × la valeur de pic du spectre de plancher (méthode statique équivalente).'),
      h(
        'div',
        { class: 'quick' },
        ['X', 'Y', 'Z'].map((d) =>
          h('label', {}, d, fieldInput({ type: 'number' }, lc.staticAcc[d], (v) => app.update((mm) => (mm.loadCases[li].staticAcc[d] = v)), { focusKey: `lc${li}:acc${d}` })),
        ),
      ),
    );
  }
  lc.spectra ??= {};
  return h(
    'div',
    {},
    h('h4', {}, 'Spectres d’accélération (fréquence Hz – accélération g)'),
    help('Une ligne par point « f a ». Interpolation log-log ; au-delà du dernier point, l’accélération à période nulle (ZPA) est conservée. Facteur 0 = direction ignorée.'),
    h(
      'div',
      { class: 'spectra' },
      spectrumBlocks(lc, app.state.model.settings.vertical).map(({ title, dirs }) => {
        const d = dirs[0];
        const sp = lc.spectra[d] ?? { factor: 0, points: [] };
        // une saisie partagée est recopiée dans toutes les directions du bloc
        const write = (mm, val) => dirs.forEach((x) => (mm.loadCases[li].spectra[x] = structuredClone(val)));
        return h(
          'div',
          { class: 'spectrum' },
          h('div', { class: 'toolbar' }, h('b', {}, title), h('span', { class: 'muted' }, '× facteur'), fieldInput({ type: 'number' }, round(sp.factor, 4), (v) => app.update((mm) => write(mm, { ...sp, factor: v === '' ? 0 : v })), { focusKey: `lc${li}:fac${d}` })),
          h('textarea', {
            rows: 6,
            dataset: { focus: `lc${li}:sp${d}` },
            value: (sp.points ?? []).map((p) => `${p[0]} ${p[1]}`).join('\n'),
            onchange: (e) =>
              app.update((mm) => {
                const pts = e.target.value
                  .split('\n')
                  .map((l) => l.trim().replace(/,/g, '.').split(/[\s;\t]+/).map(Number))
                  .filter((p) => p.length >= 2 && p.every(Number.isFinite));
                write(mm, { ...sp, points: pts });
              }),
          }),
          spectrumSvg(sp.points ?? []),
        );
      }),
    ),
  );
}

function spectrumBlocks(lc, vertical) {
  const { horizontal, vertical: v } = seismicAxes(vertical);
  if (lc.sameHorizontal === false) return ['X', 'Y', 'Z'].map((d) => ({ title: `Direction ${d}`, dirs: [d] }));
  return [
    { title: `Horizontal (${horizontal.join(' et ')})`, dirs: horizontal },
    { title: `Vertical (${v})`, dirs: [v] },
  ];
}

const round = (v, d) => (typeof v === 'number' ? +v.toFixed(d) : v);

function spectrumSvg(points) {
  const p = [...points].filter((x) => x[0] > 0).sort((a, b) => a[0] - b[0]);
  const W = 180;
  const H = 70;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'spark');
  if (p.length < 2) return svg;
  const fx = (f) => 4 + ((Math.log10(f) - Math.log10(p[0][0])) / (Math.log10(p[p.length - 1][0]) - Math.log10(p[0][0]) || 1)) * (W - 8);
  const amax = Math.max(...p.map((x) => x[1])) || 1;
  const fy = (a) => H - 4 - (a / amax) * (H - 14);
  const path = document.createElementNS(svg.namespaceURI, 'polyline');
  path.setAttribute('points', p.map((x) => `${fx(x[0]).toFixed(1)},${fy(x[1]).toFixed(1)}`).join(' '));
  svg.append(path);
  const t = document.createElementNS(svg.namespaceURI, 'text');
  t.setAttribute('x', 4);
  t.setAttribute('y', 10);
  t.textContent = `max ${amax} g`;
  svg.append(t);
  return svg;
}

// ---------------------------------------------------------------- Code
export function renderCode(app) {
  const m = app.state.model;
  const code = codes.has(m.code.id) ? codes.get(m.code.id) : null;
  return h(
    'div',
    {},
    section(
      'Code de vérification',
      h(
        'select',
        { onchange: (e) => app.update((mm) => (mm.code.id = e.target.value)) },
        codes.list().map((c) => h('option', { value: c.id, selected: c.id === m.code.id }, c.label)),
      ),
      code ? help(code.reference) : null,
      code ? fieldForm(code.params, m.code.params, (k, v) => app.update((mm) => (mm.code.params[k] = v)), { model: m, focusPrefix: 'code' }) : null,
    ),
    section(
      'Équations vérifiées (RCC-M C 3650)',
      h(
        'table',
        { class: 'eqs' },
        h(
          'tbody',
          {},
          code?.thickness ? eqRow(code.thickness.ref, 'Épaisseur minimale — tenue à la pression seule (option de l’onglet Projet)', code.thickness.formula) : null,
          eqRow('(6)', 'Poids propre + pression', 'S_L = P·Dₑ/(4eₙ) + 0,75i·M_A/Z ≤ 1,0·S_h   (0,75i ≥ 1)'),
          eqRow('(7)', 'Dilatation thermique', 'S_E = i·M_C/Z ≤ S_A = f(1,25 S_c + 0,25 S_h)'),
          eqRow('(8)', '(6) + (7), si (7) non satisfaite', 'P·Dₑ/(4eₙ) + 0,75i·M_A/Z + i·M_C/Z ≤ S_h + S_A'),
          eqRow('(10B) (10C) (10D)', 'Séisme, par niveau de critère', 'P·Dₑ/(4eₙ) + 0,75i·(M_A + M_B)/Z ≤ k·S_h  (B : 1,2 — C : 1,8 — D : 2,4) ; M_B = séisme × coefficient du niveau'),
        ),
      ),
      help('Module Z (C 3658) : π·r²·eₙ (r rayon moyen) ; tronçon réduit d’un té ou piquage réduit : π·r′ₘ²·tₛ, tₛ = min(Tᵣ, i·T_b). Moments résultants √(Mx² + My² + Mz²) à la jonction, branche par branche.'),
      help('Coudes : h = eₙR/r², k = 1,65/h, i = 0,9/h^⅔ (≥ 1). Tés : i = 0,9/h^⅔ ≥ 1 avec h = 4,4eₙ/r (forgé), (eₙ + e_r/2)^(5/2)/(eₙ^(3/2)·r) (fabrication renforcé), eₙ/r (non renforcé).'),
    ),
    combinationsSection(code, m),
  );
}

function combinationsSection(code, model) {
  if (!code?.combinations) return null;
  const rows = code.combinations({ model });
  return section(
    'Cumul des chargements',
    help('Chargements élémentaires combinés dans chaque équation, d’après les cas actifs de l’onglet Chargements.'),
    h(
      'div',
      { class: 'grid-wrap' },
      h(
        'table',
        { class: 'grid compact' },
        h('thead', {}, h('tr', {}, ['Éq.', 'Cumul', 'Règle de combinaison', 'Admissible'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, h('b', {}, r.eq)), h('td', {}, h('b', {}, r.name), h('br'), r.loads), h('td', { class: 'muted' }, r.rule), h('td', {}, r.allow)))),
      ),
    ),
    help('Déplacements et efforts sur supports : cas élémentaires, combinaison de service poids + dilatation (somme algébrique) et séisme par niveau (enveloppe).'),
  );
}

const eqRow = (ref, name, formula) => h('tr', {}, h('th', {}, ref), h('td', {}, h('b', {}, name), h('br'), h('code', {}, formula)));
