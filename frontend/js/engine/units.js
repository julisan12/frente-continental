// Unidades especializadas, formaciones (agrupaciones), modificadores de combate (tipo y terreno),
// botin de guerra y descontento en provincias conquistadas. Estado en game.ext.* (ver abajo).
// Puro: sin DOM. Se invoca desde features.js (init/action/turn/pending) y mediante ganchos
// opcionales desde military.js / provinces.js. Cuando game.ext no existe, todos los ganchos son neutros.
//
// ESTADO (inicializacion perezosa; partidas antiguas no deben romperse):
//   game.divisions[i].kind : 'inf'|'mot'|'arm'|'art'|'mtn'|'mar'|'air'|'esp'  (si falta, se infiere por el nombre)
//   game.ext.forms[cid]    : [{ id, name, divs:[divisionId...] }]   formaciones (agrupaciones de divisiones)
//   game.ext.unrest[pid]   : 0..100  descontento en provincias ocupadas (dueno != pais original)
//   game.ext.loot          : [{ turn, by, from, pid, name, money, res, amt, text }]  registro de botin (max 40); res: food|fuel|goods|metal|null
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'unit_recruit', kind, pid? }   recluta/produce una unidad del tipo en la provincia pid (propia) o en la capital
//   { action:'form_create', name, divs:[ids] } / { action:'form_dissolve', id } / { action:'form_order', id, type, target }
//
import { ensure, ok, err, news, r1, r2 } from './extutil.js';
import { sync_armies, at_war, is_sea_route, next_id, allies_of } from './state.js';
import { queue_order, OrderError } from './orders.js';
import { stock_of } from './supply.js';
import { prov_geo, prov_yield, prov_targets } from './provinces.js';
import { army_check } from './dipext.js';
import { ROSTER, MIGRATE_KIND, soil_mods } from './roster.js';

// Tanda 3: el catálogo vive en roster.js (ROSTER). UNIT_TYPES se mantiene como alias por compatibilidad.
export { ROSTER, KINDS, CLASS_NAME, MIGRATE_KIND, soil_mods, lookup, TERRAIN_GROUP, SOIL_NAME, SOIL_MODS } from './roster.js';
export const UNIT_TYPES = ROSTER;

/** Tipo de una division (si falta `kind` o es un tipo antiguo, se infiere/migra). */
export function kind_of(d) {
  if (d.kind && ROSTER[d.kind]) return d.kind;
  if (d.kind && MIGRATE_KIND[d.kind]) return MIGRATE_KIND[d.kind];
  const n = String(d.name || '');
  if (/Blindad/i.test(n)) return 'tl';
  if (/Aerotransport|Aérea|Aerea/i.test(n)) return 'caza';
  if (/Motorizad|Mecanizad|Caballer/i.test(n)) return 'mec';
  if (/Artiller/i.test(n)) return 'art';
  if (/Especial|élite|elite/i.test(n)) return 'elite';
  return 'inf';
}

// ---- Ganchos de la Tanda 3 (trabajador A los implementa; firmas estables, usadas por military/orders/provinces) ----
/** Multiplicador de pérdidas de la división d frente a las divisiones `opp` (emparejamientos: tp ×4 ante at/elite/bomb,
 *  artillería a distancia atacando → 0, fortaleza, suelo). attacking = true si d es atacante. */
export function loss_mult(game, d, opp, attacking) { void game; void d; void opp; void attacking; return 1.0; }
/** false si la división no puede atacar ni defender (en carga, recarga, marcha). */
export function can_act(game, d) { void game; return !(d && (d.st === 'recarga' || d.st === 'carga' || d.st === 'marcha')); }
/** Motivo (string) por el que la división no puede recibir la orden `type` (move|attack|defend|front|reorganize), o null. */
export function order_check_div(game, d, type, target) { void game; void d; void type; void target; return null; }
/** Motivo por el que `ent` no puede producir `kind` en la provincia `pid` (tecnología, edificios, recursos, capacidad), o null. */
export function recruit_check(game, ent, kind, pid) { void game; void ent; void kind; void pid; return null; }
/** Cola de producción de `cid`: [{id, kind, pid, left, total}]. */
export function prod_queue(game, cid) { const q = game.ext && game.ext.prodq && game.ext.prodq[cid]; return Array.isArray(q) ? q : []; }
/** Poder de ataque de `ent` contra la provincia `pid` (suelo por clase, estados); null = usar el cálculo clásico. */
export function prov_strike_power(game, ent, pid) { void game; void ent; void pid; return null; }
/** Aviso de movimiento de una división (ferrocarril «en carga», unidades lentas «en marcha», avenidas). */
export function on_move(game, d, from, to) { void game; void d; void from; void to; }

