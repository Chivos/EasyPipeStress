// Note de calcul imprimable (HTML autonome ouvert dans un nouvel onglet).

import { fmt } from '../core/units.js';
import { components } from '../components/index.js';
import { SUPPORT_KINDS } from '../components/support.js';
import { displayCases, modalSums } from './results.js';
import { spectrumFor, seismicLevels } from '../loads/seismic.js';
import { codes } from '../codes/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const table = (headers, rows) => `<table><thead><tr>${headers.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export function buildReport(state, snapshot) {
  const m = state.model;
  const r = state.result;
  const date = new Date().toLocaleString('fr-FR');
  const parts = [];
  parts.push(`<h1>${esc(m.meta.title)}</h1><p class="meta">Note de calcul de flexibilité — EasyPipeStress — ${esc(date)}${m.meta.author ? ` — ${esc(m.meta.author)}` : ''}</p>`);
  if (m.meta.notes) parts.push(`<p>${esc(m.meta.notes)}</p>`);
  if (r?.check) {
    const s = r.check.summary;
    parts.push(`<div class="verdict ${s.ok ? 'ok' : 'ko'}">${s.ok ? 'Critères satisfaits' : 'Critère(s) non satisfait(s)'} — taux maximal ${fmt(s.maxRatio, 2)} — ${esc(r.code.label)}</div>`);
  } else {
    parts.push('<div class="verdict ko">Résultats non disponibles : lancer le calcul avant d’éditer la note.</div>');
  }
  if (snapshot) parts.push(`<figure><img src="${snapshot}" alt="Vue du modèle"><figcaption>Vue du modèle</figcaption></figure>`);

  parts.push('<h2>1. Hypothèses</h2>');
  parts.push(
    table(
      ['Paramètre', 'Valeur'],
      [
        ['Axe vertical', m.settings.vertical],
        ['Température de référence', `${m.settings.tRef} °C`],
        ['Modélisation', `Poutres 3D ${m.settings.shear !== false ? 'Timoshenko' : 'Euler-Bernoulli'}, longueur max. ${m.settings.meshMaxLength} mm, coudes discrétisés (≤ ${m.settings.bendDivisionAngle}° par élément) avec facteur de flexibilité`],
        ['Tolérance de fabrication et corrosion', m.settings.allowances ? 'prises en compte (épaisseur minimale)' : 'non prises en compte'],
        ['Épaisseur minimale (pression seule)', m.settings.checkThickness ? `vérifiée${r?.code?.thickness ? ` (${r.code.thickness.ref})` : ''}` : 'non vérifiée'],
        ['Supports', 'Linéaires bilatéraux, rigidité de pénalité 10¹⁰ N/mm / 10¹⁴ N·mm/rad'],
        ['Code', r?.code?.label ?? m.code.id],
        // paramètres déclarés par le code, avec leur libellé (les clés obsolètes
        // d'anciens projets ne sont pas reprises)
        ...(codes.get(m.code.id)?.params ?? []).map((f) => {
          const v = m.code.params?.[f.key];
          return [f.label, f.type === 'checkbox' ? (v ? 'oui' : 'non') : String(v ?? '')];
        }),
      ],
    ),
  );
  parts.push('<h3>Sections</h3>');
  parts.push(
    m.settings.allowances
      ? table(['Repère', 'De (mm)', 'e (mm)', 'Tol. (%)', 'Corr. (mm)', 'ρ fluide', 'Calorifuge (mm)', 'ρ calo.'], m.sections.map((s) => [s.id, s.od, s.t, s.millTol, s.corrosion, s.fluidDensity, s.insulThk, s.insulDensity]))
      : table(['Repère', 'De (mm)', 'e (mm)', 'ρ fluide', 'Calorifuge (mm)', 'ρ calo.'], m.sections.map((s) => [s.id, s.od, s.t, s.fluidDensity, s.insulThk, s.insulDensity])),
  );
  parts.push('<h3>Matériaux</h3>');
  for (const mat of m.materials) {
    parts.push(`<p><b>${esc(mat.id)}</b> — ${esc(mat.name)} — ρ = ${mat.density} kg/m³, ν = ${mat.nu}</p>`);
    parts.push(table(['T (°C)', 'E (MPa)', 'α (10⁻⁶/°C)', 'S (MPa)', 'Sy (MPa)'], mat.table.map((t) => [t.T, t.E, t.alpha, t.S, t.Sy])));
  }
  parts.push('<h2>2. Modèle</h2>');
  for (const def of components.list()) {
    const rows = m.components.filter((c) => c.type === def.id);
    if (!rows.length) continue;
    parts.push(`<h3>${esc(def.label)}</h3>`);
    parts.push(table(def.fields.map((f) => f.label + (f.unit ? ` (${f.unit})` : '')), rows.map((c) => def.fields.map((f) => (f.key === 'kind' ? SUPPORT_KINDS[c.kind]?.label ?? c.kind : c[f.key] ?? '')))));
  }
  parts.push('<h2>3. Chargements</h2>');
  parts.push(table(['Id', 'Libellé', 'Type', 'Actif', 'Paramètres'], m.loadCases.map((lc) => [lc.id, lc.label, lc.type, lc.enabled === false ? 'non' : 'oui', loadParams(lc, m.settings.vertical)])));
  const code = r?.code;
  if (code?.combinations) {
    parts.push('<h3>Cumul des chargements</h3>');
    parts.push(table(['Éq.', 'Cumul', 'Chargements', 'Règle', 'Admissible'], code.combinations({ model: m }).map((c) => [c.eq, c.name, c.loads, c.rule, c.allow])));
  }

  if (r) {
    parts.push('<h2>4. Résultats</h2>');
    if (r.warnings.length) parts.push(`<ul class="warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`);
    if (r.modal) {
      parts.push('<h3>Modes propres</h3>');
      const tot = r.modal.totalMass;
      const sums = modalSums(r.modal);
      const pct = (v, d) => fmt((100 * v) / (tot[d] || 1), 1);
      parts.push(`<p>Masse globale du système : <b>${fmt(tot[0] * 1000, 0)} kg</b>. %X, %Y, %Z : masse modale effective (participante) de chaque mode rapportée à la masse globale.</p>`);
      parts.push(
        table(
          ['Mode', 'f (Hz)', '%X', '%Y', '%Z'],
          [
            ...r.modal.modes.map((md, k) => [k + 1, fmt(md.freq, 2), ...md.effMass.map(pct)]),
            [`Σ ${r.modal.modes.length} modes`, '', ...sums.eff.map(pct)],
            ['Masse sur supports rigides', '', ...sums.supported.map(pct)],
          ],
        ),
      );
    }
    for (const c of displayCases(r)) {
      parts.push(`<h3>Efforts sur supports — ${esc(c.id)} ${esc(c.label)}${c.signed ? '' : ' (enveloppe)'}</h3>`);
      parts.push(table(['Nœud', 'Repère', 'FX (N)', 'FY (N)', 'FZ (N)', 'MX (N·m)', 'MY (N·m)', 'MZ (N·m)'], r.mesh.supports.map((s, k) => [r.mesh.nodes[s.node].label, s.label, ...[0, 1, 2].map((d) => fmt(c.supportLoads[k * 6 + d], 0)), ...[3, 4, 5].map((d) => fmt(c.supportLoads[k * 6 + d] / 1000, 0))])));
    }
    if (r.check) {
      parts.push('<h3>Dépouillement — critères déterminants</h3>');
      parts.push(table(['Critère', 'Cas', 'Nœud', 'Composant', 'σ', 'Admissible', 'Taux'], r.check.summary.governing.map((g) => [g.eqLabel, g.case, g.node, g.comp, fmt(g.stress, 1), fmt(g.allow, 1), `${fmt(g.effRatio, 2)}${g.coveredBy ? ` (via éq. ${g.coveredBy})` : ''}`])));
      parts.push(`<ul>${r.check.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
      parts.push('<h3>Dépouillement — détail aux nœuds (hors nœuds internes)</h3>');
      const rows = r.check.rows.filter((x) => r.mesh.nodes[r.mesh.nodeIndex.get(x.node)]?.kind !== 'internal');
      parts.push(table(['Critère', 'Cas', 'Nœud', 'Élément', 'σ', 'Adm.', 'Taux'], rows.map((x) => [x.eqLabel, x.case, x.node, x.elem, fmt(x.stress, x.unit === 'mm' ? 2 : 1), fmt(x.allow, x.unit === 'mm' ? 2 : 1), fmt(x.ratio, 2)])));
    }
  }
  parts.push('<p class="meta">Les valeurs matériaux par défaut sont indicatives ; la conformité doit être établie avec les données de l’édition du code applicable. Outil d’aide à l’analyse : les résultats doivent être vérifiés par un ingénieur qualifié.</p>');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(m.meta.title)} — note de calcul</title><style>
  body{font:13px/1.45 system-ui,sans-serif;color:#1a202c;max-width:1000px;margin:24px auto;padding:0 16px}
  h1{font-size:22px;margin-bottom:2px}h2{font-size:17px;border-bottom:2px solid #0b7285;padding-bottom:3px;margin-top:28px}h3{font-size:14px;margin:16px 0 6px}
  table{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:12px}th,td{border:1px solid #cbd5e0;padding:3px 6px;text-align:left}th{background:#edf2f7}
  .meta{color:#4a5568}.verdict{padding:8px 12px;border-radius:6px;font-weight:600;margin:10px 0}.ok{background:#d3f9d8;color:#1b5e20}.ko{background:#ffe3e3;color:#8b1a1a}
  figure{margin:12px 0;text-align:center}img{max-width:100%;border:1px solid #cbd5e0}figcaption{color:#4a5568}.warn{color:#8a5a00}
  @media print{body{margin:0}button{display:none}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
  </style></head><body><button onclick="print()" style="float:right">Imprimer / PDF</button>${parts.join('\n')}</body></html>`;
}

const levelsText = (lc) =>
  `niveaux ${seismicLevels(lc)
    .filter((x) => x.enabled !== false)
    .map((x) => `${x.level}${x.name ? ` ${x.name}` : ''} (× ${x.factor === '' || x.factor == null ? 1 : x.factor})`)
    .join(', ')}`;

function loadParams(lc, vertical) {
  switch (lc.type) {
    case 'weight':
      return `fluide ${lc.fluid !== false ? 'oui' : 'non'}, calorifuge ${lc.insulation !== false ? 'oui' : 'non'}`;
    case 'thermal':
      return `T par tube, déplacements imposés ${lc.imposed !== false ? 'oui' : 'non'}`;
    case 'seismic':
      return lc.method === 'static'
        ? `statique équivalente, ${levelsText(lc)}, accélérations ${['X', 'Y', 'Z'].map((d) => `${d} ${lc.staticAcc?.[d] ?? 0} g`).join(', ')}, ${lc.directional}`
        : `spectrale, ${levelsText(lc)}, ${lc.modal === 'SRSS' ? '' : lc.dampingLaw === 'variable' ? `ξ variable ${lc.dampLow ?? 5} % → ${lc.dampHigh ?? 2} % entre ${lc.fLow ?? 10} et ${lc.fHigh ?? 20} Hz (CQC), ` : `ξ = ${lc.damping ?? 5} % (CQC), `}coupure ${lc.cutoff} Hz, ${lc.modal}, ${lc.directional}, masse manquante ${lc.missingMass !== false ? 'oui' : 'non'}, réponse rigide ${lc.rigid === 'none' ? 'non' : 'Gupta'}, ${lc.sameHorizontal !== false ? 'spectre horizontal commun, ' : ''}facteurs ${['X', 'Y', 'Z'].map((d) => `${d} ${fmt(spectrumFor(lc, d, vertical)?.factor ?? 0, 2)}`).join(', ')}`;
    default:
      return '';
  }
}
