// Unidades especializadas, formaciones (agrupaciones), modificadores de combate (tipo y terreno),
// botin de guerra y descontento en provincias conquistadas. Estado en game.ext.* (ver abajo).
// Puro: sin DOM. Se invoca desde features.js (init/action/turn/pending) y mediante ganchos
// opcionales desde military.js / provinces.js. Cuando game.ext no existe, todos los ganchos son neutros.
//
// ESTADO (inicializacion perezosa; partidas antiguas no deben romperse):
//   game.divisions[i].kind : 'inf'|'mot'|'arm'|'art'|'mtn'|'mar'|'air'|'esp'  (si falta, se infiere por el nombre)
//   game.ext.forms[cid]    : [{ id, name, divs:[divisionId...] }]   formaciones (agrupaciones de divisiones)
//   game.ext.unrest[pid]   : 0..100  descontento en provincias ocupadas (dueno != pais original)
//   game.ext.loot          : [{ turn, by, from, money, text }]  registro de botin (max 40)
//
// ACCIONES (ext_action -> action(game, body)): devuelve {ok,msg}|{ok:false,error} o null si no es suya.
//   { action:'unit_recruit', kind, pid? }   recluta/produce una unidad del tipo en la provincia pid (propia) o en la capital
//   { action:'form_create', name, divs:[ids] } / { action:'form_dissolve', id } / { action:'form_order', id, type, target }
//
import { ensure, ok, err, news, r2 } from './extutil.js';
import { sync_armies, at_war, is_sea_route } from './state.js';
import { stock_of } from './supply.js';
import { prov_geo } from './provinces.js';

/** Catalogo de tipos de unidad. icon = nombre en icons.js ICON_PATHS; color para el mapa. */
export const UNIT_TYPES = {
  inf: { name: 'Infantería', icon: 'infantry', color: '#7b8a4a', troops: 12, tanks: 0, planes: 0, cost: 80, tech: null, needs: {},
    atk: 1.0, def: 1.15, desc: 'Columna vertebral del ejército: barata, sólida en defensa y en terreno difícil.' },
  mot: { name: 'Infantería motorizada', icon: 'truck', color: '#8a7a4a', troops: 10, tanks: 2, planes: 0, cost: 120, tech: 'arm1', needs: { fuel: 2 },
    atk: 1.1, def: 1.0, desc: 'Camiones y transportes: más rápida y con pegada en llanura.' },
  arm: { name: 'Blindados', icon: 'tank', color: '#5a6470', troops: 6, tanks: 6, planes: 0, cost: 170, tech: 'arm2', needs: { metal: 6, fuel: 4 },
    atk: 1.35, def: 1.0, desc: 'Punta de lanza en pampa y sabana; sufre en selva y montaña.' },
  art: { name: 'Artillería', icon: 'artillery', color: '#8a5a3a', troops: 6, tanks: 1, planes: 0, cost: 130, tech: 'art1', needs: { metal: 4 },
    atk: 1.25, def: 0.8, desc: 'Fuego de apoyo que ablanda fortificaciones. Frágil si queda sola.' },
  mtn: { name: 'Cazadores de montaña', icon: 'mountain', color: '#6b5a45', troops: 10, tanks: 0, planes: 0, cost: 110, tech: 'inf2', needs: {},
    atk: 1.05, def: 1.1, desc: 'Especialistas en montaña y altiplano.' },
  mar: { name: 'Infantería de marina', icon: 'anchor', color: '#4f7a9a', troops: 9, tanks: 0, planes: 0, cost: 130, tech: 'inf3', needs: { fuel: 1 },
    atk: 1.1, def: 1.0, desc: 'Sin penalización por desembarco marítimo.' },
  air: { name: 'Aviación táctica', icon: 'plane', color: '#4a9a8f', troops: 2, tanks: 0, planes: 4, cost: 200, tech: 'air1', needs: { fuel: 6, metal: 4 },
    atk: 1.3, def: 0.9, desc: 'Rápida y letal; exige combustible cada turno.' },
  esp: { name: 'Fuerzas especiales', icon: 'star', color: '#8a5a9a', troops: 5, tanks: 0, planes: 0, cost: 160, tech: 'inf4', needs: {},
    atk: 1.4, def: 1.0, desc: 'Comandos de élite: golpes decisivos y menos descontento en la ocupación.' },
};

