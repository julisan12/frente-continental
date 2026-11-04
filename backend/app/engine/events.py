"""Eventos aleatorios (ambientados en 1962). Algunos ofrecen dos opciones al jugador."""
from __future__ import annotations

from .rng import PortableRandom
from typing import Dict, List, Optional

from . import constants as C
from . import state as S
from . import economy as E
from .orders import OrderError

Game = Dict
COUP_CHANCE = 0.08

# Efectos: claves sobre el pais sede: money, stability, industry, production, infrastructure, development,
# troops (fuerzas), rel_neighbors (relacion con todos los vecinos), rel_aligned (con paises del bloque contrario)
EVENTS: List[dict] = [
    {"id": "energy_crisis", "title": "Crisis energética",
     "text": "El precio del petróleo se dispara y las refinerías trabajan al límite.",
     "options": [
         {"text": "Subsidiar combustible (−$300 M, estabilidad estable)", "effects": {"money": -30, "stability": 1}},
         {"text": "Dejar subir los precios (−6 estabilidad)", "effects": {"stability": -6, "production": -2}},
     ]},
    {"id": "miners_strike", "title": "Huelga minera",
     "text": "Los sindicatos mineros paralizan las minas exigiendo mejores salarios.",
     "options": [
         {"text": "Negociar aumentos (−$250 M)", "effects": {"money": -25, "stability": 3}},
         {"text": "Enviar al ejército (−3 producción, −5 estabilidad)", "effects": {"production": -3, "stability": -5}},
     ]},
    {"id": "coup", "title": "Rumores de golpe de Estado",
     "text": "Un grupo de coroneles conspira en los cuarteles de la capital.",
     "options": [
         {"text": "Purgar el alto mando (−8 tropas, +4 estabilidad)", "effects": {"troops": -8, "stability": 4}},
         {"text": "Comprar lealtades (−$400 M)", "effects": {"money": -40}},
     ]},
    {"id": "foreign_aid", "title": "Ayuda extranjera",
     "text": "Una potencia extranjera ofrece un paquete de ayuda a cambio de alineamiento.",
     "options": [
         {"text": "Aceptar la ayuda (+$500 M, −10 relación con vecinos)", "effects": {"money": 50, "rel_neighbors": -10}},
         {"text": "Rechazarla con dignidad (+4 estabilidad)", "effects": {"stability": 4}},
     ]},
    {"id": "export_boom", "title": "Boom exportador",
     "text": "Los precios internacionales de las materias primas suben con fuerza.",
     "effects": {"money": 35, "stability": 2}},
    {"id": "earthquake", "title": "Terremoto",
     "text": "Un fuerte sismo sacude varias provincias y destruye caminos.",
     "effects": {"infrastructure": -6, "production": -2, "stability": -3}},
    {"id": "missile_crisis", "title": "Crisis de los misiles",
     "text": "El mundo contiene la respiración: la tensión entre bloques recorre el continente.",
     "options": [
         {"text": "Movilizar reservas (+10 tropas, −4 relación con vecinos)", "effects": {"troops": 10, "rel_neighbors": -4}},
         {"text": "Llamar a la calma (+6 relación con vecinos)", "effects": {"rel_neighbors": 6, "stability": -1}},
     ]},
    {"id": "good_harvest", "title": "Cosecha récord",
     "text": "El campo produce una cosecha excepcional este año.",
     "effects": {"money": 20, "stability": 3}},
    {"id": "student_protests", "title": "Protestas estudiantiles",
     "text": "Miles de estudiantes marchan por las avenidas exigiendo reformas.",
     "options": [
         {"text": "Reforma educativa (−$200 M, +desarrollo)", "effects": {"money": -20, "development": 0.3, "stability": 2}},
         {"text": "Disolver las marchas (−5 estabilidad)", "effects": {"stability": -5}},
     ]},
    {"id": "industrial_credit", "title": "Crédito industrial",
     "text": "Un banco internacional ofrece crédito barato para la industria nacional.",
     "effects": {"industry": 5, "money": -10}},
    {"id": "border_incident", "title": "Incidente fronterizo",
     "text": "Una patrulla cruza la frontera por error y se produce un tiroteo.",
     "effects": {"rel_neighbors": -8, "stability": -1}},
    {"id": "tourism", "title": "Auge del turismo",
     "text": "Las playas y ruinas atraen visitantes de todo el mundo.",
     "effects": {"money": 15, "infrastructure": 2}},
    {"id": "us_aid", "title": "Alianza para el Progreso",
     "text": "Washington ofrece ayuda económica a cambio de alinearse contra el comunismo.",
     "options": [
         {"text": "Aceptar la ayuda (+$600 M, +5 industria, −4 estabilidad, −8 relación con vecinos)",
          "effects": {"money": 60, "industry": 5, "stability": -4, "rel_neighbors": -8}},
         {"text": "Declinar con orgullo nacional (+3 estabilidad)", "effects": {"stability": 3}},
     ]},
    {"id": "soviet_aid", "title": "Asesores soviéticos",
     "text": "Moscú envía asesores técnicos y militares y ofrece armas a precio de amigo.",
     "options": [
         {"text": "Recibir a los asesores (+$400 M, +6 tropas, +3 industria, −5 estabilidad, −6 relación con vecinos)",
          "effects": {"money": 40, "troops": 6, "industry": 3, "stability": -5, "rel_neighbors": -6}},
         {"text": "Mantener la neutralidad (+2 estabilidad)", "effects": {"stability": 2}},
     ]},
    {"id": "military_coup", "title": "Golpe militar",
     "text": "Los cuarteles se sublevan y el gobierno pende de un hilo.",
     "options": [
         {"text": "Negociar con los golpistas (−$500 M, +8 estabilidad)", "effects": {"money": -50, "stability": 8}},
         {"text": "Resistir con las fuerzas leales (−5 tropas, −10 estabilidad)", "effects": {"troops": -5, "stability": -10}},
     ]},
]
_BY_ID = {e["id"]: e for e in EVENTS}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def apply_effects(game: Game, ent: str, effects: dict) -> List[str]:
    """Aplica efectos al pais sede de la entidad; devuelve descripciones."""
    c = game["countries"].get(ent)
    if c is None or not S.is_alive(game, ent):
        return []
    out = []
    for key, val in effects.items():
        if key == "money":
            c["money"] = max(0.0, c["money"] + val)
            out.append(f"Dinero {'+' if val >= 0 else '−'}{S.money_str(abs(val))}")
        elif key == "stability":
            c["stability"] = _clamp(c["stability"] + val, 0, 100)
            out.append(f"Estabilidad {val:+g}")
        elif key in ("industry", "production"):
            c[key] = max(1.0, c[key] + val)
            out.append(f"{'Industria' if key == 'industry' else 'Producción'} {val:+g}")
        elif key == "infrastructure":
            c["infrastructure"] = _clamp(c["infrastructure"] + val, 0, 100)
            out.append(f"Infraestructura {val:+g}")
        elif key == "development":
            c["development"] = max(0.0, c["development"] + val)
            out.append(f"Desarrollo {val:+g}")
        elif key == "troops":
            if val >= 0:
                E.add_forces(game, ent, troops=val)
            else:
                divs = sorted(S.divisions_of(game, ent), key=lambda d: -d["troops"])
                if divs:
                    divs[0]["troops"] = max(1.0, divs[0]["troops"] + val)
            S.sync_armies(game)
            out.append(f"Tropas {val:+g} mil")
        elif key == "rel_neighbors":
            owners = {game["countries"][nb]["owner"] for nb in S.adjacency().get(ent, []) if nb in game["countries"]}
            owners.discard(ent)
            for o in sorted(owners):
                S.add_rel(game, ent, o, val)
            out.append(f"Relación con vecinos {val:+g}")
    return out


