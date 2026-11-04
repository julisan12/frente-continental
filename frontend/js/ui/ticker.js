// Carrusel de noticias tipo noticiero de TV con decisiones pendientes y noticias.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { setState } from '../state.js';

// features.js lo crea otro agente: carga dinámica para no romper el enlazado de módulos.
let F = {};
import('../engine/features.js').then((m) => { F = m; }).catch(() => {});

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
  return items.map((it) => `${it.prio}:${it.kind}:${it.text}:${it.screen}`).join('|');
}

/** Recolecta decisiones pendientes (prioridad alta) */
function collectDecisions(g) {
  const decisions = [];
  const me = g.player;
  const c = g.countries[me];

  // Evento activo
  if (g.active_event) {
    decisions.push({ text: 'Evento pendiente: resolver decisión', kind: 'alert', screen: 'more', prio: 100 });
  }

  // Votación OEA sin votar
  if (g.ext && Array.isArray(g.ext.oas)) {
    const pending = g.ext.oas.find((o) => !o.player_vote && o.turn === g.turn);
    if (pending) {
      decisions.push({ text: 'Votación de la OEA pendiente', kind: 'alert', screen: 'diplomacy', prio: 90 });
    }
  }

  // Sin investigación en curso
  if (g.ext && g.ext.techs && g.ext.techs[me] && g.ext.techs[me].cur == null) {
    const labs = g.ext.labs && g.ext.labs[me] ? g.ext.labs[me] : 0;
    if (labs > 0) {
      decisions.push({ text: 'Sin investigación seleccionada', kind: 'alert', screen: 'economy', prio: 70 });
    }
  }

  // Sin enfoque nacional
  if (g.ext && g.ext.policy && g.ext.policy[me] && g.ext.policy[me].focus == null && g.ext.policy[me].focus_id == null) {
    decisions.push({ text: 'Sin enfoque nacional activo', kind: 'alert', screen: 'economy', prio: 75 });
  }

  // Pactos que expiran pronto
  if (g.ext && Array.isArray(g.ext.pacts)) {
    const expiring = g.ext.pacts.filter((p) => (p.a === me || p.b === me) && p.until && p.until <= g.turn + 2);
    if (expiring.length > 0) {
      const other = expiring[0].a === me ? expiring[0].b : expiring[0].a;
      decisions.push({ text: `Pacto con ${other} expira pronto`, kind: 'alert', screen: 'diplomacy', prio: 60 });
    }
  }

  // Dinero bajo o balance negativo
  const summary = g.summary || {};
  const dMoney = summary.deltas && summary.deltas.money != null ? summary.deltas.money : 0;
  if (c.money < 20) {
    decisions.push({ text: 'Tesorería crítica: quedan pocos fondos', kind: 'alert', screen: 'economy', prio: 80 });
  } else if (summary.balance != null && summary.balance < 0 && dMoney < 0) {
    decisions.push({ text: 'Déficit: el ejército cuesta más de lo que ingresas', kind: 'alert', screen: 'economy', prio: 80 });
  }

  // Divisiones con org < 40
  const divs = (g.divisions || []).filter((d) => d.owner === me && d.org != null && d.org < 40);
  if (divs.length > 0) {
    decisions.push({ text: `${divs[0].name} necesita reorganizarse`, kind: 'alert', screen: 'army', prio: 50 });
  }

  // Órdenes en cola 0 cuando turno > 1 (sugerencia suave)
  const orders = g.orders || [];
  if (g.turn > 1 && orders.length === 0) {
    decisions.push({ text: 'Sin órdenes para el turno', kind: 'alert', screen: 'map', prio: 30 });
  }

  // ext_pending de features.js
  try {
    if (F && typeof F.ext_pending === 'function') {
      const pending = F.ext_pending(g);
      if (Array.isArray(pending)) {
        pending.forEach((p) => {
          decisions.push({ text: p.text, kind: p.kind || 'alert', screen: p.screen || 'more', prio: 85 });
        });
      }
    }
  } catch (e) {
    // Módulo opcional
  }

  return decisions;
}

/** Recolecta noticias recientes */
function collectNews(g) {
  const news = [];

  // Últimas 8 de game.ext.news
  if (g.ext && Array.isArray(g.ext.news)) {
    const recent = g.ext.news.slice(-8).reverse();
    recent.forEach((n) => {
      news.push({ text: `T${n.turn} · ${n.text}`, kind: n.kind || 'info', screen: 'more', prio: 10 });
    });
  }

  // Últimas 4 de game.logs con kind war/victory/defeat/event
  const logs = (g.logs || []).filter((l) => ['war', 'victory', 'defeat', 'event'].includes(l.kind)).slice(-4).reverse();
  logs.forEach((l) => {
    news.push({ text: `T${l.turn} · ${l.text}`, kind: l.kind, screen: 'more', prio: 5 });
  });

  return news;
}

/** Deduplica ítems por texto */
function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.text)) return false;
    seen.add(it.text);
    return true;
  });
}

/** Recolecta todos los ítems del carrusel */
function collectItems(g) {
  if (!g) return [];

  const decisions = collectDecisions(g);
  const news = collectNews(g);
  const all = [...decisions, ...news];
  const deduped = dedupe(all);

  // Ordenar por prioridad descendente
  return deduped.sort((a, b) => b.prio - a.prio);
}

/** Navega a una pantalla y opcionalmente llama a showNews */
function navigate(screen) {
  if (screen === 'more') {
    // Importar dinámicamente showNews para evitar ciclos
    import('./more.js').then((m) => {
      if (m.showNews) m.showNews();
      setState({ screen });
    }).catch(() => {
      setState({ screen });
    });
  } else {
    setState({ screen });
  }
}

/** Renderiza el carrusel */
function renderTicker(items, currentIdx) {
  if (items.length === 0) return null;

  const item = items[currentIdx];
  const isDecision = item.prio >= 50;
  const ic = ICON_MAP[item.kind] || 'info';

  // Contenedor principal
  const ticker = h('div', { class: 'news-ticker', role: 'region', 'aria-live': 'polite', 'aria-label': 'Carrusel de noticias' });

  // Pestaña izquierda
  const tag = h('div', { class: 'ticker-tag ' + (isDecision ? 'decision' : 'news') },
    isDecision ? 'DECISIÓN' : 'ÚLTIMA HORA');

  // Centro: ítem actual
  const content = h('button', {
    class: 'ticker-content',
    'aria-label': item.text,
    title: item.text,
    onclick: () => navigate(item.screen),
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
