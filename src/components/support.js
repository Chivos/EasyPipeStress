// Supports et blocages. Chaque type de support se traduit par un ensemble de
// ressorts linéaires orientés (translation ou rotation) au nœud ; un blocage
// « rigide » est un ressort de très grande raideur (méthode de pénalité, comme
// dans les logiciels industriels), ce qui traite naturellement les directions
// biaises et permet d'imposer des déplacements (mouvements de piquage). Cette
// raideur est proportionnée au tube retenu (voir rigidStiffness).
// Supports variables (ressorts) : raideur verticale k active dans tous les cas
// (poids, dilatation, séisme, modal) et précharge P appliquée vers le haut dans
// le cas poids propre ; l'effort repris vaut P − k·u (u déplacement vertical vers
// le haut depuis la position de réglage). Supports constants : précharge P seule, sans raideur.
// Supports à contact (appuis simples, jeux, butées, frottement) : pris tels quels
// par le solveur linéaire, qui signale les contacts à revoir ; calculés par états
// par le solveur non linéaire (fem/contact.js, nonlinear.js).

import { vec } from '../core/linalg.js';

export const RIGID_T = 1e10; // N/mm
export const RIGID_R = 1e14; // N·mm/rad
// Un blocage « rigide » doit l'être devant le tube qu'il retient : pour les gros
// diamètres, la raideur de pénalité est portée à RIGID_RATIO fois la raideur d'un
// tronçon de tube d'un diamètre de long (E·A/De en translation, E·I/De en
// rotation). L'ancrage se comporte alors comme De/10⁴ de tube supplémentaire.
export const RIGID_RATIO = 1e4;

/** Raideurs de pénalité (translation, rotation) d'un blocage rigide au nœud. */
export function rigidStiffness(elements) {
  let kt = RIGID_T;
  let kr = RIGID_R;
  for (const e of elements ?? []) {
    if (e.valve || e.rigid) continue; // raideur déjà majorée (robinet, tronçon rigide)
    kt = Math.max(kt, (RIGID_RATIO * e.E * e.sec.A) / e.sec.od);
    kr = Math.max(kr, (RIGID_RATIO * e.E * e.sec.I) / e.sec.od);
  }
  return { kt, kr };
}

