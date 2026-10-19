// Point d'entrée de l'interface : état de l'application, onglets, liaison
// entre panneaux de saisie, vue 3D, calcul et résultats.

import { h, download } from './ui/dom.js';
import { Viewer } from './ui/viewer.js';
import { renderProject, renderGeometry, renderSupports, renderLoads, renderCode } from './ui/panels.js';
import { renderResultsPanel, renderBottom, BOTTOM_TABS, buildScene, displayCases } from './ui/results.js';
import { buildReport } from './ui/report.js';
import { exampleModel, emptyModel, normalizeModel } from './core/model.js';
import { buildMesh } from './core/mesher.js';
import { runAnalysis } from './analysis.js';
import { codes } from './codes/index.js';

const STORAGE_KEY = 'easypipestress:model';

const TABS = [
  ['project', 'Projet', renderProject],
  ['geometry', 'Géométrie', renderGeometry],
  ['supports', 'Supports & masses', renderSupports],
  ['loads', 'Chargements', renderLoads],
  ['code', 'Code', renderCode],
  ['results', 'Résultats', renderResultsPanel],
];

function loadInitialModel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeModel(JSON.parse(raw));
  } catch {
    /* stockage indisponible ou contenu invalide */
  }
  return exampleModel();
}

const state = {
  model: loadInitialModel(),
  result: null,
  runError: null,
  preview: null,
  previewErrors: [],
  tab: 'geometry',
  bottomTab: 'code',
  bottomOpen: true,
  selected: null,
  matSel: null,
  quick: { from: '', to: '', dx: '', dy: '', dz: '', bend: true, tee: true, radius: '', len: '1000' },
  display: { mode: 'geom', scale: 1, labels: true, showAll: false, animate: true, render: '3d' },
  filter: { eq: 'all', internal: false, sort: true, failOnly: false, case: null, all: false },
};

const $ = (sel) => document.querySelector(sel);
let viewer;
let renderQueued = false;

const app = {
  state,
  /** Modification du modèle : invalide les résultats, sauvegarde, rafraîchit. */
  update(fn) {
    fn(state.model);
    state.result = null;
    state.runError = null;
    if (state.display.mode !== 'geom') state.display.mode = 'geom';
    persist();
    refreshPreview();
    queueRender();
  },
  /** Modification de l'état d'interface seulement. */
  setUi(fn) {
    fn(state);
    queueRender();
  },
  select(label) {
    state.selected = label;
    if (label && state.tab === 'geometry') state.quick.from = label;
    queueRender();
  },
  setDisplay(mode) {
    state.display.mode = mode;
    queueRender();
  },
  toast,
  run,
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.model));
  } catch {
    /* quota ou navigation privée : sans conséquence */
  }
}

function refreshPreview() {
  const code = codes.has(state.model.code?.id) ? codes.get(state.model.code.id) : null;
  try {
    const mesh = buildMesh(state.model, { factors: code?.componentFactors, tolerant: true });
    state.preview = mesh;
    state.previewErrors = mesh.errors;
  } catch (e) {
    state.preview = null;
    state.previewErrors = [e.message];
  }
}

function run() {
  state.runError = null;
  try {
    state.result = runAnalysis(state.model);
    state.filter.all = false;
    state.display.mode = state.result.check ? 'ratio:max' : 'geom';
  } catch (e) {
    state.result = null;
    state.runError = e.errors ? e.errors.join('\n') : e.message;
    console.error(e);
  }
  state.tab = 'results';
  state.bottomOpen = true;
  queueRender();
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 0);
}

function render() {
  const focusKey = document.activeElement?.dataset?.focus;
  const selStart = document.activeElement?.selectionStart;
  const panel = $('#panel-body');
  const scroll = panel.scrollTop;
  const bottomBody = $('#bottom-body');
  const bscroll = bottomBody.scrollTop;

  // Onglets
  $('#tabs').replaceChildren(...TABS.map(([id, label]) => h('button', { class: state.tab === id ? 'active' : '', onclick: () => app.setUi(() => (state.tab = id)) }, label, id === 'results' && state.result?.check ? h('span', { class: `dot ${state.result.check.summary.ok ? 'ok' : 'ko'}` }) : null)));
  const tab = TABS.find((t) => t[0] === state.tab);
  panel.replaceChildren(tab[2](app));
  panel.scrollTop = scroll;

  // Bandeau du bas
  $('#bottom').classList.toggle('closed', !state.bottomOpen);
  $('#bottom-tabs').replaceChildren(
    ...BOTTOM_TABS.map(([id, label]) => h('button', { class: state.bottomTab === id ? 'active' : '', onclick: () => app.setUi(() => ((state.bottomTab = id), (state.bottomOpen = true))) }, label)),
    h('button', { class: 'icon', title: state.bottomOpen ? 'Réduire' : 'Déplier', onclick: () => app.setUi(() => (state.bottomOpen = !state.bottomOpen)) }, state.bottomOpen ? '▾' : '▴'),
  );
  if (state.bottomOpen) {
    bottomBody.replaceChildren(renderBottom(app));
    bottomBody.scrollTop = bscroll;
  }

  renderViewToolbar();
  viewer.setScene(buildScene(state));
  renderStatus();

  if (focusKey) {
    const el = document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (el) {
      el.focus();
      if (selStart != null && el.setSelectionRange && el.type === 'text') {
        try {
          el.setSelectionRange(el.value.length, el.value.length);
        } catch {
          /* type de champ sans sélection */
        }
      }
    }
  }
}