// ------------------------------------------------------------------ interfaz estandar
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'forms', () => ({}));
  ensure(game.ext, 'unrest', () => ({}));
  ensure(game.ext, 'loot', () => []);
  // Inferir y persistir kinds de todas las divisiones existentes
  for (const d of game.divisions || []) {
    if (!d.kind || !ROSTER[d.kind]) d.kind = kind_of(d);
  }
  ensure(game.ext, 'prodq', () => ({}));
}

/** Acciones del jugador. Devuelve null si la accion no es de este modulo. */
export function action(game, body) {
  if (!body || !body.action) return null;
  const me = game.player;
  const c = game.countries[me];
  if (!c) return err('País no encontrado.');

  if (body.action === 'unit_recruit') {
    const kind = body.kind;
    const ut = UNIT_TYPES[kind];
    if (!ut) return err('Tipo de unidad desconocido.');
    // Validar tecnología requerida
    if (ut.tech && game.ext && game.ext.techs && game.ext.techs[me]) {
      if (!game.ext.techs[me].done.includes(ut.tech)) {
        return err(`Requiere la tecnología: ${ut.tech}.`);
      }
    }
    const acheck = army_check(game, me, 'unit_recruit', { troops: ut.troops });
    if (acheck) return err(acheck);
    // Validar dinero
    if (c.money < ut.cost) return err(`Fondos insuficientes (se necesitan ${ut.cost}).`);
    // Validar recursos si existe stock
    if (game.ext && game.ext.stock && game.ext.stock[me]) {
      const st = stock_of(game, me);
      for (const [res, qty] of Object.entries(ut.needs || {})) {
        if ((st[res] || 0) < qty) return err(`Recursos insuficientes: ${res} (se necesitan ${qty}, tienes ${st[res] || 0}).`);
      }
      // Descontar recursos
      for (const [res, qty] of Object.entries(ut.needs || {})) st[res] = Math.max(0, (st[res] || 0) - qty);
    }
    // Descontar dinero
    c.money = Math.round((c.money - ut.cost) * 100) / 100;
    // Determinar ubicación
    let location = me;
    if (body.pid && game.ext && game.ext.prov && game.ext.prov[body.pid]) {
      const prov = game.ext.prov[body.pid];
      location = prov.c;
      // Validar que la provincia pertenece al jugador
      if (prov.o !== me && game.countries[location].owner !== me) {
        location = me; // Revert a país natal si no es válida
      }
    }
    // Crear división
    const count = (game.divisions || []).filter(d => d.owner === me && d.kind === kind).length + 1;
    const ordinal = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª', '14ª', '15ª'][count] || count + 'ª';
    const name = ordinal + ' ' + ut.name;
    const div = {
      id: next_id(game, 'd'), name, owner: me, location, kind,
      troops: ut.troops, tanks: ut.tanks, planes: ut.planes,
      stance: 'idle', org: 80
    };
    if (!game.divisions) game.divisions = [];
    game.divisions.push(div);
    sync_armies(game);
    return ok(`${name} reclutada en ${game.countries[location].name}.`);
  }

  if (body.action === 'form_create') {
    const divs = body.divs || body.div_ids || [];
    if (divs.length < 2) return err('Se necesitan al menos 2 divisiones para crear una formación.');
    // Validar que todas las divisiones existen, son del jugador y están en el mismo territorio
    const myDivs = (game.divisions || []).filter(d => d.owner === me && divs.includes(d.id));
    if (myDivs.length !== divs.length) return err('Una o más divisiones no existen o no te pertenecen.');
    const loc = myDivs[0].location;
    if (!myDivs.every(d => d.location === loc)) return err('Todas las divisiones deben estar en el mismo territorio.');
    // Verificar que no estén en otra formación
    const forms = game.ext.forms[me] || [];
    for (const f of forms) {
      if (f.divs.some(id => divs.includes(id))) return err('Una o más divisiones ya pertenecen a otra formación.');
    }
    // Crear formación
    const nextId = Math.max(0, ...forms.map(f => Number(f.id) || 0)) + 1;
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const name = body.name || (romans[nextId - 1] || String(nextId)) + ' Cuerpo de Ejército';
    forms.push({ id: String(nextId), name, divs });
    game.ext.forms[me] = forms;
    return ok(`Formación "${name}" creada con ${divs.length} divisiones.`);
  }

  if (body.action === 'form_dissolve') {
    const forms = game.ext.forms[me] || [];
    const idx = forms.findIndex(f => f.id === String(body.id || body.form_id));
    if (idx < 0) return err('Formación no encontrada.');
    const f = forms.splice(idx, 1)[0];
    return ok(`Formación "${f.name}" disuelta.`);
  }

  if (body.action === 'form_order') {
    const forms = game.ext.forms[me] || [];
    const form = forms.find(f => f.id === String(body.id || body.form_id));
    if (!form) return err('Formación no encontrada.');
    const type = body.type || body.otype;
    if (!['move', 'attack', 'defend', 'reorganize', 'front'].includes(type)) return err('Orden no válida para una formación.');
    const target = body.target || null;
    let okN = 0; const skipped = [];
    for (const did of form.divs) {
      const d = (game.divisions || []).find(x => x.id === did && x.owner === me);
      if (!d) continue;
      try { queue_order(game, me, type, target || d.location, did, null); okN++; }
      catch (e) { if (e instanceof OrderError) skipped.push(`${d.name}: ${e.message}`); else throw e; }
    }
    if (!okN) return err(skipped[0] || 'Ninguna división pudo recibir la orden.');
    return ok(`${okN} ${okN === 1 ? 'orden encolada' : 'órdenes encoladas'} para "${form.name}"` + (skipped.length ? `; ${skipped.length} omitida: ${skipped[0]}` : '.'));
  }

  return null;
}

