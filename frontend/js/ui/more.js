// Pantalla "Mas": noticias y eventos, partida, ajustes y ayuda.
import { tabStrip } from './tabs.js';
import { h, svgEl, fmtNum, toast } from '../util.js';
import { icon } from '../icons.js';
import { getState, setState, eventChoice, cname } from '../state.js';
import { getServer, setServer, health, baseUrl, isMock } from '../api.js';
import { newGameFlow, victoryRows } from './modals.js';
import { settingsForm } from './settings.js';
import { lsGet, lsSet } from './sound.js';
import { showTutorial } from './tutorial.js';
import { openQuickSettings } from './map.js';

// features.js lo crea otro agente: carga dinámica para no romper el enlazado de módulos.
let F = {};
import('../engine/features.js').then((m) => { F = m; }).catch(() => {});

let tab = 'news';
export function showNews() { tab = 'news'; }
const TABS = [['news', 'Noticias'], ['poder', 'Poder'], ['guia', 'Guía'], ['diario', 'Diario'], ['game', 'Partida'], ['set', 'Ajustes'], ['help', 'Ayuda']];
let newsKind = 'all';
const KINDS = [['all', 'Todo'], ['info', 'Info'], ['war', 'Guerra'], ['eco', 'Economía'], ['dip', 'Diplomacia'], ['spy', 'Espionaje'], ['tech', 'Tecnología']];
const COLORS = ['var(--gold)', 'var(--green-l)', 'var(--rust)', 'var(--amber)'];
const noExt = () => h('div', { class: 'empty' }, 'Disponible en modo sin conexión (local).');
const seenKey = (g) => 'fc.newsSeen.' + g.id;
const extNews = (g) => (g.ext && Array.isArray(g.ext.news) ? g.ext.news : []);

const optText = (o) => (typeof o === 'string' ? o : (o && (o.text || o.label || o.name || o.id)) || '');
const optKey = (o, i) => (typeof o === 'string' ? o : (o && (o.id != null ? o.id : o.key != null ? o.key : i)));

function eventCard(ev) {
  const opts = ev.options || ev.choices || [];
  return h('div', { class: 'panel stack' },
    h('h3', { class: 'tag-uc' }, 'Evento: ' + (ev.title || ev.name || 'Decisión pendiente')),
    h('p', null, ev.text || ev.description || ev.body || ''),
    opts.map((o, i) => h('button', { class: 'btn block', onclick: () => eventChoice(optKey(o, i)) },
      icon('check'), h('span', { class: 'grow' }, optText(o)),
      o && typeof o === 'object' && o.effect ? h('span', { class: 'muted small' }, o.effect) : null)));
}

function inbox(g) {
  if (!g.ext) return null;
  const all = extNews(g).slice().reverse();
  const list = all.filter((n) => newsKind === 'all' || n.kind === newsKind).slice(0, 60);
  return h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Bandeja'),
    h('div', { class: 'pills' }, KINDS.map(([k, l]) => h('button', { class: 'pill', 'aria-pressed': String(newsKind === k), 'data-kind': k }, l))),
    list.length ? h('div', { class: 'list' }, list.map((n) =>
      h('div', { class: 'logline ' + (n.kind || 'info') }, h('span', { class: 'muted small' }, 'T' + n.turn + ' '), n.text)))
      : h('div', { class: 'empty' }, 'Bandeja vacía.'));
}

function news(g) {
  const logs = (g.logs || []).slice(-60).reverse();
  lsSet(seenKey(g), String(g.turn));
  return h('div', { class: 'stack' },
    g.active_event ? eventCard(g.active_event) : null,
    inbox(g),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Noticias'),
      logs.length ? h('div', { class: 'list' }, logs.map((l) =>
        h('div', { class: 'logline ' + (l.kind || 'info') }, h('span', { class: 'muted small' }, 'T' + l.turn + ' '), l.text)))
        : h('div', { class: 'empty' }, 'Sin noticias todavía.')));
}

