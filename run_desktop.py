# run_desktop.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom — Entry point for the packaged .exe (PyInstaller)
#
# This wraps your existing FastAPI app rather than replacing it:
#   1. Serves the built React frontend (dist/) as static files
#   2. Resolves bundled read-only assets (frontend, ML models) correctly
#      whether running as a normal script OR as a frozen .exe
#   3. Keeps the SQLite database in a WRITABLE location next to the
#      .exe, never inside the PyInstaller bundle itself (that bundle
#      is extracted to a temp folder at runtime and should be treated
#      as read-only)
#   4. Opens the default browser automatically once the server is up
#
# ADAPTER: replace `from src.main import app` with wherever your actual
# FastAPI `app = FastAPI()` instance is defined.
# ─────────────────────────────────────────────────────────────────────

import sys
import os
import threading
import webbrowser
import time
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

# ── Path resolution: bundled (read-only) vs writable (persistent) ────
def resource_path(relative_path: str) -> Path:
    """
    Path to a READ-ONLY bundled asset (frontend build, ML model files).
    Works both when run as a normal Python script and when frozen by
    PyInstaller into a single .exe (which extracts bundled data to a
    temporary folder referenced by sys._MEIPASS at runtime).
    """
    if getattr(sys, 'frozen', False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent
    return base_path / relative_path


def writable_path(relative_path: str) -> Path:
    """
    Path to a WRITABLE file (SQLite database, logs, anything the app
    needs to modify at runtime). Always resolves next to the actual
    .exe on disk, never inside the temporary PyInstaller bundle —
    that bundle is read-only and gets wiped between runs.
    """
    if getattr(sys, 'frozen', False):
        base_path = Path(sys.executable).parent
    else:
        base_path = Path(__file__).parent
    target = base_path / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


# ── ADAPTER: point this at your actual SQLite path variable/setting ──
# If your db config currently reads something like:
#   DB_PATH = "data/spiricom.db"
# replace that line with:
#   DB_PATH = str(writable_path("data/spiricom.db"))
# BEFORE your app/db module is imported below, so the app picks up the
# correct writable path from the start rather than defaulting to a
# path relative to the temp extraction folder.
os.environ["SPIRICOM_DB_PATH"] = str(writable_path("data/spiricom.db"))
os.environ["SPIRICOM_MODELS_DIR"] = str(resource_path("models"))
os.environ["SPIRICOM_OUTPUTS_DIR"] = str(resource_path("data/outputs"))

# ── ADAPTER: import your real FastAPI app AFTER the env vars above ───
from src.nlp.analytics_api import app  # noqa: E402  — must come after env vars are set

# ── Mount the built React frontend as static files ───────────────────
FRONTEND_DIST = resource_path("dist")
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True),
              name="frontend")
else:
    print(f"⚠ Frontend build not found at {FRONTEND_DIST} — "
          f"did you run `npm run build` and include dist/ in the .spec?")


def open_browser():
    time.sleep(1.5)  # give uvicorn a moment to bind the port
    webbrowser.open("http://localhost:8000")


if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")