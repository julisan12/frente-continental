// Suministro: la poblacion, la industria y el ejercito consumen recursos cada turno (alimentos, combustible,
// bienes, metal); la produccion sale de las provincias (recurso + edificios). La escasez penaliza (estabilidad,
// produccion, organizacion, descontento). Estado en game.ext.stock / game.ext.supply. Puro: sin DOM.
// Se invoca desde features.js (init/action/turn/pending) y desde orders.js (order_check) cuando game.ext existe.
//
// ESTADO (inicializacion perezosa):
//   game.ext.stock[cid]  : { food, fuel, goods, metal }   existencias (unidades abstractas)
//   game.ext.supply[cid] : { prod:{food,fuel,goods,metal}, cons:{...}, net:{...}, short:{food:0..1,...}, prev:{troops,tanks,planes} }
//                          informe del ultimo turno (para la UI) + snapshot para detectar producciones nuevas
//
// ACCIONES: { action:'buy', res, amount } compra en el mercado (precio crece con la cantidad y la escasez regional),
//           { action:'sell', res, amount }, { action:'trade', target, give, get, amount } (intercambio con otro pais).
//
import { ensure, ok, err, news, alive, aliveIds, nameOf, r2, clampN } from './extutil.js';
import { divisions_of, get_rel, add_rel, sync_armies } from './state.js';

export const RESOURCES = {
  food:  { name: 'Alimentos',   icon: 'wheat', color: '#8aa23f' },
  fuel:  { name: 'Combustible', icon: 'oil',   color: '#3d3732' },
  goods: { name: 'Bienes',      icon: 'box',   color: '#b98a3e' },
  metal: { name: 'Metal',       icon: 'ingot', color: '#8a8f99' },
};

// Constantes de balance (calibrables)
const PROD_BASE = {
  // Por provincia: recursos r y edificios b
  food: { agro: 1.5, granja: 1.2 },
  fuel: { petroleo: 2, gas: 2, refineria: 2.5 },
  metal: { minerales: 1.5, cobre: 1.5, mina: 2 },
  goods: { madera: 0.5, fabrica: 1.0 },
};
const PROD_NATIONAL = {
  goods_industry: 0.04,  // goods += industry * 0.04
  metal_industry: 0.02,  // metal consumido por la industria para producir goods
};
const PROD_COUNTRY_RES = {
  // Recursos del país en countries.json
  food: { trigo: 2, maíz: 2, carne: 2, pesca: 2, banano: 2, azúcar: 2 },
  fuel: { petróleo: 3, carbón: 1.5 },
  metal: { acero: 2, hierro: 2, cobre: 2, estaño: 2, bauxita: 2, níquel: 2 },
  goods: { café: 1, azúcar: 1, cacao: 1, algodón: 1, lana: 1 },
};

const CONS_BASE = {
  food_pop: 0.22,       // food = population * 0.22
  goods_pop: 0.10,      // goods = population * 0.10
  goods_dev: 0.5,       // goods += development * 0.5
  fuel_ind: 0.03,       // fuel = industry * 0.03
  fuel_tank: 0.08,      // fuel += tanks * 0.08
  fuel_plane: 0.15,     // fuel += planes * 0.15
  fuel_base: 0.5,       // fuel += 0.5 (base)
};

const SHORTAGE_PENALTIES = {
  food: { stab: 2, stab_per_short: 6, pop: 0.002 },      // estab -(2+6*short), pop -0.2%*short
  goods: { stab: 1, stab_per_short: 3 },                  // estab -(1+3*short)
  fuel: { org: 5, org_per_short: 15, money: 0.15 },      // org -(5+15*short), money -15%*short
  metal: { ind: 0.3, ind_per_short: 1.2 },               // industry -(0.3+1.2*short)
};
const MAX_STAB_LOSS_PER_TURN = 10;
const MAX_STOCK_TURNS = 30;

const MARKET_BASE_PRICES = { food: 4, fuel: 7, goods: 6, metal: 6 };
const MARKET_SELL_FACTOR = 0.6;
const MARKET_LIMIT_BASE = 20;
const MARKET_LIMIT_INFRA = 2; // por cada 10 de infraestructura

const MILITARY_COSTS = {
  tanks: { metal: 6, fuel: 3, per_unit: { metal: 1, fuel: 0.5 } },
  planes: { metal: 5, fuel: 6, per_unit: { metal: 1.2, fuel: 1.5 } },
  recruit: { goods: 2, per_unit: { goods: 0.15 } },  // por mil tropas
  build: { metal: 4 },
  project: {
    factory: { metal: 8 },
    road: { goods: 4 },
    port: { goods: 4 },
  },
};