const barCls = (v) => (v < 35 ? ' bad' : v < 60 ? ' warn' : '');
const COMP = [['eco', 'Economía'], ['mil', 'Militar'], ['terr', 'Territorio'], ['tech', 'Tecnología'], ['infl', 'Influencia']];
const safePI = (g, cid) => { try { return F.power_index(g, cid); } catch (e) { return null; } };

function chart(series) {
  const W = 320, H = 160, L = 28, R = 8, T = 8, B = 20;
  const turns = series.flatMap((s) => s.pts.map((p) => p.turn));
  if (!turns.length) return h('div', { class: 'empty' }, 'Sin historial todavía.');
  const t0 = Math.min(...turns), t1 = Math.max(...turns, t0 + 1);
  const X = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - v / 100) * (H - T - B);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Evolución del índice de poder' });
  [0, 50, 100].forEach((v) => {
    svg.append(svgEl('line', { class: 'ax', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }),
      svgEl('text', { class: 'tx', x: L - 4, y: Y(v) + 3, 'text-anchor': 'end' }, String(v)));
  });
  [t0, Math.round((t0 + t1) / 2), t1].forEach((t) => svg.append(svgEl('text', { class: 'tx', x: X(t), y: H - 6, 'text-anchor': 'middle' }, 'T' + t)));
  series.forEach((s, i) => {
    const pts = s.pts.map((p) => `${X(p.turn).toFixed(1)},${Y(p.total).toFixed(1)}`).join(' ');
    svg.append(svgEl('polyline', { points: pts, fill: 'none', style: `stroke:${COLORS[i % COLORS.length]};stroke-width:${i === 0 ? 2.6 : 1.6}`, 'stroke-linejoin': 'round' }));
  });
  return svg;
}

function poder(g) {
  if (!g.ext) return noExt();
  const pid = g.player;
  const pi = safePI(g, pid);
  const hist = g.ext.power || {};
  const rivals = Object.keys(hist).filter((c) => c !== pid && (hist[c] || []).length)
    .sort((a, b) => hist[b][hist[b].length - 1].total - hist[a][hist[a].length - 1].total).slice(0, 3);
  const series = [{ id: pid, pts: (hist[pid] || []).slice(-60) }, ...rivals.map((c) => ({ id: c, pts: hist[c].slice(-60) }))];
  const region = Object.values(F.REGIONS || {}).find((r) => (r.ids || []).includes(pid)) || null;
  const rows = region ? region.ids.map((c) => ({ id: c, v: (safePI(g, c) || {}).total })).filter((r) => r.v != null).sort((a, b) => b.v - a.v) : [];
  const unlocked = {};
  ((g.ext.ach || {})[pid] || []).forEach((a) => { unlocked[a.id] = a.turn; });
  const ACH = F.ACHIEVEMENTS || [];
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Índice de poder'),
      pi ? h('div', { class: 'stack' },
        h('div', { class: 'cards' }, h('div', { class: 'card' }, h('div', { class: 't' }, 'Total'), h('div', { class: 'n' }, fmtNum(pi.total)))),
        COMP.map(([k, l]) => h('div', { class: 'stack', style: { gap: '2px' } },
          h('div', { class: 'small', style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { class: 'muted' }, l), h('span', null, fmtNum(pi[k]))),
          h('div', { class: 'bar' + barCls(pi[k]) }, h('i', { style: { width: Math.max(0, Math.min(100, pi[k] || 0)) + '%' } })))))
        : h('div', { class: 'empty' }, 'Sin datos.')),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Evolución'),
      chart(series),
      h('div', { class: 'legend' }, series.map((s, i) => h('span', null, h('i', { style: { background: COLORS[i % COLORS.length] } }), cname(s.id))))),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Ranking regional' + (region ? ': ' + region.name : '')),
      rows.length ? h('table', { class: 'rtable' }, h('tbody', null, rows.map((r, i) =>
        h('tr', { class: r.id === pid ? 'me' : '' }, h('td', null, String(i + 1)), h('td', null, cname(r.id)), h('td', null, fmtNum(r.v))))))
        : h('div', { class: 'empty' }, 'Sin región.')),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, `Logros (${Object.keys(unlocked).length}/${ACH.length})`),
      ACH.length ? h('div', { class: 'list' }, ACH.map((a) => h('div', { class: 'item ach' + (unlocked[a.id] != null ? '' : ' locked') },
        icon(unlocked[a.id] != null ? 'star' : 'close'),
        h('span', { class: 'grow' }, h('div', null, a.name), h('div', { class: 'muted small' }, a.desc)),
        unlocked[a.id] != null ? h('span', { class: 'pill ok' }, 'T' + unlocked[a.id]) : h('span', { class: 'pill' }, 'Bloqueado'))))
        : h('div', { class: 'empty' }, 'Sin logros.')));
}

