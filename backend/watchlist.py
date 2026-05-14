import json
import os
import uuid
from datetime import datetime, timezone

_FILE = os.path.join(os.path.dirname(__file__), "watchlists.json")


def _load() -> list:
    try:
        with open(_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def _save(data: list) -> None:
    with open(_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_watchlists() -> list:
    return _load()


def create_watchlist(name: str) -> dict:
    data = _load()
    wl = {
        "id":      str(uuid.uuid4())[:8],
        "name":    name.strip(),
        "tickers": [],
        "created": _now(),
    }
    data.append(wl)
    _save(data)
    return wl


def rename_watchlist(wl_id: str, name: str) -> dict | None:
    data = _load()
    for wl in data:
        if wl["id"] == wl_id:
            wl["name"] = name.strip()
            _save(data)
            return wl
    return None


def delete_watchlist(wl_id: str) -> bool:
    data = _load()
    before = len(data)
    data = [w for w in data if w["id"] != wl_id]
    _save(data)
    return len(data) < before


def add_ticker(wl_id: str, ticker: str, name: str = "") -> dict | None:
    data = _load()
    for wl in data:
        if wl["id"] == wl_id:
            symbols = [t["symbol"] for t in wl["tickers"]]
            if ticker not in symbols:
                wl["tickers"].append({
                    "symbol": ticker,
                    "name":   name,
                    "added":  _now(),
                })
            _save(data)
            return wl
    return None


def remove_ticker(wl_id: str, ticker: str) -> dict | None:
    data = _load()
    for wl in data:
        if wl["id"] == wl_id:
            wl["tickers"] = [t for t in wl["tickers"] if t["symbol"] != ticker]
            _save(data)
            return wl
    return None


def ticker_watchlist_ids(ticker: str) -> list[str]:
    """Return IDs of all watchlists that contain this ticker."""
    return [w["id"] for w in _load() if any(t["symbol"] == ticker for t in w["tickers"])]
