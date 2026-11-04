// Tanda 3, trabajador F: pantalla «Por mi cuenta» (decisiones y tareas pendientes del jugador), accesible desde la
// barra inferior. Sustituye las «DECISIÓN» del carrusel superior, que pasa a mostrar solo noticias.
// API: render(el) pinta la pantalla; countTasks(game) -> número de tareas urgentes + pendientes (insignia de la
// barra inferior); collectDecisions(game) -> [{text, kind, screen, prio}] (prio >= 80 urgente, 40-79 pendiente,
// < 40 sugerencia); groupTasks(game) -> {urgent, pending, ideas}.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState } from '../state.js';

// features.js lo mantiene otro agente: carga dinámica para no romper el enlazado de módulos.
let F = {};
import('../engine/features.js').then((m) => { F = m; }).catch(() => {});

const ICON_MAP = {
  war: 'sword', eco: 'coins', dip: 'rings', spy: 'target', tech: 'lab', supply: 'shortage', unrest: 'fire',
  mil: 'shield', info: 'news', victory: 'star', defeat: 'close', event: 'alert', alert: 'alert', unit: 'platoon',
};
export const kindIcon = (k) => ICON_MAP[k] || 'info';

const URGENT = 80;
const PENDING = 40;

/** Recolecta las decisiones y tareas pendientes del jugador (ordenadas de mayor a menor prioridad). */
export function collectDecisions(g) {
  const out = [];
  if (!g || !g.countries) return out;
  const me = g.player;
  const c = g.countries[me];
  if (!c) return out;
  const ext = g.ext;

  if (g.active_event) out.push({ text: 'Evento pendiente: resolver decisión', kind: 'alert', screen: 'more', prio: 100 });

  if (ext && Array.isArray(ext.oas)) {
    const pending = ext.oas.find((o) => !o.player_vote && o.turn === g.turn);
    if (pending) out.push({ text: 'Votación de la OEA pendiente', kind: 'dip', screen: 'diplomacy', prio: 90 });
  }

  if (ext && ext.techs && ext.techs[me] && ext.techs[me].cur == null) {
    const labs = ext.labs && ext.labs[me] ? ext.labs[me] : 0;
    if (labs > 0) out.push({ text: 'Sin investigación seleccionada', kind: 'tech', screen: 'economy', prio: 70 });
  }

  if (ext && ext.policy && ext.policy[me] && ext.policy[me].focus == null && ext.policy[me].focus_id == null) {
    out.push({ text: 'Sin enfoque nacional activo', kind: 'eco', screen: 'economy', prio: 75 });
  }

  if (ext && Array.isArray(ext.pacts)) {
    const expiring = ext.pacts.filter((p) => (p.a === me || p.b === me) && p.until && p.until <= g.turn + 2);
    if (expiring.length) {
      const other = expiring[0].a === me ? expiring[0].b : expiring[0].a;
      const name = (g.countries[other] && g.countries[other].name) || other;
      out.push({ text: `Pacto con ${name} expira pronto${expiring.length > 1 ? ` (y ${expiring.length - 1} más)` : ''}`, kind: 'dip', screen: 'diplomacy', prio: 60 });
    }
  }

  const sm = g.summary || {};
  const dMoney = sm.deltas && sm.deltas.money != null ? sm.deltas.money : 0;
  if (c.money < 20) out.push({ text: 'Tesorería crítica: quedan pocos fondos', kind: 'eco', screen: 'economy', prio: 85 });
  else if (sm.balance != null && sm.balance < 0 && dMoney < 0) out.push({ text: 'Déficit: el ejército cuesta más de lo que ingresas', kind: 'eco', screen: 'economy', prio: 80 });

  const weak = (g.divisions || []).filter((d) => d.owner === me && d.org != null && d.org < 40);
  if (weak.length) out.push({ text: weak.length === 1 ? `${weak[0].name} necesita reorganizarse` : `${weak.length} divisiones con poca organización`, kind: 'mil', screen: 'army', prio: 50 });

  if (g.turn > 1 && !(g.orders || []).length) out.push({ text: 'Sin órdenes para el turno', kind: 'info', screen: 'map', prio: 30 });

  // Pendientes del motor ampliado (obras, reclutar, escasez, descontento, producciones...).
  let canBuild = 0;
  try {
    const pend = F && typeof F.ext_pending === 'function' ? F.ext_pending(g) : [];
    (Array.isArray(pend) ? pend : []).forEach((p) => {
      if (!p || !p.text) return;
      if (/^Puedes construir/.test(p.text)) { canBuild++; return; }
      out.push({ text: p.text, kind: p.kind || 'alert', screen: p.screen || 'more', prio: p.kind === 'supply' || p.kind === 'unrest' ? 82 : 60 });
    });
  } catch (e) { /* módulo opcional */ }
  if (canBuild) out.push({ text: `Tienes ${canBuild} ${canBuild === 1 ? 'provincia' : 'provincias'} donde puedes construir`, kind: 'eco', screen: 'map', prio: 25 });

  const seen = new Set();
  return out.filter((t) => (seen.has(t.text) ? false : seen.add(t.text))).sort((a, b) => b.prio - a.prio);
}

export function groupTasks(g) {
  const all = collectDecisions(g);
  return {
    urgent: all.filter((t) => t.prio >= URGENT),
    pending: all.filter((t) => t.prio >= PENDING && t.prio < URGENT),
    ideas: all.filter((t) => t.prio < PENDING),
  };
}

/** Número de tareas urgentes + pendientes. */
export function countTasks(game) {
  if (!game) return 0;
  const t = groupTasks(game);
  return t.urgent.length + t.pending.length;
}

/** Cuenta tareas urgentes+pendientes por pantalla destino (insignias de la barra inferior). */
export function countByScreen(game) {
  const counts = {};
  collectDecisions(game).filter((t) => t.prio >= PENDING).forEach((t) => { counts[t.screen] = (counts[t.screen] || 0) + 1; });
  return counts;
}

/** Navega a la pantalla indicada; «more» abre la pestaña Noticias. */
export function goTo(screen) {
  if (screen === 'more') {
    import('./more.js').then((m) => { if (m.showNews) m.showNews(); setState({ screen }); }).catch(() => setState({ screen }));
  } else setState({ screen });
}

const GROUPS = [['urgent', 'Urgente', 'urgent'], ['pending', 'Pendiente', 'pending'], ['ideas', 'Sugerencias', 'idea']];

export function render(el) {
  const g = getState().game;
  el.replaceChildren();
  if (!g) return;
  const groups = groupTasks(g);
  const total = groups.urgent.length + groups.pending.length + groups.ideas.length;
  el.append(h('div', { class: 'stack tasks' },
    h('h2', { class: 'tasks-title' }, 'Por mi cuenta'),
    h('p', { class: 'muted small' }, 'Lo que requiere tu atención antes de finalizar el turno.'),
    total === 0 ? h('div', { class: 'empty' }, 'Nada pendiente: puedes finalizar el turno.') : null,
    GROUPS.map(([key, label, cls]) => (groups[key].length ? h('section', { class: 'task-group ' + cls },
      h('h3', { class: 'task-hd' }, label, h('span', { class: 'task-n' }, String(groups[key].length))),
      groups[key].map((t) => h('div', { class: 'task ' + cls },
        h('span', { class: 'task-ic' }, icon(kindIcon(t.kind))),
        h('span', { class: 'task-tx' }, t.text),
        h('button', { class: 'btn sm task-go', 'aria-label': 'Ir: ' + t.text, onclick: () => goTo(t.screen) }, 'Ir')))) : null))));
}
