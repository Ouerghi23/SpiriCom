# src/api/artifact_cache.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — shared artifact cache (mtime-invalidated)
#
# THE PROBLEM IT FIXES: analytics_api.py loads its parquet/JSON artifacts
# at import time, so re-running a notebook changes nothing until uvicorn
# is restarted ("the forecasting page plays the old reports").
#
# THE PATTERN: every endpoint reads through these getters. Each call
# checks the file's mtime; if the notebook rewrote it, it is reloaded
# transparently. Cost per request when unchanged: one os.stat().
#
# MIGRATION RECIPE for analytics_api.py:
#
#   BEFORE (import-time load — stale forever):
#       FORECASTS = pd.read_parquet('models/prediction/forecasts.parquet')
#       @router.get('/api/forecast/5g')
#       def forecast_5g():
#           return FORECASTS[FORECASTS.target == 'traffic_5G'].to_dict('records')
#
#   AFTER (hot-reloading):
#       from .artifact_cache import get_parquet, get_json
#       @router.get('/api/forecast/5g')
#       def forecast_5g():
#           fc = get_parquet('models/prediction/forecasts.parquet')
#           if fc is None:
#               raise HTTPException(503, 'forecasts.parquet missing - run NB02')
#           return fc[fc.target == 'traffic_5G'].to_dict('records')
#
# Also expose the validity flags from the new forecast_results.json so the
# frontend can render PENDING instead of stale numbers:
#       res = get_json('data/outputs/forecast_results.json') or {}
#       payload['traffic_scale'] = res.get('traffic_scale')
#       payload['session_mode']  = res.get('session_mode')
# ─────────────────────────────────────────────────────────────────────

import json
import logging
import threading
from pathlib import Path
from typing import Any, Callable, Optional

import pandas as pd

logger = logging.getLogger(__name__)

_store: dict = {}
_lock = threading.Lock()


def _get(path: Path, loader: Callable[[Path], Any]) -> Optional[Any]:
    path = Path(path)
    if not path.exists():
        logger.warning(f"artifact missing: {path}")
        return None
    mtime = path.stat().st_mtime
    key = str(path.resolve())
    with _lock:
        hit = _store.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
    try:
        value = loader(path)
    except Exception as e:
        logger.error(f"failed loading {path}: {e}")
        return None
    with _lock:
        _store[key] = (mtime, value)
    logger.info(f"(re)loaded artifact: {path}")
    return value


def get_parquet(path) -> Optional[pd.DataFrame]:
    """Hot-reloading parquet read. Returns None if missing/unreadable."""
    return _get(Path(path), pd.read_parquet)


def get_json(path) -> Optional[dict]:
    """Hot-reloading UTF-8 JSON read. Returns None if missing/unreadable."""
    return _get(Path(path), lambda p: json.load(open(p, encoding="utf-8")))


def get_csv(path, **kwargs) -> Optional[pd.DataFrame]:
    """Hot-reloading CSV read (kwargs are NOT part of the cache key —
    use one call style per file)."""
    return _get(Path(path), lambda p: pd.read_csv(p, **kwargs))


def invalidate(path=None) -> None:
    """Drop one cached artifact, or everything if path is None."""
    with _lock:
        if path is None:
            _store.clear()
        else:
            _store.pop(str(Path(path).resolve()), None)