"""In-memory event ring buffer for frontend hydration endpoints."""

from __future__ import annotations

import time
import uuid
from collections import deque
from threading import Lock
from typing import Deque, Dict, List

Event = Dict[str, object]


class EventStore:
    def __init__(self, max_events: int = 1000) -> None:
        self._events: Deque[Event] = deque(maxlen=max_events)
        self._lock = Lock()

    def append(self, event: Event) -> Event:
        enriched = {
            **event,
            "id": str(uuid.uuid4()),
            "created_at": int(time.time() * 1000),
        }
        with self._lock:
            self._events.append(enriched)
        return enriched

    def list_events(self, session_id: str | None = None, limit: int = 100) -> List[Event]:
        with self._lock:
            events = list(self._events)
        if session_id:
            events = [event for event in events if event.get("session_id") == session_id]
        # Frontend wants newest first.
        return list(reversed(events[-max(limit, 1) :]))

    def session_summaries(self) -> List[Dict[str, object]]:
        summaries: Dict[str, Dict[str, object]] = {}
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
                },
            )
            summary["last_seen"] = event.get("created_at")
            summary["status"] = event.get("label", "unknown")
            summary["event_count"] = int(summary["event_count"]) + 1
            if event.get("label") not in {"healthy", "unknown"}:
                summary["anomaly_count"] = int(summary["anomaly_count"]) + 1
        return sorted(summaries.values(), key=lambda item: int(item["last_seen"]), reverse=True)

    def reset(self, session_id: str | None = None) -> None:
        with self._lock:
            if session_id is None:
                self._events.clear()
                return
            filtered = [event for event in self._events if event.get("session_id") != session_id]
            self._events = deque(filtered, maxlen=self._events.maxlen)


events = EventStore()
