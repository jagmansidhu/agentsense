"""Session storage for the AgentSense proxy.

The default ``SessionStore`` keeps everything in process memory — the
hackathon-grade choice (zero setup, fastest path). Set ``AGENTSENSE_DB_PATH``
to switch to ``SqliteSessionStore``, which persists conversation history to
a SQLite file across restarts. Only stdlib ``sqlite3`` is used.

Both implementations expose the same ``append / get / reset / list_ids``
methods so ``proxy.main`` can use either via the ``store`` singleton at the
bottom of this module.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List, Protocol

from proxy.db import connect as _db_connect
from proxy.db import get_db_path, init_schema


Message = Dict[str, str]  # {"role": "user" | "assistant", "content": str}


class _SessionStoreProtocol(Protocol):
    def append(self, session_id: str, message: Message) -> List[Message]: ...
    def get(self, session_id: str) -> List[Message]: ...
    def reset(self, session_id: str | None = None) -> None: ...
    def list_ids(self) -> List[str]: ...


class SessionStore:
    """In-memory store. Single process == single source of truth."""

    def __init__(self) -> None:
        self._sessions: Dict[str, List[Message]] = defaultdict(list)
        self._lock = Lock()

    def append(self, session_id: str, message: Message) -> List[Message]:
        with self._lock:
            self._sessions[session_id].append(message)
            return list(self._sessions[session_id])

    def get(self, session_id: str) -> List[Message]:
        with self._lock:
            return list(self._sessions.get(session_id, []))

    def reset(self, session_id: str | None = None) -> None:
        with self._lock:
            if session_id is None:
                self._sessions.clear()
            else:
                self._sessions.pop(session_id, None)

    def list_ids(self) -> List[str]:
        with self._lock:
            return sorted(self._sessions.keys())


class SqliteSessionStore:
    """SQLite-backed store. Engaged when ``AGENTSENSE_DB_PATH`` is set.

    Opens a fresh connection per call so it's safe under uvicorn workers
    without ``check_same_thread=False``. Append uses BEGIN IMMEDIATE so two
    concurrent writes to the same session_id can't tear the JSON history.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        init_schema(path)

    def append(self, session_id: str, message: Message) -> List[Message]:
        now = int(time.time() * 1000)
        with _db_connect(self._path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT history FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            history: List[Message] = json.loads(row["history"]) if row else []
            history.append(message)
            conn.execute(
                """
                INSERT INTO sessions (session_id, history, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    history = excluded.history,
                    updated_at = excluded.updated_at
                """,
                (session_id, json.dumps(history), now),
            )
            conn.execute("COMMIT")
            return history

    def get(self, session_id: str) -> List[Message]:
        with _db_connect(self._path) as conn:
            row = conn.execute(
                "SELECT history FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            return json.loads(row["history"]) if row else []

    def reset(self, session_id: str | None = None) -> None:
        with _db_connect(self._path) as conn:
            if session_id is None:
                conn.execute("DELETE FROM sessions")
            else:
                conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))

    def list_ids(self) -> List[str]:
        with _db_connect(self._path) as conn:
            rows = conn.execute(
                "SELECT session_id FROM sessions ORDER BY session_id ASC"
            ).fetchall()
            return [row["session_id"] for row in rows]


def _make_store() -> _SessionStoreProtocol:
    db_path = get_db_path()
    if db_path:
        return SqliteSessionStore(db_path)
    return SessionStore()


store: _SessionStoreProtocol = _make_store()
