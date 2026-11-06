// Pantalla de Investigación: seis categorías que agrupan las ramas tecnológicas del motor.
import { h } from '../util.js';
import { tabStrip } from './tabs.js';
import { getState } from '../state.js';
import { investigacion } from './economy.js';

// Categoría -> ramas de features.BRANCHES. Una categoría sin ramas muestra «Próximamente».
export const CATEGORIES = [
  ['mil', 'Militar', ['inf', 'arm', 'art', 'air', 'nav', 'mis', 'mor']],
  ['dip', 'Diplomática', ['esp']],
  ['res', 'Recursos', ['eco']],
  ['pol', 'Política interna', []],
  ['inf', 'Infraestructura', ['bld']],
  ['com', 'Comercio', []],
];

let cat = 'mil';

export function render(el) {
  el.replaceChildren();
  if (!getState().game) return;
  const cur = CATEGORIES.find((c) => c[0] === cat) || CATEGORIES[0];
  const tabs = tabStrip('research', CATEGORIES.map((c) => [c[0], c[1]]), cur[0], (id) => { cat = id; render(el); });
  const body = cur[2].length
    ? investigacion(cur[2])
    : h('div', { class: 'panel empty stack' }, h('b', null, 'Próximamente'), h('div', { class: 'muted small' }, 'Aún no hay tecnologías en esta categoría.'));
  el.append(h('h2', null, 'Investigación'), tabs, h('div', { class: 'stack' }, body));
}
