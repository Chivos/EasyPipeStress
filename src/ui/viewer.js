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
    const C = { bg: col('--view-bg', '#fff'), pipe: col('--view-pipe', '#4a5568'), text: col('--view-text', '#1a202c'), muted: col('--view-muted', '#8a94a6'), deformed: col('--view-deformed', '#d35400'), valve: col('--view-valve', '#6a4c93'), sel: col('--accent', '#0b7285') };
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

    // Tangentes fantômes des coudes
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

    // Tuyauterie (non déformée)
    const pxPerMm = this.frame.s;
    ctx.lineCap = 'round';
    mesh.elements.forEach((e, ie) => {
      const a = S[e.n1];
      const b = S[e.n2];
      ctx.strokeStyle = ghost ? C.muted : colors?.[ie] ?? C.pipe;
      ctx.globalAlpha = ghost ? 0.45 : 1;
      ctx.lineWidth = Math.max(2.5, Math.min(14, e.sec.od * pxPerMm));
      if (e.kind === 'valve') {
        drawValve(ctx, a, b, ghost ? C.muted : colors?.[ie] ?? C.valve, Math.max(6, Math.min(18, 1.6 * e.sec.od * pxPerMm)));
        return;
      }
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Déformée (interpolation d'Hermite des déplacements nodaux)
    if (ghost) {
      const amp = disp.scale * (sc.animate ? Math.sin(performance.now() / 300) : 1);
      mesh.elements.forEach((e, ie) => {
        ctx.lineWidth = Math.max(2, Math.min(10, e.sec.od * pxPerMm * 0.8));
        const pts = deformedPoints(e, P, disp.u, amp, e.kind === 'bend' ? 2 : 8);
        const scr = pts.map((p) => this.toScreen(p));
        if (disp.colorOf && disp.colorMax > 0) {
          // couleur continue selon le déplacement total interpolé le long de l'élément
          for (let k = 1; k < scr.length; k++) {
            ctx.strokeStyle = disp.colorOf((pts.mags[k - 1] + pts.mags[k]) / 2 / disp.colorMax);
            ctx.beginPath();
            ctx.moveTo(scr[k - 1][0], scr[k - 1][1]);
            ctx.lineTo(scr[k][0], scr[k][1]);
            ctx.stroke();
          }
          return;
        }
        ctx.strokeStyle = colors?.[ie] ?? C.deformed;
        ctx.beginPath();
        scr.forEach((s, k) => (k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])));
        ctx.stroke();
      });
    }

    // Supports
    const springsByNode = new Map();
    for (const s of mesh.springs) {
      if (!springsByNode.has(s.node)) springsByNode.set(s.node, []);
      springsByNode.get(s.node).push(s);
    }
    mesh.supports.forEach((sup) => {
      const p = P[sup.node];
      const s0 = S[sup.node];
      const color = SUPPORT_COLORS[sup.kind] ?? '#555';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      const springs = (springsByNode.get(sup.node) ?? []).filter((s) => mesh.supports[s.support] === sup);
      if (sup.kind === 'anchor' || springs.some((s) => s.rot)) {
        ctx.fillRect(s0[0] - 7, s0[1] - 7, 14, 14);
        return;
      }
      for (const sp of springs) {
        const q = this.toScreen(vec.add(p, sp.dir));
        let d = [q[0] - s0[0], q[1] - s0[1]];
        const l = Math.hypot(d[0], d[1]);
        if (l < 1e-9) {
          ctx.beginPath();
          ctx.arc(s0[0], s0[1], 6, 0, 2 * Math.PI);
          ctx.stroke();
          continue;
        }
        d = [d[0] / l, d[1] / l];
        const L = 16;
        ctx.beginPath();
        ctx.moveTo(s0[0] - d[0] * L, s0[1] - d[1] * L);
        ctx.lineTo(s0[0] + d[0] * L, s0[1] + d[1] * L);
        ctx.stroke();
        for (const sg of [-1, 1]) {
          const ex = s0[0] + sg * d[0] * L;
          const ey = s0[1] + sg * d[1] * L;
          ctx.beginPath();
          ctx.moveTo(ex - d[1] * 5, ey + d[0] * 5);
          ctx.lineTo(ex + d[1] * 5, ey - d[0] * 5);
          ctx.stroke();
        }
      }
    });

    // Tés : losange autour du nœud de jonction
    ctx.strokeStyle = C.sel;
    ctx.lineWidth = 2;
    for (const t of mesh.tees ?? []) {
      const s = S[t.node];
      ctx.beginPath();
      ctx.moveTo(s[0], s[1] - 9);
      ctx.lineTo(s[0] + 9, s[1]);
      ctx.lineTo(s[0], s[1] + 9);
      ctx.lineTo(s[0] - 9, s[1]);
      ctx.closePath();
      ctx.stroke();
    }

    // Masses ponctuelles
    for (const pm of mesh.pointMasses) {
      const s = S[pm.node];
      const r = Math.max(4, Math.min(11, 3 + 2 * Math.log10(pm.m * 1000 + 1)));
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

  snapshot() {
    return this.canvas.toDataURL('image/png');
  }
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
