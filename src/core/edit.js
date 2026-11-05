// Opérations d'édition du modèle indépendantes de l'interface (testables).

import { newId } from './model.js';

/** Repères de nœuds déjà utilisés par le modèle. */
export function usedLabels(model) {
  const set = new Set(model.nodeCoords.map((n) => String(n.node)));
  for (const c of model.components) for (const k of ['n1', 'n2', 'node']) if (c[k] != null && c[k] !== '') set.add(String(c[k]));
  return set;
}

/**
 * Repères proposés pour k nouveaux nœuds d'un tube n1 → n2 : entiers suivant n1
 * (41, 42… après 40) s'ils sont libres, sinon n1_1, n1_2…
 */
export function proposeLabels(model, pipe, k) {
  const used = usedLabels(model);
  const out = [];
  const a = String(pipe.n1);
  if (/^\d+$/.test(a)) {
    for (let x = +a + 1; out.length < k && x < +a + 1000; x++) if (!used.has(String(x))) out.push(String(x));
  }
  for (let j = 1; out.length < k; j++) {
    const l = `${a}_${j}`;
    if (!used.has(l)) out.push(l);
  }
  return out;
}

/**
 * Divise un tube droit en plusieurs tubes de mêmes caractéristiques.
 * @param pipeId identifiant du tube
 * @param opts.parts nombre de parties égales (≥ 2), ou
 * @param opts.lengths longueurs successives (mm) des parties ; s'il reste une
 *   longueur, elle forme la dernière partie (somme égale à la longueur du tube :
 *   pas de partie ajoutée)
 * @param opts.labels repères des nouveaux nœuds (sinon proposés)
 * @returns repères des nœuds créés ; les nouveaux tubes suivent l'original dans la liste
 */
/** Écart de longueur (mm) en deçà duquel la somme saisie est égale à la longueur du tube. */
export const SPLIT_TOL = 0.05;
const round1 = (x) => Math.round(x * 10) / 10;

export function splitPipe(model, pipeId, { parts, lengths, labels } = {}) {
  const i = model.components.findIndex((c) => c.id === pipeId);
  const p = model.components[i];
  if (!p || p.type !== 'pipe') throw new Error('Tube introuvable.');
  const d = [+p.dx || 0, +p.dy || 0, +p.dz || 0];
  const L = Math.hypot(...d);
  if (!(L > 0)) throw new Error('Tube de longueur nulle.');
  let fr;
  if (lengths?.length) {
    const ls = lengths.map(Number);
    if (ls.some((x) => !(x > 0))) throw new Error('Les longueurs doivent être positives.');
    const sum = ls.reduce((s, x) => s + x, 0);
    const rest = L - sum;
    if (rest < -SPLIT_TOL) throw new Error(`Somme des longueurs ${round1(sum)} mm : dépassement de ${round1(-rest)} mm sur la longueur du tube (${round1(L)} mm).`);
    fr = (rest > SPLIT_TOL ? [...ls, rest] : ls).map((x) => x / L);
    if (fr.length < 2) throw new Error('Saisir au moins deux longueurs, ou une longueur inférieure à celle du tube.');
  } else {
    const n = Math.round(+parts);
    if (!(n >= 2)) throw new Error('Nombre de parties : au moins 2.');
    fr = Array.from({ length: n }, () => 1 / n);
  }
  const k = fr.length - 1;
  const names = (labels?.length ? labels.map((x) => String(x).trim()) : proposeLabels(model, p, k)).slice(0, k);
  if (names.length < k || names.some((x) => !x)) throw new Error(`Il faut ${k} repère(s) de nœud.`);
  const used = usedLabels(model);
  const clash = names.find((x) => used.has(x));
  if (clash) throw new Error(`Le repère « ${clash} » est déjà utilisé.`);
  if (new Set(names).size !== names.length) throw new Error('Repères en double.');
  const round = (x) => Math.round(x * 1000) / 1000;
  const nodes = [String(p.n1), ...names, String(p.n2)];
  // composantes arrondies ; la dernière partie absorbe l'arrondi (géométrie inchangée)
  let acc = [0, 0, 0];
  const pieces = fr.map((f, j) => {
    const v = j < fr.length - 1 ? d.map((x) => round(x * f)) : d.map((x, a) => round(x - acc[a]));
    acc = acc.map((x, a) => x + v[a]);
    return { ...p, id: j === 0 ? p.id : `__split${j}`, n1: nodes[j], n2: nodes[j + 1], dx: v[0], dy: v[1], dz: v[2] };
  });
  model.components.splice(i, 1, ...pieces);
  for (const q of pieces.slice(1)) q.id = newId(model);
  return names;
}
