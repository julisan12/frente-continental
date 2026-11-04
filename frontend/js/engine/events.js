// Port de backend/app/engine/events.py
// Eventos aleatorios (ambientados en 1962). Algunos ofrecen dos opciones al jugador.
import * as C from './constants.js';
import * as S from './state.js';
import * as E from './economy.js';
import * as P from './py.js';
import { OrderError } from './orders.js';

export const COUP_CHANCE = 0.08;

// Efectos: claves sobre el pais sede: money, stability, industry, production, infrastructure, development,
// troops (fuerzas), rel_neighbors (relacion con todos los vecinos), rel_aligned (con paises del bloque contrario)
export const EVENTS = [
  {id: "energy_crisis", title: "Crisis energética",
   text: "El precio del petróleo se dispara y las refinerías trabajan al límite.",
   options: [
     {text: "Subsidiar combustible (−$300 M, estabilidad estable)", effects: {money: -30, stability: 1}},
     {text: "Dejar subir los precios (−6 estabilidad)", effects: {stability: -6, production: -2}},
   ]},
  {id: "miners_strike", title: "Huelga minera",
   text: "Los sindicatos mineros paralizan las minas exigiendo mejores salarios.",
   options: [
     {text: "Negociar aumentos (−$250 M)", effects: {money: -25, stability: 3}},
     {text: "Enviar al ejército (−3 producción, −5 estabilidad)", effects: {production: -3, stability: -5}},
   ]},
  {id: "coup", title: "Rumores de golpe de Estado",
   text: "Un grupo de coroneles conspira en los cuarteles de la capital.",
   options: [
     {text: "Purgar el alto mando (−8 tropas, +4 estabilidad)", effects: {troops: -8, stability: 4}},
     {text: "Comprar lealtades (−$400 M)", effects: {money: -40}},
   ]},
  {id: "foreign_aid", title: "Ayuda extranjera",
   text: "Una potencia extranjera ofrece un paquete de ayuda a cambio de alineamiento.",
   options: [
     {text: "Aceptar la ayuda (+$500 M, −10 relación con vecinos)", effects: {money: 50, rel_neighbors: -10}},
     {text: "Rechazarla con dignidad (+4 estabilidad)", effects: {stability: 4}},
   ]},
  {id: "export_boom", title: "Boom exportador",
   text: "Los precios internacionales de las materias primas suben con fuerza.",
   effects: {money: 35, stability: 2}},
  {id: "earthquake", title: "Terremoto",
   text: "Un fuerte sismo sacude varias provincias y destruye caminos.",
   effects: {infrastructure: -6, production: -2, stability: -3}},
  {id: "missile_crisis", title: "Crisis de los misiles",
   text: "El mundo contiene la respiración: la tensión entre bloques recorre el continente.",
   options: [
     {text: "Movilizar reservas (+10 tropas, −4 relación con vecinos)", effects: {troops: 10, rel_neighbors: -4}},
     {text: "Llamar a la calma (+6 relación con vecinos)", effects: {rel_neighbors: 6, stability: -1}},
   ]},
  {id: "good_harvest", title: "Cosecha récord",
   text: "El campo produce una cosecha excepcional este año.",
   effects: {money: 20, stability: 3}},
  {id: "student_protests", title: "Protestas estudiantiles",
   text: "Miles de estudiantes marchan por las avenidas exigiendo reformas.",
   options: [
     {text: "Reforma educativa (−$200 M, +desarrollo)", effects: {money: -20, development: 0.3, stability: 2}},
     {text: "Disolver las marchas (−5 estabilidad)", effects: {stability: -5}},
   ]},
  {id: "industrial_credit", title: "Crédito industrial",
   text: "Un banco internacional ofrece crédito barato para la industria nacional.",
   effects: {industry: 5, money: -10}},
  {id: "border_incident", title: "Incidente fronterizo",
   text: "Una patrulla cruza la frontera por error y se produce un tiroteo.",
   effects: {rel_neighbors: -8, stability: -1}},
  {id: "tourism", title: "Auge del turismo",
   text: "Las playas y ruinas atraen visitantes de todo el mundo.",
   effects: {money: 15, infrastructure: 2}},
  {id: "us_aid", title: "Alianza para el Progreso",
   text: "Washington ofrece ayuda económica a cambio de alinearse contra el comunismo.",
   options: [
     {text: "Aceptar la ayuda (+$600 M, +5 industria, −4 estabilidad, −8 relación con vecinos)",
      effects: {money: 60, industry: 5, stability: -4, rel_neighbors: -8}},
     {text: "Declinar con orgullo nacional (+3 estabilidad)", effects: {stability: 3}},
   ]},
  {id: "soviet_aid", title: "Asesores soviéticos",
   text: "Moscú envía asesores técnicos y militares y ofrece armas a precio de amigo.",
   options: [
     {text: "Recibir a los asesores (+$400 M, +6 tropas, +3 industria, −5 estabilidad, −6 relación con vecinos)",
      effects: {money: 40, troops: 6, industry: 3, stability: -5, rel_neighbors: -6}},
     {text: "Mantener la neutralidad (+2 estabilidad)", effects: {stability: 2}},
   ]},
  {id: "military_coup", title: "Golpe militar",
   text: "Los cuarteles se sublevan y el gobierno pende de un hilo.",
   options: [
     {text: "Negociar con los golpistas (−$500 M, +8 estabilidad)", effects: {money: -50, stability: 8}},
     {text: "Resistir con las fuerzas leales (−5 tropas, −10 estabilidad)", effects: {troops: -5, stability: -10}},
   ]},
];
export const _BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