def _public(ev: dict) -> dict:
    return {
        "id": ev["id"], "title": ev["title"], "text": ev["text"],
        "options": [{"id": i, "text": o["text"]} for i, o in enumerate(ev.get("options", []))],
    }


def roll_events(game: Game) -> None:
    """Tira eventos para el jugador y algunas IA al final del turno."""
    player = game["player"]
    rng = S.make_rng(game, "event")
    flags = game.setdefault("flags", {})
    forced = None
    if game.get("turn") == 10 and not flags.get("cuban_crisis"):
        flags["cuban_crisis"] = True
        forced = _BY_ID["missile_crisis"]
    elif S.is_alive(game, player) and game["countries"][player]["stability"] < 30 and rng.random() < COUP_CHANCE:
        forced = _BY_ID["military_coup"]
    if S.is_alive(game, player) and game.get("active_event") is None and (forced or rng.random() < C.EVENT_CHANCE):
        ev = forced or rng.choice(EVENTS)
        if ev.get("options"):
            game["active_event"] = _public(ev)
            S.add_log(game, f"Evento: {ev['title']}. Se requiere una decisión.", "event")
        else:
            fx = apply_effects(game, player, ev["effects"])
            S.add_log(game, f"Evento: {ev['title']} — {ev['text']} ({', '.join(fx)})", "event")
    for ent in S.entities(game):
        if ent == player:
            continue
        c = game["countries"].get(ent)
        if c and S.is_alive(game, ent) and c["stability"] < 30 and rng.random() < COUP_CHANCE:
            apply_effects(game, ent, {"stability": -10, "troops": -5})
            S.add_log(game, f"{S.display_name(game, ent)}: golpe militar.", "event")
            c["stability"] = _clamp(c["stability"] + 15, 0, 100)
        elif rng.random() < C.AI_EVENT_CHANCE:
            ev = rng.choice(EVENTS)
            opts = ev.get("options")
            fx = opts[rng.randrange(len(opts))]["effects"] if opts else ev["effects"]
            apply_effects(game, ent, fx)
            if rng.random() < 0.35:
                S.add_log(game, f"{S.display_name(game, ent)}: {ev['title']}.", "event")


def apply_choice(game: Game, option: int) -> List[str]:
    """Resuelve el evento activo del jugador con la opcion elegida."""
    act = game.get("active_event")
    if not act:
        raise OrderError("No hay ningún evento pendiente.")
    ev = _BY_ID.get(act["id"])
    if ev is None or not ev.get("options"):
        game["active_event"] = None
        return []
    try:
        option = int(option)
    except (TypeError, ValueError):
        raise OrderError("Opción inválida.")
    if option < 0 or option >= len(ev["options"]):
        raise OrderError("Opción inválida.")
    opt = ev["options"][option]
    fx = apply_effects(game, game["player"], opt["effects"])
    game["active_event"] = None
    S.add_log(game, f"{ev['title']}: {opt['text'].split(' (')[0]} ({', '.join(fx)})", "event")
    return fx