function renderViewToolbar() {
  const r = state.result;
  const opts = [['geom', 'Géométrie']];
  if (r) {
    for (const c of displayCases(r)) opts.push([`case:${c.id}`, `${c.signed ? 'Déformée' : 'Enveloppe'} ${c.id} – ${c.label}`]);
    if (r.check) {
      opts.push(['ratio:max', 'Taux de travail (max)']);
      for (const eq of [...new Set(r.check.rows.map((x) => x.eq))]) opts.push([`ratio:${eq}`, eq === 'e' ? 'Taux : épaisseur' : `Taux : éq. (${eq})`]);
    }
    r.modal?.modes.slice(0, 30).forEach((m, k) => opts.push([`mode:${k}`, `Mode ${k + 1} – ${m.freq.toFixed(2)} Hz`]));
  }
  if (!opts.find((o) => o[0] === state.display.mode)) state.display.mode = 'geom';
  const d = state.display;
  $('#view-toolbar').replaceChildren(
    ...[
    h('select', { onchange: (e) => app.setDisplay(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === d.mode }, l))),
    /^(case|mode)/.test(d.mode)
      ? h('label', { class: 'check', title: 'Amplification de la déformée' }, '×', h('input', { type: 'range', min: -1.5, max: 1.5, step: 0.1, value: Math.log10(d.scale), oninput: (e) => { d.scale = 10 ** +e.target.value; viewer.setScene(buildScene(state)); } }))
      : null,
    d.mode.startsWith('mode') ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.animate, onchange: (e) => app.setUi(() => (d.animate = e.target.checked)) }), ' animer') : null,
    h('select', { title: 'Rendu', onchange: (e) => app.setUi(() => (d.render = e.target.value)) }, h('option', { value: '3d', selected: d.render !== 'wire' }, '3D'), h('option', { value: 'wire', selected: d.render === 'wire' }, 'Filaire')),
    h('span', { class: 'sep' }),
    ...[
      ['iso', 'Iso'],
      ['top', 'Dessus'],
      ['front', 'Face'],
      ['side', 'Côté'],
    ].map(([v, l]) => h('button', { class: 'small ghost', onclick: () => viewer.setView(v) }, l)),
    h('button', { class: 'small ghost', title: 'Recentrer', onclick: () => viewer.fit() }, '⤢'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.labels, onchange: (e) => app.setUi(() => (d.labels = e.target.checked)) }), ' repères'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.showAll, onchange: (e) => app.setUi(() => (d.showAll = e.target.checked)) }), ' tous nœuds'),
    ].filter(Boolean),
  );
}

function renderStatus() {
  const p = state.preview;
  const errs = state.previewErrors ?? [];
  const parts = [];
  if (p) parts.push(h('span', {}, `${p.nodes.length} nœuds · ${p.elements.length} éléments · ${p.supports.length} supports`));
  if (errs.length) parts.push(h('span', { class: 'err', title: errs.join('\n') }, `⚠ ${errs.length} erreur(s) de modèle : ${errs[0]}`));
  else if (p?.warnings?.length) parts.push(h('span', { class: 'warn', title: p.warnings.join('\n') }, `${p.warnings.length} avertissement(s)`));
  if (state.selected) {
    const info = nodeInfo(state.selected);
    parts.push(h('span', { class: 'sel' }, `Nœud ${state.selected}${info}`));
  }
  parts.push(h('span', { class: state.result ? 'ok' : 'muted' }, state.result ? 'Résultats à jour' : 'Résultats non calculés'));
  $('#status').replaceChildren(...parts);
}

function nodeInfo(label) {
  const mesh = state.result?.mesh ?? state.preview;
  const i = mesh?.nodeIndex.get(label);
  if (i === undefined) return mesh?.corners.has(label) ? ' (sommet de coude)' : '';
  const n = mesh.nodes[i];
  return ` : (${n.x.toFixed(0)} ; ${n.y.toFixed(0)} ; ${n.z.toFixed(0)}) mm`;
}

function toast(msg) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

function openReport() {
  const html = buildReport(state, viewer.snapshot());
  const w = window.open('', '_blank');
  if (!w) {
    download(`${slug(state.model.meta.title)}-note.html`, html, 'text/html');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

const slug = (s) => String(s || 'etude').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function init() {
  viewer = new Viewer($('#view'), { onPick: (label) => app.select(label) });
  $('#btn-new').addEventListener('click', () => {
    if (!confirm('Créer une nouvelle étude vide ? Le modèle courant sera remplacé (pensez à l’enregistrer).')) return;
    state.selected = null;
    state.quick.from = '';
    app.update((m) => Object.assign(m, emptyModel()));
    state.tab = 'geometry';
    viewer.fit();
  });
  $('#btn-example').addEventListener('click', () => {
    if (!confirm('Charger l’exemple ? Le modèle courant sera remplacé.')) return;
    state.quick.from = '';
    app.update((m) => {
      for (const k of Object.keys(m)) delete m[k];
      Object.assign(m, exampleModel());
    });
    viewer.setView('iso');
  });
  $('#btn-save').addEventListener('click', () => download(`${slug(state.model.meta.title)}.eps.json`, JSON.stringify(state.model, null, 2)));
  $('#file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const m = normalizeModel(JSON.parse(await file.text()));
      state.quick.from = '';
      app.update((cur) => {
        for (const k of Object.keys(cur)) delete cur[k];
        Object.assign(cur, m);
      });
      viewer.setView('iso');
      toast(`Étude « ${m.meta.title} » chargée.`);
    } catch (err) {
      toast(`Fichier illisible : ${err.message}`);
    }
    e.target.value = '';
  });
  $('#btn-run').addEventListener('click', run);
  $('#btn-report').addEventListener('click', openReport);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
  });
  refreshPreview();
  render();
  viewer.setView('iso');
}

init();
