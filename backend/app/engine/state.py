"""Estado del juego: carga de datos, ayudantes de consulta y creacion de partidas."""
from __future__ import annotations

import json
import math
import random  # solo para elegir semilla nueva en new_game
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from . import constants as C
from .rng import PortableRandom

Game = Dict[str, Any]
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "countries.json"


# ---------------------------------------------------------------- datos estaticos
@lru_cache(maxsize=1)
def load_countries() -> List[Dict[str, Any]]:
    """Lee la lista de los 24 paises desde countries.json."""
    with open(DATA_FILE, encoding="utf8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def country_index() -> Dict[str, Dict[str, Any]]:
    """Devuelve {id: datos estaticos}."""
    return {c["id"]: c for c in load_countries()}


@lru_cache(maxsize=1)
def _adjacency_maps() -> tuple:
    idx = country_index()
    land: Dict[str, Set[str]] = {cid: set() for cid in idx}
    sea: Dict[str, Set[str]] = {cid: set() for cid in idx}
    for cid, c in idx.items():
        for n in c.get("neighbors", []):
            if n in idx:
                land[cid].add(n)
                land[n].add(cid)
        for n in c.get("sea", []):
            if n in idx:
                sea[cid].add(n)
                sea[n].add(cid)
    for cid in idx:
        sea[cid] -= land[cid]
    return land, sea


def land_adjacency() -> Dict[str, Set[str]]:
    """Adyacencia terrestre simetrica."""
    return _adjacency_maps()[0]


@lru_cache(maxsize=1)
def _adjacency_lists() -> Dict[str, List[str]]:
    land, sea = _adjacency_maps()
    return {cid: sorted(land[cid] | sea[cid]) for cid in land}


def adjacency() -> Dict[str, List[str]]:
    """Adyacencia terrestre + maritima simetrica, como listas ORDENADAS.

    Se devuelven listas ordenadas (no sets) para que el orden de iteracion sea
    identico entre procesos (PYTHONHASHSEED) y en el port a JavaScript.
    No modificar el resultado: esta cacheado.
    """
    return _adjacency_lists()


def is_adjacent(a: str, b: str) -> bool:
    """True si a y b son vecinos por tierra o mar."""
    land, sea = _adjacency_maps()
    return b in land.get(a, set()) or b in sea.get(a, set())


def is_sea_route(a: str, b: str) -> bool:
    """True si la unica conexion es maritima."""
    return b in _adjacency_maps()[1].get(a, set())


# ---------------------------------------------------------------- claves y fechas
def pair_key(a: str, b: str) -> str:
    """Clave de relacion con ids ordenados."""
    x, y = sorted([a, b])
    return f"{x}|{y}"


def date_for_turn(turn: int) -> str:
    """Fecha 'Ene 1962' para el turno (1 = enero 1962)."""
    m = (turn - 1) % 12
    y = C.START_YEAR + (turn - 1) // 12
    return f"{C.MONTHS[m]} {y}"


def victory_target() -> int:
    """Territorios necesarios para ganar."""
    return int(math.ceil(len(load_countries()) * C.VICTORY_FRACTION))


# ---------------------------------------------------------------- relaciones
def get_rel(game: Game, a: str, b: str) -> int:
    """Relacion entre dos entidades (-100..100)."""
    return int(game["relations"].get(pair_key(a, b), 0))


def set_rel(game: Game, a: str, b: str, value: float) -> None:
    """Fija la relacion con recorte a -100..100."""
    game["relations"][pair_key(a, b)] = int(max(-100, min(100, round(value))))


def add_rel(game: Game, a: str, b: str, delta: float) -> None:
    """Suma a la relacion."""
    set_rel(game, a, b, get_rel(game, a, b) + delta)


# ---------------------------------------------------------------- tratados y guerras
def find_treaty(game: Game, kind: str, a: str, b: str) -> Optional[dict]:
    """Busca un tratado de tipo kind entre a y b."""
    for t in game["treaties"]:
        if t["type"] == kind and {t["a"], t["b"]} == {a, b}:
            return t
    return None


def has_treaty(game: Game, kind: str, a: str, b: str) -> bool:
    """True si existe tratado."""
    return find_treaty(game, kind, a, b) is not None


def remove_treaties(game: Game, a: str, b: str, kinds: Optional[List[str]] = None) -> int:
    """Elimina tratados entre a y b; devuelve cuantos."""
    keep = []
    n = 0
    for t in game["treaties"]:
        if {t["a"], t["b"]} == {a, b} and (kinds is None or t["type"] in kinds):
            n += 1
        else:
            keep.append(t)
    game["treaties"] = keep
    return n


def allies_of(game: Game, ent: str) -> List[str]:
    """Aliados de una entidad."""
    out = []
    for t in game["treaties"]:
        if t["type"] == "alliance":
            if t["a"] == ent:
                out.append(t["b"])
            elif t["b"] == ent:
                out.append(t["a"])
    return out


def find_war(game: Game, a: str, b: str) -> Optional[dict]:
    """Guerra entre a y b si existe."""
    for w in game["wars"]:
        if {w["a"], w["b"]} == {a, b}:
            return w
    return None


def at_war(game: Game, a: str, b: str) -> bool:
    """True si a y b estan en guerra."""
    return find_war(game, a, b) is not None


def enemies_of(game: Game, ent: str) -> List[str]:
    """Entidades en guerra con ent."""
    out = []
    for w in game["wars"]:
        if w["a"] == ent:
            out.append(w["b"])
        elif w["b"] == ent:
            out.append(w["a"])
    return out


# ---------------------------------------------------------------- territorios y divisiones
def territories_of(game: Game, ent: str) -> List[str]:
    """Ids de territorios cuyo dueno es ent."""
    return [cid for cid, c in game["countries"].items() if c["owner"] == ent]


def owner_of(game: Game, cid: str) -> str:
    """Dueno actual del territorio."""
    return game["countries"][cid]["owner"]


def is_alive(game: Game, ent: str) -> bool:
    """Una entidad vive si posee al menos un territorio."""
    return any(c["owner"] == ent for c in game["countries"].values())


def entities(game: Game) -> List[str]:
    """Entidades vivas (ordenadas)."""
    return sorted({c["owner"] for c in game["countries"].values()})


def divisions_of(game: Game, ent: str) -> List[dict]:
    """Divisiones de una entidad."""
    return [d for d in game["divisions"] if d["owner"] == ent]


def divisions_at(game: Game, cid: str) -> List[dict]:
    """Divisiones ubicadas en un territorio."""
    return [d for d in game["divisions"] if d["location"] == cid]


def find_division(game: Game, did: str) -> Optional[dict]:
    """Busca una division por id."""
    for d in game["divisions"]:
        if d["id"] == did:
            return d
    return None


def raw_power(troops: float, tanks: float, planes: float) -> float:
    """Poder bruto sin organizacion."""
    return troops + tanks * C.TANK_POWER + planes * C.PLANE_POWER


def division_power(d: dict) -> float:
    """Poder de una division escalado por organizacion."""
    return raw_power(d["troops"], d["tanks"], d["planes"]) * d["org"] / 100.0


def entity_power(game: Game, ent: str) -> float:
    """Poder bruto total de una entidad."""
    return sum(raw_power(d["troops"], d["tanks"], d["planes"]) for d in divisions_of(game, ent))


def entity_troops(game: Game, ent: str) -> float:
    """Tropas totales de una entidad."""
    return sum(d["troops"] for d in divisions_of(game, ent))


def sync_armies(game: Game) -> None:
    """Recalcula army/tanks/planes de cada territorio desde las divisiones ubicadas alli."""
    for c in game["countries"].values():
        c["army"] = c["tanks"] = c["planes"] = 0.0
    for d in game["divisions"]:
        c = game["countries"][d["location"]]
        c["army"] += d["troops"]
        c["tanks"] += d["tanks"]
        c["planes"] += d["planes"]
    for c in game["countries"].values():
        for k in ("army", "tanks", "planes"):
            c[k] = round(c[k], 1)


def next_id(game: Game, prefix: str) -> str:
    """Genera ids unicos por prefijo."""
    counters = game.setdefault("counters", {})
    counters[prefix] = counters.get(prefix, 0) + 1
    return f"{prefix}{counters[prefix]}"


def add_log(game: Game, text: str, kind: str = "info") -> None:
    """Agrega una linea al registro (y al reporte del turno en curso)."""
    game["logs"].append({"turn": game["turn"], "text": text, "kind": kind})
    if len(game["logs"]) > C.MAX_LOGS:
        del game["logs"][: len(game["logs"]) - C.MAX_LOGS]
    if "_turn_lines" in game:
        game["_turn_lines"].append(text)


def make_rng(game: Game, salt: str = "") -> PortableRandom:
    """RNG determinista por semilla y turno."""
    if not salt:
        return PortableRandom(game["seed"] * 1000 + game["turn"])
    return PortableRandom(f"{game['seed']}-{game['turn']}-{salt}")


def is_aggressive(game: Game, ent: str) -> bool:
    """Rasgo fijo (por semilla) que marca a los agresivos."""
    return PortableRandom(f"agg-{game['seed']}-{ent}").random() < C.AI_AGGRESSIVE_SHARE


def money_str(value: float) -> str:
    """Formato de dinero en pantalla (x10)."""
    return f"${int(round(value * 10))} M"


def display_name(game: Game, cid: str) -> str:
    """Nombre en pantalla de un territorio/entidad."""
    return game["countries"][cid]["name"]


def add_division(game: Game, owner: str, location: str, name: str, troops: float,
                 tanks: float, planes: float, stance: str = "idle") -> dict:
    """Crea una division."""
    d = {"id": next_id(game, "d"), "name": name, "owner": owner, "location": location,
         "troops": float(troops), "tanks": float(tanks), "planes": float(planes),
         "stance": stance, "org": 100}
    game["divisions"].append(d)
    return d


# ---------------------------------------------------------------- nueva partida
def _initial_relations(game: Game, rng: PortableRandom) -> None:
    idx = country_index()
    land = land_adjacency()
    ids = list(idx)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ca, cb = idx[a]["alignment"], idx[b]["alignment"]
            rel = 0
            if ca == cb:
                rel += 20 + (5 if ca == "no_alineado" else 0)
            elif "socialista" in (ca, cb):
                rel -= 30
            noise = 18 if b in land[a] else 8
            rel += rng.randint(-noise, noise)
            set_rel(game, a, b, rel)


def _make_country(c: Dict[str, Any]) -> Dict[str, Any]:
    p = c["power"]
    # Si existe campo "start", usar valores explícitos; si no, fórmula por power (compatibilidad)
    if "start" in c:
        s = c["start"]
        return {
            "id": c["id"], "name": c["name"], "owner": c["id"],
            "money": float(s["money"]), "industry": float(s["industry"]),
            "production": float(s["production"]), "army": 0.0, "tanks": 0.0, "planes": 0.0,
            "stability": float(s["stability"]), "development": float(s["development"]),
            "population": float(s["population"]),
            "infrastructure": float(s["infrastructure"]),
            "budget": {"army": 25, "social": 25, "infrastructure": 25, "industry": 25},
            "alignment": c["alignment"], "resources": list(c.get("resources", [])),
        }
    else:
        return {
            "id": c["id"], "name": c["name"], "owner": c["id"],
            "money": float(p * C.START_MONEY), "industry": float(p * C.START_INDUSTRY),
            "production": float(p * C.START_PRODUCTION), "army": 0.0, "tanks": 0.0, "planes": 0.0,
            "stability": float(C.START_STABILITY), "development": round(1 + p * 0.25, 2),
            "population": float(C.POP_OVERRIDE.get(c["id"], p * C.START_POP_FACTOR)),
            "infrastructure": float(30 + p * 4),
            "budget": {"army": 25, "social": 25, "infrastructure": 25, "industry": 25},
            "alignment": c["alignment"], "resources": list(c.get("resources", [])),
        }


def _spawn_divisions(game: Game) -> None:
    for c in load_countries():
        p = c["power"]
        cid = c["id"]
        # Si existe campo "start", usar valores explícitos; si no, fórmula por power
        if "start" in c:
            s = c["start"]
            army_total = s["army"]
            tanks_total = s["tanks"]
            planes_total = s["planes"]
        else:
            army_total = p * C.START_ARMY
            tanks_total = p * C.START_TANKS
            planes_total = p * C.START_PLANES
        first = "Infantería Motorizada" if p >= 5 else "Infantería"
        second = ["Blindada", "Mecanizada", "Aerotransportada", "de Caballería Blindada"][p % 4]
        add_division(game, cid, cid, f"1ª División de {first}", army_total * 0.6,
                     tanks_total * 0.3, planes_total * 0.3, "defend")
        add_division(game, cid, cid, f"2ª División {second}", army_total * 0.4,
                     tanks_total * 0.7, planes_total * 0.7, "idle")


def new_game(player: str, seed: Optional[int] = None, game_id: Optional[str] = None) -> Game:
    """Crea una partida nueva con el pais `player`."""
    idx = country_index()
    if player not in idx:
        raise ValueError("País desconocido.")
    seed = random.randint(1, 10 ** 6) if seed is None else int(seed)
    game: Game = {
        "id": game_id or uuid.uuid4().hex[:8], "version": C.VERSION, "player": player,
        "turn": 1, "date": date_for_turn(1),
        "countries": {c["id"]: _make_country(c) for c in load_countries()},
        "relations": {}, "treaties": [], "wars": [], "divisions": [], "orders": [],
        "projects": [], "logs": [], "active_event": None, "ended": False, "winner": None,
        "seed": seed, "counters": {}, "zero_stability_turns": {}, "result": None,
        "loss_reason": None, "last_report": None,
    }
    _initial_relations(game, PortableRandom(seed))
    _spawn_divisions(game)
    sync_armies(game)
    add_log(game, f"Enero de 1962. {idx[player]['name']} entra en la Guerra Fría.", "info")
    return game