const _has = (obj, k) => obj != null && k != null && Object.prototype.hasOwnProperty.call(obj, k);

// f"{val:+g}" (precision 6, sin ceros finales)
function _fmt_g_signed(val) {
  const x = Number(val);
  const sign = (x < 0 || Object.is(x, -0)) ? "-" : "+";
  const a = Math.abs(x);
  if (a === 0) return sign + "0";
  if (!isFinite(a)) return sign + (isNaN(a) ? "nan" : "inf");
  const expStr = a.toExponential(5); // d.ddddde±X (6 cifras significativas)
  const [mant, ex] = expStr.split("e");
  const exp = parseInt(ex, 10);
  let body;
  if (exp >= -4 && exp < 6) {
    body = a.toFixed(Math.max(0, 5 - exp));
    if (body.includes(".")) body = body.replace(/0+$/, "").replace(/\.$/, "");
  } else {
    let m = mant;
    if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
    const ae = Math.abs(exp);
    body = `${m}e${exp < 0 ? "-" : "+"}${ae < 10 ? "0" + ae : ae}`;
  }
  return sign + body;
}

export function _clamp(v, lo, hi) {
  // max(lo, min(hi, v)) con la semantica de Python (primer extremo gana)
  const m = v < hi ? v : hi;
  return m > lo ? m : lo;
}

export function apply_effects(game, ent, effects) {
  // Aplica efectos al pais sede de la entidad; devuelve descripciones.
  const c = _has(game["countries"], ent) ? game["countries"][ent] : null;
  if (c === null || c === undefined || !S.is_alive(game, ent)) {
    return [];
  }
  const out = [];
  for (const [key, val] of Object.entries(effects)) {
    if (key === "money") {
      const v = c["money"] + val;
      c["money"] = v > 0.0 ? v : 0.0;
      out.push(`Dinero ${val >= 0 ? '+' : '−'}${S.money_str(Math.abs(val))}`);
    } else if (key === "stability") {
      c["stability"] = _clamp(c["stability"] + val, 0, 100);
      out.push(`Estabilidad ${_fmt_g_signed(val)}`);
    } else if (key === "industry" || key === "production") {
      const v = c[key] + val;
      c[key] = v > 1.0 ? v : 1.0;
      out.push(`${key === 'industry' ? 'Industria' : 'Producción'} ${_fmt_g_signed(val)}`);
    } else if (key === "infrastructure") {
      c["infrastructure"] = _clamp(c["infrastructure"] + val, 0, 100);
      out.push(`Infraestructura ${_fmt_g_signed(val)}`);
    } else if (key === "development") {
      const v = c["development"] + val;
      c["development"] = v > 0.0 ? v : 0.0;
      out.push(`Desarrollo ${_fmt_g_signed(val)}`);
    } else if (key === "troops") {
      if (val >= 0) {
        E.add_forces(game, ent, val, 0, 0);
      } else {
        const divs = P.sortedBy(S.divisions_of(game, ent), (d) => -d["troops"]);
        if (divs.length) {
          const v = divs[0]["troops"] + val;
          divs[0]["troops"] = v > 1.0 ? v : 1.0;
        }
      }
      S.sync_armies(game);
      out.push(`Tropas ${_fmt_g_signed(val)} mil`);
    } else if (key === "rel_neighbors") {
      const adj = S.adjacency();
      const nbs = (adj instanceof Map ? adj.get(ent) : (_has(adj, ent) ? adj[ent] : null)) || [];
      const owners = new Set();
      for (const nb of nbs) {
        if (_has(game["countries"], nb)) owners.add(game["countries"][nb]["owner"]);
      }
      owners.delete(ent);
      for (const o of P.sortedBy([...owners], (x) => x)) {
        S.add_rel(game, ent, o, val);
      }
      out.push(`Relación con vecinos ${_fmt_g_signed(val)}`);
    }
  }
  return out;
}