/** Fase de turno (tras prov_turn). `lines` son lineas del informe del jugador. */
export function turn(game, rng, lines) {
  if (!game.ext) return;
  const me = game.player;

  // Inferir y persistir kinds de todas las divisiones
  for (const d of game.divisions || []) {
    if (!d.kind || !ROSTER[d.kind]) d.kind = kind_of(d);
  }

  // IA recluta tipos variados
  const alive = Object.keys(game.countries).filter(cid => game.countries[cid].owner === cid);
  for (const cid of alive) {
    if (cid === me) continue;
    const c = game.countries[cid];
    if (c.money < 300) continue;
    if (rng.random() > 0.15) continue;
    // Elegir tipo según techs disponibles
    const techs = game.ext && game.ext.techs && game.ext.techs[cid] ? game.ext.techs[cid].done : [];
    const opts = Object.keys(UNIT_TYPES).filter(k => {
      const ut = UNIT_TYPES[k];
      return !ut.tech || techs.includes(ut.tech);
    });
    if (!opts.length) continue;
    const kind = opts[Math.floor(rng.random() * opts.length)];
    const ut = UNIT_TYPES[kind];
    if (c.money < ut.cost) continue;
    c.money = Math.round((c.money - ut.cost) * 100) / 100;
    const count = (game.divisions || []).filter(d => d.owner === cid && d.kind === kind).length + 1;
    const div = {
      id: next_id(game, 'd'), name: `${count}ª ${ut.name}`, owner: cid, location: cid, kind,
      troops: ut.troops, tanks: ut.tanks, planes: ut.planes, stance: 'idle', org: 80
    };
    game.divisions.push(div);
  }

  // Limpiar formaciones: divisiones desaparecidas o separadas
  const forms = game.ext.forms[me] || [];
  const keep = [];
  for (const f of forms) {
    const divs = (game.divisions || []).filter(d => f.divs.includes(d.id) && d.owner === me);
    if (divs.length < 2) {
      if (f.divs.some(id => (game.divisions || []).some(d => d.id === id && d.owner === me))) {
        lines.push(`Formación "${f.name}" disuelta: menos de 2 divisiones.`);
      }
      continue;
    }
    const loc = divs[0].location;
    if (!divs.every(d => d.location === loc)) {
      lines.push(`Formación "${f.name}" disuelta: las divisiones se separaron.`);
      continue;
    }
    f.divs = divs.map(d => d.id);
    keep.push(f);
  }
  game.ext.forms[me] = keep;

  // Descontento en provincias ocupadas
  if (!game.ext.prov) return;
  const prov = game.ext.prov;
  const unrest = game.ext.unrest;
  const countries = game.countries;
  let stabLoss = 0;
  for (const [pid, p] of Object.entries(prov)) {
    if (p.o === p.c) {
      // Provincia recuperada: borrar descontento
      if (unrest[pid]) delete unrest[pid];
      continue;
    }
    const occupier = countries[p.c];
    if (!occupier || occupier.owner !== p.o) continue; // Ocupante debe ser dueño del país
    let u = unrest[pid] || 0;
    // Incremento base
    const originalAlive = countries[p.c] && countries[p.c].owner === p.c;
    u += originalAlive ? 3 : 1;
    // Reducción por bases
    u -= 1.5 * (p.b.base || 0);
    // Reducción por guarnición (p.g / 10, tope 2)
    u -= 0.5 * Math.min(2, (p.g || 0) / 10);
    // Reducción si están en paz con el país original
    if (originalAlive && !at_war(game, p.o, p.c)) u -= 1;
    // Reducción si hay divisiones 'esp' del ocupante en el país
    const hasEsp = (game.divisions || []).some(d => d.owner === p.o && d.location === p.c && kind_of(d) === 'elite');
    if (hasEsp) u -= 2;
    unrest[pid] = Math.max(0, Math.min(100, Math.round(u * 10) / 10));

    // Efectos
    if (unrest[pid] >= 60 && p.o === me) stabLoss += 0.3;
    if (unrest[pid] >= 80 && rng.random() < 0.15) {
      // REVUELTA
      const origOwner = originalAlive ? p.c : p.o;
      p.o = origOwner;
      p.g = 0;
      p.b.base = Math.max(0, (p.b.base || 0) - 1);
      unrest[pid] = 30;
      const gp = prov_geo().byId[pid];
      news(game, `Revuelta en ${gp ? gp.n : pid}: vuelve a ${countries[origOwner].name}.`, 'unrest');
      if (p.o === me || p.c === me) lines.push(`¡Revuelta en ${gp ? gp.n : pid}!`);
    }
  }
  if (stabLoss > 0 && countries[me]) {
    const loss = Math.min(2, stabLoss);
    countries[me].stability = Math.max(0, Math.min(100, countries[me].stability - loss));
    if (loss >= 0.5) lines.push(`Descontento en provincias ocupadas: -${Math.round(loss * 10) / 10} estabilidad.`);
  }
}

