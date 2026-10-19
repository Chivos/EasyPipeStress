// Mailleur : transforme le modèle utilisateur en maillage de calcul
// (nœuds, éléments de poutre, ressorts de support, masses ponctuelles).
//
// Étapes :
//  1. coordonnées des nœuds utilisateur (parcours des DX/DY/DZ) ;
//  2. composants 'line'   → segments droits ;
//  3. composants 'corner' → remplacement des sommets par des arcs (coudes) ;
//  4. discrétisation des segments, renumérotation Cuthill-McKee inverse ;
//  5. caractéristiques des éléments (section, matériau, facteurs k / i / B fournis
//     par le code de vérification) ;
//  6. composants 'point'  → masses, supports.

import { components } from '../components/index.js';
import { resolveCoordinates } from './model.js';
import { pipeSection } from './sections.js';
import { materialAt } from './materials.js';
import { densityToInternal, kgToT, AXES } from './units.js';
import { vec } from './linalg.js';
import { elementFrame } from '../fem/beam3d.js';

export class ModelError extends Error {
  constructor(errors, warnings = []) {
    super(errors.join('\n'));
    this.errors = errors;
    this.warnings = warnings;
  }
}

const genericFactors = ({ kind }) => ({ k: 1, i: 1, B1: 0.5, B2: 1, note: kind });

/**
 * @param model modèle utilisateur
 * @param opts.factors (elemDescriptor) → { k, i, B1, B2 } (fourni par le code)
 * @param opts.tolerant si vrai, ne lève pas d'exception (aperçu géométrique)
 */
