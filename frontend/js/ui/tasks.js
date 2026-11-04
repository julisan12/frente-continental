// Tanda 3, trabajador F: pantalla «Por mi cuenta» (decisiones y tareas pendientes del jugador), accesible desde la
// barra inferior. Sustituye las «DECISIÓN» del carrusel superior, que pasa a mostrar solo noticias.
// API: render(el) pinta la pantalla; countTasks(game) -> número de tareas (insignia de la barra inferior).
import { h } from '../util.js';

export function countTasks(game) { void game; return 0; }
export function render(el) { el.replaceChildren(h('div', { class: 'empty' }, 'Sin tareas pendientes.')); }