/** Decisiones pendientes para el carrusel de noticias: [{text, kind, screen}]. */
export function pending(game) {
  const out = [];
  if (!game.ext) return out;
  const me = game.player;
  const unrest = game.ext.unrest;
  const prov = game.ext.prov;
  if (prov && unrest) {
    const high = Object.entries(unrest).filter(([pid, u]) => {
      const p = prov[pid];
      return u >= 60 && p && p.o === me;
    }).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [pid, u] of high) {
      let gp = null;
      try { gp = prov_geo().byId[pid]; } catch (e) { /* opcional */ }
      out.push({ text: `Descontento alto en ${gp ? gp.n : pid} (${Math.round(u)})`, kind: 'unrest', screen: 'map' });
    }
  }
  // Formaciones sugeridas
  const divsByLoc = {};
  for (const d of (game.divisions || []).filter(d => d.owner === me)) {
    if (!divsByLoc[d.location]) divsByLoc[d.location] = [];
    divsByLoc[d.location].push(d);
  }
  const forms = game.ext.forms[me] || [];
  const inForm = new Set(forms.flatMap(f => f.divs));
  for (const [loc, divs] of Object.entries(divsByLoc)) {
    const free = divs.filter(d => !inForm.has(d.id));
    if (free.length >= 2) {
      out.push({ text: 'Tienes divisiones sin formación en el mismo territorio: puedes agruparlas', kind: 'info', screen: 'army' });
      break;
    }
  }
  // Escasez: sugerir conquistar provincias que produzcan el recurso que falta
  try {
    const sup = game.ext.supply && game.ext.supply[me];
    if (sup && sup.short && prov) {
      const G = prov_geo();
      const al = allies_of(game, me);
      const cand = new Set(prov_targets(game, me));
      for (const [pid, p] of Object.entries(prov)) {
        if (p.o !== me) continue;
        for (const q of G.adj[pid] || []) {
          const pq = prov[q];
          if (pq && pq.o !== me && game.countries[pq.o] && !al.includes(pq.o)) cand.add(q);
        }
      }
      let n = 0;
      for (const res of ['fuel', 'food', 'metal', 'goods']) {
        if (n >= 2) break;
        if (!((sup.short[res] || 0) > 0.05)) continue;
        for (const q of cand) {
          const pq = prov[q];
          if (RES_TO_STOCK[pq.r] !== res) continue;
          out.push({ text: `Escasez de ${RES_LABEL[res]}: ${G.byId[q].n} (${game.countries[pq.o].name}) produce ${P_RES[pq.r]} — conquistarla la aliviaría`, kind: 'supply', screen: 'map' });
          n++;
          break;
        }
      }
    }
  } catch (e) { /* opcional */ }
  return out.slice(0, 6);
}

