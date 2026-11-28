// Fiches des valeurs attendues des cas de comparaison à supports non linéaires.
//
// Le modèle est l'exemple « Cas non linéaire – appui qui décolle, jeu rattrapé,
// frottement » (src/core/examples.js), jumeau des jeux de données nl-appui-jeu.fre
// (sans frottement) et nl-appui-jeu-frottement.fre (μ = 0,3). Les fiches donnent,
// pour chaque état calculé, ce que le logiciel de référence doit imprimer.
//
// Usage : node docs/validation/valeurs-attendues.mjs   (réécrit les deux fiches .md)
import fs from 'node:fs';
import { normalizeModel } from '../../src/core/model.js';
import { nonlinearSupports } from '../../src/core/examples.js';
import { runAnalysis } from '../../src/analysis.js';
import { buildContacts } from '../../src/fem/contact.js';
import { solveContactState } from '../../src/fem/nonlinear.js';
import { weightLoads } from '../../src/loads/weight.js';
import { thermalLoads, hotMesh } from '../../src/loads/thermal.js';

// points du jeu de données ↔ nœuds de l'application
const POINTS = [
  ['10', '10', 'ancrage PF1'],
  ['20', '20A', 'début du coude 1'],
  ['21', '20B', 'fin du coude 1'],
  ['30', '30', 'appui A1'],
  ['40', '40A', 'début du coude 2'],
  ['41', '40B', 'fin du coude 2'],
  ['50', '50', 'appui A2 + butée G1'],
  ['60', '60', 'ancrage PF2'],
];
const K_E = 203 / 184; // E à 20 °C / E à 300 °C (P265GH)
const n = (v, d = 3) => {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};

/**
 * Calcul de l'exemple et de ses deux états réels : poids seul à froid (cas 100) et
 * poids + dilatation au module à chaud (cas 101). L'application rend le cas de
 * dilatation comme une différence d'états ; l'état de service est recalculé ici.
 */
function compute(friction) {
  const model = normalizeModel(nonlinearSupports({ friction }));
  const r = runAnalysis(model);
  const { mesh, sys } = r;
  const wl = weightLoads(sys, model.loadCases.find((c) => c.type === 'weight'));
  const mh = hotMesh(mesh);
  const tl = thermalLoads(mh, model, model.loadCases.find((c) => c.type === 'thermal'));
  const add = (a, b) => a.map((fa, i) => (fa && b[i] ? fa.map((v, k) => v + b[i][k]) : fa ?? b[i]));
  const { contacts, baseSprings } = buildContacts(mesh);
  const cold = solveContactState({ mesh, loads: wl, contacts, baseSprings, name: 'W' });
  const service = solveContactState({ mesh: mh, loads: { F: wl.F, elemEq: add(wl.elemEq, tl.elemEq), imposed: tl.imposed }, contacts, baseSprings, guess: cold.zones, name: 'W+T1' });
  return { r, mesh, cold, service };
}
/** Base linéaire : les trois supports bilatéraux, sans jeu ni frottement (cas 1 et 2, modal). */
function linearBase() {
  const model = normalizeModel(nonlinearSupports({ friction: '' }));
  model.settings.solver = 'linear';
  for (const c of model.components) {
    if (c.type !== 'support') continue;
    if (c.kind === 'rest') c.kind = 'clamp';
    c.gap = '';
  }
  const r = runAnalysis(model);
  return { r, mesh: r.mesh, weight: r.cases.find((c) => c.type === 'weight'), thermal: r.cases.find((c) => c.type === 'thermal') };
}

