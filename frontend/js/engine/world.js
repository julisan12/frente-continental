// Tanda 4: noticias internacionales y accidentes mundiales. Solo JS (game.ext.world / game.ext.news).
// Interfaz estandar de modulo: {init, action, turn, pending}.
import * as S from './state.js';
import { clampN, news, alive, aliveIds, nameOf, ensure, ok, err } from './extutil.js';

export const NEWS_MAX = 60;
const ACC_CHANCE = 0.14;

const KINDS = [
  { id: 'terremoto', label: 'Terremoto', text: 'Un sismo devastador sacude' },
  { id: 'huracan', label: 'Huracán', text: 'Un huracán arrasa las costas de' },
  { id: 'inundacion', label: 'Inundaciones', text: 'Lluvias torrenciales anegan' },
  { id: 'sequia', label: 'Sequía', text: 'Una sequía histórica castiga' },
  { id: 'epidemia', label: 'Epidemia', text: 'Un brote epidémico se extiende por' },
  { id: 'volcan', label: 'Erupción volcánica', text: 'Un volcán entra en erupción en' },
];

// money en unidades del motor (-40 = $400 M)
export const OPTIONS = {
  full: { id: 'full', name: 'Ayuda completa', money: -40, rel: 15, rel3: 4, stab: -1, prestige: 6,
    pros: 'Gran prestigio y +15 relación con el afectado; sus aliados te ven bien.',
    cons: '−$400 M y −1 estabilidad por el gasto.' },
  partial: { id: 'partial', name: 'Ayuda parcial', money: -20, rel: 8, rel3: 2, stab: 0, prestige: 3,
    pros: '+8 relación y algo de prestigio.', cons: '−$200 M.' },
  minimal: { id: 'minimal', name: 'Ayuda mínima', money: -8, rel: 3, rel3: 0, stab: 0, prestige: 1,
    pros: 'Gesto simbólico barato (+3 relación).', cons: '−$80 M; casi sin efecto.' },
  none: { id: 'none', name: 'No ayudar', money: 0, rel: -6, rel3: -2, stab: 1, prestige: -3,
    pros: 'Conservas la caja y +1 estabilidad interna.', cons: '−6 relación con el afectado, −3 prestigio.' },
};
const ORDER = ['full', 'partial', 'minimal', 'none'];

function W(game) {
  const e = ensure(game, 'ext', () => ({}));
  return ensure(e, 'world', () => ({ pending: null, prestige: {}, seen: null, history: [] }));
}

const wkey = (w) => [w.a, w.b].sort().join('|');
const tkey = (t) => `${t.type}:${[t.a, t.b].sort().join('|')}`;

function snapshot(game) {
  const ids = aliveIds(game);
  return {
    wars: (game.wars || []).map(wkey),
    treaties: (game.treaties || []).map(tkey),
    alive: ids,
    low: ids.filter((c) => game.countries[c] && game.countries[c].stability <= 20),
  };
}

export function init(game) {
  const w = W(game);
  if (!w.seen) w.seen = snapshot(game);
  if (!Array.isArray(game.ext.news)) game.ext.news = [];
}

function pushNews(game, text, kind) {
  news(game, text, kind);
  const n = game.ext.news;
  if (n.length > NEWS_MAX) n.splice(0, n.length - NEWS_MAX);
}

const TREATY_LABEL = {
  alliance: 'una alianza', trade: 'un pacto comercial', nap: 'un pacto de no agresión',
  non_aggression: 'un pacto de no agresión', military_access: 'un acuerdo de paso militar',
};

function worldNews(game) {
  const w = W(game);
  const prev = w.seen || snapshot(game);
  const cur = snapshot(game);
  const nm = (c) => nameOf(game, c);
  for (const k of cur.wars) {
    if (!prev.wars.includes(k)) {
      const [a, b] = k.split('|');
      pushNews(game, `Estalla la guerra entre ${nm(a)} y ${nm(b)}.`, 'war');
    }
  }
  for (const k of prev.wars) {
    if (!cur.wars.includes(k)) {
      const [a, b] = k.split('|');
      pushNews(game, `Cese de hostilidades entre ${nm(a)} y ${nm(b)}.`, 'dip');
    }
  }
  for (const t of game.treaties || []) {
    if (!prev.treaties.includes(tkey(t))) {
      pushNews(game, `${nm(t.a)} y ${nm(t.b)} firman ${TREATY_LABEL[t.type] || 'un tratado'}.`, 'dip');
    }
  }
  for (const c of prev.alive) {
    if (!cur.alive.includes(c)) pushNews(game, `${nm(c)} cae: su territorio es ocupado.`, 'war');
  }
  for (const c of cur.low) {
    if (!prev.low.includes(c)) pushNews(game, `Crisis política en ${nm(c)}: disturbios y riesgo de golpe de Estado.`, 'unrest');
  }
  for (const c of prev.low) {
    if (cur.alive.includes(c) && !cur.low.includes(c)) pushNews(game, `${nm(c)} recupera la calma tras la crisis.`, 'info');
  }
  w.seen = cur;
}

