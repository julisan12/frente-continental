// IA de los paises no controlados por el jugador: economia, diplomacia y operaciones militares.
// Port fiel de backend/app/engine/ai.py (mismo orden de funciones y operaciones).
import * as C from './constants.js';
import * as E from './economy.js';
import * as S from './state.js';
import * as P from './py.js';
import { OrderError, queue_order } from './orders.js';

function _has(obj, key) {
    return key !== null && key !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

function _adj_get(adj, cid) {
    if (adj instanceof Map) return adj.get(cid) || [];
    return _has(adj, cid) ? adj[cid] : [];
}

function _project_keys() {
    return C.PROJECTS instanceof Map ? [...C.PROJECTS.keys()] : Object.keys(C.PROJECTS);
}

function _project_cost(kind) {
    const p = C.PROJECTS instanceof Map ? C.PROJECTS.get(kind) : C.PROJECTS[kind];
    return Array.isArray(p) ? p[1] : p.cost;
}


export function _try(game, ent, otype, target = null, division_id = null, params = null) {
    try {
        queue_order(game, ent, otype, target, division_id, params);
        return true;
    } catch (e) {
        if (e instanceof OrderError) return false;
        throw e;
    }
}


export function _memory(game, ent) {
    if (!_has(game, "ai_memory")) game.ai_memory = {};
    const mem = game.ai_memory;
    if (!_has(mem, ent)) mem[ent] = {"last_attack": -99};
    return mem[ent];
}


export function _neighbor_owners(game, ent) {
    // owner -> un territorio fronterizo de ese owner (Map con orden de insercion).
    const adj = S.adjacency();
    const out = new Map();
    for (const t of S.territories_of(game, ent)) {
        for (const nb of _adj_get(adj, t)) {
            if (!_has(game.countries, nb)) {
                continue;
            }
            const o = S.owner_of(game, nb);
            if (o !== ent && S.is_alive(game, o)) {
                if (!out.has(o)) out.set(o, nb);
            }
        }
    }
    return out;
}


export function _threat(game, ent) {
    // Poder enemigo vecino relativo al propio.
    const mine = Math.max(1.0, S.entity_power(game, ent));
    let hostile = 0.0;
    for (const o of _neighbor_owners(game, ent).keys()) {
        if (S.at_war(game, ent, o) || S.get_rel(game, ent, o) <= C.AI_HOSTILE_REL) {
            hostile += S.entity_power(game, o);
        }
    }
    return hostile / mine;
}


export function _economy(game, ent, rng) {
    const c = game.countries[ent];
    const bal = E.balance(game, ent);
    const threat = _threat(game, ent);
    if (c.stability < C.AI_MIN_STABILITY) {
        _try(game, ent, "stability");
    }
    if (threat > 0.9 || S.enemies_of(game, ent).length) {
        for (const t of ["recruit", "tanks", "planes"]) {
            if (c.money > C.ORDER_COSTS[t] * 1.5) {
                _try(game, ent, t);
            }
        }
    }
    if (bal > C.AI_MIN_BALANCE && c.money > C.ORDER_COSTS["build"] * 2) {
        _try(game, ent, "build");
    }
    if (c.money > 400 && rng.random() < 0.3) {
        const kind = rng.choice(_project_keys());
        if (c.money > _project_cost(kind) * 2) {
            _try(game, ent, "project", ent, null, {"kind": kind});
        }
    }
    if (c.money > 300 && rng.random() < 0.35) {
        _try(game, ent, "recruit");
    }
}


export function _diplomacy(game, ent, rng) {
    for (const [o, terr] of _neighbor_owners(game, ent)) {
        if (S.at_war(game, ent, o)) {
            continue;
        }
        const rel = S.get_rel(game, ent, o);
        if (rel >= C.ALLIANCE_MIN_REL && !S.has_treaty(game, "alliance", ent, o) && rng.random() < 0.25) {
            _try(game, ent, "propose_alliance", terr);
        } else if (rel >= C.TRADE_MIN_REL && !S.has_treaty(game, "trade", ent, o) && rng.random() < 0.3) {
            _try(game, ent, "trade", terr);
        } else if (rel >= C.NAP_MIN_REL && !S.has_treaty(game, "nap", ent, o) && rng.random() < 0.2) {
            _try(game, ent, "nap", terr);
        }
    }
}


export function _peace(game, ent) {
    const mine = S.entity_power(game, ent);
    for (const foe of S.enemies_of(game, ent)) {
        if (S.entity_power(game, foe) > mine * 1.2 || game.countries[ent].stability < 30) {
            const terr = S.territories_of(game, foe);
            if (terr.length) {
                _try(game, ent, "peace", terr[0]);
            }
        }
    }
}


export function _offensive(game, ent, rng) {
    if (game.turn < C.AI_START_TURN) {
        return;
    }
    const c = game.countries[ent];
    const mem = _memory(game, ent);
    const mine = S.entity_power(game, ent);
    const aggressive = S.is_aggressive(game, ent);
    const targets = [];
    for (const [o, terr] of _neighbor_owners(game, ent)) {  // eslint-disable-line no-unused-vars
        if (S.has_treaty(game, "alliance", ent, o)) {
            continue;
        }
        const theirs = Math.max(1.0, S.entity_power(game, o));
        if (aggressive && game.turn >= C.AI_GRUDGE_START && theirs < mine * C.AI_WEAK_RATIO
                && !S.has_treaty(game, "nap", ent, o)) {
            S.add_rel(game, ent, o, -C.AI_GRUDGE);
        }
        const at_war = S.at_war(game, ent, o);
        const willing = (mine > theirs * C.AI_OFFENSIVE_RATIO && S.get_rel(game, ent, o) < C.AI_HOSTILE_REL
                   && c.stability > C.AI_MIN_STABILITY
                   && game.turn - mem.last_attack >= C.AI_ATTACK_COOLDOWN);
        if (at_war && mine >= theirs * 0.9) {
            targets.push(o);
        } else if (willing && !S.has_treaty(game, "nap", ent, o)) {
            targets.push(o);
        }
    }
    if (!targets.length) {
        return;
    }
    const adj = S.adjacency();
    const ready = S.divisions_of(game, ent).filter(d => d.org >= C.ORG_MIN_ATTACK);
    const busy = new Set(game.orders.filter(o => o.owner === ent).map(o => o.division_id));
    // agrupa divisiones por territorio objetivo adyacente (Map con orden de insercion)
    const groups = new Map();
    for (const d of ready) {
        if (busy.has(d.id)) {
            continue;
        }
        for (const nb of _adj_get(adj, d.location)) {
            if (_has(game.countries, nb) && targets.includes(S.owner_of(game, nb))) {
                if (!groups.has(nb)) groups.set(nb, []);
                groups.get(nb).push(d);
            }
        }
    }
    const used = new Set();
    let launched = false;
    const order = P.sortedBy([...groups.keys()], t => P.sum(S.divisions_at(game, t).map(x => S.division_power(x))));
    for (const nb of order) {
        const foe = S.owner_of(game, nb);
        const defense = P.sum(S.divisions_at(game, nb).map(x => S.division_power(x)));
        let divs = groups.get(nb).filter(d => !used.has(d.id));
        divs = P.sortedBy(divs, d => S.division_power(d), true);
        const chosen = [];
        let total = 0.0;
        for (const d of divs) {
            chosen.push(d);
            total += S.division_power(d);
            if (total >= defense * C.AI_ATTACK_MARGIN) {
                break;
            }
        }
        if (!chosen.length || (total < defense * C.AI_ATTACK_MARGIN && !S.at_war(game, ent, foe))) {
            continue;
        }
        for (const d of chosen) {
            if (_try(game, ent, "attack", nb, d.id)) {
                used.add(d.id);
                launched = true;
            }
        }
    }
    if (launched) {
        mem.last_attack = game.turn;
    }
    _reposition(game, ent, targets, used);
}


export function _reposition(game, ent, targets, used) {
    // Mueve divisiones ociosas hacia la frontera con los objetivos.
    const adj = S.adjacency();
    const tset = new Set(targets);
    const own = new Set(S.territories_of(game, ent));
    const border = new Set();
    for (const t of own) {
        if (_adj_get(adj, t).some(nb => _has(game.countries, nb) && tset.has(S.owner_of(game, nb)))) {
            border.add(t);
        }
    }
    if (!border.size) {
        return;
    }
    const busy = new Set(game.orders.filter(o => o.owner === ent).map(o => o.division_id));
    for (const d of S.divisions_of(game, ent)) {
        if (busy.has(d.id) || used.has(d.id) || border.has(d.location)) {
            continue;
        }
        // BFS por territorios propios hasta la frontera
        const prev = new Map([[d.location, null]]);
        const queue = [d.location];
        let goal = null;
        while (queue.length && goal === null) {
            const cur = queue.shift();
            for (const nb of _adj_get(adj, cur)) {
                if (prev.has(nb) || !own.has(nb)) {
                    continue;
                }
                prev.set(nb, cur);
                if (border.has(nb)) {
                    goal = nb;
                    break;
                }
                queue.push(nb);
            }
        }
        if (goal === null) {
            continue;
        }
        let step = goal;
        while (prev.get(step) !== d.location) {
            step = prev.get(step);
        }
        _try(game, ent, "move", step, d.id);
    }
}


export function _defensive(game, ent) {
    const busy = new Set(game.orders.filter(o => o.owner === ent).map(o => o.division_id));
    const adj = S.adjacency();
    const enemies = new Set(S.enemies_of(game, ent));
    for (const d of S.divisions_of(game, ent)) {
        if (busy.has(d.id)) {
            continue;
        }
        if (d.org < C.ORG_REORG) {
            _try(game, ent, "reorganize", null, d.id);
            continue;
        }
        const threatened = _adj_get(adj, d.location).some(nb => _has(game.countries, nb) && enemies.has(S.owner_of(game, nb)));
        if (threatened && d.stance !== "defend") {
            _try(game, ent, "defend", null, d.id);
        }
    }
}


export function generate_ai_orders(game) {
    // Genera las ordenes de todas las entidades IA vivas.
    for (const ent of S.entities(game)) {
        if (ent === game.player || !S.is_alive(game, ent)) {
            continue;
        }
        const rng = S.make_rng(game, `ai-${ent}`);
        try {
            _peace(game, ent);
            _offensive(game, ent, rng);
            _defensive(game, ent);
            _diplomacy(game, ent, rng);
            _economy(game, ent, rng);
        } catch (e) {
            if (!(e instanceof OrderError)) throw e;
        }
    }
}
