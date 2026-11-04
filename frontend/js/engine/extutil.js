// Utilidades compartidas por los modulos de sistemas ampliados (game.ext). Puro: sin DOM.
// No importa features.js (evita ciclos): cualquier modulo de engine/ puede importar esto.

export const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
export const r1 = (x) => Math.round(x * 10) / 10;
export const r2 = (x) => Math.round(x * 100) / 100;

/** Agrega una noticia a game.ext.news ({turn, text, kind}); kind: info|war|eco|dip|spy|tech|supply|unrest|mil. */
export function news(game, text, kind = 'info') {
  if (!game.ext) return;
  if (!Array.isArray(game.ext.news)) game.ext.news = [];
  game.ext.news.push({ turn: game.turn, text, kind });
  if (game.ext.news.length > 80) game.ext.news.splice(0, game.ext.news.length - 80);
}

/** True si cid es un pais vivo e independiente (no ocupado). */
export const alive = (game, cid) => !!(game.countries[cid] && game.countries[cid].owner === cid);
export const aliveIds = (game) => Object.keys(game.countries).filter((c) => alive(game, c));
export const nameOf = (game, cid) => (game.countries[cid] ? game.countries[cid].name : cid);

/** Devuelve el objeto garantizando que exista (inicializacion perezosa para partidas antiguas). */
export function ensure(obj, key, make) {
  if (obj[key] === undefined || obj[key] === null) obj[key] = typeof make === 'function' ? make() : make;
  return obj[key];
}

/** Resultado estandar de acciones. */
export const ok = (msg, extra) => ({ ok: true, msg, ...(extra || {}) });
export const err = (error) => ({ ok: false, error });
