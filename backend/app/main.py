"""API FastAPI de Frente Continental."""
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import storage
from .engine import events as EV
from .engine import orders as O
from .engine import state as S
from .engine import views
from .engine.constants import VERSION
from .engine.turn import end_turn

app = FastAPI(title="Frente Continental")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api = APIRouter(prefix="/api")

_MAP_CACHE: Optional[dict] = None


class NewGame(BaseModel):
    player: str
    seed: Optional[int] = None


class OrderIn(BaseModel):
    type: str
    target: Optional[str] = None
    division_id: Optional[str] = None
    params: Optional[Dict[str, Any]] = None


class BudgetIn(BaseModel):
    army: float
    social: float
    infrastructure: float
    industry: float


class ChoiceIn(BaseModel):
    option: int


def _get(gid: str) -> dict:
    g = storage.load(gid)
    if g is None:
        raise HTTPException(404, "Partida no encontrada.")
    return g


def _bad(e: Exception) -> HTTPException:
    return HTTPException(400, str(e))


@api.get("/health")
def health():
    return {"ok": True, "version": VERSION}


@api.get("/map")
def get_map():
    global _MAP_CACHE
    if _MAP_CACHE is None:
        keys = ("id", "name", "color", "path", "neighbors", "sea", "power", "alignment", "resources")
        _MAP_CACHE = {"viewBox": "0 0 500 535",
                      "countries": [{k: c.get(k) for k in keys} for c in S.load_countries()]}
    return _MAP_CACHE


@api.post("/games")
def create_game(body: NewGame):
    try:
        g = S.new_game(body.player, seed=body.seed)
    except ValueError as e:
        raise _bad(e)
    storage.save(g)
    return views.game_view(g)


@api.get("/games/{gid}")
def get_game(gid: str):
    return views.game_view(_get(gid))


@api.post("/games/{gid}/orders")
def add_order(gid: str, body: OrderIn):
    g = _get(gid)
    try:
        O.queue_order(g, g["player"], body.type, body.target, body.division_id, body.params)
    except ValueError as e:
        raise _bad(e)
    storage.save(g)
    return {"game": views.game_view(g)}


@api.delete("/games/{gid}/orders/{order_id}")
def del_order(gid: str, order_id: str):
    g = _get(gid)
    try:
        O.delete_order(g, g["player"], order_id)
    except ValueError as e:
        raise _bad(e)
    storage.save(g)
    return {"game": views.game_view(g)}


@api.put("/games/{gid}/budget")
def set_budget(gid: str, body: BudgetIn):
    g = _get(gid)
    vals = body.model_dump()
    if any(v < 0 for v in vals.values()):
        raise HTTPException(400, "El presupuesto no puede ser negativo.")
    if abs(sum(vals.values()) - 100.0) > 0.5:
        raise HTTPException(400, "El presupuesto debe sumar 100%.")
    g["countries"][g["player"]]["budget"] = vals
    storage.save(g)
    return {"game": views.game_view(g)}


@api.post("/games/{gid}/events/choice")
def event_choice(gid: str, body: ChoiceIn):
    g = _get(gid)
    try:
        EV.apply_choice(g, body.option)
    except ValueError as e:
        raise _bad(e)
    storage.save(g)
    return {"game": views.game_view(g)}


@api.post("/games/{gid}/end-turn")
def do_end_turn(gid: str):
    g = _get(gid)
    try:
        report = end_turn(g)
    except ValueError as e:
        raise _bad(e)
    storage.save(g)
    return {"game": views.game_view(g), "report": report}


@api.get("/games/{gid}/country/{cid}")
def country(gid: str, cid: str):
    g = _get(gid)
    try:
        return views.country_detail(g, cid)
    except ValueError as e:
        raise HTTPException(404, str(e))


app.include_router(api)

_FRONT = Path(__file__).resolve().parent.parent.parent / "frontend"
if _FRONT.exists():
    app.mount("/", StaticFiles(directory=str(_FRONT), html=True), name="frontend")
