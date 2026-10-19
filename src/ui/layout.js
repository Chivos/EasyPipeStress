// Ergonomie de l'interface : volets redimensionnables et navigation au clavier
// dans les tableaux de saisie.

const LAYOUT_KEY = 'easypipestress:layout';
const DEFAULTS = { panel: 440, bottom: 0.36 }; // largeur du volet (px), hauteur du bandeau (fraction)

function loadLayout() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveLayout(l) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    /* stockage indisponible : disposition non mémorisée */
  }
}

/**
 * Séparateurs déplaçables entre le volet de saisie et la vue, et entre la vue et
 * le bandeau de résultats. Double-clic : disposition par défaut. La disposition
 * est mémorisée dans le navigateur.
 */
export function initSplitters() {
  const root = document.documentElement;
  const main = document.querySelector('main');
  const workspace = document.querySelector('#workspace');
  const layout = loadLayout();
  const apply = () => {
    const maxPanel = Math.max(280, main.clientWidth - 320);
    layout.panel = Math.min(maxPanel, Math.max(260, layout.panel));
    layout.bottom = Math.min(0.85, Math.max(0.08, layout.bottom));
    root.style.setProperty('--panel-w', `${layout.panel}px`);
    root.style.setProperty('--bottom-h', `${Math.round(layout.bottom * workspace.clientHeight)}px`);
  };
  apply();
  window.addEventListener('resize', apply);

  const drag = (el, onMove) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = (ev) => {
        onMove(ev);
        apply();
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        saveLayout(layout);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', () => {
      Object.assign(layout, DEFAULTS);
      apply();
      saveLayout(layout);
    });
  };
  drag(document.querySelector('#split-v'), (ev) => {
    layout.panel = ev.clientX - main.getBoundingClientRect().left;
  });
  drag(document.querySelector('#split-h'), (ev) => {
    const r = workspace.getBoundingClientRect();
    layout.bottom = (r.bottom - ev.clientY) / r.height;
  });
}

const FIELD = 'input:not([type=hidden]):not([type=file]), select, textarea';

/** Champ de saisie d'une cellule (ou null). */
const fieldOf = (td) => td?.querySelector(FIELD) ?? null;

/**
 * Navigation au clavier dans les tableaux de saisie (table.grid) :
 * ↑ / ↓ et Entrée : même colonne, ligne précédente / suivante ;
 * ← / → : cellule voisine (dans un champ texte, seulement quand le curseur est
 * en début / fin de texte, pour garder l'édition du texte).
 * La valeur est validée en quittant le champ, comme avec Tab.
 */
export function initGridKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches(FIELD) || el.tagName === 'TEXTAREA') return;
    const td = el.closest('td');
    const tr = td?.parentElement;
    if (!td || !tr?.closest('table.grid')) return;
    const isText = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number' || el.type === '');
    let dir = null;
    switch (e.key) {
      case 'ArrowUp':
        dir = 'up';
        break;
      case 'ArrowDown':
        dir = 'down';
        break;
      case 'Enter':
        if (el.tagName === 'SELECT') return;
        dir = 'down';
        break;
      case 'ArrowLeft':
        if (isText && !(el.selectionStart === 0 && el.selectionEnd === 0) && !(el.selectionStart === 0 && el.selectionEnd === el.value.length)) return;
        dir = 'left';
        break;
      case 'ArrowRight':
        if (isText && !(el.selectionStart === el.value.length && el.selectionEnd === el.value.length) && !(el.selectionStart === 0 && el.selectionEnd === el.value.length)) return;
        dir = 'right';
        break;
      default:
        return;
    }
    const target = neighbour(td, dir);
    if (!target) return;
    e.preventDefault();
    target.focus(); // la valeur du champ quitté est validée (événement change)
    if (target.select && target.tagName === 'INPUT' && target.type === 'text') target.select();
  });
}

function neighbour(td, dir) {
  const tr = td.parentElement;
  if (dir === 'left' || dir === 'right') {
    const cells = [...tr.children];
    const step = dir === 'right' ? 1 : -1;
    for (let k = cells.indexOf(td) + step; k >= 0 && k < cells.length; k += step) {
      const f = fieldOf(cells[k]);
      if (f) return f;
    }
    return null;
  }
  const col = [...tr.children].indexOf(td);
  let row = dir === 'down' ? tr.nextElementSibling : tr.previousElementSibling;
  while (row) {
    const f = fieldOf(row.children[col]);
    if (f) return f;
    row = dir === 'down' ? row.nextElementSibling : row.previousElementSibling;
  }
  return null;
}