function addPrestige(w, cid, d) { w.prestige[cid] = clampN((w.prestige[cid] || 0) + d, -50, 200); }

function applyAid(game, donor, victim, opt) {
  const w = W(game);
  const o = OPTIONS[opt];
  const c = game.countries[donor];
  if (c) {
    c.money = (c.money || 0) + o.money;
    c.stability = clampN(c.stability + o.stab, 0, 100);
  }
  S.add_rel(game, donor, victim, o.rel);
  if (o.rel3) {
    for (const ally of S.allies_of(game, victim)) {
      if (ally !== donor && alive(game, ally)) S.add_rel(game, donor, ally, o.rel3);
    }
  }
  addPrestige(w, donor, o.prestige);
  const v = game.countries[victim];
  if (v && o.money < 0) {
    v.money = (v.money || 0) - o.money * 0.5;
    v.stability = clampN(v.stability + Math.round(-o.money / 8), 0, 100);
  }
}

function rollAccident(game, rng) {
  const w = W(game);
  if (w.pending || rng.random() >= ACC_CHANCE) return;
  const ids = aliveIds(game);
  if (ids.length < 2) return;
  const victim = ids[Math.floor(rng.random() * ids.length)];
  const kind = KINDS[Math.floor(rng.random() * KINDS.length)];
  const dmg = 3 + Math.floor(rng.random() * 6);
  const vc = game.countries[victim];
  vc.stability = clampN(vc.stability - dmg, 0, 100);
  vc.money = (vc.money || 0) - dmg * 3;
  const title = `${kind.label} en ${nameOf(game, victim)}`;
  const text = `${kind.text} ${nameOf(game, victim)}. Miles de damnificados piden ayuda internacional.`;
  pushNews(game, `${title}: la comunidad internacional evalúa enviar ayuda.`, 'disaster');
  for (const d of ids) {
    if (d === game.player || d === victim) continue;
    const rel = S.get_rel(game, d, victim);
    const rich = (game.countries[d].money || 0) > 60;
    let opt = 'none';
    if (rel >= 40 && rich) opt = 'partial';
    else if (rel >= 15 && rng.random() < 0.6) opt = 'minimal';
    else if (rich && rng.random() < 0.2) opt = 'minimal';
    if (opt !== 'none') applyAid(game, d, victim, opt);
  }
  if (victim === game.player) return; // el propio jugador recibe ayuda; no decide
  w.pending = {
    id: `acc-${game.turn}`, turn: game.turn, country: victim, kind: kind.id, title, text,
    options: ORDER.map((id) => ({ id, text: OPTIONS[id].name, pros: OPTIONS[id].pros, cons: OPTIONS[id].cons, money: OPTIONS[id].money })),
  };
}

function resolve(game, opt, auto) {
  const w = W(game);
  const p = w.pending;
  if (!p) return err('No hay accidente pendiente.');
  if (!OPTIONS[opt]) return err('Opción inválida.');
  const me = game.countries[game.player];
  if (OPTIONS[opt].money < 0 && (me.money || 0) + OPTIONS[opt].money < 0) return err('Caja insuficiente para esa ayuda.');
  applyAid(game, game.player, p.country, opt);
  const o = OPTIONS[opt];
  const txt = `${p.title}: ${auto ? 'sin respuesta, se envía ' : 'decisión: '}${o.name.toLowerCase()}.`;
  pushNews(game, txt, 'disaster');
  w.history.push({ turn: game.turn, country: p.country, kind: p.kind, option: opt });
  if (w.history.length > 30) w.history.shift();
  w.pending = null;
  return ok(txt);
}

export function action(game, b) {
  switch (b.action) {
    case 'world_resolve': return resolve(game, b.option, false);
    case 'world_news': return ok('Noticias', { news: (game.ext.news || []).slice(-NEWS_MAX) });
    default: return null;
  }
}

export function turn(game, rng, lines) {
  const w = W(game);
  if (w.pending) {
    const me = game.countries[game.player];
    const r = resolve(game, (me.money || 0) >= 8 ? 'minimal' : 'none', true);
    if (r.ok && lines) lines.push(r.msg);
  }
  worldNews(game);
  rollAccident(game, rng);
  if (w.pending && lines) lines.push(`Accidente mundial: ${w.pending.title}. Decide tu ayuda.`);
}

export function pending(game) {
  const p = game.ext && game.ext.world && game.ext.world.pending;
  return p ? [{ text: `${p.title}: decidir ayuda internacional`, kind: 'event', screen: 'more' }] : [];
}