// ------------------------------------------------------------------ ganchos
/** Tabla de modificadores de terreno y emparejamientos (para la UI). */
export const MODS = {};
for (const k of Object.keys(ROSTER)) {
  const terr = {};
  for (const t of ['S', 'M', 'D', 'P', 'V', 'B', 'E', 'T', 'A']) { const m = soil_mods(k, t); if (m.atk !== 1) terr[t] = m.atk; }
  MODS[k] = { terr, desc: ROSTER[k].desc };
}

/** Multiplicador de ataque de una division contra el territorio `target` (tipo + terreno). */
export function div_attack_mult(game, d, target) {
  if (!game.ext) return 1.0;
  const kind = d.kind || kind_of(d);
  const ut = UNIT_TYPES[kind];
  if (!ut) return 1.0;
  let m = ut.atk / 4;

  // Terreno dominante del país objetivo
  const terrainType = _dominant_terrain(game, target);
  const modT = MODS[kind] && MODS[kind].terr ? MODS[kind].terr[terrainType] : 1.0;
  m *= modT || 1.0;

  // Compensar penalización marítima para marina
  if (ut.cls === 'nav' && is_sea_route(d.location, target)) {
    m *= 1.33; // Compensa SEA_PENALTY 25%
  }

  // Artillería contra fortalezas
  if (kind === 'art') {
    let hasFortalezas = false;
    if (game.ext.prov) {
      const provs = Object.values(game.ext.prov).filter(p => p.c === target && p.o === game.countries[target].owner);
      hasFortalezas = provs.some(p => (p.b.base || 0) > 0);
    }
    if (hasFortalezas) m *= 1.15;
    else m *= 0.9; // Sin fortalezas, penalización leve
  }

  // Bono de armas combinadas
  if (_in_combined_arms_formation(game, d)) m *= 1.10;

  return m;
}

/** Multiplicador de defensa de una division en `target`. */
export function div_defense_mult(game, d, target) {
  if (!game.ext) return 1.0;
  const kind = d.kind || kind_of(d);
  const ut = UNIT_TYPES[kind];
  if (!ut) return 1.0;
  let m = ut.def / 5;

  const terrainType = _dominant_terrain(game, target);
  const modT = MODS[kind] && MODS[kind].terr ? MODS[kind].terr[terrainType] : 1.0;
  m *= modT || 1.0;

  if (_in_combined_arms_formation(game, d)) m *= 1.10;

  return m;
}

