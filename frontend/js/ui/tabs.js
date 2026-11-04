// Tira de pestañas horizontal que NO se mueve al cambiar de pestaña: conserva el desplazamiento por pantalla
// y mantiene visible la pestaña seleccionada (Tanda 2). Uso: tabStrip('diplomacy', TABS, tab, (id) => {...}).
// Con <= 8 pestañas y ancho >= 360 (CSS) se reparten en filas sin desplazamiento.
import { h } from '../util.js';

const scrollPos = {}; // key -> scrollLeft

/**
 * @param key   identificador de la pantalla (para recordar el desplazamiento)
 * @param tabs  [[id, label], ...]
 * @param cur   id seleccionado
 * @param onSel callback(id)
 */
export function tabStrip(key, tabs, cur, onSel) {
  const el = h('div', { class: 'tabs' + (tabs.length <= 8 ? ' fit' : ''), role: 'tablist' }, tabs.map(([id, l]) =>
    h('button', { class: 'tab', role: 'tab', 'data-tab': id, 'aria-selected': String(cur === id), onclick: () => { if (id !== cur) onSel(id); } }, l)));
  el.addEventListener('scroll', () => { scrollPos[key] = el.scrollLeft; }, { passive: true });
  // Tras insertarse en el DOM: restaurar desplazamiento y, solo si la pestaña activa no se ve entera, acercarla.
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    if (scrollPos[key] != null) el.scrollLeft = scrollPos[key];
    const wrap = el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).flexWrap === 'wrap';
    const b = el.querySelector('[aria-selected="true"]');
    if (b && !wrap) {
      const L = b.offsetLeft, R = L + b.offsetWidth;
      if (L < el.scrollLeft || R > el.scrollLeft + el.clientWidth) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    scrollPos[key] = el.scrollLeft;
    marcarBordes(el);
  });
  el.addEventListener('scroll', () => marcarBordes(el), { passive: true });
  return el;
}

// Degradados de desbordamiento a los lados (clases .more-l / .more-r)
function marcarBordes(el) {
  el.classList.toggle('more-l', el.scrollLeft > 2);
  el.classList.toggle('more-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
}
