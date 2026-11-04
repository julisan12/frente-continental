"""Copia backend/app/data/countries.json a frontend/data/countries.json (modo offline).

Uso: python tools/sync_data.py [--check]
  --check  no copia; sale con 1 si los archivos difieren.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "backend" / "app" / "data" / "countries.json"
DST = ROOT / "frontend" / "data" / "countries.json"


def main() -> int:
    if "--check" in sys.argv:
        same = DST.exists() and SRC.read_bytes() == DST.read_bytes()
        print("OK: frontend/data/countries.json esta sincronizado." if same
              else "DIFIERE: ejecute python tools/sync_data.py")
        return 0 if same else 1
    DST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC, DST)
    print(f"Copiado {SRC} -> {DST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