export function _public(ev) {
  return {
    id: ev["id"], title: ev["title"], text: ev["text"],
    options: (ev["options"] || []).map((o, i) => ({id: i, text: o["text"]})),
  };
}

export function roll_events(game) {
  // Tira eventos para el jugador y algunas IA al final del turno.
  const player = game["player"];
  const rng = S.make_rng(game, "event");
  if (!_has(game, "flags")) game["flags"] = {};
  const flags = game["flags"];
  let forced = null;
  if (game["turn"] === 10 && !P.truthy(flags["cuban_crisis"])) {
    flags["cuban_crisis"] = true;
    forced = _BY_ID["missile_crisis"];
  } else if (S.is_alive(game, player) && game["countries"][player]["stability"] < 30 && rng.random() < COUP_CHANCE) {
    forced = _BY_ID["military_coup"];
  }
  if (S.is_alive(game, player) && (game["active_event"] === null || game["active_event"] === undefined)
      && (forced || rng.random() < C.EVENT_CHANCE)) {
    const ev = forced || rng.choice(EVENTS);
    if (P.truthy(ev["options"])) {
      game["active_event"] = _public(ev);
      S.add_log(game, `Evento: ${ev['title']}. Se requiere una decisión.`, "event");
    } else {
      const fx = apply_effects(game, player, ev["effects"]);
      S.add_log(game, `Evento: ${ev['title']} — ${ev['text']} (${fx.join(', ')})`, "event");
    }
  }
  for (const ent of S.entities(game)) {
    if (ent === player) {
      continue;
    }
    const c = _has(game["countries"], ent) ? game["countries"][ent] : null;
    if (P.truthy(c) && S.is_alive(game, ent) && c["stability"] < 30 && rng.random() < COUP_CHANCE) {
      apply_effects(game, ent, {stability: -10, troops: -5});
      S.add_log(game, `${S.display_name(game, ent)}: golpe militar.`, "event");
      c["stability"] = _clamp(c["stability"] + 15, 0, 100);
    } else if (rng.random() < C.AI_EVENT_CHANCE) {
      const ev = rng.choice(EVENTS);
      const opts = ev["options"];
      const fx = P.truthy(opts) ? opts[rng.randrange(opts.length)]["effects"] : ev["effects"];
      apply_effects(game, ent, fx);
      if (rng.random() < 0.35) {
        S.add_log(game, `${S.display_name(game, ent)}: ${ev['title']}.`, "event");
      }
    }
  }
}

// int(option) de Python: acepta enteros, floats (trunca), bool y cadenas enteras.
function _py_int(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") {
    if (!isFinite(v)) throw new OrderError("Opción inválida.");
    return Math.trunc(v);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (/^[+-]?\d+(_\d+)*$/.test(s)) return parseInt(s.replace(/_/g, ""), 10);
  }
  throw new OrderError("Opción inválida.");
}

export function apply_choice(game, option) {
  // Resuelve el evento activo del jugador con la opcion elegida.
  const act = game["active_event"];
  if (!P.truthy(act)) {
    throw new OrderError("No hay ningún evento pendiente.");
  }
  const ev = _has(_BY_ID, act["id"]) ? _BY_ID[act["id"]] : null;
  if (ev === null || !P.truthy(ev["options"])) {
    game["active_event"] = null;
    return [];
  }
  option = _py_int(option);
  if (option < 0 || option >= ev["options"].length) {
    throw new OrderError("Opción inválida.");
  }
  const opt = ev["options"][option];
  const fx = apply_effects(game, game["player"], opt["effects"]);
  game["active_event"] = null;
  S.add_log(game, `${ev['title']}: ${opt['text'].split(' (')[0]} (${fx.join(', ')})`, "event");
  return fx;
}
