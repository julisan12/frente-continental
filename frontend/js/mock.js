// API simulada en el navegador (?mock=1). Simple: sirve para probar la interfaz sin backend.
import { relKey } from './util.js';

let MAP = null;
let GAME = null;
const KEY = 'fc_mock_game';
const err = (detail, status = 400) => { throw { status, detail }; };
const clone = (o) => JSON.parse(JSON.stringify(o));

async function loadMap() {
  if (MAP) return MAP;
  const tries = ['/api/map', new URL('../backend/app/data/countries.json', location.href).href, new URL('../../backend/app/data/countries.json', location.href).href];
  for (const u of tries) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j)) MAP = { viewBox: '0 0 500 535', countries: j };
      else if (j && j.countries) MAP = j;
      if (MAP) return MAP;
    } catch { /* siguiente */ }
  }
  const ids = ['Alfa', 'Beta', 'Gama', 'Delta'];
  const cols = ['#c9a24d', '#7b8a4a', '#9a6a5a', '#5a7a9a'];
  MAP = {
    viewBox: '0 0 500 535',
    countries: ids.map((id, i) => {
      const x = 60 + (i % 2) * 190, y = 60 + Math.floor(i / 2) * 200;
      return {
        id, name: id, color: cols[i], path: `M${x} ${y}L${x + 180} ${y}L${x + 180} ${y + 190}L${x} ${y + 190}Z`,
        neighbors: ids.filter((_, j) => Math.abs(j - i) === 1 || Math.abs(j - i) === 2).filter((o) => o !== id),
        sea: [], power: 3 + i, alignment: 'no_alineado', resources: ['petróleo'],
      };
    }),
  };
  return MAP;
}

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(GAME)); } catch { /* nada */ } };
function load() {
  if (GAME) return GAME;
  try { GAME = JSON.parse(localStorage.getItem(KEY)); } catch { GAME = null; }
  return GAME;
}

function newGame(player) {
  const cs = {}, divisions = [];
  MAP.countries.forEach((m) => {
    const p = m.power || 3;
    cs[m.id] = {
      id: m.id, name: m.name, owner: m.id, money: p * 65, industry: p * 12, production: p * 15,
      army: p * 7, tanks: p * 4, planes: p * 2, stability: 70, development: 40 + p * 3, population: p * 6,
      infrastructure: 30 + 4 * p, budget: { army: 25, social: 25, infrastructure: 25, industry: 25 },
      alignment: m.alignment, resources: m.resources || [],
    };
    for (let i = 1; i <= 2; i++) divisions.push({ id: `${m.id}-d${i}`, name: `${i}.ª División ${m.name}`, owner: m.id, location: m.id, troops: p * 3, tanks: p, planes: 0, stance: 'defend', org: 100 });
  });
  const relations = {};
  const ids = MAP.countries.map((m) => m.id);
  ids.forEach((a) => ids.forEach((b) => { if (a < b) relations[relKey(a, b)] = Math.round((Math.random() - 0.5) * 80); }));
  GAME = {
    id: 'mock-' + Date.now().toString(36), version: 1, player, turn: 1, date: 'Ene 1962', countries: cs, relations,
    treaties: [], wars: [], divisions, orders: [], projects: [], logs: [{ turn: 1, text: 'Comienza la partida (modo demo).', kind: 'info' }],
    active_event: null, ended: false, winner: null, seed: 1, summary: null,
  };
  summarize();
  save();
  return GAME;
}

