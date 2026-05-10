"""Optional SQLite persistence layer for the AgentSense proxy.

Behavior:
  - If ``AGENTSENSE_DB_PATH`` is unset (or empty), the proxy stays in
    its hackathon default of in-memory storage — zero setup, fastest path.
  - If ``AGENTSENSE_DB_PATH`` is set, both ``proxy.session.store`` and
    ``proxy.events.events`` switch to SQLite-backed implementations that
    persist across process restarts.

Stdlib ``sqlite3`` only — no new dependencies. WAL mode is enabled so the
proxy can read while a write is in flight; per-call connections keep the
implementation thread-safe under uvicorn's worker model without needing
``check_same_thread=False`` gymnastics.

To wipe local state, delete the SQLite file or unset the env var.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from threading import Lock
from typing import Optional


_DB_PATH_ENV = "AGENTSENSE_DB_PATH"
_init_lock = Lock()
_initialized: set[str] = set()


def get_db_path() -> Optional[str]:
    """Return the configured SQLite path, or ``None`` for in-memory mode."""
    raw = os.environ.get(_DB_PATH_ENV, "").strip()
    return raw or None


def connect(path: str) -> sqlite3.Connection:
    """Open a fresh connection. Caller is responsible for ``close()``.

    A new connection per call avoids cross-thread sharing issues under
    uvicorn workers; SQLite is fast enough that the connect overhead
    (sub-millisecond) doesn't matter at hackathon scale.
    """
    conn = sqlite3.connect(path, isolation_level=None)  # autocommit-ish; we use BEGIN/COMMIT explicitly
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(path: str) -> None:
    """Create tables and indices on first use of `path`. Idempotent."""
    with _init_lock:
        if path in _initialized:
            return
        # Make sure the parent directory exists for paths like `data/agentsense.db`.
        parent = Path(path).expanduser().resolve().parent
        parent.mkdir(parents=True, exist_ok=True)

        with connect(path) as conn:
            conn.executescript(
                """
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;

                CREATE TABLE IF NOT EXISTS sessions (
                    session_id  TEXT PRIMARY KEY,
                    history     TEXT NOT NULL DEFAULT '[]',  -- JSON array of {role, content}
                    updated_at  INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS events (
                    id          TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL,
                    payload     TEXT NOT NULL,                -- JSON object (full event body)
                    created_at  INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_events_session_time
                    ON events(session_id, created_at DESC);
                """
            )
        _initialized.add(path)