/** Tipo de una division (si falta `kind`, se infiere por el nombre). */
export function kind_of(d) {
  if (d.kind && UNIT_TYPES[d.kind]) return d.kind;
  const n = String(d.name || '');
  if (/Blindad/i.test(n)) return 'arm';
  if (/Aerotransport|Aérea|Aerea/i.test(n)) return 'air';
  if (/Motorizad|Mecanizad|Caballer/i.test(n)) return 'mot';
  if (/Artiller/i.test(n)) return 'art';
  if (/Montaña|Montana/i.test(n)) return 'mtn';
  if (/Marina/i.test(n)) return 'mar';
  if (/Especial/i.test(n)) return 'esp';
  return 'inf';
}

// ------------------------------------------------------------------ interfaz estandar
export function init(game) {
  if (!game.ext) return;
  ensure(game.ext, 'forms', () => ({}));
  ensure(game.ext, 'unrest', () => ({}));
  ensure(game.ext, 'loot', () => []);
  // Inferir y persistir kinds de todas las divisiones existentes
  for (const d of game.divisions || []) {
    if (!d.kind) d.kind = kind_of(d);
  }
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
        const techNames = { inf1:'Doctrina de fusileros', inf2:'Guerra de montaña y selva', inf3:'Movilización de reservas', inf4:'Fuerzas especiales',
          arm1:'Motorización', arm2:'Carros medios', arm3:'Blindaje compuesto', arm4:'Guerra de maniobra',
          art1:'Artillería de campaña', art2:'Control de fuego', art3:'Cohetes de saturación', art4:'Defensa antiaérea',
          air1:'Cazas a reacción', air2:'Radar y alerta temprana', air3:'Bombarderos tácticos', air4:'Supremacía aérea' };
        return err(`Requiere la tecnología: ${techNames[ut.tech] || ut.tech}.`);
      }
    }
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
    const nextId = Math.max(0, ...(game.divisions || []).map(d => Number(d.id) || 0)) + 1;
    const count = (game.divisions || []).filter(d => d.owner === me && d.kind === kind).length + 1;
    const ordinal = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª', '14ª', '15ª'][count] || count + 'ª';
    const nameMap = { inf:'División de Infantería', mot:'División Motorizada', arm:'Brigada Blindada', art:'Regimiento de Artillería',
      mtn:'Batallón de Montaña', mar:'Infantería de Marina', air:'Ala Aérea', esp:'Fuerzas Especiales' };
    const name = ordinal + ' ' + (nameMap[kind] || 'División');
    const div = {
      id: String(nextId), name, owner: me, location, kind,
      troops: ut.troops, tanks: ut.tanks, planes: ut.planes,
      stance: 'idle', org: 80
    };
    if (!game.divisions) game.divisions = [];
    game.divisions.push(div);
    sync_armies(game);
    return ok(`${name} reclutada en ${game.countries[location].name}.`);
  }

  if (body.action === 'form_create') {
    const divs = body.divs || [];
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
    const idx = forms.findIndex(f => f.id === body.id);
    if (idx < 0) return err('Formación no encontrada.');
    const f = forms.splice(idx, 1)[0];
    return ok(`Formación "${f.name}" disuelta.`);
  }

  if (body.action === 'form_order') {
    const forms = game.ext.forms[me] || [];
    const form = forms.find(f => f.id === body.id);
    if (!form) return err('Formación no encontrada.');
    // NOTE: Encolar órdenes se maneja desde la UI; aquí solo validamos
    // La UI llamará sendOrder para cada división por separado
    return ok(`Formación "${form.name}" lista para recibir órdenes.`);
  }

  return null;
}