function tips(g) {
  const c = (g.countries || {})[g.player] || {};
  const ext = g.ext || {};
  const out = [];
  if (c.stability != null && c.stability < 40) out.push(['alert', `Estabilidad baja (${Math.round(c.stability)}%). Refuerza el gasto social para evitar golpes.`, 'Economía', 'economy']);
  if (c.money != null && c.money < 50) out.push(['coins', 'Tu tesorería es escasa. Revisa el presupuesto antes de lanzar proyectos.', 'Economía', 'economy']);
  const tk = ext.techs && typeof ext.techs === 'object' ? (ext.techs[g.player] || ext.techs) : null;
  if (tk && typeof tk === 'object' && !tk.cur) out.push(['school', 'No tienes investigación seleccionada.', 'Investigar', 'economy']);
  const pol = ext.policy && typeof ext.policy === 'object' ? (ext.policy[g.player] || ext.policy) : null;
  if (pol && typeof pol === 'object' && !pol.focus && !pol.focus_id) out.push(['flag', 'Aún no has elegido un enfoque nacional.', 'Elegir enfoque', 'economy']);
  const wars = (g.wars || []).filter((w) => w.a === g.player || w.b === g.player);
  const troops = g.summary && g.summary.forces && g.summary.forces.troops;
  if (wars.length && troops != null && troops < 30) out.push(['swords', 'Estás en guerra con un ejército débil. Recluta o busca la paz.', 'Ejército', 'army']);
  const seen = parseInt(lsGet(seenKey(g)) || '0', 10) || 0;
  const unread = extNews(g).filter((n) => n.turn > seen).length;
  if (unread) out.push(['news', `Tienes ${unread} noticia${unread === 1 ? '' : 's'} sin leer.`, 'Leer', 'news']);
  if (ext.blocs !== undefined && !(g.treaties || []).some((t) => t.type === 'alliance' && (t.a === g.player || t.b === g.player))) out.push(['rings', 'Sin aliados ni bloque: la diplomacia puede abrir oportunidades.', 'Diplomacia', 'diplomacy']);
  return out.slice(0, 6);
}

function guia(g, el) {
  const list = g.ext ? tips(g) : [];
  const oas = g.ext && Array.isArray(g.ext.oas) ? g.ext.oas.slice().reverse() : [];
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Asesor'),
      !g.ext ? noExt() : list.length ? list.map(([ic, txt, lbl, scr]) => h('div', { class: 'tip' }, icon(ic), h('span', { class: 'grow' }, txt),
        h('button', { class: 'btn', onclick: () => { if (scr === 'news') { tab = 'news'; render(el); } else setState({ screen: scr }); } }, lbl)))
        : h('div', { class: 'empty' }, 'Todo en orden, comandante.'),
      h('button', { class: 'btn block', onclick: () => showTutorial(true) }, icon('info'), 'Ver tutorial')),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Votaciones de la OEA'),
      !g.ext ? noExt() : oas.length ? h('div', { class: 'list' }, oas.map((o) => h('div', { class: 'item' },
        h('span', { class: 'grow' }, h('div', null, String(o.topic)), h('div', { class: 'muted small' }, `T${o.turn} · Sí ${o.yes} / No ${o.no}`)),
        h('span', { class: 'pill ' + (/aprob|pas|yes|si|sí/i.test(String(o.result)) ? 'ok' : 'no') }, String(o.result)))))
        : h('div', { class: 'empty' }, 'Sin votaciones.')));
}