/** Conquista de un pais entero (military.capture): botin y descontento. */
export function on_capture(game, attacker, target, old_owner) {
  if (!game.ext) return;

  // Botín de recursos (30% del stock del viejo dueño)
  const loot = {};
  if (game.ext.stock && game.ext.stock[old_owner] && game.ext.stock[attacker]) {
    const oldStock = game.ext.stock[old_owner];
    const newStock = game.ext.stock[attacker];
    for (const res of ['food', 'fuel', 'goods', 'metal']) {
      const amt = Math.floor((oldStock[res] || 0) * 0.3);
      if (amt > 0) {
        oldStock[res] = Math.max(0, (oldStock[res] || 0) - amt);
        newStock[res] = (newStock[res] || 0) + amt;
        loot[res] = amt;
      }
    }
  }

  // Registrar botín (dinero ya lo hace military.capture)
  const cname = game.countries[target].name;
  const money = Math.round(game.countries[target].money * 0.25);
  const keys = Object.keys(loot).sort((x, y) => loot[y] - loot[x]);
  const parts = keys.map(k => `+${loot[k]} ${RES_LABEL[k]}`);
  _push_loot(game, {
    turn: game.turn, by: attacker, from: old_owner, pid: null, name: cname, money,
    res: keys[0] || null, amt: keys.length ? loot[keys[0]] : 0,
    text: `Conquista de ${cname}: +$${_m10(money)} M` + (parts.length ? ' y ' + parts.join(', ') : '')
  });

  news(game, `${game.countries[attacker].name} saquea ${cname}.`, 'war');
}

const RES_TO_STOCK = { petroleo: 'fuel', gas: 'fuel', minerales: 'metal', cobre: 'metal', agro: 'food', madera: 'goods' };
const BUILD_TO_STOCK = [['refineria', 'fuel'], ['mina', 'metal'], ['granja', 'food'], ['taller', 'goods']];
export const RES_LABEL = { food: 'alimentos', fuel: 'combustible', goods: 'bienes', metal: 'metal' };
const P_RES = { petroleo: 'petróleo', gas: 'gas', minerales: 'minerales', cobre: 'cobre', agro: 'cultivos', madera: 'madera' };
const _m10 = (m) => Math.round(m * 10);

/** Calculo comun (sin efectos) del botin de la provincia `pid` cuyo dueno actual/anterior es `owner`. */
function _loot_calc(game, pid, owner) {
  const p = game.ext && game.ext.prov && game.ext.prov[pid];
  if (!p) return null;
  const b = p.b || {};
  const econ = (b.taller || 0) + (b.refineria || 0) + (b.mina || 0) + (b.granja || 0);
  const fixed = 15 + 8 * econ + 4 * ((b.avenida || 0) + (b.ferrocarril || 0)) + (p.cap ? 20 : 0);
  const ownerMoney = Math.max(0, (game.countries[owner] && game.countries[owner].money) || 0);
  const fromOwner = ownerMoney * 0.06;
  const yld = prov_yield(game, pid);
  const ostock = (game.ext.stock && game.ext.stock[owner]) || {};
  let res = RES_TO_STOCK[p.r] || null, amt = 0;
  if (res) {
    amt = Math.max(6, 0.25 * (ostock[res] || 0)) + 3 * (yld[res] || 0);
  } else {
    let best = 0;
    for (const [bk, rs] of BUILD_TO_STOCK) if ((b[bk] || 0) > best) { best = b[bk]; res = rs; }
    if (res) amt = 3 * (yld[res] || 0);
  }
  amt = res ? Math.floor(amt) : 0;
  if (amt <= 0) res = null;
  return { money: r1(fixed + fromOwner), fixed, fromOwner, res, amt, yield: yld };
}

/** Vista previa de la recompensa de conquistar `pid` (misma formula; no modifica el estado). */
export function conquest_preview(game, pid, attacker) {
  void attacker;
  const empty = { money: 0, res: null, amt: 0, yield: { money: 0, food: 0, fuel: 0, goods: 0, metal: 0 } };
  const p = game.ext && game.ext.prov && game.ext.prov[pid];
  if (!p) return empty;
  const c = _loot_calc(game, pid, p.o);
  return c ? { money: c.money, res: c.res, amt: c.amt, yield: c.yield } : empty;
}

function _push_loot(game, entry) {
  if (!Array.isArray(game.ext.loot)) game.ext.loot = [];
  game.ext.loot.push(entry);
  if (game.ext.loot.length > 40) game.ext.loot.splice(0, game.ext.loot.length - 40);
}

