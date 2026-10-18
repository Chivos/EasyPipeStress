// Matériaux : tables de propriétés fonction de la température, interpolées
// linéairement. Les valeurs fournies par défaut sont INDICATIVES (ordre de grandeur
// RCC-M Annexe Z I / ASME II-D) : elles doivent être vérifiées et remplacées par
// les valeurs de l'édition de code applicable au projet.
//
// Colonnes : T (°C), E (MPa), alpha (10⁻⁶/°C, coefficient MOYEN de dilatation
// entre 20 °C et T), S (contrainte admissible classe 2, MPa), Sy (limite
// d'élasticité Rp0,2, MPa).

export function interpTable(table, T, key) {
  const rows = table;
  if (!rows.length) return NaN;
  if (T <= rows[0].T) return rows[0][key];
  for (let i = 1; i < rows.length; i++) {
    if (T <= rows[i].T) {
      const a = rows[i - 1];
      const b = rows[i];
      const w = (T - a.T) / (b.T - a.T);
      return a[key] + w * (b[key] - a[key]);
    }
  }
  return rows[rows.length - 1][key];
}

/** Propriétés du matériau à la température T. */
export function materialAt(mat, T) {
  const table = [...mat.table].sort((a, b) => a.T - b.T);
  const out = {};
  for (const key of ['E', 'alpha', 'S', 'Sy']) out[key] = interpTable(table, T, key);
  out.alpha *= 1e-6;
  out.outOfRange = T < table[0].T - 1e-9 || T > table[table.length - 1].T + 1e-9;
  return out;
}

export const DEFAULT_MATERIALS = [
  {
    id: 'Z2CN18-10',
    name: 'Z2CN18-10 (X2CrNi18-9, ~304L) – valeurs indicatives',
    density: 7900,
    nu: 0.3,
    table: [
      { T: 20, E: 197000, alpha: 15.3, S: 115, Sy: 172 },
      { T: 100, E: 191000, alpha: 16.0, S: 115, Sy: 145 },
      { T: 150, E: 187000, alpha: 16.4, S: 115, Sy: 131 },
      { T: 200, E: 184000, alpha: 16.8, S: 108, Sy: 121 },
      { T: 250, E: 180000, alpha: 17.2, S: 102, Sy: 114 },
      { T: 300, E: 176000, alpha: 17.5, S: 98, Sy: 108 },
      { T: 350, E: 172000, alpha: 17.8, S: 94, Sy: 104 },
    ],
  },
  {
    id: 'Z2CND17-12',
    name: 'Z2CND17-12 (X2CrNiMo17-12-2, ~316L) – valeurs indicatives',
    density: 7950,
    nu: 0.3,
    table: [
      { T: 20, E: 197000, alpha: 15.3, S: 115, Sy: 172 },
      { T: 100, E: 191000, alpha: 16.0, S: 115, Sy: 147 },
      { T: 150, E: 187000, alpha: 16.4, S: 115, Sy: 134 },
      { T: 200, E: 184000, alpha: 16.8, S: 112, Sy: 123 },
      { T: 250, E: 180000, alpha: 17.2, S: 107, Sy: 116 },
      { T: 300, E: 176000, alpha: 17.5, S: 102, Sy: 110 },
      { T: 350, E: 172000, alpha: 17.8, S: 99, Sy: 106 },
    ],
  },
  {
    id: 'P265GH',
    name: 'P265GH (acier au carbone) – valeurs indicatives',
    density: 7850,
    nu: 0.3,
    table: [
      { T: 20, E: 203000, alpha: 11.2, S: 118, Sy: 265 },
      { T: 100, E: 198000, alpha: 11.7, S: 118, Sy: 226 },
      { T: 150, E: 195000, alpha: 12.1, S: 118, Sy: 213 },
      { T: 200, E: 191000, alpha: 12.5, S: 118, Sy: 192 },
      { T: 250, E: 188000, alpha: 12.9, S: 118, Sy: 171 },
      { T: 300, E: 184000, alpha: 13.3, S: 118, Sy: 154 },
      { T: 350, E: 180000, alpha: 13.6, S: 116, Sy: 141 },
    ],
  },
];