function sheet({ friction, name, title }) {
  const S = compute(friction);
  const free = friction ? compute('') : null; // même cas sans frottement, pour mesurer l'effet
  const lin = linearBase();
  const out = [];
  const p = (...a) => out.push(...a);
  const idx = (mesh, l) => mesh.nodeIndex.get(l);
  /** Position (dans elemForces) d'une extrémité d'élément située au nœud l. */
  const end = (mesh, l) => {
    const nd = idx(mesh, l);
    const ie = mesh.elements.findIndex((e) => e.n1 === nd || e.n2 === nd);
    return ie * 12 + (mesh.elements[ie].n1 === nd ? 0 : 6);
  };
  const moment = (st, o) => Math.hypot(st.elemForces[o + 3], st.elemForces[o + 4], st.elemForces[o + 5]) / 1e6;
  const dispTable = (mesh, list) => {
    p(`| Point | ${list.map(([t]) => `${t} DX | DY | DZ`).join(' | ')} |`, `|---|${list.map(() => '---:|---:|---:|').join('')}`);
    for (const [ps, l] of POINTS) p(`| ${ps} | ${list.map(([, st]) => [0, 1, 2].map((k) => n(st.u[idx(mesh, l) * 6 + k])).join(' | ')).join(' | ')} |`);
    p('');
  };
  const supTable = (mesh, list) => {
    for (const [t, st] of list) {
      p(`${t} :`, '', '| Support | FX (kN) | FY (kN) | FZ (kN) | MX (kN·m) | MY (kN·m) | MZ (kN·m) |', '|---|---:|---:|---:|---:|---:|---:|');
      mesh.supports.forEach((s, k) => {
        const point = POINTS.find((x) => x[1] === mesh.nodes[s.node].label)[0];
        p(`| ${s.label} (point ${point}) | ${[0, 1, 2].map((d) => n(st.supportLoads[k * 6 + d] / 1e3)).join(' | ')} | ${[3, 4, 5].map((d) => (s.kind === 'anchor' ? n(st.supportLoads[k * 6 + d] / 1e6) : '–')).join(' | ')} |`);
      });
      p('');
    }
  };
  const states = [S.cold, S.service];
  const dx50 = (st) => st.u[idx(S.mesh, '50') * 6];

  p(`# ${title} — valeurs attendues`, '');
  p(`Valeurs calculées par EasyPipeStress (solveur non linéaire, RCC-M, module à chaud pour la dilatation) sur l’exemple « Cas non linéaire – appui qui décolle, jeu rattrapé, frottement »${friction ? '' : ', colonne « Frottement μ » vidée'}. À comparer aux résultats du jeu de données \`${name}.fre\`. Fiche produite par \`valeurs-attendues.mjs\`.`, '');

  p('## 1. Modèle', '');
  p('- Tube DN200 219,1 × 8,18 mm, P265GH, plein d’eau, sans calorifuge ; 300 °C, 3 MPa ; pesanteur suivant −Z.');
  p('- Tracé : ancrage PF1 (0 ; 0 ; 0), montée de 3 m suivant +Z, coude R = 305 mm, 6 m suivant +X, coude R = 305 mm, 5 m suivant +Y, ancrage PF2. Longueurs mesurées aux intersections des axes.');
  p('- A1 (à 2,5 m du premier coude) et A2 (à 2 m du second coude) : appuis simples, la tuyauterie est posée.');
  p('- G1 (même point que A2) : butée latérale suivant X avec 5 mm de jeu de chaque côté.');
  p(`- Raideur des trois supports : 1000 kN/mm${friction ? ` ; frottement μ = ${String(friction).replace('.', ',')} sur les trois (champ MU des cartes NRST)` : ''}.`, '');
  p('| Point du jeu de données | Nœud EasyPipeStress | Position |', '|---|---|---|');
  for (const [ps, l, d] of POINTS) p(`| ${ps} | ${l} | ${d} |`);
  p('', 'Conventions : déplacements en mm dans le repère global ; efforts exercés **par la tuyauterie sur le support**, repère global.', '');

  p('## 2. Ce que le cas doit montrer', '');
  const fr = (st, label) => st.friction.find((f) => S.mesh.supports[f.support].label === label);
  const frText = (f) => (!f.active ? 'sans objet, le support n’agit pas' : f.slip ? `**glisse**, ${n(f.force / 1e3)} kN (= μ·R), déplacement ${n(f.delta, 2)} mm` : `adhère, ${n(f.force / 1e3)} kN pour ${n(f.limit / 1e3)} kN admis`);
  p('| Support | Cas 100 (poids seul, 20 °C) | Cas 101 (poids + dilatation, 300 °C) |', '|---|---|---|');
  p(`| A1, appui simple | en contact, ${n(-states[0].states[0].force / 1e3)} kN | **décollé de ${n(states[1].states[0].d, 2)} mm**, effort nul |`);
  if (friction) p(`| A1, frottement | ${frText(fr(states[0], 'A1'))} | ${frText(fr(states[1], 'A1'))} |`);
  p(`| A2, appui simple | en contact, ${n(-states[0].states[1].force / 1e3)} kN | en contact, ${n(-states[1].states[1].force / 1e3)} kN |`);
  if (friction) p(`| A2, frottement | ${frText(fr(states[0], 'A2'))} | ${frText(fr(states[1], 'A2'))} |`);
  p(`| G1, butée X à jeu de 5 mm | jeu ouvert (DX = ${n(dx50(states[0]))} mm), effort nul | **jeu rattrapé côté +X** (DX = ${n(dx50(states[1]))} mm), ${n(Math.abs(states[1].states[2].force) / 1e3)} kN |`);
  if (friction) p(`| G1, frottement | ${frText(fr(states[0], 'G1'))} | ${frText(fr(states[1], 'G1'))} |`);
  p('', `Itérations (calculs complets) : ${states[0].iterations} pour le cas 100, ${states[1].iterations} pour le cas 101.`, '');
  const a1 = lin.mesh.supports.findIndex((x) => x.label === 'A1');
  const g1 = lin.mesh.supports.findIndex((x) => x.label === 'G1');
  if (!friction) {
    p(`Pour mesurer l’effet : en linéaire (cas 2, supports bilatéraux sans jeu), A1 retiendrait la tuyauterie vers le bas avec ${n(lin.thermal.supportLoads[a1 * 6 + 2] / 1e3, 1)} kN et G1 reprendrait ${n(lin.thermal.supportLoads[g1 * 6] / 1e3, 1)} kN.`, '');
  } else {
    const [f2, f3] = [fr(states[1], 'A2'), fr(states[1], 'G1')];
    const pf2 = S.mesh.supports.findIndex((x) => x.label === 'PF2');
    p(`Direction des forces de frottement dans le cas 101 (force de la tuyauterie sur le support, colinéaire au déplacement du point 50) : A2 dans le plan horizontal, suivant (${f2.dir.map((v) => n(v)).join(' ; ')}) ; G1 dans le plan transversal à X, suivant (${f3.dir.map((v) => n(v)).join(' ; ')}).`, '');
    p(`Effet principal du frottement : au point 50 le tube est orienté suivant Y et se déplace surtout suivant −Y ; les deux forces de frottement sont donc presque axiales et se retrouvent dans la réaction FY de l’ancrage PF2, qui passe de ${n(free.service.supportLoads[pf2 * 6 + 1] / 1e3)} kN sans frottement à ${n(S.service.supportLoads[pf2 * 6 + 1] / 1e3)} kN. L’ancrage PF1 et l’éq. (7) au point 10 changent très peu.`, '');
    p('Points de modèle à connaître pour la comparaison :', '');
    p('- A2 et G1 sont deux supports distincts au même point : chacun frotte dans son propre plan transversal, comme deux cartes NRST.');
    p('- Raideur d’adhérence 1750 kN/mm (valeur par défaut KM = 10⁷ lb/in du logiciel de référence).');
    p('- L’application converge à 10⁻⁶ sur la force de frottement ; avec la tolérance par défaut E1 = 0,001 du logiciel de référence, un écart de l’ordre de 0,1 % sur les forces de frottement est normal.');
    p('- À froid (cas 100), les forces d’adhérence sont petites et sensibles à la raideur d’adhérence : n’y comparer que l’ordre de grandeur.', '');
  }

  p('## 3. Cas non linéaires 100 et 101', '', '### Déplacements (mm)', '');
  dispTable(S.mesh, [['100', S.cold], ['101', S.service]]);
  p('### Efforts sur les supports', '');
  supTable(S.mesh, [['Cas 100 — poids seul', S.cold], ['Cas 101 — poids + dilatation', S.service]]);
  p(`Somme des efforts verticaux dans les deux cas : ${n(S.mesh.supports.reduce((a, s, k) => a + S.service.supportLoads[k * 6 + 2], 0) / 1e3)} kN (poids total).`, '');
  p('### Moments résultants √(MX² + MY² + MZ²) et étendue (kN·m)', '');
  p('| Point | Cas 100 | Cas 101 | Étendue 101 − 100 (cas 200) |', '|---|---:|---:|---:|');
  for (const [ps, l] of POINTS) {
    const o = end(S.mesh, l);
    const d = [3, 4, 5].map((k) => S.service.elemForces[o + k] - S.cold.elemForces[o + k]);
    p(`| ${ps} | ${n(moment(S.cold, o))} | ${n(moment(S.service, o))} | ${n(Math.hypot(...d) / 1e6)} |`);
  }
  p('', 'L’étendue est le module de la différence des moments, composante par composante (pas la différence des modules).', '');

  p('## 4. Contraintes RCC-M (MPa)', '');
  const cfg = S.r.nonlinear.configurations[0].id;
  p(`| Point | Éq. (6), cas 100 | Éq. (6), configuration de service ${cfg} | Éq. (7) EasyPipeStress | Éq. (7) sans le facteur E_froid/E_chaud |`, '|---|---:|---:|---:|---:|');
  for (const [ps, l] of POINTS) {
    const at = S.r.check.rows.filter((x) => x.node === l);
    const max = (eq, configuration = null) => Math.max(...at.filter((x) => x.eq === eq && (x.configuration ?? null) === configuration).map((x) => x.stress));
    p(`| ${ps} | ${n(max('6'), 2)} | ${n(max('6', cfg), 2)} | ${n(max('7'), 2)} | ${n(max('7') / K_E, 2)} |`);
  }
  p('', `L’éq. (6) du cas 100 est celle du poids seul à froid, à comparer au logiciel de référence. La colonne suivante est une vérification propre à l’application : le poids recalculé avec les supports dans leur état de service (A1 retiré, G1 actif, sans frottement), sans équivalent direct dans le jeu de données.`);
  p('', `EasyPipeStress ramène l’étendue au module à froid : éq. (7) = i·M_C·(E_froid/E_chaud)/Z, avec E_froid/E_chaud = 203/184 = ${n(K_E, 4)}. Si le cas 200 du logiciel de référence ne porte pas ce facteur (les cas 100 et 101 sont des cas de poids, pas des cas de dilatation), c’est la dernière colonne qui doit ressortir.`);
  p('Admissibles : S = 118 MPa pour l’éq. (6), S_A = 177 MPa pour l’éq. (7). L’éq. (8) n’est pas évaluée par l’application quand l’éq. (7) est satisfaite.', '');

  if (friction) {
    p('## 5. Base linéaire (cas 1, cas 2, modal)', '', 'Inchangée par le frottement : voir la fiche du cas sans frottement (`nl-appui-jeu-valeurs-attendues.md`).', '');
  } else {
    p('## 5. Base linéaire (cas 1, cas 2, modal)', '');
    p('Ces cas servent à contrôler que les deux modèles sont identiques avant de regarder le non linéaire : les trois supports y sont bilatéraux et sans jeu.', '');
    p('### Déplacements (mm)', '');
    dispTable(lin.mesh, [['Cas 1', lin.weight], ['Cas 2', lin.thermal]]);
    p('### Efforts sur les supports', '');
    supTable(lin.mesh, [['Cas 1 — poids', lin.weight], ['Cas 2 — dilatation, efforts au module à chaud', lin.thermal]]);
    p(`Si le logiciel de référence imprime les efforts du cas 2 ramenés au module à froid, les multiplier par ${n(K_E, 4)}.`, '');
    const modes = lin.r.modal.modes.slice(0, 5);
    p('### Fréquences propres (Hz)', '');
    p(`| Mode | ${modes.map((_, i) => i + 1).join(' | ')} |`, `|---|${modes.map(() => '---:|').join('')}`);
    p(`| f (Hz) | ${modes.map((m) => n(m.freq, 2)).join(' | ')} |`, '');
    p('Module à froid, supports bilatéraux sans jeu (les mêmes fréquences sortent du modèle non linéaire : en dynamique les supports sont comptés actifs, sans frottement).', '');
  }
  return out.join('\n');
}

const here = new URL('.', import.meta.url);
for (const s of [
  { friction: '', name: 'nl-appui-jeu', title: 'Cas « NL-APPUI-JEU »' },
  { friction: 0.3, name: 'nl-appui-jeu-frottement', title: 'Cas « NL-APPUI-JEU-FROTTEMENT »' },
]) {
  fs.writeFileSync(new URL(`${s.name}-valeurs-attendues.md`, here), sheet(s));
  console.log(`${s.name}-valeurs-attendues.md`);
}