function _ids(game) { return Object.keys(game.countries); }
function _prov(game) { return (game.ext && game.ext.prov) || {}; }

// ------------------------------------------------------------------ init
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'stock', () => ({}));
  ensure(game.ext, 'supply', () => ({}));
  // Inicializacion perezosa: si una partida guardada antigua no tiene stock, darle inicial razonable
  const alive = aliveIds(game);
  for (const cid of alive) {
    const st = ensure(game.ext.stock, cid, () => null);
    if (!st || typeof st.food !== 'number') {
      // 6 turnos de consumo inicial
      const c = game.countries[cid];
      const cons = _compute_consumption(game, cid, c);
      game.ext.stock[cid] = {
        food: r2(cons.food * 6),
        fuel: r2(cons.fuel * 6),
        goods: r2(cons.goods * 6),
        metal: r2(cons.metal * 6),
      };
    }
    // Supply info
    ensure(game.ext.supply, cid, () => ({
      prod: { food: 0, fuel: 0, goods: 0, metal: 0 },
      cons: { food: 0, fuel: 0, goods: 0, metal: 0 },
      net: { food: 0, fuel: 0, goods: 0, metal: 0 },
      short: {},
      prev: { troops: 0, tanks: 0, planes: 0 },
    }));
  }
}

// ------------------------------------------------------------------ produccion
function _compute_production(game, cid, c) {
  const out = { food: 0, fuel: 0, goods: 0, metal: 0 };
  const pr = _prov(game);

  // Produccion provincial
  for (const [pid, p] of Object.entries(pr)) {
    if (p.o !== cid) continue;
    const r = p.r;
    const b = p.b || {};
    const unrest = (game.ext.unrest && game.ext.unrest[pid]) || 0;
    const mult = unrest >= 50 ? (1 - unrest / 200) : 1;

    // Recursos naturales
    if (r === 'agro') out.food += PROD_BASE.food.agro * mult;
    if (r === 'petroleo' || r === 'gas') out.fuel += PROD_BASE.fuel[r] * mult;
    if (r === 'minerales' || r === 'cobre') out.metal += PROD_BASE.metal[r] * mult;
    if (r === 'madera') out.goods += PROD_BASE.goods.madera * mult;

    // Edificios
    out.food += (b.granja || 0) * PROD_BASE.food.granja * mult;
    out.fuel += (b.refineria || 0) * PROD_BASE.fuel.refineria * mult;
    out.metal += (b.mina || 0) * PROD_BASE.metal.mina * mult;
    out.goods += (b.fabrica || 0) * PROD_BASE.goods.fabrica * mult;
  }

  // Produccion nacional: industria fabrica bienes (consumiendo metal)
  const metal_for_industry = c.industry * PROD_NATIONAL.metal_industry;
  const goods_from_industry = c.industry * PROD_NATIONAL.goods_industry;
  out.goods += goods_from_industry;
  out.metal -= metal_for_industry; // se consume

  // Bonus por recursos del país
  const res = c.resources || [];
  for (const [type, map] of Object.entries(PROD_COUNTRY_RES)) {
    for (const [resName, bonus] of Object.entries(map)) {
      if (res.includes(resName)) out[type] += bonus;
    }
  }

  return { food: r2(out.food), fuel: r2(out.fuel), goods: r2(out.goods), metal: r2(out.metal) };
}

function _compute_consumption(game, cid, c) {
  const out = { food: 0, fuel: 0, goods: 0, metal: 0 };

  // Poblacion
  out.food = c.population * CONS_BASE.food_pop;
  out.goods = c.population * CONS_BASE.goods_pop + c.development * CONS_BASE.goods_dev;

  // Industria y militar
  out.fuel = c.industry * CONS_BASE.fuel_ind + CONS_BASE.fuel_base;

  const divs = divisions_of(game, cid);
  const tanks = divs.reduce((s, d) => s + d.tanks, 0);
  const planes = divs.reduce((s, d) => s + d.planes, 0);
  out.fuel += tanks * CONS_BASE.fuel_tank + planes * CONS_BASE.fuel_plane;

  // Metal ya se resto en produccion (industria)

  return { food: r2(out.food), fuel: r2(out.fuel), goods: r2(out.goods), metal: r2(out.metal) };
}

