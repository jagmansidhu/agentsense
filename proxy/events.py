"""Event ring buffer / persistent event log for frontend hydration.

The default ``EventStore`` is an in-memory bounded deque (the original
hackathon-grade choice). Set ``AGENTSENSE_DB_PATH`` to switch to
``SqliteEventStore`` — events then persist across process restarts and the
frontend will hydrate them via ``GET /proxy/events``. Both implementations
expose the same surface so ``proxy.main`` can use either via the ``events``
singleton at the bottom of this module.
"""

from __future__ import annotations

import json
import time
import uuid
from collections import deque
from threading import Lock
from typing import Deque, Dict, List, Protocol

from proxy.db import connect as _db_connect
from proxy.db import get_db_path, init_schema


Event = Dict[str, object]


class _EventStoreProtocol(Protocol):
    def append(self, event: Event) -> Event: ...
    def list_events(self, session_id: str | None = None, limit: int = 100) -> List[Event]: ...
    def session_summaries(self) -> List[Dict[str, object]]: ...
    def reset(self, session_id: str | None = None) -> None: ...


def _summarize(events: List[Event]) -> List[Dict[str, object]]:
    """Aggregate per-session counts and latest status from a list of events.

    Shared by both the in-memory and SQLite stores so summary shape stays in
    one place. Latest event wins for `last_seen` and `status`.
    """
    summaries: Dict[str, Dict[str, object]] = {}
    for event in events:
        session_id = str(event.get("session_id", "default"))
        summary = summaries.setdefault(
            session_id,
            {
                "session_id": session_id,
                "last_seen": event.get("created_at"),
                "status": event.get("label", "unknown"),
                "event_count": 0,
                "anomaly_count": 0,
            },
        )
        summary["last_seen"] = event.get("created_at")
        summary["status"] = event.get("label", "unknown")
        summary["event_count"] = int(summary["event_count"]) + 1
        if event.get("label") not in {"healthy", "unknown"}:
            summary["anomaly_count"] = int(summary["anomaly_count"]) + 1
    return sorted(
        summaries.values(),
        key=lambda item: int(item["last_seen"] or 0),
        reverse=True,
    )


class EventStore:
    """In-memory bounded ring buffer.

    ``append`` is an **upsert by ``id``** — if the caller supplies an ``id``
    that already exists, the existing entry is replaced in place (preserving
    deque ordering). This lets the proxy emit a "pending" classification
    event and later refine it with the real label without producing a
    duplicate card on the dashboard.
    """

    def __init__(self, max_events: int = 1000) -> None:
        self._events: Deque[Event] = deque(maxlen=max_events)
        self._lock = Lock()

    def append(self, event: Event) -> Event:
        enriched: Event = {
            **event,
            "id": event.get("id") or str(uuid.uuid4()),
            "created_at": event.get("created_at") or int(time.time() * 1000),
        }
        with self._lock:
            for i, existing in enumerate(self._events):
                if existing.get("id") == enriched["id"]:
                    self._events[i] = enriched
                    return enriched
            self._events.append(enriched)
        return enriched

    def list_events(self, session_id: str | None = None, limit: int = 100) -> List[Event]:
        with self._lock:
            events = list(self._events)
        if session_id:
            events = [event for event in events if event.get("session_id") == session_id]
        return list(reversed(events[-max(limit, 1) :]))

    def session_summaries(self) -> List[Dict[str, object]]:
        with self._lock:
            events = list(self._events)
        return _summarize(events)

    def reset(self, session_id: str | None = None) -> None:
        with self._lock:
            if session_id is None:
                self._events.clear()
                return
            filtered = [event for event in self._events if event.get("session_id") != session_id]
            self._events = deque(filtered, maxlen=self._events.maxlen)


class SqliteEventStore:
    """SQLite-backed event log. Engaged when ``AGENTSENSE_DB_PATH`` is set.

    ``append`` is an **upsert by ``id``** — pending events get refined to
    classified events on the same row, so the dashboard sees one card per
    turn even after a hydration round-trip.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        init_schema(path)

    def append(self, event: Event) -> Event:
        enriched: Event = {
            **event,
            "id": event.get("id") or str(uuid.uuid4()),
            "created_at": event.get("created_at") or int(time.time() * 1000),
        }
        with _db_connect(self._path) as conn:
            conn.execute(
                """
                INSERT INTO events (id, session_id, payload, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    session_id = excluded.session_id,
                    payload    = excluded.payload,
                    created_at = excluded.created_at
                """,
                (
                    enriched["id"],
                    str(enriched.get("session_id") or "default"),
                    json.dumps(enriched, default=str),
                    int(enriched["created_at"]),  # type: ignore[arg-type]
                ),
            )
        return enriched

    def list_events(self, session_id: str | None = None, limit: int = 100) -> List[Event]:
        with _db_connect(self._path) as conn:
            if session_id:
                rows = conn.execute(
                    "SELECT payload FROM events WHERE session_id = ? "
                    "ORDER BY created_at DESC LIMIT ?",
                    (session_id, max(limit, 1)),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload FROM events ORDER BY created_at DESC LIMIT ?",
                    (max(limit, 1),),
                ).fetchall()
        return [json.loads(row["payload"]) for row in rows]

    def session_summaries(self) -> List[Dict[str, object]]:
        # Pull all events (oldest -> newest) so `_summarize` can let the
        # latest event win for `last_seen` / `status`. SQLite is plenty fast
        # at this scale; if the table grows beyond ~100k rows we'd switch
        # to a proper aggregate query.
        with _db_connect(self._path) as conn:
            rows = conn.execute(
                "SELECT payload FROM events ORDER BY created_at ASC"
            ).fetchall()
        return _summarize([json.loads(row["payload"]) for row in rows])

    def reset(self, session_id: str | None = None) -> None:
        with _db_connect(self._path) as conn:
            if session_id is None:
                conn.execute("DELETE FROM events")
            else:
                conn.execute("DELETE FROM events WHERE session_id = ?", (session_id,))


def _make_store() -> _EventStoreProtocol:
    db_path = get_db_path()
    if db_path:
        return SqliteEventStore(db_path)
    return EventStore()


events: _EventStoreProtocol = _make_store()
