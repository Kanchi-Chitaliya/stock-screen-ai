import os
import pickle
import time
import threading

_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".cache", "stocks.pkl")
os.makedirs(os.path.dirname(_CACHE_PATH), exist_ok=True)

_DEFAULT_TTL = int(os.environ.get("CACHE_TTL_SECONDS", 3600))  # 1 hour default


class DiskCache:
    def __init__(self, path: str = _CACHE_PATH, ttl: int = _DEFAULT_TTL):
        self.path = path
        self.ttl = ttl
        self._lock = threading.Lock()
        self._data: dict = {}
        self._load()

    def get(self, key: str):
        with self._lock:
            entry = self._data.get(key)
            if entry and (time.time() - entry["ts"]) < self.ttl:
                return entry["value"]
        return None

    def set(self, key: str, value) -> None:
        with self._lock:
            self._data[key] = {"value": value, "ts": time.time()}
            self._persist()

    def age_seconds(self, key: str) -> float | None:
        entry = self._data.get(key)
        if entry:
            return round(time.time() - entry["ts"], 1)
        return None

    def clear(self, prefix: str | None = None) -> int:
        with self._lock:
            if prefix:
                keys = [k for k in self._data if k.startswith(prefix)]
            else:
                keys = list(self._data.keys())
            for k in keys:
                del self._data[k]
            self._persist()
        return len(keys)

    def stats(self) -> dict:
        now = time.time()
        with self._lock:
            total = len(self._data)
            valid = sum(1 for v in self._data.values() if now - v["ts"] < self.ttl)
            oldest = min((now - v["ts"] for v in self._data.values()), default=None)
        return {
            "total_entries": total,
            "valid_entries": valid,
            "stale_entries": total - valid,
            "ttl_seconds": self.ttl,
            "oldest_entry_age_seconds": round(oldest, 0) if oldest else None,
        }

    def _load(self) -> None:
        try:
            with open(self.path, "rb") as f:
                self._data = pickle.load(f)
        except Exception:
            self._data = {}

    def _persist(self) -> None:
        try:
            with open(self.path, "wb") as f:
                pickle.dump(self._data, f)
        except Exception:
            pass


cache = DiskCache()
