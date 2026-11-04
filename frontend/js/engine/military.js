// Militar: movimientos, posturas, combate y conquista de territorios.
// Port fiel de backend/app/engine/military.py (mismo orden de funciones y operaciones).
import * as C from './constants.js';
import * as D from './diplomacy.js';
import * as S from './state.js';
import * as P from './py.js';
import * as U from './units.js';
import { country_defense_mult, attack_logistics_mult } from './provinces.js';

// Ganchos de Tanda 1 (neutros cuando game.ext no existe: la paridad con Python se conserva).
const _ext = (game) => !!(game && game.ext);
function _amult(game, d, target) {
    if (!_ext(game)) return 1.0;
    let m = 1.0;
    try { m *= U.div_attack_mult(game, d, target) || 1; } catch (e) { /* neutro */ }
    try { m *= attack_logistics_mult(game, d, target) || 1; } catch (e) { /* neutro */ }
    // Tanda 2: ataque sorpresa (bandera temporal game.ext.surprise = {by, target, mult})
    const sp = game.ext.surprise;
    if (sp && sp.by === d.owner && sp.target === target && sp.mult > 0) m *= sp.mult;
    return m;
}
function _dmult(game, d, target) {
    if (!_ext(game)) return 1.0;
    try { return U.div_defense_mult(game, d, target) || 1; } catch (e) { return 1.0; }
}
function _cmult(game, target) {
    if (!_ext(game)) return 1.0;
    try { return country_defense_mult(game, target) || 1; } catch (e) { return 1.0; }
}
// Tanda 3: contexto de batalla (divisiones enfrentadas) para emparejamientos, estados y perdidas por tipo.
function _battle_begin(game, att, defs) {
    if (!_ext(game)) return;
    game.ext.battle = { att, def: defs };
}
function _battle_end(game) {
    if (_ext(game) && game.ext.battle) delete game.ext.battle;
}
/** Divisiones que pueden combatir (no en carga/recarga/marcha). Sin game.ext devuelve la lista tal cual. */
function _active(game, divs) {
    if (!_ext(game)) return divs;
    return divs.filter(d => { try { return U.can_act(game, d) !== false; } catch (e) { return true; } });
}
/** Fraccion de perdidas ajustada por tipo (tanque pesado x4 ante antitanque, artilleria a distancia 0, fortaleza...). */
function _lmult(game, d, opp, attacking) {
    if (!_ext(game)) return 1.0;
    try { const m = U.loss_mult(game, d, opp, attacking); return Number.isFinite(m) && m >= 0 ? m : 1.0; } catch (e) { return 1.0; }
}