// ------------------------------------------------------------------ escasez y penalizaciones
function _apply_shortages(game, cid, c, shortages, rng) {
  const lines = [];
  const income = c.production || 0;
  let totalStabLoss = 0;

  for (const res of Object.keys(RESOURCES)) {
    const short = shortages[res] || 0;
    if (short <= 0.01) continue;

    const pen = SHORTAGE_PENALTIES[res];
    if (!pen) continue;

    // Estabilidad
    if (pen.stab !== undefined) {
      const loss = pen.stab + (pen.stab_per_short || 0) * short;
      totalStabLoss += loss;
    }

    // Poblacion
    if (pen.pop) {
      c.population = r2(Math.max(0.1, c.population * (1 - pen.pop * short)));
    }

    // Organizacion
    if (pen.org) {
      const orgLoss = pen.org + (pen.org_per_short || 0) * short;
      const divs = divisions_of(game, cid);
      for (const d of divs) {
        d.org = r2(Math.max(0, d.org - orgLoss));
      }
    }

    // Dinero (industria rinde menos)
    if (pen.money && income > 0) {
      const moneyLoss = income * pen.money * short;
      c.money = r2(c.money - moneyLoss);
    }

    // Industria se deteriora
    if (pen.ind) {
      const indLoss = pen.ind + (pen.ind_per_short || 0) * short;
      c.industry = r2(Math.max(0, c.industry - indLoss));
    }

    // Lineas de informe
    const pct = Math.round(short * 100);
    if (pct >= 10) {
      const name = RESOURCES[res].name;
      let desc = `Escasez de ${name.toLowerCase()} (${pct}%): `;
      if (res === 'food') desc += 'descontento y hambruna';
      else if (res === 'fuel') desc += 'la organización de tus divisiones cae';
      else if (res === 'goods') desc += 'descontento popular';
      else if (res === 'metal') desc += 'la industria se deteriora';
      lines.push(desc);
    }
  }

  // Aplicar estabilidad con tope
  if (totalStabLoss > 0) {
    const loss = Math.min(totalStabLoss, MAX_STAB_LOSS_PER_TURN);
    c.stability = r2(clampN(c.stability - loss, 0, 100));
  }

  return lines;
}