const GLOBAL = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** Directions horizontales perpendiculaires à l'axe du tube. */
function lateralDirs(axis, up) {
  if (Math.abs(vec.dot(axis, up)) > 0.9) {
    // tube vertical : les deux directions horizontales
    const a = vec.unit(vec.cross(up, Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    return [a, vec.cross(up, a)];
  }
  return [vec.unit(vec.cross(up, axis))];
}

/** Direction(s) d'un dispositif auto-bloquant selon le choix de l'utilisateur. */
function snubberDirs(dir, axis, up) {
  if (GLOBAL[dir]) return [GLOBAL[dir]];
  if (dir === 'vertical') return [up];
  if (dir === 'lateral') return lateralDirs(axis, up);
  return [axis];
}

// Chaque type fournit ses ressorts { rot, dir } ; marqueurs :
//  - bearing : appui vertical d'une tuyauterie posée (unilatéral en réalité : le
//    calcul linéaire le prend bilatéral et signale le soulèvement) ;
//  - dynamicOnly : actif seulement dans les cas dynamiques (modal, séisme).
export const SUPPORT_KINDS = {
  anchor: {
    label: 'Ancrage (6 DDL bloqués)',
    springs: () => [
      ...Object.values(GLOBAL).map((d) => ({ rot: false, dir: d })),
      ...Object.values(GLOBAL).map((d) => ({ rot: true, dir: d })),
    ],
  },
  rest: {
    label: 'Appui simple (posé)',
    springs: ({ up }) => [{ rot: false, dir: up, bearing: true }],
  },
  guide: {
    label: 'Guide latéral',
    springs: ({ axis, up }) => lateralDirs(axis, up).map((d) => ({ rot: false, dir: d })),
  },
  restguide: {
    label: 'Appui simple + guide latéral',
    springs: ({ axis, up }) => [{ rot: false, dir: up, bearing: true }, ...lateralDirs(axis, up).map((d) => ({ rot: false, dir: d }))],
  },
  clamp: {
    label: 'Appui vertical bilatéral (étrier)',
    springs: ({ up }) => [{ rot: false, dir: up }],
  },
  clampguide: {
    label: 'Appui bilatéral + guide latéral',
    springs: ({ axis, up }) => [{ rot: false, dir: up }, ...lateralDirs(axis, up).map((d) => ({ rot: false, dir: d }))],
  },
  axial: {
    label: 'Butée axiale',
    springs: ({ axis }) => [{ rot: false, dir: axis }],
  },
  variable: {
    label: 'Support variable (précharge + raideur)',
    springs: ({ up }) => [{ rot: false, dir: up, flexible: true }],
    hanger: true,
  },
  constant: {
    label: 'Support constant (précharge)',
    springs: () => [],
    hanger: true,
  },
  snubber: {
    label: 'Dispositif auto-bloquant',
    springs: ({ axis, up, comp }) => snubberDirs(comp.dir, axis, up).map((d) => ({ rot: false, dir: d, dynamicOnly: true })),
  },
  custom: {
    label: 'Blocage personnalisé (DDL globaux)',
    springs: ({ comp }) => {
      const out = [];
      for (const ax of ['X', 'Y', 'Z']) if (comp.dofs?.includes(`D${ax}`)) out.push({ rot: false, dir: GLOBAL[ax] });
      for (const ax of ['X', 'Y', 'Z']) if (comp.dofs?.includes(`R${ax}`)) out.push({ rot: true, dir: GLOBAL[ax] });
      return out;
    },
  },
};

export const SNUBBER_DIRS = { axial: 'Axiale (suivant le tube)', lateral: 'Latérale', vertical: 'Verticale', X: 'Globale X', Y: 'Globale Y', Z: 'Globale Z' };

const F = {
  node: { key: 'node', label: 'Nœud', type: 'node', width: 60 },
  label: { key: 'label', label: 'Repère', type: 'text', width: 90 },
  kind: (kinds) => ({ key: 'kind', label: 'Type', type: 'select', options: () => kinds, optionLabel: (k) => SUPPORT_KINDS[k]?.label ?? k, width: 170 }),
  stiffness: (title) => ({ key: 'stiffness', label: 'Raideur', unit: 'N/mm', type: 'number', width: 80, placeholder: 'rigide', title }),
  gap: (title) => ({ key: 'gap', label: 'Jeu', unit: 'mm', type: 'text', width: 80, placeholder: 'aucun', title }),
  friction: {
    key: 'friction',
    label: 'Frottement μ',
    type: 'number',
    width: 80,
    placeholder: 'aucun',
    title:
      'Coefficient de frottement de Coulomb entre la tuyauterie et le support (ordre de grandeur : 0,3 acier sur acier, 0,1 sur patin PTFE). ' +
      'La force de frottement vaut μ fois la réaction du support et s’oppose au glissement. Pris en compte par le solveur non linéaire seulement (poids, dilatation) ; sans effet en séisme.',
  },
};
const GAP_HELP =
  'Jeu avant contact (mm). Une valeur : même jeu des deux côtés (5). Deux valeurs séparées par « / » : côté − puis côté + de la direction (2/5) ; ' +
  '« - » à la place d’une valeur : pas de butée de ce côté (0/- : butée à un seul sens, au contact ; 3/- : appui placé 3 mm sous le tube). ' +
  'Le côté + est celui des coordonnées globales croissantes (le haut pour une direction verticale). ' +
  'Plusieurs directions bloquées : une entrée par direction, séparées par un espace, dans l’ordre des directions du support. ' +
  'Solveur linéaire : une direction à jeu des deux côtés est libre en poids et en dilatation (un avertissement signale un jeu rattrapé) et bloquée en séisme ; ' +
  'une butée au contact d’un côté est prise dans les deux sens (un avertissement signale un effort en sens inverse). Solveur non linéaire : le jeu se ferme quand il est rattrapé.';

/**
 * Familles de supports de l'onglet de saisie : chacune a ses types, ses colonnes
 * de base et ses réglages avancés (masqués tant qu'ils ne servent pas).
 */
export const SUPPORT_FAMILIES = [
  {
    id: 'fixed',
    label: 'Points fixes et blocages',
    addLabel: 'blocage',
    kinds: ['anchor', 'guide', 'axial', 'clamp', 'clampguide', 'custom'],
    help: 'Blocages bilatéraux, rigides par défaut. Le blocage personnalisé se définit par ses DDL globaux (réglages avancés). Un jeu, différent de chaque côté si besoin, ou une butée à un seul sens se saisissent dans la colonne « Jeu » des réglages avancés (5, 2/5, 0/-).',
    fields: [F.node, F.kind(['anchor', 'guide', 'axial', 'clamp', 'clampguide', 'custom']), F.label],
    advanced: [
      { key: 'dofs', label: 'DDL (perso.)', type: 'text', width: 110, placeholder: 'DX DY RZ…', title: 'Pour le blocage personnalisé : DX DY DZ RX RY RZ' },
      F.stiffness('Raideur en translation (vide = rigide)'),
      F.gap(GAP_HELP),
      F.friction,
      { key: 'imposed', label: 'Dépl. imposé thermique', unit: 'mm', type: 'text', width: 120, placeholder: 'dx dy dz', title: 'Déplacement imposé appliqué dans les cas thermiques (mouvement de piquage), composantes globales' },
    ],
  },
  {
    id: 'rest',
    label: 'Appuis simples (tuyauterie posée)',
    addLabel: 'appui simple',
    kinds: ['rest', 'restguide'],
    help: 'La tuyauterie repose sur l’appui sans y être tenue. Solveur linéaire : un avertissement signale tout appui soulevé (poids, dilatation) ou qui décollerait sous séisme. Solveur non linéaire : l’appui décolle.',
    fields: [F.node, F.kind(['rest', 'restguide']), F.label],
    advanced: [F.stiffness('Raideur en translation (vide = rigide)'), F.gap(`Jeu du guide latéral. ${GAP_HELP}`), F.friction],
  },
  {
    id: 'spring',
    label: 'Supports à ressort',
    addLabel: 'support à ressort',
    kinds: ['variable', 'constant'],
    help: 'Support variable : ressort vertical de raideur k, actif dans tous les cas, et précharge P (effort de réglage vers le haut) appliquée dans le cas poids propre ; effort repris = P − k·u. Support constant : précharge P seule, sans raideur. Les courses vers le haut et vers le bas, avant butée, se saisissent séparément (réglages avancés).',
    fields: [
      F.node,
      F.kind(['variable', 'constant']),
      { key: 'stiffness', label: 'Raideur', unit: 'N/mm', type: 'number', width: 80, placeholder: '—', title: 'Raideur du ressort (support variable) ; sans objet pour un support constant' },
      { key: 'preload', label: 'Précharge', unit: 'N', type: 'number', width: 80, placeholder: '—', title: 'Effort vertical de réglage (vers le haut) exercé par le support sur la tuyauterie, appliqué dans le cas poids propre' },
      F.label,
    ],
    advanced: [
      { key: 'travelUp', label: 'Course haut', unit: 'mm', type: 'number', width: 80, placeholder: 'libre', title: 'Course disponible vers le haut depuis la position de réglage, avant la butée haute ; vide : pas de butée de ce côté. Solveur linéaire : un avertissement signale une butée atteinte (poids, dilatation, séisme). Solveur non linéaire : la butée arrête le support.' },
      { key: 'travelDown', label: 'Course bas', unit: 'mm', type: 'number', width: 80, placeholder: 'libre', title: 'Course disponible vers le bas depuis la position de réglage, avant la butée basse ; vide : pas de butée de ce côté. Elle peut différer de la course vers le haut.' },
    ],
  },
  {
    id: 'snubber',
    label: 'Dispositifs auto-bloquants',
    addLabel: 'dispositif auto-bloquant',
    kinds: ['snubber'],
    help: 'Libres en poids et en dilatation, bloqués en analyse modale et en séisme. Le détail du support donne le déplacement thermique suivant sa direction (course à prévoir).',
    fields: [F.node, { key: 'dir', label: 'Direction', type: 'select', options: () => Object.keys(SNUBBER_DIRS), optionLabel: (k) => SNUBBER_DIRS[k] ?? k, width: 150 }, F.label],
    advanced: [F.stiffness('Raideur du dispositif bloqué (vide = rigide)')],
  },
];

/** Famille d'un type de support. */
export const familyOf = (kind) => SUPPORT_FAMILIES.find((f) => f.kinds.includes(kind)) ?? SUPPORT_FAMILIES[0];

/** Vrai si le champ avancé est renseigné (les réglages avancés s'affichent alors d'office). */
export const hasAdvanced = (family, comp) => family.advanced.some((f) => comp[f.key] != null && String(comp[f.key]).trim() !== '') || comp.kind === 'custom';

export const support = {
  id: 'support',
  label: 'Support',
  phase: 'point',
  // toutes les colonnes (note de calcul) ; la saisie se fait par famille (SUPPORT_FAMILIES)
  fields: [
    F.node,
    F.kind(Object.keys(SUPPORT_KINDS)),
    F.stiffness('Raideur en translation (vide = rigide)'),
    { key: 'preload', label: 'Précharge', unit: 'N', type: 'number', width: 80 },
    { key: 'dofs', label: 'DDL (perso.)', type: 'text', width: 110 },
    { key: 'dir', label: 'Direction (auto-bloquant)', type: 'text', width: 110 },
    { key: 'gap', label: 'Jeu', unit: 'mm', type: 'text', width: 80 },
    { key: 'travelUp', label: 'Course haut', unit: 'mm', type: 'number', width: 80 },
    { key: 'travelDown', label: 'Course bas', unit: 'mm', type: 'number', width: 80 },
    { key: 'friction', label: 'Frottement μ', type: 'number', width: 80 },
    { key: 'imposed', label: 'Dépl. imposé thermique', unit: 'mm', type: 'text', width: 120 },
    F.label,
  ],

  create(model, { node, kind } = {}) {
    const k = kind ?? 'rest';
    return { type: 'support', node: node ?? '', kind: k, stiffness: '', preload: '', dofs: '', imposed: '', label: '', ...(k === 'snubber' ? { dir: 'axial' } : {}) };
  },

  mesh(comp, ctx) {
    const kindDef = SUPPORT_KINDS[comp.kind];
    if (!kindDef) {
      ctx.error(`Support ${comp.label || comp.id} : type inconnu « ${comp.kind} ».`);
      return;
    }
    const idx = ctx.nodeIndex(comp.node, `Support « ${comp.label || comp.kind} »`);
    if (idx < 0) return;
    const axis = ctx.pipeAxisAt(idx);
    const specs = kindDef.springs({ axis, up: ctx.up, comp: { ...comp, dofs: String(comp.dofs ?? '').toUpperCase() } });
    if (!specs.length && !kindDef.hanger) ctx.warn(`Support au nœud ${comp.node} : aucun degré de liberté bloqué.`);
    const kUser = +comp.stiffness;
    if (comp.kind === 'variable' && !(kUser > 0)) {
      ctx.error(`Support variable au nœud ${comp.node} : raideur obligatoire.`);
      return;
    }
    const preload = kindDef.hanger && Number.isFinite(+comp.preload) ? +comp.preload : 0;
    if (comp.kind === 'constant' && !(preload > 0)) ctx.warn(`Support constant au nœud ${comp.node} : précharge nulle, le support ne reprend aucun effort.`);
    const imposed = parseVec(comp.imposed);
    // jeux : sur les directions de translation bloquées, hors appui de la tuyauterie posée
    const gapped = specs.filter((s) => !s.rot && !s.bearing && !s.dynamicOnly && !kindDef.hanger);
    const gaps = parseGaps(comp.gap, gapped.length);
    if (gaps === null) ctx.warn(`Support au nœud ${comp.node} : jeu « ${comp.gap} » non compris (une valeur par direction bloquée, ${gapped.length} ici, ou une seule pour toutes ; « 2/5 » pour un jeu différent de chaque côté, « - » pour un côté sans butée) ; jeu ignoré.`);
    else if (gaps.some((g) => g.minus > 0 || g.plus > 0) && comp.kind === 'anchor') ctx.warn(`Ancrage au nœud ${comp.node} : un jeu n’a pas de sens sur un ancrage ; jeu ignoré.`);
    const travel = (v) => (v === '' || v == null || !(+v >= 0) ? null : +v);
    // frottement : sur les blocages en translation ; sans objet pour un ancrage, un support à ressort ou un auto-bloquant
    let mu = 0;
    if (comp.friction != null && String(comp.friction).trim() !== '') {
      const v = +String(comp.friction).replace(',', '.');
      if (!(v >= 0)) ctx.warn(`Support au nœud ${comp.node} : coefficient de frottement « ${comp.friction} » non compris ; frottement ignoré.`);
      else if (v > 0 && (comp.kind === 'anchor' || kindDef.hanger || comp.kind === 'snubber')) ctx.warn(`Support au nœud ${comp.node} : le frottement est sans objet pour ce type de support (${kindDef.label}) ; frottement ignoré.`);
      else mu = v;
    }
    const supIdx = ctx.addSupport({
      comp: comp.id,
      node: idx,
      kind: comp.kind,
      label: comp.label || comp.kind,
      imposed,
      ...(mu > 0 ? { mu } : {}),
      ...(kindDef.hanger ? { preload, dir: ctx.up, k: comp.kind === 'variable' ? kUser : 0, travelUp: travel(comp.travelUp), travelDown: travel(comp.travelDown) } : {}),
    });
    const rigid = rigidStiffness(ctx.elementsAt(idx));
    for (const s of specs) {
      const k = s.rot ? rigid.kr : kUser > 0 ? kUser : rigid.kt;
      const g = (comp.kind !== 'anchor' && gaps ? gaps[gapped.indexOf(s)] : null) ?? { minus: 0, plus: 0 };
      const hasGap = g.minus > 0 || g.plus > 0;
      if (g.minus === Infinity && g.plus === Infinity) {
        ctx.warn(`Support au nœud ${comp.node} : une direction sans butée d’aucun côté (jeu « ${comp.gap} ») ne retient rien ; direction ignorée.`);
        continue;
      }
      // jeu des deux côtés : direction libre en statique linéaire (jeu supposé ouvert, contrôlé), bloquée en
      // dynamique ; butée au contact d'un côté : active, prise dans les deux sens par le calcul linéaire
      const open = g.minus > 0 && g.plus > 0;
      ctx.addSpring({
        node: idx,
        rot: s.rot,
        // direction à jeu : orientée dans le sens global croissant, qui définit ses côtés − et +
        dir: hasGap ? positiveSense(vec.unit(s.dir)) : vec.unit(s.dir),
        k,
        support: supIdx,
        bearing: !!s.bearing,
        gapped: hasGap,
        ...(hasGap ? { gapMinus: g.minus, gapPlus: g.plus, oneWay: open ? 0 : g.minus === 0 ? -1 : 1 } : {}),
        dynamicOnly: !!s.dynamicOnly || open,
      });
    }
  },
};

/** Direction orientée dans le sens global croissant : sa plus grande composante est positive. */
function positiveSense(d) {
  const i = [0, 1, 2].reduce((a, b) => (Math.abs(d[b]) > Math.abs(d[a]) + 1e-9 ? b : a), 0);
  return d[i] < 0 ? d.map((v) => (v === 0 ? 0 : -v)) : d;
}

/**
 * Jeux par direction : [{ minus, plus }] en mm, du côté − et du côté + de la direction
 * (Infinity : pas de butée de ce côté). '' → aucun jeu ; une entrée → toutes les directions ;
 * n entrées → une par direction. Une entrée : « 5 » (même jeu des deux côtés), « 2/5 »
 * (côté − / côté +), « - » à la place d'une valeur pour un côté sans butée. null si incompris.
 */
function parseGaps(text, n) {
  if (text == null || String(text).trim() === '') return Array.from({ length: n }, () => ({ minus: 0, plus: 0 }));
  const side = (t) => {
    if (/^(-|–|—|libre|inf|∞)$/i.test(t)) return Infinity;
    const v = t === '' ? NaN : Number(t.replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : NaN;
  };
  const parts = String(text)
    .trim()
    .split(/[\s;]+/)
    .map((token) => {
      const sides = token.split('/');
      if (sides.length > 2) return null;
      const minus = side(sides[0]);
      const plus = sides.length === 2 ? side(sides[1]) : minus;
      return Number.isNaN(minus) || Number.isNaN(plus) ? null : { minus, plus };
    });
  if (parts.some((x) => !x)) return null;
  if (parts.length === 1) return Array.from({ length: n }, () => ({ ...parts[0] }));
  return parts.length === n ? parts : null;
}

function parseVec(text) {
  if (text == null || String(text).trim() === '') return null;
  const parts = String(text).trim().split(/[\s;]+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return parts;
}