function _has(obj, key) {
    return key !== null && key !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

function _adj_get(adj, cid) {
    if (adj instanceof Map) return adj.get(cid) || [];
    return _has(adj, cid) ? adj[cid] : [];
}

export function _name(game, ent) {
    return S.display_name(game, ent);
}


// ---------------------------------------------------------------- calculo de fuerzas
export function attack_strength(game, divs, target, rng) {
    // Fuerza de ataque total (con penalizacion maritima si no hay ruta terrestre).
    let total = 0.0;
    for (const d of divs) {
        let p = S.division_power(d);
        if (S.is_sea_route(d.location, target)) {
            p *= 1 - C.SEA_PENALTY;
        }
        const own = S.owner_of(game, d.location);
        if (own !== d.owner && !S.allies_of(game, d.owner).includes(own)) {
            p *= C.SUPPLY_PENALTY;  // fuera de suministro
        }
        p *= _amult(game, d, target);
        total += p;
    }
    const [lo, span] = C.ATTACK_RANGE;
    return total * C.ATTACK_FACTOR * (lo + rng.random() * span);
}


export function defenders_at(game, target, attacker) {
    // Divisiones que defienden el territorio: del dueno y sus aliados (no aliados del atacante).
    const owner = S.owner_of(game, target);
    const friends = new Set([owner, ...S.allies_of(game, owner)]);
    for (const x of [attacker, ...S.allies_of(game, attacker)]) friends.delete(x);
    return S.divisions_at(game, target).filter(d => friends.has(d.owner));
}


export function is_enemy_border(game, cid) {
    // True si el territorio linda con algun territorio de una entidad en guerra con su dueno.
    const owner = S.owner_of(game, cid);
    for (const nb of _adj_get(S.adjacency(), cid)) {
        if (_has(game.countries, nb) && S.at_war(game, owner, S.owner_of(game, nb))) {
            return true;
        }
    }
    return false;
}


export function has_front(game, ent) {
    // True si la entidad tiene alguna division en postura 'front' (frente establecido).
    for (const d of S.divisions_of(game, ent)) {
        if (d.stance === "front") {
            return true;
        }
    }
    return false;
}


export function defense_strength(game, divs, target, rng) {
    // Fuerza de defensa: divisiones con bonos de postura + milicia local + infraestructura.
    const rec = game.countries[target];
    const owner = rec.owner;
    const front = has_front(game, owner) && is_enemy_border(game, target);
    let total = C.MILITIA_BASE + rec.infrastructure * C.MILITIA_INFRA;
    for (const d of divs) {
        let mult = 1.0;
        if (d.stance === "defend") {
            mult += C.DEFEND_BONUS;
        }
        if (front && d.owner === owner) {
            mult += C.FRONT_BONUS;
        }
        total += S.division_power(d) * mult * _dmult(game, d, target);
    }
    total *= _cmult(game, target);
    if (owner === target) {
        total *= 1 + C.HOME_DEFENSE_BONUS;  // defensa de la patria: el territorio de origen resiste mejor
    }
    const [lo, span] = C.DEFENSE_RANGE;
    return total * C.DEFENSE_FACTOR * (lo + rng.random() * span) * (1 + rec.infrastructure * C.INFRA_DEF_BONUS);
}


// ---------------------------------------------------------------- perdidas y limpieza
export function _scale(d, fraction) {
    // Reduce las fuerzas de una division; devuelve las tropas perdidas.
    fraction = Math.max(0.0, Math.min(fraction < 1 ? C.MAX_LOSS_FRACTION : 1.0, fraction));
    const lost = d.troops * fraction;
    d.troops -= lost;
    d.tanks *= 1 - fraction;
    d.planes *= 1 - fraction;
    return lost;
}


export function purge_dead(game) {
    // Elimina divisiones aniquiladas y entidades sin territorios.
    const alive = new Set(S.entities(game));
    game.divisions = game.divisions.filter(d => alive.has(d.owner) && S.raw_power(d.troops, d.tanks, d.planes) >= 0.5);
    for (const ent of Object.keys(game.countries).filter(c => !alive.has(c))) {
        _eliminate(game, ent);
    }
}


export function _eliminate(game, ent) {
    // Limpia tratados, guerras, proyectos y ordenes de una entidad sin territorios.
    game.treaties = game.treaties.filter(t => !(t.a === ent || t.b === ent));
    game.wars = game.wars.filter(w => !(w.a === ent || w.b === ent));
    game.projects = game.projects.filter(p => p.owner !== ent);
    game.orders = game.orders.filter(o => o.owner !== ent);
    if (!_has(game, "eliminated")) game.eliminated = {};
    const done = game.eliminated;
    if (!_has(done, ent)) {
        done[ent] = game.turn;
        S.add_log(game, `${_name(game, ent)} ha sido eliminado como potencia independiente.`, "war");
    }
}


// ---------------------------------------------------------------- conquista
export function capture(game, attacker, target) {
    // Transfiere el territorio al atacante con botin economico.
    const rec = game.countries[target];
    const old_owner = rec.owner;
    const ind = rec.industry * C.CAPTURE_INDUSTRY;
    const prod = rec.production * C.CAPTURE_PRODUCTION;
    rec.industry -= ind;
    rec.production -= prod;
    const home = game.countries[attacker];
    home.industry += ind;
    home.production += prod;
    if (old_owner === target) {
        const loot = rec.money * C.CAPTURE_MONEY;
        rec.money -= loot;
        home.money += loot;
    }
    rec.owner = attacker;
    home.stability = Math.min(100.0, home.stability + C.CAPTURE_STAB_GAIN);
    game.countries[old_owner].stability = Math.max(0.0, game.countries[old_owner].stability - C.CAPTURE_STAB_LOSS);
    S.add_rel(game, attacker, old_owner, -10);
    S.add_log(game, `${_name(game, attacker)} conquista ${_name(game, target)} (antes de ${_name(game, old_owner)}).`, "war");
    if (_ext(game)) { try { U.on_capture(game, attacker, target, old_owner); } catch (e) { /* botin opcional */ } }
}


export function _retreat(game, d, lost_cid, attacker) {
    // Hace retroceder a una division derrotada a un territorio amigo adyacente, o la aniquila.
    const friends = new Set([d.owner, ...S.allies_of(game, d.owner)]);
    const options = P.sortedBy(_adj_get(S.adjacency(), lost_cid), n => n)
        .filter(n => friends.has(S.owner_of(game, n)) && S.owner_of(game, n) !== attacker);
    if (options.length) {
        d.location = options[0];
        d.org = Math.max(10, d.org - 20);
    } else {
        d.troops = d.tanks = d.planes = 0.0;
    }
}


// ---------------------------------------------------------------- resolucion de un asalto
export function resolve_assault(game, attacker, target, divs, rng) {
    // Resuelve el ataque combinado de `divs` contra `target`.
    const defender = S.owner_of(game, target);
    if (!S.at_war(game, attacker, defender)) {
        D.declare_war(game, attacker, defender, rng, " al atacar su territorio");
    }
    const allDefs = defenders_at(game, target, attacker);
    const defs = _active(game, allDefs);
    _battle_begin(game, divs, defs);
    const att = attack_strength(game, divs, target, rng);
    const dfn = defense_strength(game, defs, target, rng);
    const won = att > dfn;
    let att_lost = 0.0;
    let def_lost = 0.0;
    if (won) {
        const frac = Math.min(C.MAX_LOSS_FRACTION, C.WIN_LOSS * dfn / Math.max(att, 0.01));
        for (const d of divs) {
            att_lost += _scale(d, frac * _lmult(game, d, defs, true));
            d.org = Math.max(0, d.org - C.ORG_ATTACK_COST);
        }
        for (const d of allDefs) {
            const f = Math.min(1, C.DEFEATED_DEF_LOSS * _lmult(game, d, divs, false));
            def_lost += d.troops * f;
            _scale_full(d, f);
        }
        capture(game, attacker, target);
        for (const d of allDefs) {
            _retreat(game, d, target, attacker);
        }
        for (const d of divs) {
            d.location = target;
            d.stance = "idle";
        }
    } else {
        const frac_a = Math.min(C.MAX_LOSS_FRACTION, C.LOSE_ATT_LOSS * dfn / Math.max(att, 0.01));
        const frac_d = Math.min(C.MAX_LOSS_FRACTION, C.LOSE_DEF_LOSS * att / Math.max(dfn, 0.01));
        for (const d of divs) {
            att_lost += _scale(d, frac_a * _lmult(game, d, defs, true));
            d.org = Math.max(0, d.org - C.ORG_LOSE_COST);
        }
        for (const d of allDefs) {
            def_lost += _scale(d, frac_d * _lmult(game, d, divs, false));
        }
    }
    _battle_end(game);
    const war = S.find_war(game, attacker, defender);
    if (war) {
        war.last_combat = game.turn;
    }
    S.add_log(game, `Batalla por ${_name(game, target)}: ${_name(game, attacker)} ` +
                    `${won ? 'vence' : 'es rechazado'} (${P.fmtFixed(att, 0)} contra ${P.fmtFixed(dfn, 0)}).`, "war");
    return {"target": target, "target_name": _name(game, target), "attacker": attacker,
            "defender": defender, "attack": P.pyRound(att, 1), "defense": P.pyRound(dfn, 1), "won": won,
            "attacker_losses": P.pyRound(att_lost, 1), "defender_losses": P.pyRound(def_lost, 1),
            "captured": won};
}


export function _scale_full(d, fraction) {
    // Pierde `fraction` de todas las fuerzas sin tope de perdida.
    d.troops *= 1 - fraction;
    d.tanks *= 1 - fraction;
    d.planes *= 1 - fraction;
}


// ---------------------------------------------------------------- resolucion de ordenes
export function _valid_division(game, order) {
    const d = S.find_division(game, order.division_id === undefined ? "" : order.division_id);
    if (d === null || d === undefined || d.owner !== order.owner) {
        return null;
    }
    return d;
}


export function resolve_stances(game, orders) {
    // Aplica defend/front/reorganize. Devuelve ids de divisiones que se reorganizan.
    const reorg = new Set();
    for (const o of orders) {
        const d = _valid_division(game, o);
        if (d === null) {
            continue;
        }
        if (o.type === "defend") {
            d.stance = "defend";
        } else if (o.type === "front") {
            d.stance = "front";
        } else if (o.type === "reorganize") {
            reorg.add(d.id);
        }
    }
    return reorg;
}


export function resolve_moves(game, orders) {
    // Aplica los movimientos validos; devuelve ids de divisiones movidas.
    const moved = new Set();
    for (const o of orders) {
        if (o.type !== "move") {
            continue;
        }
        const d = _valid_division(game, o);
        if (d === null) {
            continue;
        }
        const tgt = o.target === undefined ? null : o.target;
        if (!_has(game.countries, tgt) || !S.is_adjacent(d.location, tgt)) {
            continue;
        }
        const town_owner = S.owner_of(game, tgt);
        if (town_owner !== d.owner && !S.allies_of(game, d.owner).includes(town_owner)) {
            continue;
        }
        const from = d.location;
        d.location = tgt;
        d.stance = "idle";
        moved.add(d.id);
        if (_ext(game)) { try { U.on_move(game, d, from, tgt); } catch (e) { /* neutro */ } }
    }
    return moved;
}


export function resolve_attacks(game, orders, rng) {
    // Agrupa y resuelve los ataques. Devuelve [batallas, ids de atacantes].
    const groups = new Map();  // "att\0tgt" -> {key: [att, tgt], divs: []}
    for (const o of orders) {
        if (o.type !== "attack") {
            continue;
        }
        const d = _valid_division(game, o);
        const tgt = o.target === undefined ? null : o.target;
        if (d === null || !_has(game.countries, tgt) || d.org < C.ORG_MIN_ATTACK) {
            continue;
        }
        if (_ext(game) && !_active(game, [d]).length) {
            continue;
        }
        if (!S.is_adjacent(d.location, tgt)) {
            continue;
        }
        const defender = S.owner_of(game, tgt);
        const att = d.owner;
        if (defender === att || S.allies_of(game, att).includes(defender)) {
            continue;
        }
        const k = att + "\u0000" + tgt;
        if (!groups.has(k)) groups.set(k, {key: [att, tgt], divs: []});
        groups.get(k).divs.push(d);
    }
    const battles = [];
    const attackers = new Set();
    const items = P.sortedBy([...groups.values()], g => g.key);
    for (const g of items) {
        const [att, tgt] = g.key;
        const divs = g.divs.filter(d => S.raw_power(d.troops, d.tanks, d.planes) >= 0.5);
        if (!divs.length || !S.is_alive(game, att)) {
            continue;
        }
        const defender = S.owner_of(game, tgt);
        if (defender === att || S.allies_of(game, att).includes(defender)) {
            continue;
        }
        for (const d of divs) attackers.add(d.id);
        battles.push(resolve_assault(game, att, tgt, divs, rng));
        purge_dead(game);
    }
    return [battles, attackers];
}


export function recover_org(game, skip, reorg) {
    // Recupera organizacion segun la postura (excepto atacantes).
    for (const d of game.divisions) {
        if (skip.has(d.id)) {
            continue;
        }
        let gain;
        if (reorg.has(d.id)) {
            gain = C.ORG_REORG;
        } else if (d.stance === "defend" || d.stance === "front") {
            gain = C.ORG_DEFEND;
        } else {
            gain = C.ORG_IDLE;
        }
        d.org = Math.min(100, d.org + gain);
    }
}


export function resolve_military(game, orders, rng) {
    // Fase militar completa: posturas, movimientos, ataques y recuperacion.
    const reorg = resolve_stances(game, orders);
    resolve_moves(game, orders);
    const [battles, attackers] = resolve_attacks(game, orders, rng);
    recover_org(game, attackers, reorg);
    purge_dead(game);
    return battles;
}