function summarize(prev) {
  const c = GAME.countries[GAME.player];
  const income = Math.round(c.industry * 0.9 + c.production * 0.3);
  const expenses = Math.round(income * 0.8);
  GAME.summary = {
    income, expenses, balance: income - expenses,
    deltas: prev || { money: 0, stability: 0, industry: 0 },
  };
  GAME.max_turns = 48;
  GAME.ranking = Object.values(GAME.countries)
    .map((k) => ({ id: k.id, name: k.name, score: Math.round(k.industry || 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
}

function ordersOut() { return GAME.orders; }
const COST = { build: 100, stability: 70, recruit: 80, tanks: 120, planes: 150, project: 90 };

function addOrder(gid, o) {
  const g = GAME;
  const c = g.countries[g.player];
  if (!o || !o.type) err('Orden no válida.');
  const cost = COST[o.type] || 0;
  const committed = g.orders.reduce((a, x) => a + (x.cost || 0), 0);
  if (cost && committed + cost > c.money) return { game: clone(g), error: 'Fondos insuficientes.' };
  if (o.type === 'attack' && o.target && g.countries[o.target] && g.countries[o.target].owner === g.player) return { game: clone(g), error: 'No puedes atacar tu propio territorio.' };
  g.orders.push({ id: 'o' + Math.random().toString(36).slice(2, 8), type: o.type, target: o.target || null, division_id: o.division_id || null, cost, params: o.params || {} });
  save();
  return { game: clone(g) };
}

function applyOrders() {
  const g = GAME, c = g.countries[g.player];
  const lines = [], battles = [];
  g.orders.forEach((o) => {
    c.money -= o.cost || 0;
    const t = o.target ? (MAP.countries.find((m) => m.id === o.target) || {}).name : '';
    switch (o.type) {
      case 'build': c.industry += 4; lines.push('Se construyó nueva industria.'); break;
      case 'stability': c.stability = Math.min(100, c.stability + 6); lines.push('Programa de estabilidad aplicado.'); break;
      case 'recruit': c.army += 5; lines.push('Nuevos reclutas se incorporan al ejército.'); break;
      case 'tanks': c.tanks += 3; lines.push('Nuevos tanques entregados.'); break;
      case 'planes': c.planes += 2; lines.push('Nuevos aviones entregados.'); break;
      case 'project': {
        const total = 3;
        g.projects.push({ id: 'p' + Math.random().toString(36).slice(2, 6), owner: g.player, kind: o.params.kind || 'factory', name: o.params.kind || 'obra', turns_left: total, total_turns: total, cost: o.cost });
        lines.push('Inicia un proyecto de construcción.'); break;
      }
      case 'declare_war': g.wars.push({ a: g.player, b: o.target, since_turn: g.turn }); lines.push('Guerra declarada a ' + t + '.'); break;
      case 'propose_alliance':
        if (Math.random() < 0.5) { g.treaties.push({ type: 'alliance', a: g.player, b: o.target, since_turn: g.turn }); lines.push(t + ' acepta la alianza.'); } else lines.push(t + ' rechaza la alianza.');
        break;
      case 'nap': case 'trade':
        g.treaties.push({ type: o.type, a: g.player, b: o.target, since_turn: g.turn }); lines.push('Tratado firmado con ' + t + '.'); break;
      case 'break': g.treaties = g.treaties.filter((x) => !(x.type === (o.params.treaty || x.type) && [x.a, x.b].includes(o.target))); lines.push('Tratado roto con ' + t + '.'); break;
      case 'attack': {
        const win = Math.random() < 0.5;
        battles.push({ attacker: g.player, defender: o.target, location: o.target, winner: win ? g.player : o.target });
        if (win && g.countries[o.target]) g.countries[o.target].owner = g.player;
        lines.push(win ? 'Victoria en ' + t + '.' : 'El ataque a ' + t + ' fracasó.'); break;
      }
      case 'move': { const d = g.divisions.find((x) => x.id === o.division_id); if (d) d.location = o.target; break; }
      case 'defend': case 'reorganize': case 'front': {
        const d = g.divisions.find((x) => x.id === o.division_id);
        if (d) { d.stance = o.type === 'front' ? 'front' : 'defend'; if (o.type === 'reorganize') d.org = 100; }
        break;
      }
      default: break;
    }
  });
  g.orders = [];
  return { lines, battles };
}

function endTurn() {
  const g = GAME, c = g.countries[g.player];
  const before = { money: c.money, stability: c.stability, industry: c.industry };
  const rep = applyOrders();
  const s = g.summary || { income: 0, expenses: 0 };
  c.money += s.balance || 0;
  g.projects.forEach((p) => { p.turns_left -= 1; });
  g.projects.filter((p) => p.turns_left <= 0 && p.owner === g.player).forEach((p) => {
    c.infrastructure = Math.min(100, c.infrastructure + 3); c.industry += p.kind === 'factory' ? 3 : 0;
    rep.lines.push('Proyecto terminado: ' + p.name + '.');
  });
  g.projects = g.projects.filter((p) => p.turns_left > 0);
  c.stability = Math.max(0, Math.min(100, c.stability + Math.round((Math.random() - 0.5) * 4)));
  const report = { turn: g.turn, lines: rep.lines.length ? rep.lines : ['Turno sin novedades.'], battles: rep.battles };
  report.lines.forEach((t) => g.logs.push({ turn: g.turn, text: t, kind: 'info' }));
  g.turn += 1;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const idx = g.turn - 1;
  g.date = months[idx % 12] + ' ' + (1962 + Math.floor(idx / 12));
  if (Math.random() < 0.4) {
    g.active_event = { id: 'ev' + g.turn, title: 'Protestas estudiantiles', text: 'Estudiantes salen a las calles exigiendo reformas.', options: ['Negociar con los líderes (-estabilidad menor)', 'Reprimir las protestas (+orden, -relaciones)'] };
    g.logs.push({ turn: g.turn, text: 'Evento: protestas estudiantiles.', kind: 'event' });
  }
  summarize({ money: Math.round(c.money - before.money), stability: c.stability - before.stability, industry: c.industry - before.industry });
  save();
  return { game: clone(g), report };
}

function countryDetail(cid) {
  const g = GAME, c = g.countries[cid];
  if (!c) err('País no encontrado.', 404);
  const income = Math.round(c.industry * 0.9 + c.production * 0.3);
  const expenses = Math.round(income * 0.8);
  const rel = cid === g.player ? 0 : (g.relations[relKey(cid, g.player)] || 0);
  return {
    ...c, income, expenses, balance: income - expenses, gdp: c.industry * 9 + c.production * 3,
    threat: Math.min(100, Math.round(c.army * 2 + c.tanks)), relation: rel, army_estimate: Math.round(c.army * (0.85 + Math.random() * 0.3)),
    stability_factors: [{ name: 'Presupuesto social', value: 2 }, { name: 'Guerra', value: g.wars.length ? -3 : 0 }, { name: 'Desarrollo', value: 1 }],
    sector_output: { Industria: c.industry, Producción: c.production, Agricultura: Math.round(c.population * 2), Servicios: Math.round(c.development) },
  };
}

export async function handle(method, path, body) {
  await loadMap();
  let m;
  if (path === '/health') return { ok: true, version: 'mock' };
  if (path === '/map') return clone(MAP);
  if (method === 'POST' && path === '/games') {
    if (!body || !MAP.countries.some((c) => c.id === body.player)) err('País no válido.');
    return clone(newGame(body.player));
  }
  m = path.match(/^\/games\/([^/]+)(\/.*)?$/);
  if (!m) err('Ruta no encontrada.', 404);
  const g = load();
  if (!g || g.id !== decodeURIComponent(m[1])) err('Partida no encontrada.', 404);
  const sub = m[2] || '';
  if (method === 'GET' && sub === '') return clone(g);
  if (method === 'POST' && sub === '/orders') return addOrder(g.id, body);
  if (method === 'DELETE' && (m = sub.match(/^\/orders\/(.+)$/))) {
    g.orders = g.orders.filter((o) => o.id !== decodeURIComponent(m[1]));
    save();
    return clone(g);
  }
  if (method === 'PUT' && sub === '/budget') {
    const sum = ['army', 'social', 'infrastructure', 'industry'].reduce((a, k) => a + (body[k] || 0), 0);
    if (sum !== 100) err('El presupuesto debe sumar 100%.');
    g.countries[g.player].budget = { army: body.army, social: body.social, infrastructure: body.infrastructure, industry: body.industry };
    save();
    return clone(g);
  }
  if (method === 'POST' && sub === '/events/choice') {
    if (!g.active_event) err('No hay evento activo.');
    const c = g.countries[g.player];
    c.stability = Math.max(0, Math.min(100, c.stability + (body.option === 0 ? -2 : 3)));
    g.logs.push({ turn: g.turn, text: 'Decisión tomada: ' + g.active_event.options[body.option], kind: 'event' });
    g.active_event = null;
    save();
    return clone(g);
  }
  if (method === 'POST' && sub === '/end-turn') return endTurn();
  if (method === 'GET' && (m = sub.match(/^\/country\/(.+)$/))) return countryDetail(decodeURIComponent(m[1]));
  return err('Ruta no encontrada.', 404);
}
