// Coude placé au sommet (point d'intersection des tangentes) de deux tubes
// droits. Le sommet est remplacé par un arc de rayon R discrétisé en éléments
// courbes approchés par des cordes. Les nœuds créés sont nommés <nœud>A (début),
// <nœud>M (milieu) et <nœud>B (fin), comme dans les logiciels de flexibilité.
// Les facteurs de flexibilité k et d'intensification i sont fournis par le code
// de vérification actif (cf. src/codes).

import { vec } from '../core/linalg.js';

export const bend = {
  id: 'bend',
  label: 'Coude',
  phase: 'corner',
  fields: [
    { key: 'node', label: 'Sommet', type: 'node', width: 60 },
    { key: 'radius', label: 'Rayon', unit: 'mm', type: 'number', width: 70, title: 'Rayon de cintrage (grand rayon = 1,5 DN)' },
    { key: 't', label: 'Épaisseur', unit: 'mm', type: 'number', width: 70, placeholder: 'tube', title: 'Épaisseur nominale du coude (vide = celle du tube)' },
    { key: 'divisions', label: 'Divisions', type: 'number', width: 60, placeholder: 'auto' },
  ],

  create(model, { node, radius } = {}) {
    return { type: 'bend', node: node ?? '', radius: radius ?? '', t: '', divisions: '' };
  },

  mesh(comp, ctx) {
    const B = String(comp.node);
    const segs = ctx.segmentsAt(B);
    if (segs.length !== 2) {
      ctx.error(`Coude au nœud ${B} : le sommet doit relier exactement deux tubes (trouvé ${segs.length}).`);
      return;
    }
    const pB = ctx.coord(B);
    const ends = segs.map((s) => ({ seg: s, other: s.a === B ? s.pb : s.pa }));
    const e1 = vec.unit(vec.sub(ends[0].other, pB));
    const e2 = vec.unit(vec.sub(ends[1].other, pB));
    const d1 = vec.scale(e1, -1); // direction d'arrivée au sommet
    const d2 = e2; // direction de départ
    const cosT = Math.max(-1, Math.min(1, vec.dot(d1, d2)));
    const theta = Math.acos(cosT);
    if (theta < 1e-3) {
      ctx.warn(`Coude au nœud ${B} : tubes alignés, coude ignoré.`);
      return;
    }
    if (theta > Math.PI - 1e-3) {
      ctx.error(`Coude au nœud ${B} : demi-tour (180°) impossible.`);
      return;
    }
    const props = { ...ends[0].seg.props };
    const sec = ctx.section(props.section);
    const R = +comp.radius > 0 ? +comp.radius : Math.round(1.5 * (sec?.od ?? 100));
    const Lt = R * Math.tan(theta / 2);
    for (const { seg, other } of ends) {
      const avail = vec.norm(vec.sub(other, pB)); // extrémité opposée déjà rognée si coude
      if (Lt > avail + 1e-6) {
        ctx.error(`Coude au nœud ${B} : longueur de tangente ${Lt.toFixed(0)} mm supérieure à la longueur disponible du tube ${seg.a}-${seg.b} (${avail.toFixed(0)} mm).`);
        return;
      }
    }
    const P1 = vec.add(pB, vec.scale(e1, Lt));
    const P2 = vec.add(pB, vec.scale(e2, Lt));
    const labA = `${B}A`;
    const labB = `${B}B`;
    ctx.replaceEnd(ends[0].seg, B, labA, P1, Lt);
    ctx.replaceEnd(ends[1].seg, B, labB, P2, Lt);

    const n = vec.unit(vec.sub(d2, vec.scale(d1, vec.dot(d2, d1))));
    const C = vec.add(P1, vec.scale(n, R));
    let nd = +comp.divisions > 0 ? Math.round(+comp.divisions) : Math.max(2, Math.ceil(theta / ((ctx.settings.bendDivisionAngle ?? 10) * Math.PI / 180)));
    if (nd % 2) nd += 1; // nombre pair : un nœud au milieu de l'arc
    const pts = [];
    for (let k = 0; k <= nd; k++) {
      const phi = (theta * k) / nd;
      pts.push(vec.add(C, vec.add(vec.scale(n, -R * Math.cos(phi)), vec.scale(d1, R * Math.sin(phi)))));
    }
    const labels = pts.map((_, k) => (k === 0 ? labA : k === nd ? labB : k === nd / 2 ? `${B}M` : `${B}.${k}`));
    if (comp.t !== '' && comp.t != null && +comp.t > 0) props.tOverride = +comp.t;
    const bendInfo = { node: B, radius: R, angle: theta, normal: vec.cross(d1, d2) };
    for (let k = 0; k < nd; k++) {
      ctx.addSegment({
        comp: comp.id,
        kind: 'bend',
        a: labels[k],
        b: labels[k + 1],
        pa: pts[k],
        pb: pts[k + 1],
        nodeKinds: ['bend', 'bend'],
        subdivide: false,
        massLength: (R * theta) / nd,
        props: { ...props, bend: bendInfo },
      });
    }
    ctx.markCorner(B, { point: pB, start: P1, end: P2, radius: R, angle: theta });
  },
};
