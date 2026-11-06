// Tutorial de 5 pasos. Se guarda como visto en LS fc.tut.
import { h } from '../util.js';
import { openModal } from './modals.js';
import { lsGet, lsSet } from './sound.js';

const STEPS = [
  ['Bienvenida y objetivo', 'Eres el gobierno de una nación latinoamericana (en el escenario clásico, enero de 1962, en plena Guerra Fría). Cada turno es un mes y la duración la eliges al crear la partida para hacer crecer tu país, tejer alianzas y dominar el continente.'],
  ['Mapa y país', 'Toca un país en el mapa para ver su ficha. Arrastra para moverte y usa los botones +/- para acercar. Dorado: tuyo; verde oliva: aliados; rojo óxido: enemigos. La pestaña País muestra tus datos y acciones.'],
  ['Economía, política e investigación', 'En Economía reparte tu presupuesto entre Ejército, Social, Infraestructura e Industria y lanza proyectos. Vigila la estabilidad: si cae habrá protestas y golpes. Elige también línea de investigación y enfoque nacional cuando estén disponibles.'],
  ['Ejército, diplomacia y espionaje', 'En Ejército recluta, agrupa divisiones y ordena mover o atacar a territorios vecinos. En Diplomacia propón alianzas, pactos y bloques, y usa el espionaje para ganar ventaja. Declarar la guerra tiene costo político.'],
  ['Finalizar turno y asesor', 'Da tus órdenes y pulsa Finalizar turno: se ejecutan juntas, la IA mueve y recibes un informe. En Más > Guía el Asesor te sugiere qué hacer y puedes repetir este tutorial cuando quieras.'],
];

export const tutorialDone = () => lsGet('fc.tut') === '1';

export function showTutorial(force) {
  if (!force && tutorialDone()) return Promise.resolve();
  return new Promise((res) => {
    let i = 0;
    let m;
    const finish = () => { lsSet('fc.tut', '1'); m.close(); res(); };
    const body = h('div', { class: 'tut' });
    const paint = () => {
      const [t, x] = STEPS[i];
      body.replaceChildren(
        h('div', { class: 'tut-step muted small' }, `Paso ${i + 1} de ${STEPS.length}`),
        h('h2', null, t),
        h('p', null, x),
        h('div', { class: 'tut-dots', role: 'presentation' }, STEPS.map((_, k) => h('span', { class: 'tut-dot' + (k === i ? ' on' : '') }))),
        h('div', { class: 'acts' },
          i < STEPS.length - 1 ? h('button', { class: 'btn', onclick: finish }, 'Saltar') : null,
          i > 0 ? h('button', { class: 'btn', onclick: () => { i--; paint(); } }, 'Anterior') : null,
          h('button', { class: 'btn primary', onclick: () => { if (i < STEPS.length - 1) { i++; paint(); } else finish(); } },
            i < STEPS.length - 1 ? 'Siguiente' : 'Empezar')));
      const b = body.querySelector('.btn.primary');
      if (b) b.focus({ preventScroll: true });
    };
    m = openModal([body], { label: 'Tutorial', onDismiss: () => { lsSet('fc.tut', '1'); res(); } });
    paint();
  });
}
