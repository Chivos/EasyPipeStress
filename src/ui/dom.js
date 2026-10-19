// Petits utilitaires DOM et éditeurs génériques pilotés par des descriptions
// de champs ({ key, label, type, unit, options, optionLabel, placeholder, title }).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' && tag === 'textarea') el.value = v; // un textarea n'a pas d'attribut value
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function parseNumber(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (s === '') return '';
  const v = Number(s);
  return Number.isFinite(v) ? v : '';
}

/** Éditeur d'une valeur selon son descripteur de champ. */
export function fieldInput(field, value, onChange, { model, focusKey } = {}) {
  const common = { title: field.title, dataset: focusKey ? { focus: focusKey } : undefined };
  switch (field.type) {
    case 'checkbox':
      return h('input', { type: 'checkbox', checked: !!(value ?? field.default), onchange: (e) => onChange(e.target.checked), ...common });
    case 'select': {
      const opts = field.options(model);
      const sel = h(
        'select',
        { onchange: (e) => onChange(e.target.value), ...common },
        opts.map((o) => h('option', { value: o, selected: String(o) === String(value) }, field.optionLabel ? field.optionLabel(o) : o)),
      );
      if (!opts.map(String).includes(String(value))) sel.prepend(h('option', { value: value ?? '', selected: true }, value ? `${value} (?)` : '—'));
      return sel;
    }
    case 'number':
      return h('input', {
        type: 'text',
        inputmode: 'decimal',
        value: value ?? '',
        placeholder: field.placeholder ?? '',
        class: 'num',
        onchange: (e) => onChange(parseNumber(e.target.value)),
        ...common,
      });
    default:
      return h('input', { type: 'text', value: value ?? '', placeholder: field.placeholder ?? '', onchange: (e) => onChange(e.target.value.trim()), ...common });
  }
}

/** Formulaire vertical label / éditeur. */
export function fieldForm(fields, obj, onChange, opts = {}) {
  return h(
    'div',
    { class: 'form' },
    fields.map((f) =>
      h(
        'label',
        { class: f.type === 'checkbox' ? 'row check' : 'row' },
        h('span', { class: 'lbl', title: f.title }, f.label, f.unit ? h('small', {}, ` (${f.unit})`) : null),
        fieldInput(f, obj[f.key], (v) => onChange(f.key, v), { ...opts, focusKey: opts.focusPrefix ? `${opts.focusPrefix}:${f.key}` : undefined }),
      ),
    ),
  );
}

/** Tableau éditable. */
export function editableTable({ columns, rows, model, onEdit, onDelete, onAdd, addLabel = 'Ajouter', focusPrefix, rowAttrs, empty = 'Aucune ligne.' }) {
  const table = h(
    'table',
    { class: 'grid' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { title: c.title, style: c.width ? { minWidth: `${c.width}px` } : undefined }, c.label, c.unit ? h('small', {}, h('br'), c.unit) : null)), onDelete ? h('th', {}) : null)),
    h(
      'tbody',
      {},
      rows.length
        ? rows.map((row, i) =>
            h(
              'tr',
              rowAttrs ? rowAttrs(row, i) : {},
              columns.map((c) => h('td', {}, c.render ? c.render(row, i) : fieldInput(c, row[c.key], (v) => onEdit(i, c.key, v), { model, focusKey: `${focusPrefix}:${row.id ?? i}:${c.key}` }))),
              onDelete ? h('td', {}, h('button', { class: 'icon danger', title: 'Supprimer', onclick: () => onDelete(i) }, '✕')) : null,
            ),
          )
        : h('tr', {}, h('td', { colspan: columns.length + 1, class: 'muted' }, empty)),
    ),
  );
  return h('div', { class: 'grid-wrap' }, table, onAdd ? h('button', { class: 'small', onclick: onAdd }, `+ ${addLabel}`) : null);
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
