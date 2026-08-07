#!/usr/bin/env python3
"""Vérifie si les pages sources Insee/SDES référencées dans data/sources.json
ont changé depuis la dernière exécution. N'invente rien, ne régénère rien :
signale seulement qu'un nouveau millésime est peut-être disponible, pour
qu'un humain déclenche la ré-ingestion.
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = json.loads((ROOT / "data" / "sources.json").read_text(encoding="utf-8"))
STATE_PATH = ROOT / "data" / ".sources_state.json"
STATE = json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}


def fetch_hash(url):
    req = urllib.request.Request(url, headers={"User-Agent": "VO-Insee-source-check/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read()
    return hashlib.sha256(body).hexdigest()


def main():
    changed = []
    errors = []
    for key, meta in SOURCES.items():
        url = meta.get("page")
        if not url:
            continue
        try:
            digest = fetch_hash(url)
        except Exception as exc:  # réseau, 404, etc. — signalé, pas fatal
            errors.append(f"{key}: {exc}")
            continue
        previous = STATE.get(key)
        if previous and previous != digest:
            changed.append(key)
        STATE[key] = digest

    STATE_PATH.write_text(json.dumps(STATE, indent=1, ensure_ascii=False), encoding="utf-8")

    if changed:
        print("CHANGED:" + ",".join(changed))
    if errors:
        print("ERRORS:" + " | ".join(errors), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