let diaryTimer = null;
function diario(g) {
  const key = 'fc.diary.' + g.id;
  const ta = h('textarea', { class: 'diary', placeholder: 'Notas de campaña...', 'aria-label': 'Diario' });
  ta.value = lsGet(key) || '';
  const st = h('span', { class: 'muted small' }, '');
  ta.addEventListener('input', () => {
    clearTimeout(diaryTimer);
    diaryTimer = setTimeout(() => { lsSet(key, ta.value); st.textContent = 'Guardado'; }, 500);
  });
  const key_ = extNews(g).filter((n) => n.kind && n.kind !== 'info').slice(-40).reverse();
  return h('div', { class: 'stack' },
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Diario'), ta, st),
    h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Cronología'),
      !g.ext ? noExt() : key_.length ? h('div', { class: 'list' }, key_.map((n) =>
        h('div', { class: 'logline ' + n.kind }, h('span', { class: 'muted small' }, 'T' + n.turn + ' '), n.text)))
        : h('div', { class: 'empty' }, 'Sin hechos clave.')));
}

export function serverForm(onDone) {
  const input = h('input', { class: 'field', type: 'url', placeholder: 'http://10.0.2.2:8000', value: getServer() || '', 'aria-label': 'URL del servidor', autocomplete: 'off' });
  const out = h('div', { class: 'muted small', role: 'status' }, 'Servidor actual: ' + (isMock ? 'motor local (demo)' : baseUrl()));
  const test = async () => {
    setServer(input.value.trim());
    out.textContent = 'Probando conexión...';
    try {
      const r = await health({ quiet: true });
      // api.req() no lanza: devuelve null si falla
      if (!r || r.ok === false) throw new Error('sin respuesta');
      out.textContent = 'Conexión correcta' + (r && r.version ? ' (versión ' + r.version + ')' : '') + '.';
      toast('Conexión correcta', 'ok');
      if (onDone) onDone(true);
    } catch (e) {
      out.textContent = 'No se pudo conectar con ' + baseUrl() + '.';
      if (onDone) onDone(false);
    }
  };
  return h('div', { class: 'stack' },
    h('label', { class: 'small muted' }, 'URL del servidor'), input,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: test }, icon('globe'), 'Guardar y probar'),
      h('button', { class: 'btn', onclick: () => { setServer(''); input.value = ''; out.textContent = 'Servidor restablecido: ' + baseUrl(); } }, 'Restablecer')),
    out);
}

