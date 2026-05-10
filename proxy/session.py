"""In-memory session storage for the AgentSense proxy.

Hackathon-grade: no persistence, no eviction. One process = one source of truth.
"""

from __future__ import annotations

from collections import defaultdict
from threading import Lock
from typing import Dict, List


Message = Dict[str, str]  # {"role": "user" | "assistant", "content": str}


class SessionStore:
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


store = SessionStore()