export function buildMesh(model, { factors = genericFactors, tolerant = false } = {}) {
  const errors = [];
  const warnings = [];
  const settings = model.settings ?? {};
  const up = AXES[settings.vertical ?? 'Z'];
  const sections = new Map(model.sections.map((s) => [s.id, s]));
  const materials = new Map(model.materials.map((m) => [m.id, m]));

  const lineTypes = components.list().filter((d) => d.phase === 'line').map((d) => d.id);
  const { coords, errors: geoErr } = resolveCoordinates(model, lineTypes);
  errors.push(...geoErr);

  const segments = [];
  const corners = new Map();
  const byPhase = (phase) => model.components.filter((c) => components.has(c.type) && components.get(c.type).phase === phase);

  const ctxBase = {
    up,
    settings,
    model,
    error: (m) => errors.push(m),
    warn: (m) => warnings.push(m),
    section: (id) => sections.get(id),
    material: (id) => materials.get(id),
    coord: (label) => coords.get(String(label)) ?? corners.get(String(label))?.point,
  };

  // --- 2. segments
  const lineCtx = {
    ...ctxBase,
    addSegment(seg) {
      segments.push({ subdivide: true, nodeKinds: ['user', 'user'], trimmedA: 0, trimmedB: 0, ...seg });
    },
  };
  for (const c of byPhase('line')) {
    if (!lineCtx.coord(c.n1) || !lineCtx.coord(c.n2)) continue;
    components.get(c.type).mesh(c, lineCtx);
  }

  // --- 3. sommets
  const cornerCtx = {
    ...lineCtx,
    segmentsAt: (label) => segments.filter((s) => s.a === label || s.b === label),
    replaceEnd(seg, oldLabel, newLabel, newPos, trim) {
      if (seg.a === oldLabel) {
        seg.a = newLabel;
        seg.pa = newPos;
        seg.nodeKinds[0] = 'bend';
      } else {
        seg.b = newLabel;
        seg.pb = newPos;
        seg.nodeKinds[1] = 'bend';
      }
      seg.trimmed = (seg.trimmed ?? 0) + trim;
    },
    markCorner: (label, info) => corners.set(label, info),
  };
  for (const c of byPhase('corner')) components.get(c.type).mesh(c, cornerCtx);

  // --- 4. nœuds et éléments
  // Segments de longueur nulle (coude soudé directement sur un piquage, coudes
  // bout à bout) : leurs deux extrémités sont un seul et même nœud, connu sous
  // les deux repères (le repère utilisateur est conservé comme repère principal).
  const parent = new Map();
  const find = (l) => {
    while (parent.has(l) && parent.get(l) !== l) l = parent.get(l);
    return l;
  };
  const kindOf = new Map();
  for (const s of segments) {
    kindOf.set(s.a, s.nodeKinds[0]);
    kindOf.set(s.b, s.nodeKinds[1]);
  }
  for (const s of segments) {
    if (vec.norm(vec.sub(s.pb, s.pa)) >= 1) continue;
    const ra = find(s.a);
    const rb = find(s.b);
    if (ra === rb) continue;
    if (kindOf.get(rb) === 'user' && kindOf.get(ra) !== 'user') parent.set(ra, rb);
    else parent.set(rb, ra);
  }
  const nodeMap = new Map();
  const rawNodes = [];
  const getNode = (label0, p, kind0) => {
    const label = find(label0);
    const kind = kindOf.get(label) ?? kind0;
    if (nodeMap.has(label)) return nodeMap.get(label);
    const i = rawNodes.length;
    rawNodes.push({ label, x: p[0], y: p[1], z: p[2], kind });
    nodeMap.set(label, i);
    return i;
  };
  const rawElems = [];
  const maxLen = +settings.meshMaxLength > 0 ? +settings.meshMaxLength : 1e12;
  for (const s of segments) {
    const L = vec.norm(vec.sub(s.pb, s.pa));
    if (L < 1) continue; // extrémités fusionnées ci-dessus
    const nsub = s.subdivide ? Math.max(1, Math.ceil(L / maxLen - 1e-9)) : 1;
    let prev = getNode(s.a, s.pa, s.nodeKinds[0]);
    const end = getNode(s.b, s.pb, s.nodeKinds[1]);
    for (let k = 1; k <= nsub; k++) {
      const cur = k === nsub ? end : getNode(`${s.a}>${s.b}.${k}`, vec.add(s.pa, vec.scale(vec.sub(s.pb, s.pa), k / nsub)), 'internal');
      rawElems.push({ seg: s, n1: prev, n2: cur, massLength: s.massLength != null ? s.massLength : L / nsub });
      prev = cur;
    }
  }

  // Renumérotation Cuthill-McKee inverse (réduit le profil de la matrice).
  const perm = reverseCuthillMcKee(rawNodes.length, rawElems);
  const inv = new Int32Array(rawNodes.length);
  perm.forEach((old, nw) => (inv[old] = nw));
  const nodes = perm.map((old) => rawNodes[old]);
  const nodeIndex = new Map(nodes.map((n, i) => [n.label, i]));
  for (const l of parent.keys()) if (!nodeIndex.has(l) && nodeIndex.has(find(l))) nodeIndex.set(l, nodeIndex.get(find(l)));

  // --- 5. caractéristiques des éléments
  const tRef = +settings.tRef || 20;
  const elements = [];
  for (const re of rawElems) {
    const { seg } = re;
    const p = seg.props;
    const sec = sections.get(p.section);
    const mat = materials.get(p.material);
    if (!sec) {
      errors.push(`Élément ${seg.a}-${seg.b} : section « ${p.section} » introuvable.`);
      continue;
    }
    if (!mat) {
      errors.push(`Élément ${seg.a}-${seg.b} : matériau « ${p.material} » introuvable.`);
      continue;
    }
    let sp;
    try {
      sp = pipeSection(sec, p.tOverride);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    const n1 = inv[re.n1];
    const n2 = inv[re.n2];
    const p1 = xyz(nodes[n1]);
    const p2 = xyz(nodes[n2]);
    const { L, R } = elementFrame(p1, p2, up);
    const cold = materialAt(mat, tRef);
    const hot = materialAt(mat, p.T1);
    if (hot.outOfRange) warnings.push(`Matériau ${mat.id} : température ${p.T1} °C hors de la table (extrapolation constante).`);
    const f = factors({ kind: seg.kind, sec: sp, bend: p.bend, P: p.P1, Ec: cold.E, params: model.code?.params ?? {} });
    const valve = p.valve ?? null;
    // robinet : masse totale répartie sur la longueur, sans fluide ni calorifuge
    const metal = valve ? kgToT(valve.mass) / L : densityToInternal(mat.density) * sp.A;
    const fluid = valve ? 0 : densityToInternal(+sec.fluidDensity || 0) * sp.Ai;
    const insul = valve ? 0 : densityToInternal(+sec.insulDensity || 0) * sp.Ains;
    elements.push({
      index: elements.length,
      n1,
      n2,
      kind: seg.kind,
      comp: seg.comp,
      label: `${nodes[n1].label}-${nodes[n2].label}`,
      L,
      R,
      sec: sp,
      secId: sec.id,
      secDef: sec,
      matId: mat.id,
      mat,
      nu: +mat.nu || 0.3,
      E: cold.E * (valve ? valve.stiffFactor : 1), // robinet : raideur = facteur × tube
      T1: p.T1,
      P1: p.P1,
      Td: p.Td,
      Pd: p.Pd,
      bend: p.bend ?? null,
      valve,
      factors: f,
      endFactors: [null, null], // facteurs locaux d'extrémité (té), prioritaires sur `factors`
      massLength: re.massLength,
      mpl: { metal, fluid, insul }, // masse linéique (t/mm)
    });
  }

  // --- 6. masses et supports
  const springs = [];
  const supports = [];
  const pointMasses = [];
  const tees = [];
  const nodeElems = nodes.map(() => []);
  for (const e of elements) {
    nodeElems[e.n1].push(e);
    nodeElems[e.n2].push(e);
  }
  const pointCtx = {
    ...ctxBase,
    nodeIndex(label, what) {
      const l = String(label ?? '').trim();
      if (nodeIndex.has(l)) return nodeIndex.get(l);
      if (corners.has(l)) errors.push(`${what} : le nœud ${l} est le sommet d'un coude ; utiliser ${l}A, ${l}M ou ${l}B.`);
      else errors.push(`${what} : nœud « ${l} » inexistant.`);
      return -1;
    },
    pipeAxisAt(i) {
      const es = nodeElems[i];
      if (!es.length) return [1, 0, 0];
      let a = [0, 0, 0];
      for (const e of es) {
        let x = e.R.slice(0, 3);
        if (vec.dot(x, a) < 0) x = vec.scale(x, -1);
        a = vec.add(a, x);
      }
      return vec.unit(a);
    },
    addSpring: (s) => springs.push(s),
    addSupport: (s) => supports.push(s) - 1,
    addPointMass: (m) => pointMasses.push(m),
    elementsAt: (i) => nodeElems[i],
    /** Facteurs locaux (té…) appliqués aux extrémités des éléments aboutissant au nœud. */
    addNodeFactors(i, desc) {
      // le SIF d'un té se calcule avec les dimensions du collecteur (tube principal :
      // plus grand diamètre, puis plus grande épaisseur) et s'applique aux trois branches
      const run = [...nodeElems[i]].sort((a, b) => b.sec.od - a.sec.od || b.sec.t - a.sec.t)[0];
      for (const e of nodeElems[i]) {
        const end = e.n1 === i ? 0 : 1;
        e.endFactors[end] = factors({ ...desc, sec: run.sec, P: run.P1, Ec: run.E, params: model.code?.params ?? {} });
        e.endFactors[end].component = desc.kind;
      }
      tees.push({ node: i, ...desc });
    },
  };
  for (const c of byPhase('point')) components.get(c.type).mesh(c, pointCtx);
  for (const c of model.components) if (!components.has(c.type)) warnings.push(`Composant de type inconnu « ${c.type} » ignoré.`);

  if (!elements.length) errors.push('Le modèle ne contient aucun élément de tuyauterie.');
  const mesh = { nodes, nodeIndex, elements, springs, supports, pointMasses, tees, corners, up, nodeElems, errors, warnings };
  if (errors.length && !tolerant) throw new ModelError(errors, warnings);
  return mesh;
}

export const xyz = (n) => [n.x, n.y, n.z];

function reverseCuthillMcKee(n, elems) {
  const adj = Array.from({ length: n }, () => new Set());
  for (const e of elems) {
    adj[e.n1].add(e.n2);
    adj[e.n2].add(e.n1);
  }
  const visited = new Uint8Array(n);
  const order = [];
  const deg = (i) => adj[i].size;
  while (order.length < n) {
    // départ : nœud non visité de degré minimal (extrémité de ligne)
    let start = -1;
    for (let i = 0; i < n; i++) if (!visited[i] && (start < 0 || deg(i) < deg(start))) start = i;
    const queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const v = queue.shift();
      order.push(v);
      const nb = [...adj[v]].filter((w) => !visited[w]).sort((a, b) => deg(a) - deg(b));
      for (const w of nb) {
        visited[w] = 1;
        queue.push(w);
      }
    }
  }
  return order.reverse();
}
