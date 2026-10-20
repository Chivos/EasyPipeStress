// Vue 3D filaire en projection orthographique sur <canvas> 2D (aucune
// dépendance). Rotation : glisser ; translation : Maj + glisser ou clic droit ;
// zoom : molette ; clic : sélection d'un nœud.

import { vec } from '../core/linalg.js';
import { toLocalVector } from '../fem/beam3d.js';
import { SUPPORT_KINDS } from '../components/support.js';

const SUPPORT_COLORS = { anchor: '#c0392b', rest: '#2471a3', guide: '#7d3c98', restguide: '#1f618d', axial: '#b9770e', variable: '#148f77', constant: '#d35400', custom: '#566573' };

export class Viewer {
  constructor(canvas, { onPick } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.az = (35 * Math.PI) / 180;
    this.el = (30 * Math.PI) / 180;
    this.zoom = 1;
    this.pan = [0, 0];
    this.scene = null;
    this.anim = null;
    this.installEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  installEvents() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.pan) {
        this.pan[0] += dx;
        this.pan[1] += dy;
      } else {
        this.az -= dx * 0.01;
        this.el = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.el + dy * 0.01));
      }
      this.draw();
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.pick(e);
      drag = null;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = Math.exp(-e.deltaY * 0.0015);
        const r = c.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2 - this.pan[0];
        const my = e.clientY - r.top - r.height / 2 - this.pan[1];
        this.pan[0] -= mx * (f - 1);
        this.pan[1] -= my * (f - 1);
        this.zoom *= f;
        this.draw();
      },
      { passive: false },
    );
  }

  setView(name) {
    const views = { iso: [35, 30], top: [0, 90], front: [0, 0], side: [90, 0] };
    const [a, e] = views[name] ?? views.iso;
    this.az = (a * Math.PI) / 180;
    this.el = (e * Math.PI) / 180;
    this.fit();
  }

  fit() {
    this.zoom = 1;
    this.pan = [0, 0];
    this.draw();
  }

  setScene(scene) {
    this.scene = scene;
    if (scene?.animate && !this.anim) {
      const loop = () => {
        this.draw();
        this.anim = requestAnimationFrame(loop);
      };
      this.anim = requestAnimationFrame(loop);
    } else if (!scene?.animate && this.anim) {
      cancelAnimationFrame(this.anim);
      this.anim = null;
    }
    this.draw();
  }

  /** Passage au repère canonique (z = vertical) puis projection écran. */
  canon(p) {
    const v = this.scene?.mesh?.up ?? [0, 0, 1];
    if (v[2] === 1) return p;
    if (v[1] === 1) return [p[0], -p[2], p[1]];
    return [p[1], p[2], p[0]];
  }

  project(p) {
    const [x, y, z] = this.canon(p);
    const ca = Math.cos(this.az);
    const sa = Math.sin(this.az);
    const x1 = x * ca + y * sa;
    const y1 = -x * sa + y * ca;
    const ce = Math.cos(this.el);
    const se = Math.sin(this.el);
    return [x1, z * ce + y1 * se, y1 * ce - z * se];
  }

  toScreen(p) {
    const q = this.project(p);
    const { cx, cy, s, ox, oy } = this.frame;
    return [cx + (q[0] - ox) * s + this.pan[0], cy - (q[1] - oy) * s + this.pan[1], q[2]];
  }

  computeFrame(points, w, h) {
    let mnx = Infinity;
    let mxx = -Infinity;
    let mny = Infinity;
    let mxy = -Infinity;
    for (const p of points) {
      const q = this.project(p);
      mnx = Math.min(mnx, q[0]);
      mxx = Math.max(mxx, q[0]);
      mny = Math.min(mny, q[1]);
      mxy = Math.max(mxy, q[1]);
    }
    if (!Number.isFinite(mnx)) {
      mnx = mny = -1000;
      mxx = mxy = 1000;
    }
    const ext = Math.max(mxx - mnx, mxy - mny, 500);
    const s = (Math.min(w, h) * 0.78 * this.zoom) / ext;
    this.frame = { cx: w / 2, cy: h / 2, s, ox: (mnx + mxx) / 2, oy: (mny + mxy) / 2 };
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(canvas);
    const col = (name, fb) => css.getPropertyValue(name).trim() || fb;
    const C = { bg: col('--view-bg', '#fff'), pipe: col('--view-pipe', '#4a5568'), text: col('--view-text', '#1a202c'), muted: col('--view-muted', '#8a94a6'), deformed: col('--view-deformed', '#d35400'), valve: col('--view-valve', '#6a4c93'), halo: col('--view-halo', '#a5dde3'), sel: col('--accent', '#0b7285') };
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, hgt);
    const sc = this.scene;
    const mesh = sc?.mesh;
    if (!mesh || !mesh.nodes.length) {
      ctx.fillStyle = C.muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Modèle vide : ajoutez un premier tube dans l’onglet Géométrie.', w / 2, hgt / 2);
      this.drawTriad(ctx, C, hgt);
      return;
    }
    const P = mesh.nodes.map((n) => [n.x, n.y, n.z]);
    this.computeFrame([...P, ...[...mesh.corners.values()].map((c) => c.point)], w, hgt);
    const S = P.map((p) => this.toScreen(p));

    const disp = sc.displacement; // { u, scale, signed }
    const colors = sc.elementColors; // tableau de couleurs par élément ou null
    const ghost = disp && disp.signed;

    const pxPerMm = this.frame.s;
    const solid = sc.render !== 'wire';
    const odAtNode = (i) => Math.max(0, ...(mesh.nodeElems?.[i] ?? []).filter((e) => e.kind !== 'valve').map((e) => e.sec.od));

    // Tangentes fantômes des coudes (filaire seulement)
    if (!solid) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      for (const [, c] of mesh.corners) {
        const a = this.toScreen(c.start);
        const b = this.toScreen(c.point);
        const d = this.toScreen(c.end);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(d[0], d[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Rendu des tubes par « lignes continues » (suites d'éléments de même diamètre
    // reliés deux à deux) : les coudes sont tracés sur leur arc réel finement
    // échantillonné et chaque ligne est ombrée d'un seul tenant, indépendamment
    // du découpage en éléments de calcul. Quand une déformée est affichée, la
    // géométrie initiale est rappelée en filaire grisé.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prims = []; // primitives 3D triées par profondeur (peintre)
    const valveShape = (pa, pb, od, color) => {
      if (solid) prims.push(...this.valvePrims(pa, pb, od, color, mesh.up));
      else drawValve(ctx, this.toScreen(pa), this.toScreen(pb), color, 9);
    };
    const arcs = this.bendArcs(mesh);
    const hlSpec = sc.highlight;
    // composant en cours d'édition (comp) ou élément(s) d'une ligne de résultats (elems)
    const isHl = (e) => (hlSpec?.comp != null && e.comp === hlSpec.comp) || !!hlSpec?.elems?.has(e.index);
    const hlColor = (e) => isHl(e) && !hlSpec.keepColor; // résultats : la couleur du taux est conservée
    const amp = ghost ? disp.scale * (sc.animate ? Math.sin(performance.now() / 300) : 1) : 0;
    const useDisp = disp?.colorOf && disp.colorMax > 0;
    // points (3D) et couleurs d'un élément, dans le sens de parcours demandé
    const elemTrace = (e, ie, rev) => {
      const arc = e.kind === 'bend' ? arcs.get(e.index) : null;
      const nseg = arc ? Math.max(2, Math.ceil(arc.phi / (3 * Math.PI / 180))) : ghost ? 8 : 1;
      let pts;
      let mags = null;
      if (ghost) {
        pts = deformedPoints(e, P, disp.u, amp, nseg);
        mags = pts.mags;
        if (arc) pts = pts.map((p, k) => vec.add(p, vec.sub(arc.at(k / nseg), vec.add(P[e.n1], vec.scale(vec.sub(P[e.n2], P[e.n1]), k / nseg)))));
      } else if (arc) {
        pts = Array.from({ length: nseg + 1 }, (_, k) => arc.at(k / nseg));
      } else {
        // tube droit : tronçons courts aux extrémités (tri en profondeur correct
        // au voisinage des robinets, disques de supports et tés)
        const L = vec.norm(vec.sub(P[e.n2], P[e.n1]));
        const a = L > 0 ? Math.min(0.3, (1.2 * e.sec.od) / L) : 0;
        const ts = a > 0.02 ? [0, a, 1 - a, 1] : [0, 1];
        pts = ts.map((t) => vec.add(P[e.n1], vec.scale(vec.sub(P[e.n2], P[e.n1]), t)));
      }
      const hl = hlColor(e);
      const segColors = Array.from({ length: pts.length - 1 }, (_, k) =>
        hl ? C.sel : ghost ? (useDisp ? disp.colorOf((mags[k] + mags[k + 1]) / 2 / disp.colorMax) : colors?.[ie] ?? C.deformed) : colors?.[ie] ?? C.pipe,
      );
      if (rev) {
        pts.reverse();
        segColors.reverse();
      }
      return { pts, segColors };
    };
    if (ghost) {
      ctx.strokeStyle = C.muted;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      for (const e of mesh.elements) {
        const a = S[e.n1];
        const b = S[e.n2];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Mise en évidence du composant en cours d'édition : halo sous le tracé
    if (hlSpec?.comp || hlSpec?.elems?.size) {
      ctx.strokeStyle = C.halo; // teinte opaque : pas de surépaisseur aux recouvrements
      for (const e of mesh.elements) {
        if (!isHl(e)) continue;
        const scr = elemTrace(e, e.index, false).pts.map((q) => this.toScreen(q));
        ctx.lineWidth = (solid ? Math.max(1.2, e.sec.od * pxPerMm) * (e.kind === 'valve' ? 1.6 : 1) : 2.5) + 14;
        ctx.beginPath();
        scr.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        ctx.stroke();
      }
    }
    for (const chain of this.tubeChains(mesh)) {
      const pts = [];
      const segColors = [];
      chain.forEach(({ e, rev }, k) => {
        const t = elemTrace(e, e.index, rev);
        pts.push(...(k ? t.pts.slice(1) : t.pts));
        segColors.push(...t.segColors);
      });
      const od = chain[0].e.sec.od;
      trimPolyline(pts, segColors, chain.trim[0], chain.trim[1]);
      const scr = pts.map((p) => this.toScreen(p));
      if (solid) prims.push(...this.chainPrims(scr, segColors, od));
      else {
        ctx.lineWidth = 2.5;
        for (let k = 1; k < scr.length; k++) {
          ctx.strokeStyle = segColors[k - 1];
          ctx.beginPath();
          ctx.moveTo(scr[k - 1][0], scr[k - 1][1]);
          ctx.lineTo(scr[k][0], scr[k][1]);
          ctx.stroke();
        }
      }
    }
    mesh.elements.forEach((e, ie) => {
      if (e.kind !== 'valve') return;
      if (!ghost) {
        valveShape(P[e.n1], P[e.n2], e.sec.od, hlColor(e) ? C.sel : colors?.[ie] ?? C.valve);
        return;
      }
      const pts = deformedPoints(e, P, disp.u, amp, 1);
      valveShape(pts[0], pts[1], e.sec.od, useDisp ? disp.colorOf((pts.mags[0] + pts.mags[1]) / 2 / disp.colorMax) : C.valve);
    });
    // Supports : flèches dont la pointe touche la paroi du tube, une par sens
    // bloqué (blocage bilatéral = deux flèches opposées) ; blocage axial =
    // flèches parallèles au tube ; point fixe = disque rouge dans le plan de
    // section ; blocage partiel en rotation = disque jaune. Les disques sont
    // triés en profondeur avec les tubes (le tube traverse le disque).
    const springsByNode = new Map();
    for (const s of mesh.springs) {
      if (!springsByNode.has(s.node)) springsByNode.set(s.node, []);
      springsByNode.get(s.node).push(s);
    }
    const supInfo = mesh.supports.map((sup) => {
      const springs = (springsByNode.get(sup.node) ?? []).filter((s) => mesh.supports[s.support] === sup);
      return { springs, fullAnchor: sup.kind === 'anchor' || springs.filter((s) => s.rot).length >= 3 };
    });
    const minPx = 14; // longueur minimale lisible d'une flèche (px)
    const hangerLength = (od) => Math.max(2.2 * od, (1.6 * minPx) / pxPerMm);
    mesh.supports.forEach((sup, k) => {
      // supports variables / constants en 3D : volume trié en profondeur avec les tubes
      // (profondeur du milieu du ressort, sous le tube : masqué par le tube vu de dessus)
      if (solid && (sup.kind === 'variable' || sup.kind === 'constant')) {
        const p = P[sup.node];
        const od = odAtNode(sup.node) || 100;
        const Lh = hangerLength(od);
        const mid = vec.add(p, vec.scale(mesh.up, -(od / 2 + Lh / 2)));
        prims.push({ depth: this.toScreen(mid)[2], draw: (c) => this.drawHanger3D(c, p, mesh.up, od / 2, Lh, SUPPORT_COLORS[sup.kind], od, sup.kind === 'constant') });
        return;
      }
      const { springs, fullAnchor } = supInfo[k];
      if (!fullAnchor && !springs.some((s) => s.rot)) return;
      const p = P[sup.node];
      const od = odAtNode(sup.node) || 100;
      const axis = this.nodeAxis(mesh, sup.node);
      prims.push({
        depth: this.toScreen(p)[2],
        draw: (c) => (fullAnchor ? this.drawDisc(c, p, axis, 1.0 * od, '#d62828', '#7a1010') : this.drawDisc(c, p, axis, 0.85 * od, '#f2c200', '#8a6d00')),
      });
    });
    prims.sort((a, b) => b.depth - a.depth);
    for (const pr of prims) pr.draw(ctx);

    mesh.supports.forEach((sup, k) => {
      const p = P[sup.node];
      const od = odAtNode(sup.node) || 100;
      const R = od / 2;
      const axis = this.nodeAxis(mesh, sup.node);
      const { springs, fullAnchor } = supInfo[k];
      const color = SUPPORT_COLORS[sup.kind] ?? '#555';
      if (fullAnchor) return;
      // longueur de flèche : 1,5 De à l'échelle, avec un minimum en pixels
      const L = Math.max(1.5 * od, minPx / pxPerMm);
      if (sup.kind === 'variable' || sup.kind === 'constant') {
        // support variable / constant : ressort sous le tube, effort vers le haut
        if (!solid) this.drawHanger(ctx, p, mesh.up, R, hangerLength(od), color, od, sup.kind === 'constant'); // en 3D : dessiné avec les tubes
        return;
      }
      for (const sp of springs.filter((x) => !x.rot)) {
        const d = sp.dir;
        if (Math.abs(vec.dot(d, axis)) > 0.9) {
          // blocage axial : deux flèches parallèles au tube, de part et d'autre du nœud,
          // décalées hors du tube, pointes vers le plan du nœud
          let off = vec.sub(mesh.up, vec.scale(axis, vec.dot(mesh.up, axis)));
          if (vec.norm(off) < 1e-6) off = Math.abs(axis[0]) < 0.9 ? vec.cross(axis, [1, 0, 0]) : vec.cross(axis, [0, 1, 0]);
          off = vec.scale(vec.unit(off), R + 0.35 * od);
          for (const sg of [-1, 1]) {
            const tip = vec.add(vec.add(p, off), vec.scale(axis, sg * 0.15 * od));
            const tail = vec.add(tip, vec.scale(axis, sg * L));
            this.drawArrow(ctx, tail, tip, color, od);
          }
          continue;
        }
        for (const sg of [-1, 1]) {
          const tip = vec.add(p, vec.scale(d, sg * R));
          const tail = vec.add(tip, vec.scale(d, sg * L));
          this.drawArrow(ctx, tail, tip, color, od);
        }
      }
    });

    // Nœud du composant ponctuel en cours d'édition (support, masse, té…)
    if (hlSpec?.node != null && !hlSpec.keepColor) {
      const q = S[hlSpec.node];
      const r = (solid ? (odAtNode(hlSpec.node) * pxPerMm) / 2 : 4) + 12;
      ctx.fillStyle = C.sel;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Masses ponctuelles
    for (const pm of mesh.pointMasses) {
      const s = S[pm.node];
      const r = solid ? Math.max(4, 0.3 * odAtNode(pm.node) * pxPerMm) : Math.max(4, Math.min(11, 3 + 2 * Math.log10(pm.m * 1000 + 1)));
      ctx.fillStyle = '#2e86c1';
      ctx.strokeStyle = C.bg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s[0], s[1], r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    // Nœuds et étiquettes
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const showAll = sc.showAllNodes;
    mesh.nodes.forEach((n, i) => {
      if (n.kind === 'internal' && !showAll) return;
      if (n.kind === 'bend' && !showAll && !/[AB]$/.test(n.label)) return;
      const s = S[i];
      const selected = sc.selected === n.label;
      ctx.fillStyle = selected ? C.sel : C.text;
      ctx.beginPath();
      ctx.arc(s[0], s[1], selected ? 5 : n.kind === 'user' ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();
      if (sc.labels !== false && (n.kind === 'user' || showAll || selected)) {
        ctx.fillStyle = selected ? C.sel : n.kind === 'user' ? C.text : C.muted;
        ctx.fillText(n.label, s[0] + 6, s[1] - 6);
      }
    });
    if (sc.labels !== false) {
      for (const [label, c] of mesh.corners) {
        const s = this.toScreen(c.point);
        ctx.fillStyle = sc.selected === label ? C.sel : C.muted;
        ctx.fillText(label, s[0] + 6, s[1] - 6);
      }
    }
    this.screenNodes = [
      ...mesh.nodes.map((n, i) => ({ label: n.label, s: S[i], kind: n.kind })),
      ...[...mesh.corners].map(([label, c]) => ({ label, s: this.toScreen(c.point), kind: 'corner' })),
    ];

    this.drawTriad(ctx, C, hgt);
    // Point d'une ligne de résultats survolée : repère marqué et nom du nœud, au premier plan
    if (hlSpec?.keepColor && hlSpec.node != null && S[hlSpec.node]) {
      const q = S[hlSpec.node];
      const r = (solid ? (odAtNode(hlSpec.node) * pxPerMm) / 2 : 4) + 10;
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.bg;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.sel;
      ctx.stroke();
      ctx.fillStyle = C.sel;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 3.5, 0, 2 * Math.PI);
      ctx.fill();
      const text = `Nœud ${mesh.nodes[hlSpec.node].label}`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      const bx = q[0] + r * 0.75 + 6;
      const by = q[1] - r * 0.75 - 22;
      ctx.fillStyle = C.sel;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, tw + 12, 20, 4) ?? ctx.rect(bx, by, tw + 12, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 6, by + 10);
      ctx.textBaseline = 'alphabetic';
    }

    if (sc.legend) this.drawLegend(ctx, C, w, sc.legend);
  }

  drawTriad(ctx, C, hgt) {
    const o = [44, hgt - 44];
    const axes = [
      ['X', [1, 0, 0], '#c0392b'],
      ['Y', [0, 1, 0], '#27ae60'],
      ['Z', [0, 0, 1], '#2471a3'],
    ];
    ctx.font = 'bold 11px system-ui, sans-serif';
    for (const [name, d, color] of axes) {
      const q = this.project(d);
      const e = [o[0] + q[0] * 28, o[1] - q[1] * 28];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o[0], o[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
      ctx.fillText(name, e[0] + 3, e[1] + 3);
    }
  }

  drawLegend(ctx, C, w, legend) {
    if (legend.gradient) return this.drawGradientLegend(ctx, C, w, legend);
    const x = w - 190;
    const y = 14;
    ctx.fillStyle = C.bg;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x - 10, y - 4, 190, 20 + legend.items.length * 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(legend.title, x, y + 10);
    ctx.font = '12px system-ui, sans-serif';
    legend.items.forEach(([color, text], k) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y + 20 + k * 18, 14, 10);
      ctx.fillStyle = C.text;
      ctx.fillText(text, x + 20, y + 29 + k * 18);
    });
  }

  /** Barre de couleur graduée (valeurs continues) + lignes d'information. */
  drawGradientLegend(ctx, C, w, legend) {
    const { max, unit, colorOf, digits = 1 } = legend.gradient;
    const notes = legend.notes ?? [];
    const W = 230;
    const x = w - W - 4;
    const y = 12;
    const barW = 18;
    const barH = 120;
    const H = 30 + barH + notes.length * 16;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = C.bg;
    ctx.fillRect(x - 8, y - 6, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(legend.title, x, y + 8);
    const top = y + 18;
    for (let k = 0; k < barH; k++) {
      ctx.fillStyle = colorOf(1 - k / (barH - 1));
      ctx.fillRect(x, top + k, barW, 1);
    }
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, barW, barH);
    ctx.font = '11px system-ui, sans-serif';
    for (let t = 0; t <= 4; t++) {
      const v = (max * (4 - t)) / 4;
      const yy = top + (barH * t) / 4;
      ctx.fillStyle = C.text;
      ctx.fillRect(x + barW, yy, 4, 1);
      ctx.fillText(`${v.toFixed(digits)}${unit ? ` ${unit}` : ''}`, x + barW + 8, yy + 4);
    }
    ctx.fillStyle = C.text;
    notes.forEach((n, k) => ctx.fillText(n, x, top + barH + 16 + k * 16));
  }

  pick(e) {
    if (!this.screenNodes || !this.onPick) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = null;
    let bd = 12;
    for (const n of this.screenNodes) {
      if (n.kind === 'internal' && !this.scene.showAllNodes) continue;
      const d = Math.hypot(n.s[0] - x, n.s[1] - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    this.onPick(best?.label ?? null);
  }

  /**
   * Ligne de tubes à l'échelle (largeur = Dₑ), ombrée comme un cylindre éclairé
   * en haut à gauche : profil transversal doux (bord éclairé légèrement sombre,
   * reflet diffus, cœur à la teinte nominale, bord opposé dans l'ombre). Les
   * normales écran sont moyennées aux sommets : la ligne, coudes compris, est
   * continue. Chaque tronçon est prolongé à ses extrémités par la demi-ellipse
   * de sa section projetée (tronçon incliné sur l'axe de vue, cercle complet
   * pour un tronçon vu en bout). Une primitive par tronçon, pour un tri en
   * profondeur correct vis-à-vis des robinets, des supports et des autres lignes.
   */
  chainPrims(scr, segColors, od) {
    const w = Math.max(1.2, od * this.frame.s);
    const n = scr.length;
    if (n < 2) return [];
    const sc = this.frame.s;
    // direction écran et inclinaison sur l'axe de vue (|cos|) de chaque tronçon
    const dirs = [];
    const tilt = [];
    for (let k = 1; k < n; k++) {
      const dx = scr[k][0] - scr[k - 1][0];
      const dy = scr[k][1] - scr[k - 1][1];
      const dz = (scr[k][2] - scr[k - 1][2]) * sc;
      const l = Math.hypot(dx, dy);
      const l3 = Math.hypot(l, dz);
      dirs.push(l > 1e-3 ? [dx / l, dy / l] : null);
      tilt.push(l3 > 1e-9 ? Math.abs(dz) / l3 : 0);
    }
    // tronçon vu en bout : direction empruntée au voisin le plus proche
    for (let k = 0; k < dirs.length; k++) {
      if (dirs[k]) continue;
      for (let j = 1; j < dirs.length; j++) {
        const c = dirs[k - j] ?? dirs[k + j];
        if (c) {
          dirs[k] = c;
          break;
        }
      }
      dirs[k] ??= [1, 0];
    }
    // normales aux sommets : moyennes (raccord en onglet) si l'angle est modéré
    const segNormal = (d) => [-d[1], d[0]];
    const joint = scr.map((_, i) => {
      const a = dirs[Math.max(0, i - 1)];
      const b = dirs[Math.min(dirs.length - 1, i)];
      const c = a[0] * b[0] + a[1] * b[1];
      if (c < 0.3) return null; // angle vif à l'écran : chaque tronçon garde sa normale
      const tx = a[0] + b[0];
      const ty = a[1] + b[1];
      const l = Math.hypot(tx, ty);
      const miter = 1 / Math.max(0.6, Math.abs((tx / l) * b[0] + (ty / l) * b[1]));
      return [(-ty / l) * miter, (tx / l) * miter];
    });
    const K = w < 3 ? 1 : Math.max(4, Math.min(40, Math.round(w / 1.5)));
    const ys = Array.from({ length: K + 1 }, (_, j) => -w / 2 + (j * w) / K);
    const prims = [];
    for (let k = 1; k < n; k++) {
      const d = dirs[k - 1];
      const own = segNormal(d);
      const n0 = joint[k - 1] ?? own;
      const n1 = joint[k] ?? own;
      // côté éclairé : composante de la normale écran vers la lumière ; le
      // profil est mélangé avec son symétrique quand le tube est orienté vers
      // la lumière, pour une transition continue
      const lat = own[0] * LIGHT2D[0] + own[1] * LIGHT2D[1];
      const wgt = Math.min(1, Math.max(0, 0.5 + lat / 0.5));
      const base = toRGB(segColors[k - 1]);
      const fills = [];
      for (let j = 0; j < K; j++) {
        if (K === 1) {
          fills.push(segColors[k - 1]);
          break;
        }
        const sy = (ys[j] + ys[j + 1]) / w; // −1…1 le long de la normale
        const pa = tubeProfile((1 - sy) / 2);
        const pb = tubeProfile((1 + sy) / 2);
        const mul = wgt * pa[0] + (1 - wgt) * pb[0];
        const add = wgt * pa[1] + (1 - wgt) * pb[1];
        fills.push(`rgb(${Math.min(255, base[0] * mul + add) | 0},${Math.min(255, base[1] * mul + add) | 0},${Math.min(255, base[2] * mul + add) | 0})`);
      }
      // demi-ellipses d'extrémité : demi-petit axe = R·|cos| (R en pixels) ; inutiles
      // à un raccord régulier avec un tronçon voisin assez long pour les couvrir
      const capR = (w / 2) * tilt[k - 1];
      const segLen = Math.hypot(scr[k][0] - scr[k - 1][0], scr[k][1] - scr[k - 1][1]);
      const short = segLen < w;
      const capA = k === 1 || !joint[k - 1] || short ? capR : 0;
      const capB = k === n - 1 || !joint[k] || short ? capR : 0;
      const ell = (y) => Math.sqrt(Math.max(0, 1 - ((2 * y) / w) ** 2));
      // léger recouvrement longitudinal entre tronçons : pas de joint visible
      const e0 = k > 1 ? 0.6 : 0;
      const e1 = k < n - 1 ? 0.6 : 0;
      const A = scr[k - 1];
      const B = scr[k];
      prims.push({
        depth: (A[2] + B[2]) / 2,
        draw: (ctx) => {
          for (let j = 0; j < K; j++) {
            const y0 = j === 0 ? ys[j] : ys[j] - 0.5;
            const y1 = j === K - 1 ? ys[j + 1] : ys[j + 1] + 0.5;
            const yc = [y0, (y0 + y1) / 2, y1];
            ctx.fillStyle = fills[j];
            ctx.beginPath();
            // bord y0 → y1 côté A (avec la demi-ellipse), puis retour côté B
            yc.forEach((y, i) => {
              const ex = e0 + capA * ell(y);
              const x = A[0] + n0[0] * y - d[0] * ex;
              const yy = A[1] + n0[1] * y - d[1] * ex;
              if (i === 0) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
            });
            for (let i = 2; i >= 0; i--) {
              const y = yc[i];
              const ex = e1 + capB * ell(y);
              ctx.lineTo(B[0] + n1[0] * y + d[0] * ex, B[1] + n1[1] * y + d[1] * ex);
            }
            ctx.closePath();
            ctx.fill();
          }
        },
      });
    }
    return prims;
  }

  /**
   * Suites d'éléments (hors robinets) reliés deux à deux par des nœuds de degré 2
   * et de même diamètre : chaque suite est dessinée comme un seul tube continu.
   */
  tubeChains(mesh) {
    if (this._chains?.mesh === mesh) return this._chains.list;
    const elems = mesh.elements.filter((e) => e.kind !== 'valve');
    const at = new Map();
    for (const e of elems) for (const n of [e.n1, e.n2]) (at.get(n) ?? at.set(n, []).get(n)).push(e);
    // Tés : le collecteur est la paire d'éléments la plus colinéaire au nœud ; les
    // dérivations sont arrêtées à la paroi du collecteur (raccord net à l'écran).
    const branchTrim = new Map();
    const runPair = new Map(); // nœud de té → [élément, élément] du collecteur
    for (const [node, list] of at) {
      if (list.length < 3) continue;
      const pn = mesh.nodes[node];
      const dirs = list.map((e) => {
        const o = mesh.nodes[e.n1 === node ? e.n2 : e.n1];
        return vec.unit([o.x - pn.x, o.y - pn.y, o.z - pn.z]);
      });
      let best = [0, 1];
      let bd = Infinity;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (vec.dot(dirs[i], dirs[j]) < bd) (bd = vec.dot(dirs[i], dirs[j])), (best = [i, j]);
      const runR = Math.max(list[best[0]].sec.od, list[best[1]].sec.od) / 2;
      runPair.set(node, [list[best[0]], list[best[1]]]);
      list.forEach((e, k) => !best.includes(k) && branchTrim.set(`${e.index}:${node}`, 0.97 * runR));
    }
    const used = new Set();
    const list = [];
    const walk = (e, node) => {
      const out = [];
      let cur = e;
      for (;;) {
        const nb = at.get(node) ?? [];
        let next;
        if (nb.length === 2) next = nb[0] === cur ? nb[1] : nb[0];
        else if (runPair.get(node)?.includes(cur)) {
          // le collecteur traverse le té d'un seul tenant
          const pair = runPair.get(node);
          next = pair[0] === cur ? pair[1] : pair[0];
        } else break;
        if (used.has(next) || Math.abs(next.sec.od - cur.sec.od) > 1e-6) break;
        used.add(next);
        const rev = next.n2 === node;
        out.push({ e: next, rev });
        node = rev ? next.n1 : next.n2;
        cur = next;
      }
      return out;
    };
    for (const e of elems) {
      if (used.has(e)) continue;
      used.add(e);
      const fwd = walk(e, e.n2);
      const back = walk(e, e.n1).map(({ e: x, rev }) => ({ e: x, rev: !rev })).reverse();
      const chain = [...back, { e, rev: false }, ...fwd];
      const first = chain[0];
      const last = chain[chain.length - 1];
      const startNode = first.rev ? first.e.n2 : first.e.n1;
      const endNode = last.rev ? last.e.n1 : last.e.n2;
      chain.trim = [branchTrim.get(`${first.e.index}:${startNode}`) ?? 0, branchTrim.get(`${last.e.index}:${endNode}`) ?? 0];
      list.push(chain);
    }
    this._chains = { mesh, list };
    return list;
  }

  /** Arcs réels des éléments de coude (centre, rayon) pour un tracé lisse. */
  bendArcs(mesh) {
    if (this._arcs?.mesh === mesh) return this._arcs.map;
    const map = new Map();
    for (const e of mesh.elements) {
      if (e.kind !== 'bend' || !e.bend) continue;
      const c = mesh.corners.get(e.bend.node);
      if (!c) continue;
      const d1 = vec.unit(vec.sub(c.point, c.start));
      const d2 = vec.unit(vec.sub(c.end, c.point));
      const nrm = vec.unit(vec.sub(d2, vec.scale(d1, vec.dot(d2, d1))));
      const center = vec.add(c.start, vec.scale(nrm, c.radius));
      const n1 = mesh.nodes[e.n1];
      const n2 = mesh.nodes[e.n2];
      const v1 = vec.sub([n1.x, n1.y, n1.z], center);
      const v2 = vec.sub([n2.x, n2.y, n2.z], center);
      const phi = Math.acos(Math.max(-1, Math.min(1, vec.dot(v1, v2) / (vec.norm(v1) * vec.norm(v2)))));
      const sphi = Math.sin(phi);
      map.set(e.index, {
        phi,
        at: (t) => (sphi < 1e-9 ? vec.add(center, v1) : vec.add(center, vec.add(vec.scale(v1, Math.sin((1 - t) * phi) / sphi), vec.scale(v2, Math.sin(t * phi) / sphi)))),
      });
    }
    this._arcs = { mesh, map };
    return map;
  }

  /**
   * Robinet : deux cônes opposés par la pointe (bases aux brides, pointes au
   * milieu), brides aux extrémités, tige et volant de manœuvre. Le corps est un
   * solide de révolution facetté, chaque facette étant ombrée d'après sa
   * normale (même éclairage que les tubes) et triée en profondeur avec eux.
   */
  valvePrims(pa, pb, od, color, up) {
    const axis = vec.sub(pb, pa);
    const L = vec.norm(axis);
    const u = L > 0 ? vec.scale(axis, 1 / L) : [1, 0, 0];
    // repère du plan de section ; e1 = direction de la tige (au plus près de la verticale)
    let e1 = vec.sub(up, vec.scale(u, vec.dot(up, u)));
    if (vec.norm(e1) < 1e-6) e1 = Math.abs(u[0]) < 0.9 ? vec.cross(u, [1, 0, 0]) : vec.cross(u, [0, 1, 0]);
    e1 = vec.unit(e1);
    const e2 = vec.cross(u, e1);
    const Rf = 0.8 * od; // bride
    const Rc = 0.7 * od; // base des cônes
    const tf = Math.min(0.12 * od, 0.12 * L);
    // profil (abscisse, rayon) de pa à pb ; les faces des brides sont des
    // couronnes autour du tube qui y entre
    const ri = 0.49 * od;
    const prof = [[0, ri], [0, Rf], [tf, Rf], [tf, Rc], [L / 2, 0], [L - tf, Rc], [L - tf, Rf], [L, Rf], [L, ri]];
    const N = 48;
    const ang = Array.from({ length: N + 1 }, (_, k) => (2 * Math.PI * k) / N);
    const pt = (x, r, t) => vec.add(pa, vec.add(vec.scale(u, x), vec.add(vec.scale(e1, r * Math.cos(t)), vec.scale(e2, r * Math.sin(t)))));
    const base = toRGB(color);
    // facettes visibles d'un tronçon de profil (surface de révolution)
    const band = (i) => {
      const [x0, r0] = prof[i - 1];
      const [x1, r1] = prof[i];
      const dx = x1 - x0;
      const dr = r1 - r0;
      const ln = Math.hypot(dx, dr);
      const out = [];
      if (ln < 1e-9) return out;
      for (let k = 0; k < N; k++) {
        const tm = (ang[k] + ang[k + 1]) / 2;
        const radial = vec.add(vec.scale(e1, Math.cos(tm)), vec.scale(e2, Math.sin(tm)));
        const nrm = vec.add(vec.scale(u, -dr / ln), vec.scale(radial, dx / ln)); // normale sortante
        const vn = this.viewDir(nrm);
        if (vn[2] <= 0) continue; // facette cachée
        const quad = grow([pt(x0, r0, ang[k]), pt(x1, r1, ang[k]), pt(x1, r1, ang[k + 1]), pt(x0, r0, ang[k + 1])].map((q) => this.toScreen(q)), 0.5);
        const f = 0.55 + 0.5 * Math.max(0, vn[0] * LIGHT3D[0] + vn[1] * LIGHT3D[1] + vn[2] * LIGHT3D[2]);
        out.push({ quad, fill: `rgb(${Math.min(255, base[0] * f) | 0},${Math.min(255, base[1] * f) | 0},${Math.min(255, base[2] * f) | 0})` });
      }
      return out;
    };
    // Chaque demi-corps (bride + cône) est dessiné d'un bloc, dans un ordre
    // fixé par le côté d'où il est vu : le corps n'est pas convexe (gorge au
    // milieu, épaulement de bride), un tri facette par facette serait faux.
    // Tronçons : 1 face, 2 pourtour de bride, 3 épaulement, 4 cône (demi-corps
    // côté pa) ; 8 face, 7 pourtour, 6 épaulement, 5 cône (côté pb).
    const prims = [];
    const halves = [
      { segs: [1, 2, 3, 4], outward: vec.scale(u, -1), at: L / 4, sil: prof.slice(0, 5) },
      { segs: [8, 7, 6, 5], outward: u, at: (3 * L) / 4, sil: prof.slice(4) },
    ];
    const under = shade(color, 0.8);
    for (const hf of halves) {
      const faceSeen = this.viewDir(hf.outward)[2] > 0;
      const order = faceSeen ? [...hf.segs].reverse() : hf.segs;
      const facets = order.flatMap((i) => band(i));
      const sil = [];
      for (const [x, r] of hf.sil) for (let k = 0; k < N; k += 2) sil.push(this.toScreen(pt(x, Math.max(r, 0), ang[k])));
      const hull = convexHull(sil);
      prims.push({
        depth: this.toScreen(vec.add(pa, vec.scale(u, hf.at)))[2],
        draw: (ctx) => {
          // silhouette en teinte moyenne sous les facettes : masque les joints d'anticrénelage
          ctx.fillStyle = under;
          polygon(ctx, hull);
          ctx.fill();
          for (const ft of facets) {
            ctx.fillStyle = ft.fill;
            polygon(ctx, ft.quad);
            ctx.fill();
          }
        },
      });
    }
    // tige et volant
    const mid = vec.add(pa, vec.scale(axis, 0.5));
    const stemTop = vec.add(mid, vec.scale(e1, 1.5 * od));
    const wheel = Array.from({ length: 28 }, (_, k) => {
      const t = (2 * Math.PI * k) / 28;
      return this.toScreen(vec.add(stemTop, vec.add(vec.scale(u, 0.55 * od * Math.cos(t)), vec.scale(e2, 0.55 * od * Math.sin(t)))));
    });
    const ms = this.toScreen(vec.add(mid, vec.scale(e1, 0.15 * od)));
    const st = this.toScreen(stemTop);
    const s = this.frame.s;
    prims.push({
      depth: st[2],
      draw: (ctx) => {
        ctx.strokeStyle = shade(color, 0.8);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, 0.12 * od * s);
        ctx.beginPath();
        ctx.moveTo(ms[0], ms[1]);
        ctx.lineTo(st[0], st[1]);
        ctx.stroke();
        polygon(ctx, wheel);
        ctx.stroke();
      },
    });
    return prims;
  }

  /** Direction 3D dans le repère écran : x à droite, y vers le bas, z vers l'observateur. */
  viewDir(d) {
    const a = this.project([0, 0, 0]);
    const b = this.project(d);
    return [b[0] - a[0], -(b[1] - a[1]), -(b[2] - a[2])];
  }

  /** Axe du tube au nœud (moyenne des éléments qui y aboutissent). */
  nodeAxis(mesh, i) {
    let a = [0, 0, 0];
    for (const e of mesh.nodeElems?.[i] ?? []) {
      let x = e.R.slice(0, 3);
      if (vec.dot(x, a) < 0) x = vec.scale(x, -1);
      a = vec.add(a, x);
    }
    return vec.norm(a) > 0 ? vec.unit(a) : [1, 0, 0];
  }

  /** Flèche 3D projetée (tige + pointe), pointe en `tip`. */
  drawArrow(ctx, tail3, tip3, color, od) {
    const a = this.toScreen(tail3);
    const b = this.toScreen(tip3);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    const s = this.frame.s;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (l < 3) {
      // flèche vue de bout : pastille
      ctx.beginPath();
      ctx.arc(b[0], b[1], Math.max(3, 0.15 * od * s), 0, 2 * Math.PI);
      ctx.fill();
      return;
    }
    const ux = dx / l;
    const uy = dy / l;
    const head = Math.min(l * 0.45, Math.max(7, 0.45 * od * s));
    const half = head * 0.45;
    const bx = b[0] - ux * head;
    const by = b[1] - uy * head;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.8, 0.09 * od * s);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(bx - uy * half, by + ux * half);
    ctx.lineTo(bx + uy * half, by - ux * half);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Support variable (ressort) ou constant : ressort hélicoïdal sous le tube, dans
   * l'axe vertical, terminé par une flèche contre la paroi ; boîtier pour le constant.
   */
  drawHanger(ctx, p, up, R, L, color, od, constant) {
    const tip = vec.add(p, vec.scale(up, -R));
    const tail = vec.add(tip, vec.scale(up, -L));
    const a = this.toScreen(tail);
    const b = this.toScreen(tip);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 6) return this.drawArrow(ctx, tail, tip, color, od);
    const ux = dx / l;
    const uy = dy / l;
    const w = Math.max(4, Math.min(0.35 * od * this.frame.s, l * 0.18));
    const s0 = 0.18 * l; // départ du ressort
    const s1 = 0.62 * l; // fin du ressort
    const turns = 5;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.6, 0.06 * od * this.frame.s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const at = (t, off = 0) => [a[0] + ux * t - uy * off, a[1] + uy * t + ux * off];
    if (constant) {
      // boîtier du support constant
      const c0 = at(0, -w * 1.3);
      const c1 = at(0, w * 1.3);
      const c2 = at(s0 * 0.9, w * 1.3);
      const c3 = at(s0 * 0.9, -w * 1.3);
      ctx.beginPath();
      ctx.moveTo(...c0);
      ctx.lineTo(...c1);
      ctx.lineTo(...c2);
      ctx.lineTo(...c3);
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(...at(0));
    ctx.lineTo(...at(s0));
    const n = turns * 2;
    for (let k = 1; k <= n; k++) ctx.lineTo(...at(s0 + ((s1 - s0) * (k - 0.5)) / n, k % 2 ? w : -w));
    ctx.lineTo(...at(s1));
    ctx.stroke();
    this.drawArrow(ctx, vec.add(tail, vec.scale(up, (L * s1) / l)), tip, color, od); // flèche depuis le haut du ressort
  }

  /**
   * Support variable ou constant en 3D : ressort hélicoïdal ombré (spires arrière
   * plus sombres, puis spires avant), plateaux et tige jusqu'à la paroi du tube ;
   * boîtier cylindrique pour le support constant.
   */
  drawHanger3D(ctx, p, up, R, L, color, od, constant) {
    let e1 = vec.cross(up, Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    e1 = vec.unit(e1);
    const e2 = vec.cross(up, e1);
    const s = this.frame.s;
    const base = vec.add(p, vec.scale(up, -(R + L)));
    const at = (h, r = 0, t = 0) => vec.add(base, vec.add(vec.scale(up, h), vec.add(vec.scale(e1, r * Math.cos(t)), vec.scale(e2, r * Math.sin(t)))));
    const rgb = toRGB(color);
    const tint = (f) => `rgb(${Math.min(255, rgb[0] * f) | 0},${Math.min(255, rgb[1] * f) | 0},${Math.min(255, rgb[2] * f) | 0})`;
    const lit = (n) => {
      const v = this.viewDir(n);
      return 0.55 + 0.55 * Math.max(0, v[0] * LIGHT3D[0] + v[1] * LIGHT3D[1] + v[2] * LIGHT3D[2]);
    };
    // cylindre (boîtier, plateaux) : enveloppe des deux cercles, face supérieure éclairée
    const cylinder = (h0, h1, r, f = 1) => {
      const N = 32;
      const ring = (h) => Array.from({ length: N }, (_, k) => this.toScreen(at(h, r, (2 * Math.PI * k) / N)));
      const bottom = ring(h0);
      const top = ring(h1);
      ctx.fillStyle = tint(0.8 * f);
      polygon(ctx, convexHull([...bottom, ...top]));
      ctx.fill();
      const upSeen = this.viewDir(up)[2] > 0;
      ctx.fillStyle = tint((upSeen ? 1.05 : 0.65) * f);
      polygon(ctx, upSeen ? top : bottom);
      ctx.fill();
      ctx.strokeStyle = tint(0.55);
      ctx.lineWidth = 1;
      polygon(ctx, convexHull([...bottom, ...top]));
      ctx.stroke();
    };
    const hBox = constant ? 0.3 * L : 0;
    const plate = 0.05 * L;
    if (constant) cylinder(0, hBox, 0.62 * od);
    else cylinder(0, plate, 0.5 * od);
    // ressort hélicoïdal
    const h0 = (constant ? hBox : plate) + 0.02 * L;
    const h1 = 0.8 * L;
    const rh = 0.33 * od;
    const turns = 5;
    const M = turns * 24;
    const seg = [];
    for (let k = 0; k < M; k++) {
      const t0 = (2 * Math.PI * turns * k) / M;
      const t1 = (2 * Math.PI * turns * (k + 1)) / M;
      const hA = h0 + ((h1 - h0) * k) / M;
      const hB = h0 + ((h1 - h0) * (k + 1)) / M;
      const tm = (t0 + t1) / 2;
      const radial = vec.add(vec.scale(e1, Math.cos(tm)), vec.scale(e2, Math.sin(tm)));
      seg.push({ a: this.toScreen(at(hA, rh, t0)), b: this.toScreen(at(hB, rh, t1)), front: this.viewDir(radial)[2] >= 0, f: lit(radial) });
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.6, 0.085 * od * s);
    for (const pass of [false, true]) {
      for (const g of seg) {
        if (g.front !== pass) continue;
        ctx.strokeStyle = tint(pass ? g.f : 0.5);
        ctx.beginPath();
        ctx.moveTo(g.a[0], g.a[1]);
        ctx.lineTo(g.b[0], g.b[1]);
        ctx.stroke();
      }
    }
    // plateau supérieur, tige et flèche contre la paroi
    cylinder(h1, h1 + plate, 0.42 * od);
    this.drawArrow(ctx, at(h1 + plate), vec.add(p, vec.scale(up, -R)), tint(0.9), od);
  }

  /** Disque dans le plan de section du tube (normal à l'axe), rayon r. */
  drawDisc(ctx, c, axis, r, fill, stroke) {
    let e1 = Math.abs(axis[0]) < 0.9 ? vec.cross(axis, [1, 0, 0]) : vec.cross(axis, [0, 1, 0]);
    e1 = vec.unit(e1);
    const e2 = vec.cross(axis, e1);
    const rr = Math.max(r, 6 / this.frame.s);
    const pts = Array.from({ length: 36 }, (_, k) => {
      const t = (2 * Math.PI * k) / 36;
      return this.toScreen(vec.add(c, vec.add(vec.scale(e1, rr * Math.cos(t)), vec.scale(e2, rr * Math.sin(t)))));
    });
    polygon(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  snapshot() {
    return this.canvas.toDataURL('image/png');
  }
}

// Lumière (haut gauche, vers l'observateur) commune aux tubes et aux robinets
const LIGHT2D = [-0.586, -0.81];
const LIGHT3D = [-0.42, -0.58, 0.7];

/**
 * Profil d'ombrage transversal d'un tube, t = 0 au bord éclairé, 1 au bord à
 * l'ombre : [facteur sur la teinte, ajout de blanc]. Voile sombre au bord
 * éclairé, reflet blanc diffus vers le premier quart, teinte nominale au
 * milieu, assombrissement progressif jusqu'au bord opposé.
 */
function tubeProfile(t) {
  let ab = 0;
  let aw = 0;
  if (t < 0.28) {
    const x = t / 0.28;
    ab = 0.25 * (1 - x);
    aw = 0.35 * x;
  } else if (t < 0.5) aw = 0.35 * (1 - (t - 0.28) / 0.22);
  else ab = 0.4 * ((t - 0.5) / 0.5);
  return [1 - ab - aw, 255 * aw];
}

/** Couleur CSS → [r, g, b] (via le moteur du navigateur, mis en cache). */
const rgbCache = new Map();
let colorCtx = null;
function toRGB(color) {
  if (rgbCache.has(color)) return rgbCache.get(color);
  colorCtx ??= document.createElement('canvas').getContext('2d');
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = color;
  const v = colorCtx.fillStyle;
  let rgb;
  if (v.startsWith('#')) rgb = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  else rgb = (v.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  rgbCache.set(color, rgb);
  return rgb;
}
const shade = (color, f) => {
  const [r, g, b] = toRGB(color);
  return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`;
};

/** Raccourcit une polyligne 3D de d0 au début et d1 à la fin (couleurs par tronçon). */
function trimPolyline(pts, colors, d0, d1) {
  const cut = (fromStart, d) => {
    while (d > 1e-9 && pts.length > 2) {
      const [a, b] = fromStart ? [pts[0], pts[1]] : [pts[pts.length - 1], pts[pts.length - 2]];
      const l = vec.norm(vec.sub(b, a));
      if (l <= d) {
        d -= l;
        if (fromStart) {
          pts.shift();
          colors.shift();
        } else {
          pts.pop();
          colors.pop();
        }
        continue;
      }
      const q = vec.add(a, vec.scale(vec.sub(b, a), d / l));
      if (fromStart) pts[0] = q;
      else pts[pts.length - 1] = q;
      return;
    }
    if (d > 1e-9 && pts.length === 2) {
      const [a, b] = fromStart ? [pts[0], pts[1]] : [pts[1], pts[0]];
      const l = vec.norm(vec.sub(b, a));
      const q = vec.add(a, vec.scale(vec.sub(b, a), Math.min(d, 0.9 * l) / l));
      if (fromStart) pts[0] = q;
      else pts[1] = q;
    }
  };
  cut(true, d0);
  cut(false, d1);
}

/** Polygone écran dilaté de `d` px depuis son centre (recouvrement entre facettes). */
function grow(pts, d) {
  const cx = pts.reduce((x, p) => x + p[0], 0) / pts.length;
  const cy = pts.reduce((y, p) => y + p[1], 0) / pts.length;
  return pts.map((p) => {
    const l = Math.hypot(p[0] - cx, p[1] - cy) || 1;
    return [p[0] + ((p[0] - cx) / l) * d, p[1] + ((p[1] - cy) / l) * d, p[2]];
  });
}

function polygon(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

/** Enveloppe convexe (chaîne monotone d'Andrew) de points écran. */
function convexHull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Symbole de robinet : deux triangles opposés par la pointe, au milieu de l'élément. */
function drawValve(ctx, a, b, color, w) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = l > 1e-6 ? [-dy / l, dx / l] : [0, 1];
  // si l'élément est vu de bout, un simple cercle
  if (l < 4) {
    ctx.beginPath();
    ctx.arc(m[0], m[1], w / 2, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(p[0] + n[0] * w, p[1] + n[1] * w);
    ctx.lineTo(p[0] - n[0] * w, p[1] - n[1] * w);
    ctx.lineTo(m[0], m[1]);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // tige de manœuvre
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(m[0], m[1]);
  ctx.lineTo(m[0] + n[0] * w * 1.4, m[1] + n[1] * w * 1.4);
  ctx.moveTo(m[0] + n[0] * w * 1.4 - (dx / l) * w * 0.6, m[1] + n[1] * w * 1.4 - (dy / l) * w * 0.6);
  ctx.lineTo(m[0] + n[0] * w * 1.4 + (dx / l) * w * 0.6, m[1] + n[1] * w * 1.4 + (dy / l) * w * 0.6);
  ctx.stroke();
}

/** Points de la déformée d'un élément (interpolation cubique d'Hermite). */
export function deformedPoints(e, P, u, amp, nseg) {
  const ug = new Float64Array(12);
  for (let a = 0; a < 6; a++) {
    ug[a] = u[e.n1 * 6 + a];
    ug[6 + a] = u[e.n2 * 6 + a];
  }
  const ul = toLocalVector(ug, e.R);
  const L = e.L;
  const R = e.R;
  const p1 = P[e.n1];
  const p2 = P[e.n2];
  const out = [];
  out.mags = [];
  for (let k = 0; k <= nseg; k++) {
    const x = k / nseg;
    const N1 = 1 - 3 * x * x + 2 * x ** 3;
    const N2 = L * (x - 2 * x * x + x ** 3);
    const N3 = 3 * x * x - 2 * x ** 3;
    const N4 = L * (-x * x + x ** 3);
    const du = (1 - x) * ul[0] + x * ul[6];
    const dv = N1 * ul[1] + N2 * ul[5] + N3 * ul[7] + N4 * ul[11];
    const dw = N1 * ul[2] - N2 * ul[4] + N3 * ul[8] - N4 * ul[10];
    const g = [R[0] * du + R[3] * dv + R[6] * dw, R[1] * du + R[4] * dv + R[7] * dw, R[2] * du + R[5] * dv + R[8] * dw];
    out.mags.push(Math.hypot(g[0], g[1], g[2]));
    out.push([p1[0] + x * (p2[0] - p1[0]) + amp * g[0], p1[1] + x * (p2[1] - p1[1]) + amp * g[1], p1[2] + x * (p2[2] - p1[2]) + amp * g[2]]);
  }
  return out;
}

export { SUPPORT_KINDS, SUPPORT_COLORS };
