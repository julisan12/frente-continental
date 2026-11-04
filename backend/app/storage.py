"""Persistencia de partidas en JSON."""
import json
import re
from pathlib import Path
from typing import Optional

SAVE_DIR = Path(__file__).resolve().parent.parent / "saves"
_ID = re.compile(r"^[A-Za-z0-9]{1,64}$")


def _path(gid: str) -> Optional[Path]:
    if not isinstance(gid, str) or not _ID.match(gid):
        return None
    return SAVE_DIR / f"{gid}.json"


def save(game: dict) -> None:
    p = _path(game["id"])
    if p is None:
        raise ValueError("Identificador de partida inválido.")
    SAVE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(game, ensure_ascii=False), encoding="utf8")
    tmp.replace(p)


def load(gid: str) -> Optional[dict]:
    p = _path(gid)
    if p is None or not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf8"))


def exists(gid: str) -> bool:
    p = _path(gid)
    return p is not None and p.exists()
