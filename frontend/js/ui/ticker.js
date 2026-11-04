// Carrusel de noticias tipo noticiero de TV (solo noticias; las decisiones pendientes están en tasks.js).
import { h } from '../util.js';
import { icon } from '../icons.js';
import { goTo } from './tasks.js';

// Las decisiones pendientes se recolectan en tasks.js; se reexporta para quien las necesite.
export { collectDecisions } from './tasks.js';

const ICON_MAP = {
  war: 'sword', eco: 'coins', dip: 'rings', spy: 'target', tech: 'lab',
  supply: 'shortage', unrest: 'fire', mil: 'shield', info: 'news',
  victory: 'star', defeat: 'close', event: 'alert',
};

// Estado global del carrusel para sobrevivir a repintados
let tickerState = {
  root: null,
  items: [],
  currentIdx: 0,
  timer: null,
  contentHash: '',
  isPaused: false,
};

/** Calcula una firma del contenido para detectar cambios */
function contentSignature(items) {
  return items.map((it) => `${it.kind}:${it.text}`).join('|');
}

/** Recolecta noticias recientes (solo noticias: las decisiones viven en «Por mi cuenta»). */
function collectNews(g) {
  const news = [];
  const cname = (id) => (g.countries && g.countries[id] && g.countries[id].name) || id;

  // Últimas 12 de game.ext.news, más recientes primero.
  if (g.ext && Array.isArray(g.ext.news)) {
    g.ext.news.slice(-12).reverse().forEach((n) => {
      news.push({ raw: n.text, text: `T${n.turn} · ${n.text}`, kind: n.kind || 'info', screen: 'more' });
    });
  }

  // Últimos 6 registros de guerra/victoria/derrota/evento.
  (g.logs || []).filter((l) => ['war', 'victory', 'defeat', 'event'].includes(l.kind)).slice(-6).reverse().forEach((l) => {
    news.push({ raw: l.text, text: `T${l.turn} · ${l.text}`, kind: l.kind, screen: 'more' });
  });

  // Batallas del último informe de turno.
  const r = g.last_report;
  if (r && Array.isArray(r.battles)) {
    r.battles.forEach((b) => {
      if (!b) return;
      const t = typeof b === 'string' ? b : b.text
        || `Batalla por ${b.target_name || (b.target ? cname(b.target) : '?')}: ${cname(b.attacker)} ${b.won ? 'vence' : 'es rechazado'}`
          + (b.attack != null && b.defense != null ? ` (${Math.round(b.attack)} contra ${Math.round(b.defense)}).` : '.');
      news.push({ raw: t, text: `T${r.turn != null ? r.turn : g.turn} · ${t}`, kind: 'war', screen: 'more' });
    });
  }
  return news;
}

/** Deduplica ítems por texto (sin el prefijo de turno). */
function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const k = (it.raw || it.text).replace(/[.\s]+$/, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Ítems del carrusel: solo noticias. */
function collectItems(g) {
  return g ? dedupe(collectNews(g)) : [];
}

/** Toque en una noticia: Más → Noticias. */
const navigate = () => goTo('more');

/** Renderiza el carrusel */
function renderTicker(items, currentIdx) {
  if (items.length === 0) return null;

  const item = items[currentIdx];
  const ic = ICON_MAP[item.kind] || 'info';

  // Contenedor principal
  const ticker = h('div', { class: 'news-ticker', role: 'region', 'aria-live': 'polite', 'aria-label': 'Carrusel de noticias' });

  // Pestaña izquierda
  const tag = h('div', { class: 'ticker-tag news' }, 'ÚLTIMA HORA');

  // Centro: ítem actual
  const content = h('button', {
    class: 'ticker-content',
    'aria-label': item.text,
    title: item.text,
    onclick: navigate,
  }, icon(ic), h('span', { class: 'ticker-text' }, item.text));

  // Derecha: contador y controles
  const counter = h('span', { class: 'ticker-counter', 'aria-label': `Ítem ${currentIdx + 1} de ${items.length}` },
    `${currentIdx + 1}/${items.length}`);

  const prevBtn = h('button', {
    class: 'ticker-btn',
    'aria-label': 'Anterior',
    onclick: (e) => {
      e.stopPropagation();
      prevItem();
    },
  }, '‹');

  const nextBtn = h('button', {
    class: 'ticker-btn',
    'aria-label': 'Siguiente',
    onclick: (e) => {
      e.stopPropagation();
      nextItem();
    },
  }, '›');

  const controls = h('div', { class: 'ticker-controls' }, counter, prevBtn, nextBtn);

  ticker.append(tag, content, controls);
  return ticker;
}

/** Avanza al siguiente ítem */
function nextItem() {
  if (tickerState.items.length === 0) return;
  tickerState.currentIdx = (tickerState.currentIdx + 1) % tickerState.items.length;
  updateTicker();
}

/** Retrocede al ítem anterior */
function prevItem() {
  if (tickerState.items.length === 0) return;
  tickerState.currentIdx = (tickerState.currentIdx - 1 + tickerState.items.length) % tickerState.items.length;
  updateTicker();
}

/** Actualiza el contenido del ticker */
function updateTicker() {
  if (!tickerState.root || tickerState.items.length === 0) return;

  const newTicker = renderTicker(tickerState.items, tickerState.currentIdx);
  if (newTicker) {
    tickerState.root.replaceChildren(newTicker);
  }
}

/** Inicia el timer de rotación automática */
function startTimer() {
  stopTimer();

  // Respetar prefers-reduced-motion
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || tickerState.isPaused || tickerState.items.length <= 1) return;

  tickerState.timer = setInterval(() => {
    if (!tickerState.isPaused) {
      nextItem();
    }
  }, 4500);
}

/** Detiene el timer */
function stopTimer() {
  if (tickerState.timer) {
    clearInterval(tickerState.timer);
    tickerState.timer = null;
  }
}

/** Crea o actualiza el carrusel de noticias */
export function newsTicker(game) {
  if (!game) {
    destroyTicker();
    return null;
  }

  const items = collectItems(game);
  if (items.length === 0) {
    destroyTicker();
    return null;
  }

  const sig = contentSignature(items);

  // Si el contenido no cambió, reutilizar el elemento existente
  if (tickerState.root && tickerState.contentHash === sig) {
    return tickerState.root;
  }

  // Actualizar estado
  tickerState.items = items;
  tickerState.contentHash = sig;

  // Si cambió el contenido, resetear el índice solo si el actual está fuera de rango
  if (tickerState.currentIdx >= items.length) {
    tickerState.currentIdx = 0;
  }

  // Crear o reutilizar contenedor raíz
  if (!tickerState.root) {
    tickerState.root = h('div', { class: 'ticker-wrapper' });
  }

  // Actualizar contenido
  updateTicker();

  // Reiniciar timer
  startTimer();

  return tickerState.root;
}

/** Destruye el ticker y limpia recursos */
export function destroyTicker() {
  stopTimer();
  tickerState = {
    root: null,
    items: [],
    currentIdx: 0,
    timer: null,
    contentHash: '',
    isPaused: false,
  };
}
