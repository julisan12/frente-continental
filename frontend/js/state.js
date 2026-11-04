// Almacen simple + acciones sobre la API.
import * as api from './api.js';
import { relKey, toast } from './util.js';

const S = {
  game: null, map: null, mapById: {}, selected: null, screen: 'map',
  details: {}, diploTarget: null, busy: false,
};
const subs = new Set();
let headerFn = null;
export function setHeaderRefresher(fn) { headerFn = fn; }
function refreshHeader() { if (headerFn) { try { headerFn(); } catch (e) { console.error(e); } } }
export const getState = () => S;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setState(patch) {
  Object.assign(S, patch || {});
  subs.forEach((f) => { try { f(S); } catch (e) { console.error(e); } });
}

export const player = () => S.game && S.game.player;
export const cname = (id) => (S.mapById[id] && S.mapById[id].name) || id || '';
export const ownerOf = (id) => {
  const c = S.game && S.game.countries && S.game.countries[id];
  return (c && c.owner) || id;
};
export const relation = (a, b) => (S.game && S.game.relations && S.game.relations[relKey(a, b)]) || 0;
export const isAllied = (a, b) => !!(S.game && (S.game.treaties || []).some((t) => t.type === 'alliance' && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
export const isAtWar = (a, b) => !!(S.game && (S.game.wars || []).some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)));
export const ownedBy = (owner) => S.game ? Object.values(S.game.countries).filter((c) => c.owner === owner).map((c) => c.id) : [];
export function neighborsOf(id) {
  const m = S.mapById[id];
  if (!m) return [];
  return [...new Set([...(m.neighbors || []), ...(m.sea || [])])].filter((x) => S.mapById[x]);
}
// Candidatos diplomaticos: duenos de territorios adyacentes, enemigos en guerra y paises con tratados.
export function partners() {
  const me = player();
  const set = new Set();
  ownedBy(me).forEach((id) => neighborsOf(id).forEach((n) => {
    const o = ownerOf(n);
    if (o !== me) set.add(o);
  }));
  const g = S.game || {};
  [...(g.wars || []), ...(g.treaties || [])].forEach((x) => {
    if (x.a === me && x.b !== me) set.add(x.b);
    else if (x.b === me && x.a !== me) set.add(x.a);
  });
  return [...set].sort((a, b) => cname(a).localeCompare(cname(b), 'es'));
}

export function setGame(g) {
  if (!g) return;
  S.details = {};
  api.saveGameId(g.id);
  setState({ game: g });
}

const pending = {};
export function detail(cid) { return S.details[cid] || null; }
export function loadDetail(cid) {
  if (!S.game || !cid) return;
  if (cid in S.details || pending[cid]) return;
  pending[cid] = api.getCountry(S.game.id, cid).then((d) => {
    delete pending[cid];
    if (d) { S.details[cid] = d.country ? { ...d.country, ...d } : d; setState({}); }
    else delete S.details[cid];
  });
}

export async function sendOrder(o) {
  const r = await api.addOrder(S.game.id, o);
  if (!r) return false;
  if (r.error) { toast(r.error); if (r.game) setGame(r.game); return false; }
  setGame(r.game || r);
  return true;
}
export async function extAction(body) {
  const r = await api.extAction(S.game.id, body);
  if (!r) return false;
  if (r.error) { toast(r.error); return false; }
  setGame(r.game || r);
  toast(r.msg || 'Hecho');
  return true;
}
export function hasExt() { return !!(S.game && S.game.ext); }
export async function delOrder(oid) {
  const g = await api.delOrder(S.game.id, oid);
  if (g) setGame(g.game || g);
}
export async function saveBudget(b) {
  const g = await api.putBudget(S.game.id, b);
  // sin repintar (no reconstruir los sliders); se invalida la ficha cacheada: gastos/balance cambian con el presupuesto
  if (g) { const gg = g.game || g; S.game = gg; S.details = {}; refreshHeader(); return true; }
  return false;
}
export async function eventChoice(option) {
  const g = await api.eventChoice(S.game.id, option);
  if (g) setGame(g.game || g);
}
export async function endTurn() {
  setState({ busy: true });
  const r = await api.endTurn(S.game.id);
  setState({ busy: false });
  if (r && r.game) setGame(r.game);
  return r;
}
