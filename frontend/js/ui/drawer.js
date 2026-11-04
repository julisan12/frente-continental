// Cajon lateral deslizante (Tanda 2): no tapa todo el mapa; el velo ligero cierra al tocarlo; Escape cierra.
import { h } from '../util.js';
import { icon } from '../icons.js';

let root = null, current = null, onKey = null;

function mountPoint() {
  if (root && root.isConnected) return root;
  root = h('div', { id: 'drawer-root' });
  document.body.append(root);
  return root;
}

export function closeDrawer() {
  if (!current) return;
  const { veil } = current;
  current = null;
  if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  veil.classList.remove('open');
  const done = () => veil.remove();
  setTimeout(done, 200);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
}

/** Abre el cajon. body: nodo o lista de nodos. Devuelve el elemento .drawer. */
export function openDrawer({ title = '', body = null, side = 'right' } = {}) {
  if (current) { current.veil.remove(); current = null; }
  const close = h('button', { class: 'iconbtn drawer-x', 'aria-label': 'Cerrar ajustes', onclick: closeDrawer }, icon('close'));
  const content = h('div', { class: 'drawer-body' }, body);
  const drawer = h('aside', { class: 'drawer ' + (side === 'left' ? 'left' : 'right'), role: 'dialog', 'aria-label': title || 'Panel' },
    h('div', { class: 'drawer-hd' }, h('h2', null, title), close), content);
  const veil = h('div', { class: 'drawer-veil', onclick: (e) => { if (e.target === veil) closeDrawer(); } }, drawer);
  mountPoint().append(veil);
  current = { veil, drawer };
  onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { veil.classList.add('open'); close.focus({ preventScroll: true }); });
  return drawer;
}

export const drawerOpen = () => !!current;