/** Conquista de una provincia (provinces.prov_attack): botin y descontento. */
export function on_prov_capture(game, attacker, pid, old_owner) {
  if (!game.ext || !game.ext.prov) return;
  const p = game.ext.prov[pid];
  const att = game.countries[attacker], old = game.countries[old_owner];
  if (!p || !att || !old) return;
  const c = _loot_calc(game, pid, old_owner);
  if (!c) return;

  // Dinero: la parte fija la genera la provincia; el 6 % sale del tesoro del dueno (nunca negativo)
  const taken = Math.min(Math.max(0, old.money || 0), c.fromOwner);
  old.money = r2(Math.max(0, (old.money || 0) - taken));
  const money = r1(c.fixed + taken);
  att.money = r2((att.money || 0) + money);

  // Recurso: requisa; el dueno anterior pierde solo lo que tenia
  let res = c.res, amt = c.amt;
  if (res && game.ext.stock) {
    const ost = stock_of(game, old_owner), ast = stock_of(game, attacker);
    ost[res] = Math.max(0, (ost[res] || 0) - amt);
    ast[res] = (ast[res] || 0) + amt;
  } else { res = null; amt = 0; }

  p.fx = Object.assign(p.fx || { k: 'win', t: game.turn }, { loot: { money, res, amt } });

  let gp = null;
  try { gp = prov_geo().byId[pid]; } catch (e) { /* opcional */ }
  const name = gp ? gp.n : pid;
  const gain = `+$${_m10(money)} M` + (res ? ` y +${amt} ${RES_LABEL[res]}` : '');
  _push_loot(game, { turn: game.turn, by: attacker, from: old_owner, pid, name, money, res, amt, text: `${name}: ${gain}` });
  if (old_owner === game.player) {
    news(game, `${att.name} requisa ${name}: −$${_m10(money)} M` + (res ? ` y −${amt} ${RES_LABEL[res]}` : ''), 'war');
  } else {
    news(game, `${att.name} conquista ${name}: ${gain}`, 'war');
  }

  // Inicializar descontento
  let unrest = 35;
  if (p.cap) unrest += 15;
  const hasEsp = (game.divisions || []).some(d => d.owner === attacker && d.location === p.c && kind_of(d) === 'elite');
  if (hasEsp) unrest -= 10;
  if (!game.ext.unrest) game.ext.unrest = {};
  game.ext.unrest[pid] = Math.max(0, Math.min(100, unrest));
}

// ------------------------------------------------------------------ ayudantes internos
function _dominant_terrain(game, cid) {
  // Cache por país
  if (!_dominant_terrain._cache) _dominant_terrain._cache = {};
  if (_dominant_terrain._cache[cid]) return _dominant_terrain._cache[cid];

  if (!game.ext || !game.ext.prov) return 'P'; // default pampa
  const provs = Object.values(game.ext.prov).filter(p => p.c === cid);
  if (!provs.length) return 'P';

  const count = {};
  let geo = null;
  try { geo = prov_geo(); } catch (e) { return 'P'; }

  for (const p of provs) {
    const pid = Object.keys(game.ext.prov).find(k => game.ext.prov[k] === p);
    const gp = geo.byId[pid];
    if (gp && gp.t) count[gp.t] = (count[gp.t] || 0) + 1;
  }

  let max = 0, dom = 'P';
  for (const [t, n] of Object.entries(count)) {
    if (n > max) { max = n; dom = t; }
  }
  _dominant_terrain._cache[cid] = dom;
  return dom;
}

function _in_combined_arms_formation(game, d) {
  if (!game.ext || !game.ext.forms) return false;
  const forms = game.ext.forms[d.owner] || [];
  const form = forms.find(f => f.divs.includes(d.id));
  if (!form || form.divs.length < 2) return false;

  const kinds = new Set();
  for (const divId of form.divs) {
    const div = (game.divisions || []).find(dd => dd.id === divId);
    if (div && div.location === d.location) kinds.add(div.kind || kind_of(div));
  }
  return kinds.size >= 2;
}

/** Multiplicador de rendimiento por descontento (para supply/provinces). */
export function unrest_yield_mult(game, pid) {
  if (!game.ext || !game.ext.unrest) return 1.0;
  const u = game.ext.unrest[pid] || 0;
  return 1 - u / 200;
}