const HELP = [
  ['Índice de poder', 'La pestaña Poder resume tu fuerza (0-100) en economía, militar, territorio, tecnología e influencia, la compara con los rivales y muestra el ranking regional y tus logros.'],
  ['Asesor y guía', 'La pestaña Guía da consejos según tu situación, con atajos a la pantalla indicada, el tutorial y las votaciones de la OEA.'],
  ['Diario y bandeja', 'El Diario guarda tus notas por partida. La Bandeja de Noticias filtra los sucesos por tipo: guerra, economía, diplomacia, espionaje y tecnología.'],
  ['Probabilidad de batalla', 'El informe de turno muestra una probabilidad estimada de victoria en cada batalla, calculada con el ataque y la defensa.'],
  ['Sonido y daltonismo', 'En Ajustes puedes activar el sonido y el modo daltónico, que cambia los colores a una paleta más distinguible.'],
  ['Objetivo', 'Conduce a tu país por la Latinoamérica de 1962. Crece, forma alianzas y, si es necesario, conquista territorio vecino.'],
  ['Turnos', 'Cada turno das órdenes y pulsas Finalizar turno. Las órdenes se ejecutan juntas, la IA mueve y se muestra un informe. Puedes deshacer la última orden con el botón de deshacer.'],
  ['Economía', 'El dinero sube con la industria y el desarrollo y baja con el presupuesto. Reparte el 100% entre Ejército, Social, Infraestructura e Industria. Los proyectos tardan varios turnos.'],
  ['Estabilidad', 'Si baja demasiado habrá protestas y golpes. Los programas sociales y la paz la sostienen; la guerra y el déficit la erosionan.'],
  ['Ejército', 'Recluta tropas, tanques y aviones, y agrúpalos en divisiones. Mover, Atacar, Defender, Reorganizar o Establecer frente. Solo puedes atacar territorios vecinos que no sean tuyos ni de aliados.'],
  ['Diplomacia', 'Propón alianzas, pactos de no agresión y acuerdos comerciales; envía recursos para mejorar la relación. Romper tratados o declarar la guerra tiene costo político.'],
  ['Mapa', 'Toca un país para ver su ficha. Arrastra para moverte y usa dos dedos o los botones +/- para acercar. Dorado: tuyo; verde oliva: aliados; rojo óxido: enemigos.'],
];

export function render(el) {
  const g = getState().game;
  el.replaceChildren();
  const tabs = tabStrip('more', TABS, tab, (id) => { tab = id; render(el); });
  let body;
  if (tab === 'news') body = g ? news(g) : h('div', { class: 'empty' }, 'Sin partida.');
  else if (tab === 'poder') body = g ? poder(g) : h('div', { class: 'empty' }, 'Sin partida.');
  else if (tab === 'guia') body = g ? guia(g, el) : h('div', { class: 'empty' }, 'Sin partida.');
  else if (tab === 'diario') body = g ? diario(g) : h('div', { class: 'empty' }, 'Sin partida.');
  else if (tab === 'game') {
    body = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Partida'),
      g ? h('div', { class: 'muted small' }, `Turno ${g.turn}${g.max_turns ? '/' + g.max_turns : ''} · ${g.date}`) : null,
      g && g.victory_progress ? h('div', { class: 'stack' }, h('h3', { class: 'tag-uc' }, 'Progreso hacia la victoria'), victoryRows(g.victory_progress)) : null,
      g && g.ranking && g.ranking.length ? h('div', { class: 'stack', style: { background: 'var(--panel2)', borderRadius: '8px', padding: '8px' } },
        h('h3', { class: 'tag-uc' }, 'Ranking'),
        g.ranking.map((r, i) => h('div', { class: 'small', style: { display: 'flex', justifyContent: 'space-between', color: r.id === g.player ? 'var(--brass)' : 'inherit' } }, h('span', null, `${i + 1}. ${r.name}`), h('span', null, String(r.score))))) : null,
      h('button', { class: 'btn block danger', onclick: () => newGameFlow(false) }, icon('flag'), 'Nueva partida'));
  } else if (tab === 'set') body = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Ajustes'),
    h('button', { class: 'btn block', onclick: () => { setState({ screen: 'map' }); openQuickSettings(); } }, icon('settings'), 'Ajustes rápidos (cajón del mapa)'),
    settingsForm((ok, changed) => { if (ok && changed) location.reload(); }));
  else body = h('div', { class: 'panel stack' }, h('h3', { class: 'tag-uc' }, 'Reglas'),
    HELP.map(([t, x]) => h('details', null, h('summary', null, t), h('p', { class: 'helptxt' }, x))));
  el.append(h('h2', null, 'Más'), tabs, body);
  body.querySelectorAll('button.pill[data-kind]').forEach((b) => b.addEventListener('click', () => { newsKind = b.dataset.kind; render(el); }));
}
