// Vue 3D filaire en projection orthographique sur <canvas> 2D (aucune
// dépendance). Rotation : glisser ; translation : Maj + glisser ou clic droit ;
// zoom : molette ; clic : sélection d'un nœud.

import { vec } from '../core/linalg.js';
import { toLocalVector } from '../fem/beam3d.js';
import { SUPPORT_KINDS } from '../components/support.js';

const SUPPORT_COLORS = { anchor: '#c0392b', rest: '#2471a3', guide: '#7d3c98', restguide: '#1f618d', axial: '#b9770e', spring: '#148f77', custom: '#566573' };

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
      if (solid) prims.push(this.valvePrim(pa, pb, od, color, mesh.up));
      else drawValve(ctx, this.toScreen(pa), this.toScreen(pb), color, 9);
    };
    const arcs = this.bendArcs(mesh);
    const hlSpec = sc.highlight;
    const isHl = (e) => hlSpec?.comp != null && e.comp === hlSpec.comp;
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
      } else {
        pts = Array.from({ length: nseg + 1 }, (_, k) => (arc ? arc.at(k / nseg) : vec.add(P[e.n1], vec.scale(vec.sub(P[e.n2], P[e.n1]), k / nseg))));
      }
      const hl = isHl(e);
      const segColors = Array.from({ length: nseg }, (_, k) =>
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
    if (hlSpec?.comp) {
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
      if (solid) prims.push(this.chainPrim(scr, segColors, od));
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
        valveShape(P[e.n1], P[e.n2], e.sec.od, isHl(e) ? C.sel : colors?.[ie] ?? C.valve);
        return;
      }
      const pts = deformedPoints(e, P, disp.u, amp, 1);
      valveShape(pts[0], pts[1], e.sec.od, useDisp ? disp.colorOf((pts.mags[0] + pts.mags[1]) / 2 / disp.colorMax) : C.valve);
    });
    prims.sort((a, b) => b.depth - a.depth);
    for (const pr of prims) pr.draw(ctx);

    // Supports : flèches dont la pointe touche la paroi du tube, une par sens
    // bloqué (blocage bilatéral = deux flèches opposées) ; blocage axial =
    // flèches parallèles au tube ; point fixe = disque rouge dans le plan de
    // section ; blocage partiel en rotation = disque jaune.
    const springsByNode = new Map();
    for (const s of mesh.springs) {
      if (!springsByNode.has(s.node)) springsByNode.set(s.node, []);
      springsByNode.get(s.node).push(s);
    }
    const minPx = 14; // longueur minimale lisible d'une flèche (px)
    mesh.supports.forEach((sup) => {
      const p = P[sup.node];
      const od = odAtNode(sup.node) || 100;
      const R = od / 2;
      const axis = this.nodeAxis(mesh, sup.node);
      const springs = (springsByNode.get(sup.node) ?? []).filter((s) => mesh.supports[s.support] === sup);
      const color = SUPPORT_COLORS[sup.kind] ?? '#555';
      const fullAnchor = sup.kind === 'anchor' || springs.filter((s) => s.rot).length >= 3;
      if (fullAnchor) {
        this.drawDisc(ctx, p, axis, 1.0 * od, '#d62828', '#7a1010');
        return;
      }
      if (springs.some((s) => s.rot)) this.drawDisc(ctx, p, axis, 0.85 * od, '#f2c200', '#8a6d00');
      // longueur de flèche : 1,5 De à l'échelle, avec un minimum en pixels
      const L = Math.max(1.5 * od, minPx / pxPerMm);
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
    if (hlSpec?.node != null) {
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
   * Ligne de tubes à l'échelle (largeur = Dₑ) : couleurs par tronçon, puis
   * ombrage cylindrique par passes concentriques tracées chacune d'un seul
   * chemin (aucune surépaisseur aux raccords, coudes lisses).
   */
  chainPrim(scr, segColors, od) {
    const w = Math.max(1.2, od * this.frame.s);
    const depth = scr.reduce((d, p) => d + p[2], 0) / scr.length;
    return {
      depth,
      draw: (ctx) => {
        ctx.lineCap = 'butt'; // extrémités franches (coupe du tube) ; raccords internes continus
        ctx.lineJoin = 'round';
        // couleur de base (opaque) : tronçons de même couleur regroupés
        const base = (width) => {
          ctx.lineWidth = width;
          let k = 1;
          while (k < scr.length) {
            const color = segColors[k - 1];
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(scr[k - 1][0], scr[k - 1][1]);
            while (k < scr.length && segColors[k - 1] === color) {
              ctx.lineTo(scr[k][0], scr[k][1]);
              k++;
            }
            ctx.stroke();
          }
        };
        base(w);
        if (w < 4) return;
        const path = () => {
          ctx.beginPath();
          scr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        };
        // bord assombri, puis couleur restaurée à l'intérieur
        ctx.lineWidth = w;
        ctx.strokeStyle = 'rgba(0,0,0,0.38)';
        path();
        ctx.stroke();
        ctx.lineWidth = w * 0.9;
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        path();
        ctx.stroke();
        base(w * 0.8);
        // reflet progressif (passes fines et peu opaques : dégradé quasi continu)
        const N = Math.min(14, Math.max(4, Math.round(w / 3)));
        for (let i = 1; i <= N; i++) {
          ctx.lineWidth = w * 0.8 * (1 - i / (N + 1));
          ctx.strokeStyle = `rgba(255,255,255,${(0.32 / N).toFixed(3)})`;
          path();
          ctx.stroke();
        }
      },
    };
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
   * milieu), tige et volant de manœuvre, projetés en vraie grandeur.
   */
  valvePrim(pa, pb, od, color, up) {
    const axis = vec.sub(pb, pa);
    const L = vec.norm(axis);
    const u = L > 0 ? vec.scale(axis, 1 / L) : [1, 0, 0];
    // repère du plan de section ; e1 = direction de la tige (au plus près de la verticale)
    let e1 = vec.sub(up, vec.scale(u, vec.dot(up, u)));
    if (vec.norm(e1) < 1e-6) e1 = Math.abs(u[0]) < 0.9 ? vec.cross(u, [1, 0, 0]) : vec.cross(u, [0, 1, 0]);
    e1 = vec.unit(e1);
    const e2 = vec.cross(u, e1);
    const R = 0.8 * od;
    const mid = vec.add(pa, vec.scale(axis, 0.5));
    const circle = (c, r, a, b) => Array.from({ length: 28 }, (_, k) => {
      const t = (2 * Math.PI * k) / 28;
      return this.toScreen(vec.add(c, vec.add(vec.scale(a, r * Math.cos(t)), vec.scale(b, r * Math.sin(t)))));
    });
    const apex = this.toScreen(mid);
    const cones = [pa, pb].map((base) => ({ base: circle(base, R, e1, e2), hull: convexHull([...circle(base, R, e1, e2), apex]) }));
    const stemTop = vec.add(mid, vec.scale(e1, 1.5 * od));
    const wheel = circle(stemTop, 0.55 * od, u, e2);
    const ms = this.toScreen(mid);
    const st = this.toScreen(stemTop);
    const s = this.frame.s;
    return {
      depth: ms[2],
      draw: (ctx) => {
        // cônes, le plus éloigné d'abord
        const order = cones.map((c) => ({ c, d: c.base.reduce((x, p) => x + p[2], 0) / c.base.length })).sort((x, y) => y.d - x.d);
        for (const { c } of order) {
          ctx.fillStyle = color;
          polygon(ctx, c.hull);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          polygon(ctx, c.base);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // tige et volant
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, 0.12 * od * s);
        ctx.beginPath();
        ctx.moveTo(ms[0], ms[1]);
        ctx.lineTo(st[0], st[1]);
        ctx.stroke();
        polygon(ctx, wheel);
        ctx.stroke();
      },
    };
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
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  snapshot() {
    return this.canvas.toDataURL('image/png');
  }
}

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