// ------------------------------------------------------------------ produccion militar
function _check_military_production(game, cid, stock, prevSnapshot, lines) {
  const divs = divisions_of(game, cid);
  const troops = divs.reduce((s, d) => s + d.troops, 0);
  const tanks = divs.reduce((s, d) => s + d.tanks, 0);
  const planes = divs.reduce((s, d) => s + d.planes, 0);

  const deltaTroops = Math.max(0, troops - prevSnapshot.troops);
  const deltaTanks = Math.max(0, tanks - prevSnapshot.tanks);
  const deltaPlanes = Math.max(0, planes - prevSnapshot.planes);

  let needed = { metal: 0, fuel: 0, goods: 0 };

  if (deltaTanks > 0) {
    needed.metal += deltaTanks * MILITARY_COSTS.tanks.per_unit.metal;
    needed.fuel += deltaTanks * MILITARY_COSTS.tanks.per_unit.fuel;
  }
  if (deltaPlanes > 0) {
    needed.metal += deltaPlanes * MILITARY_COSTS.planes.per_unit.metal;
    needed.fuel += deltaPlanes * MILITARY_COSTS.planes.per_unit.fuel;
  }
  if (deltaTroops > 0) {
    needed.goods += (deltaTroops / 1000) * MILITARY_COSTS.recruit.per_unit.goods;
  }

  // Descontar del stock
  for (const [res, amt] of Object.entries(needed)) {
    if (amt <= 0) continue;
    const avail = stock[res] || 0;
    if (avail >= amt) {
      stock[res] = r2(stock[res] - amt);
    } else {
      // Produccion parcial: eliminar la parte no cubierta
      const fraction = avail / amt;
      stock[res] = 0;

      // Eliminar de la division mas pequeña
      if (res === 'metal' || res === 'fuel') {
        const divs = divisions_of(game, cid);
        if (divs.length > 0) {
          let smallest = divs[0];
          for (const d of divs) {
            if (d.tanks + d.planes < smallest.tanks + smallest.planes) smallest = d;
          }
          const missing = (1 - fraction);
          if (deltaTanks > 0 && smallest.tanks > 0) {
            smallest.tanks = r2(Math.max(0, smallest.tanks - deltaTanks * missing));
          }
          if (deltaPlanes > 0 && smallest.planes > 0) {
            smallest.planes = r2(Math.max(0, smallest.planes - deltaPlanes * missing));
          }
          sync_armies(game);
          lines.push(`Producción militar incompleta por falta de ${RESOURCES[res].name.toLowerCase()}.`);
        }
      } else if (res === 'goods') {
        const divs = divisions_of(game, cid);
        if (divs.length > 0) {
          let smallest = divs[0];
          for (const d of divs) {
            if (d.troops < smallest.troops) smallest = d;
          }
          const missing = (1 - fraction);
          if (deltaTroops > 0 && smallest.troops > 0) {
            smallest.troops = r2(Math.max(0, smallest.troops - deltaTroops * missing));
            sync_armies(game);
            lines.push(`Reclutamiento incompleto por falta de ${RESOURCES[res].name.toLowerCase()}.`);
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ mercado
function _regional_shortage(game, res) {
  const alive = aliveIds(game);
  if (alive.length === 0) return 0;
  let count = 0;
  for (const cid of alive) {
    const sup = game.ext.supply[cid];
    if (sup && sup.short && sup.short[res] > 0) count++;
  }
  return count / alive.length;
}

function _market_price(game, res, amount) {
  const base = MARKET_BASE_PRICES[res] || 5;
  const regShort = _regional_shortage(game, res);
  const priceFactor = (game.ext.prices && game.ext.prices.cur) || {};

  // Factor de precios de materias primas
  let commodityFactor = 1;
  if (res === 'fuel' && priceFactor.petroleo) commodityFactor = priceFactor.petroleo / 100;
  if (res === 'metal' && priceFactor.cobre) commodityFactor = priceFactor.cobre / 100;
  if (res === 'food' && priceFactor.carne) commodityFactor = (priceFactor.carne || 100) / 100;

  const p = base * commodityFactor * (1 + 0.5 * regShort) * (1 + amount / 40);
  return r2(p);
}

function _market_limit(game, cid) {
  const c = game.countries[cid];
  return MARKET_LIMIT_BASE + Math.floor((c.infrastructure || 0) / 10) * MARKET_LIMIT_INFRA;
}

function _at_war_with_producers(game, cid, res) {
  // Simplificado: si mas de la mitad de los países vivos están en guerra con cid
  const alive = aliveIds(game);
  const wars = game.wars || [];
  let warCount = 0;
  for (const w of wars) {
    if ((w.a === cid || w.b === cid) && alive.includes(w.a) && alive.includes(w.b)) warCount++;
  }
  return warCount > alive.length / 2;
}

// ------------------------------------------------------------------ acciones
export function action(game, body) {
  if (!game.ext) return null;
  const b = body || {};
  const me = game.player;
  const c = game.countries[me];
  const stock = stock_of(game, me);

  if (b.action === 'buy') {
    const res = b.res;
    const amount = Number(b.amount) || 5;
    if (!RESOURCES[res]) return err('Recurso desconocido.');

    const limit = _market_limit(game, me);
    if (amount > limit) return err(`Solo puedes comprar hasta ${limit} unidades por turno.`);

    let price = _market_price(game, res, amount);
    let actualLimit = limit;

    if (_at_war_with_producers(game, me, res)) {
      price *= 2;
      actualLimit = Math.floor(actualLimit / 2);
      if (amount > actualLimit) return err(`En guerra con los productores: límite reducido a ${actualLimit}.`);
    }

    const cost = r2(price * amount);
    if (c.money < cost) return err(`Fondos insuficientes: se necesitan $${cost}M.`);

    c.money = r2(c.money - cost);
    stock[res] = r2(stock[res] + amount);
    return ok(`Comprados ${amount} de ${RESOURCES[res].name.toLowerCase()} por $${cost}M.`);
  }

  if (b.action === 'sell') {
    const res = b.res;
    const amount = Number(b.amount) || 10;
    if (!RESOURCES[res]) return err('Recurso desconocido.');
    if (stock[res] < amount) return err(`No tienes suficiente ${RESOURCES[res].name.toLowerCase()}.`);

    const price = _market_price(game, res, amount) * MARKET_SELL_FACTOR;
    const revenue = r2(price * amount);

    c.money = r2(c.money + revenue);
    stock[res] = r2(stock[res] - amount);
    return ok(`Vendidos ${amount} de ${RESOURCES[res].name.toLowerCase()} por $${revenue}M.`);
  }

  if (b.action === 'trade') {
    const target = b.target;
    const give = b.give;
    const get = b.get;
    const amount = Number(b.amount) || 5;

    if (!RESOURCES[give] || !RESOURCES[get]) return err('Recurso desconocido.');
    if (!alive(game, target)) return err('País objetivo inválido.');
    if (stock[give] < amount) return err(`No tienes suficiente ${RESOURCES[give].name.toLowerCase()}.`);

    const tgtStock = stock_of(game, target);
    if (tgtStock[get] < amount) return err(`El objetivo no tiene suficiente ${RESOURCES[get].name.toLowerCase()}.`);

    // Verificar pacto o relacion
    const rel = get_rel(game, me, target);
    const hasPact = (game.ext.pacts || []).some(p => p.type === 'com' && ((p.a === me && p.b === target) || (p.a === target && p.b === me)));

    if (!hasPact && rel < 20) {
      return err(`${nameOf(game, target)} rechaza el intercambio: se necesita pacto comercial o relación ≥20.`);
    }

    // Verificar que le sobre al objetivo
    const tgtSup = game.ext.supply[target];
    const tgtCons = (tgtSup && tgtSup.cons && tgtSup.cons[get]) || 1;
    const surplus = tgtStock[get] - tgtCons * 6;
    if (surplus < amount) {
      return err(`${nameOf(game, target)} no tiene excedentes suficientes de ${RESOURCES[get].name.toLowerCase()}.`);
    }

    // Realizar intercambio
    stock[give] = r2(stock[give] - amount);
    stock[get] = r2(stock[get] + amount);
    tgtStock[give] = r2(tgtStock[give] + amount);
    tgtStock[get] = r2(tgtStock[get] - amount);

    // Mejorar relacion
    add_rel(game, me, target, 2);

    return ok(`Intercambiados ${amount} de ${RESOURCES[give].name.toLowerCase()} por ${RESOURCES[get].name.toLowerCase()} con ${nameOf(game, target)}.`);
  }

  return null;
}

// ------------------------------------------------------------------ turno
export function turn(game, rng, lines) {
  if (!game.ext) return;
  const alive = aliveIds(game);

  for (const cid of alive) {
    const c = game.countries[cid];
    const stock = stock_of(game, cid);
    const supply = ensure(game.ext.supply, cid, () => ({
      prod: { food: 0, fuel: 0, goods: 0, metal: 0 },
      cons: { food: 0, fuel: 0, goods: 0, metal: 0 },
      net: { food: 0, fuel: 0, goods: 0, metal: 0 },
      short: {},
      prev: { troops: 0, tanks: 0, planes: 0 },
    }));

    // Snapshot anterior
    const prev = supply.prev || { troops: 0, tanks: 0, planes: 0 };

    // Calcular produccion y consumo
    const prod = _compute_production(game, cid, c);
    const cons = _compute_consumption(game, cid, c);

    // Produccion militar: descontar recursos
    _check_military_production(game, cid, stock, prev, cid === game.player ? lines : []);

    // Actualizar stock
    const shortages = {};
    for (const res of Object.keys(RESOURCES)) {
      const available = (stock[res] || 0) + prod[res];
      const net = available - cons[res];
      stock[res] = r2(Math.max(0, available - cons[res]));

      // Limite de stock maximo
      const maxStock = cons[res] * MAX_STOCK_TURNS;
      if (stock[res] > maxStock) {
        const excess = stock[res] - maxStock;
        // Vender automaticamente al 30% si sobra mucho
        if (cid !== game.player && excess > 10) {
          c.money = r2(c.money + excess * MARKET_BASE_PRICES[res] * 0.3);
        }
        stock[res] = r2(maxStock);
      }

      // Escasez
      const shortage = cons[res] > 0 ? Math.max(0, 1 - available / cons[res]) : 0;
      if (shortage > 0.01) shortages[res] = r2(shortage);
    }

    // Aplicar penalizaciones
    const shortLines = _apply_shortages(game, cid, c, shortages, rng);
    if (cid === game.player && shortLines.length > 0) {
      for (const line of shortLines) {
        lines.push(line);
        news(game, line, 'supply');
      }
    }

    // Actualizar supply info
    supply.prod = prod;
    supply.cons = cons;
    supply.net = { food: r2(prod.food - cons.food), fuel: r2(prod.fuel - cons.fuel), goods: r2(prod.goods - cons.goods), metal: r2(prod.metal - cons.metal) };
    supply.short = shortages;

    // Snapshot para el proximo turno
    const divs = divisions_of(game, cid);
    supply.prev = {
      troops: r2(divs.reduce((s, d) => s + d.troops, 0)),
      tanks: r2(divs.reduce((s, d) => s + d.tanks, 0)),
      planes: r2(divs.reduce((s, d) => s + d.planes, 0)),
    };

    // IA: comprar/vender
    if (cid !== game.player) {
      for (const res of Object.keys(RESOURCES)) {
        const short = shortages[res] || 0;
        if (short > 0.3 && c.money > 50) {
          const amount = Math.min(10, _market_limit(game, cid));
          const price = _market_price(game, res, amount);
          const cost = r2(price * amount);
          if (c.money >= cost) {
            c.money = r2(c.money - cost);
            stock[res] = r2(stock[res] + amount);
          }
        }

        // Vender excedentes
        const surplus = stock[res] - cons[res] * 20;
        if (surplus > 10) {
          const amount = Math.min(10, Math.floor(surplus));
          const price = _market_price(game, res, amount) * MARKET_SELL_FACTOR;
          const revenue = r2(price * amount);
          c.money = r2(c.money + revenue);
          stock[res] = r2(stock[res] - amount);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ pending
export function pending(game) {
  if (!game.ext) return [];
  const me = game.player;
  const supply = game.ext.supply[me];
  if (!supply) return [];

  const out = [];
  const stock = stock_of(game, me);
  const cons = supply.cons || {};
  const short = supply.short || {};

  // Avisos de escasez
  const shortRes = Object.entries(short).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [res, val] of shortRes) {
    const pct = Math.round(val * 100);
    out.push({ text: `Escasez de ${RESOURCES[res].name.toLowerCase()} (${pct}%)`, kind: 'supply', screen: 'economy' });
  }

  // Avisos de reservas bajas
  for (const res of Object.keys(RESOURCES)) {
    if (short[res]) continue; // Ya tiene escasez
    const c = cons[res] || 1;
    const turns = c > 0 ? (stock[res] || 0) / c : 999;
    if (turns > 0 && turns <= 3) {
      out.push({ text: `Reservas de ${RESOURCES[res].name.toLowerCase()} para ${Math.floor(turns)} turnos`, kind: 'supply', screen: 'economy' });
    }
  }

  return out;
}

// ------------------------------------------------------------------ order_check
export function order_check(game, ent, otype, params) {
  if (!game.ext) return null;
  const stock = stock_of(game, ent);
  const costs = MILITARY_COSTS[otype];

  if (!costs) return null;

  if (otype === 'tanks') {
    if (stock.metal < costs.metal) return `Faltan ${r2(costs.metal - stock.metal)} de metal para producir tanques.`;
    if (stock.fuel < costs.fuel) return `Faltan ${r2(costs.fuel - stock.fuel)} de combustible para producir tanques.`;
  }

  if (otype === 'planes') {
    if (stock.metal < costs.metal) return `Faltan ${r2(costs.metal - stock.metal)} de metal para producir aviones.`;
    if (stock.fuel < costs.fuel) return `Faltan ${r2(costs.fuel - stock.fuel)} de combustible para producir aviones.`;
  }

  if (otype === 'recruit') {
    if (stock.goods < costs.goods) return `Faltan ${r2(costs.goods - stock.goods)} bienes para reclutar tropas.`;
  }

  if (otype === 'build') {
    if (stock.metal < costs.metal) return `Faltan ${r2(costs.metal - stock.metal)} de metal para construir industria.`;
  }

  if (otype === 'project' && params && params.kind) {
    const pKind = params.kind;
    const pCosts = costs[pKind];
    if (pCosts) {
      if (pCosts.metal && stock.metal < pCosts.metal) {
        return `Faltan ${r2(pCosts.metal - stock.metal)} de metal para este proyecto.`;
      }
      if (pCosts.goods && stock.goods < pCosts.goods) {
        return `Faltan ${r2(pCosts.goods - stock.goods)} bienes para este proyecto.`;
      }
    }
  }

  return null;
}

// ------------------------------------------------------------------ stock_of
export function stock_of(game, cid) {
  if (!game.ext) return { food: 0, fuel: 0, goods: 0, metal: 0 };
  const st = ensure(game.ext, 'stock', () => ({}));
  return ensure(st, cid, () => ({ food: 0, fuel: 0, goods: 0, metal: 0 }));
}
