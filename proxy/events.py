"""Event ring buffer used for frontend hydration.

The in-memory deque stays the fast path for live broadcasts and the
hydration endpoints. When `DATABASE_URL` is set, every appended event is
also persisted to the `events` table so it survives restarts and so other
processes (analytics, background workers, the Cursor watcher script) can
read the same history.
"""

from __future__ import annotations

import time
import uuid
from collections import deque
from threading import Lock
from typing import Any, Deque, Dict, List, Optional

from sqlalchemy import desc, select

from proxy import db as dbmod
from proxy.models import EventRow

Event = Dict[str, Any]

_RESERVED_KEYS = {
    "id",
    "session_id",
    "origin",
    "agent_id",
    "agent_name",
    "user_message",
    "message",
    "label",
    "confidence",
    "explanation",
    "created_at",
}


class EventStore:
    def __init__(self, max_events: int = 1000) -> None:
        self._events: Deque[Event] = deque(maxlen=max_events)
        self._lock = Lock()
        self._hydrated = False

    def hydrate_from_db(self) -> int:
        """Load the most recent N events from the DB into the in-memory ring."""
        if not dbmod.is_enabled() or self._hydrated:
            return 0
        with dbmod.get_session() as session:
            limit = self._events.maxlen or 1000
            rows = (
                session.execute(
                    select(EventRow).order_by(desc(EventRow.created_at)).limit(limit)
                )
                .scalars()
                .all()
            )
        with self._lock:
            self._events.clear()
            # Oldest-first into the deque so newest sits at the right end.
            for row in reversed(rows):
                self._events.append(row.to_dict())
            self._hydrated = True
        return len(rows)

    def append(self, event: Event) -> Event:
        enriched: Event = {
            "id": str(uuid.uuid4()),
            "created_at": int(time.time() * 1000),
            "origin": "ui",
            **event,
        }
        # Normalise known fields.
        enriched["session_id"] = str(enriched.get("session_id") or "default")
        enriched["origin"] = str(enriched.get("origin") or "ui")

        with self._lock:
            self._events.append(enriched)

        if dbmod.is_enabled():
            self._persist(enriched)
        return enriched

    @staticmethod
    def _persist(event: Event) -> None:
        extra = {k: v for k, v in event.items() if k not in _RESERVED_KEYS}
        try:
            with dbmod.get_session() as session:
                row = EventRow(
                    id=str(event["id"]),
                    session_id=str(event["session_id"]),
                    origin=str(event.get("origin") or "ui"),
                    agent_id=event.get("agent_id"),
                    agent_name=event.get("agent_name"),
                    user_message=event.get("user_message"),
                    message=str(event.get("message") or ""),
                    label=event.get("label"),
                    confidence=(
                        float(event["confidence"]) if event.get("confidence") is not None else None
                    ),
                    explanation=event.get("explanation"),
                    extra=extra or None,
                    created_at=int(event["created_at"]),
                )
                session.merge(row)
        except Exception:
            # Persistence is best-effort — never break the proxy hot path.
            pass

    def list_events(
        self,
        session_id: Optional[str] = None,
        limit: int = 100,
        origin: Optional[str] = None,
    ) -> List[Event]:
        with self._lock:
            events = list(self._events)
        if session_id:
            events = [event for event in events if event.get("session_id") == session_id]
        if origin and origin != "all":
            events = [event for event in events if (event.get("origin") or "ui") == origin]
        return list(reversed(events[-max(limit, 1) :]))

    def session_summaries(self) -> List[Dict[str, Any]]:
        summaries: Dict[str, Dict[str, Any]] = {}
        with self._lock:
            events = list(self._events)
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
                    "origin": event.get("origin") or "ui",
                },
            )
            summary["last_seen"] = event.get("created_at")
            summary["status"] = event.get("label", "unknown")
            summary["origin"] = event.get("origin") or summary.get("origin") or "ui"
            summary["event_count"] = int(summary["event_count"]) + 1
            if event.get("label") not in {"healthy", "unknown"}:
                summary["anomaly_count"] = int(summary["anomaly_count"]) + 1
        return sorted(summaries.values(), key=lambda item: int(item["last_seen"]), reverse=True)

    def reset(self, session_id: Optional[str] = None) -> None:
        with self._lock:
            if session_id is None:
                self._events.clear()
            else:
                filtered = [event for event in self._events if event.get("session_id") != session_id]
                self._events = deque(filtered, maxlen=self._events.maxlen)
        if dbmod.is_enabled():
            try:
                with dbmod.get_session() as session:
                    if session_id is None:
                        session.query(EventRow).delete()
                    else:
                        session.query(EventRow).filter(EventRow.session_id == session_id).delete()
            except Exception:
                pass


events = EventStore()
