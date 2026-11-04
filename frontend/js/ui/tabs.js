// Tira de pestañas horizontal que NO se mueve al cambiar de pestaña: conserva el desplazamiento por pantalla
// y mantiene visible la pestaña seleccionada (Tanda 2). Uso: tabStrip('diplomacy', TABS, tab, (id) => {...}).
import { h } from '../util.js';

const scrollPos = {}; // key -> scrollLeft

/**
 * @param key   identificador de la pantalla (para recordar el desplazamiento)
 * @param tabs  [[id, label], ...]
 * @param cur   id seleccionado
 * @param onSel callback(id)
 */
export function tabStrip(key, tabs, cur, onSel) {
  const el = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, l]) =>
    h('button', { class: 'tab', role: 'tab', 'data-tab': id, 'aria-selected': String(cur === id), onclick: () => { if (id !== cur) onSel(id); } }, l)));
  el.addEventListener('scroll', () => { scrollPos[key] = el.scrollLeft; }, { passive: true });
  // Tras insertarse en el DOM: restaurar desplazamiento y asegurar que la pestaña activa se ve entera.
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    if (scrollPos[key] != null) el.scrollLeft = scrollPos[key];
    const b = el.querySelector('[aria-selected="true"]');
    if (!b) return;
    const L = b.offsetLeft, R = L + b.offsetWidth;
    if (L < el.scrollLeft + 6) el.scrollLeft = Math.max(0, L - 6);
    else if (R > el.scrollLeft + el.clientWidth - 6) el.scrollLeft = R - el.clientWidth + 6;
    scrollPos[key] = el.scrollLeft;
  });
  return el;
}