/** Fase de turno (tras prov_turn). `lines` son lineas del informe del jugador. */
export function turn(game, rng, lines) {
  if (!game.ext) return;
  const me = game.player;

  // Inferir y persistir kinds de todas las divisiones
  for (const d of game.divisions || []) {
    if (!d.kind) d.kind = kind_of(d);
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
    const nextId = Math.max(0, ...(game.divisions || []).map(d => Number(d.id) || 0)) + 1;
    const count = (game.divisions || []).filter(d => d.owner === cid && d.kind === kind).length + 1;
    const div = {
      id: String(nextId), name: `${count}ª ${ut.name}`, owner: cid, location: cid, kind,
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
    const hasEsp = (game.divisions || []).some(d => d.owner === p.o && d.location === p.c && d.kind === 'esp');
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
  return out.slice(0, 4);
}

// ------------------------------------------------------------------ ganchos
/** Tabla de modificadores de terreno y emparejamientos (para la UI). */
export const MODS = {
  inf: { terr: { S: 1.1, B: 1.1, T: 1.1 }, desc: 'Sólida en selva, bosque y tropical defendiendo' },
  mot: { terr: { P: 1.15, V: 1.15, E: 1.1 }, desc: 'Rápida en pampa, sabana y estepa' },
  arm: { terr: { P: 1.25, V: 1.25, E: 1.25, D: 1.2, S: 0.7, M: 0.7, A: 0.7 }, desc: 'Excelente en llanuras; sufre en selva, montaña y altiplano' },
  art: { terr: { S: 0.9 }, desc: 'Penalización leve en selva; bono contra fortalezas' },
  mtn: { terr: { M: 1.3, A: 1.3, S: 1.1 }, desc: 'Especialista en montaña, altiplano y selva' },
  mar: { terr: {}, desc: 'Sin penalización por desembarco marítimo' },
  air: { terr: { S: 0.85, D: 1.1, P: 1.1 }, desc: 'Penalización en selva; bono en desierto y pampa' },
  esp: { terr: {}, desc: 'Élite: bono en todo combate y reduce descontento' },
};

/** Multiplicador de ataque de una division contra el territorio `target` (tipo + terreno). */
export function div_attack_mult(game, d, target) {
  if (!game.ext) return 1.0;
  const kind = d.kind || kind_of(d);
  const ut = UNIT_TYPES[kind];
  if (!ut) return 1.0;
  let m = ut.atk;

  // Terreno dominante del país objetivo
  const terrainType = _dominant_terrain(game, target);
  const modT = MODS[kind] && MODS[kind].terr ? MODS[kind].terr[terrainType] : 1.0;
  m *= modT || 1.0;

  // Compensar penalización marítima para marina
  if (kind === 'mar' && is_sea_route(d.location, target)) {
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
  let m = ut.def;

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
  if (game.ext.stock && game.ext.stock[old_owner] && game.ext.stock[attacker]) {
    const oldStock = game.ext.stock[old_owner];
    const newStock = game.ext.stock[attacker];
    const loot = {};
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
  const money = Math.round(game.countries[target].money * 0.25);
  const entry = {
    turn: game.turn,
    by: attacker,
    from: old_owner,
    money,
    text: `Conquista de ${game.countries[target].name}: +${money} dinero`
  };
  game.ext.loot.push(entry);
  if (game.ext.loot.length > 40) game.ext.loot.splice(0, game.ext.loot.length - 40);

  news(game, `${game.countries[attacker].name} saquea ${game.countries[target].name}.`, 'war');
}

/** Conquista de una provincia (provinces.prov_attack): botin y descontento. */
export function on_prov_capture(game, attacker, pid, old_owner) {
  if (!game.ext || !game.ext.prov) return;
  const p = game.ext.prov[pid];
  if (!p) return;

  // Botín de dinero
  const buildSum = (p.b.base || 0) + (p.b.fabrica || 0) + (p.b.refineria || 0) + (p.b.mina || 0) + (p.b.granja || 0);
  const base = 8 + buildSum * 6 + (p.cap ? 10 : 0);
  const loot = Math.min(base, game.countries[old_owner].money);
  if (loot > 0) {
    game.countries[old_owner].money = Math.max(0, game.countries[old_owner].money - loot);
    game.countries[attacker].money = (game.countries[attacker].money || 0) + loot;
  }

  // Botín de recursos (20% del stock de la provincia)
  if (game.ext.stock && game.ext.stock[old_owner] && game.ext.stock[attacker] && p.r) {
    const resMap = { petroleo: 'fuel', gas: 'fuel', minerales: 'metal', cobre: 'metal', agro: 'food', madera: 'goods' };
    const res = resMap[p.r];
    if (res) {
      const amt = Math.floor((game.ext.stock[old_owner][res] || 0) * 0.2);
      if (amt > 0) {
        game.ext.stock[old_owner][res] = Math.max(0, (game.ext.stock[old_owner][res] || 0) - amt);
        game.ext.stock[attacker][res] = (game.ext.stock[attacker][res] || 0) + amt;
      }
    }
  }

  // Registrar botín
  let gp = null;
  try { gp = prov_geo().byId[pid]; } catch (e) { /* opcional */ }
  const entry = {
    turn: game.turn,
    by: attacker,
    from: old_owner,
    money: loot,
    text: `${gp ? gp.n : pid}: +${loot} dinero`
  };
  game.ext.loot.push(entry);
  if (game.ext.loot.length > 40) game.ext.loot.splice(0, game.ext.loot.length - 40);

  // Inicializar descontento
  let unrest = 35;
  if (p.cap) unrest += 15;
  const hasEsp = (game.divisions || []).some(d => d.owner === attacker && d.location === p.c && d.kind === 'esp');
  if (hasEsp) unrest -= 10;
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
