// Tanda 4: modal de accidentes internacionales y lista expandible de noticias.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { getState, extAction } from '../state.js';
import { openModal } from './modals.js';

let open = false;

/** Si hay un accidente pendiente, abre el modal de decisión. Devuelve una promesa que resuelve al decidir. */
export function maybeWorldModal() {
  const g = getState().game;
  const p = g && g.ext && g.ext.world && g.ext.world.pending;
  if (!p || open) return Promise.resolve();
  open = true;
  return new Promise((res) => {
    let m;
    const done = () => { open = false; m.close(); res(); };
    const money = g.countries[g.player].money || 0;
    const opts = p.options.map((o) => {
      const cost = -(o.money || 0);
      const poor = cost > money;
      return h('button', {
        class: 'btn world-opt' + (o.id === 'none' ? ' ghost' : ''),
        disabled: poor ? 'disabled' : null,
        onclick: async () => { if (await extAction({ action: 'world_resolve', option: o.id })) done(); },
      },
      h('strong', null, o.text, cost ? ` (−$${cost * 10} M)` : ''),
      h('span', { class: 'pro' }, '＋ ' + o.pros),
      h('span', { class: 'con' }, '－ ' + o.cons));
    });
    m = openModal([
      h('h2', null, icon('alert'), ' ', p.title),
      h('p', null, p.text),
      h('p', { class: 'muted' }, 'Elige cómo responde tu nación. Si no decides, se enviará ayuda mínima.'),
      h('div', { class: 'stack world-opts' }, opts),
      h('div', { class: 'acts' }, h('button', { class: 'btn ghost', onclick: () => { open = false; m.close(); res(); } }, 'Decidir después')),
    ], { label: 'Accidente internacional', dismissible: false });
  });
}

/** Lista completa (hasta 60) de noticias internacionales. */
export function openNewsList() {
  const g = getState().game;
  const list = (g && g.ext && Array.isArray(g.ext.news)) ? g.ext.news.slice().reverse() : [];
  let m;
  m = openModal([
    h('h2', null, 'Noticias internacionales'),
    h('div', { class: 'stack news-list' },
      list.length ? list.map((n) => h('div', { class: 'logline news-' + (n.kind || 'info') }, `T${n.turn} · ${n.text}`))
        : h('p', { class: 'muted' }, 'Sin noticias.')),
    h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Cerrar')),
  ], { label: 'Noticias internacionales' });
}
