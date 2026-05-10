"""In-memory registry of testable AI agents.

Each agent is a small wrapper around a CLōD chat completion: a stable id, a
system prompt that defines its role/persona, an optional task to focus on,
and per-agent generation knobs (model, temperature). The registry is
single-process and not persisted — fine for the hackathon dashboard.

The proxy uses this registry from `POST /proxy/chat` so the frontend can spin
up multiple bots, assign each a task, and pit them against the same CLōD
backend through a single classifier-monitored pipe.
"""

from __future__ import annotations

import re
import time
import uuid
from threading import Lock
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from proxy import db as dbmod
from proxy.models import AgentRow


_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _slugify(value: str) -> str:
    base = _SLUG_RE.sub("-", value.lower()).strip("-")
    return base or f"agent-{uuid.uuid4().hex[:8]}"


class Agent:
    """Lightweight value object for a registered chatbot."""

    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        system_prompt: str,
        task: str,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        created_at: Optional[int] = None,
    ) -> None:
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.system_prompt = system_prompt
        self.task = task
        self.model = model
        self.temperature = temperature
        self.created_at = created_at or int(time.time() * 1000)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "system_prompt": self.system_prompt,
            "task": self.task,
            "model": self.model,
            "temperature": self.temperature,
            "created_at": self.created_at,
        }

    def composed_system_prompt(self) -> str:
        """Combine the agent's persona prompt and assigned task into one system message."""
        parts: List[str] = []
        if self.system_prompt and self.system_prompt.strip():
            parts.append(self.system_prompt.strip())
        if self.task and self.task.strip():
            parts.append(f"Current assigned task:\n{self.task.strip()}")
        return "\n\n".join(parts)


class AgentRegistry:
    """Thread-safe in-memory CRUD for agents, optionally backed by the DB."""

    def __init__(self) -> None:
        self._agents: Dict[str, Agent] = {}
        self._lock = Lock()
        self._hydrated = False

    def hydrate_from_db(self) -> int:
        if not dbmod.is_enabled() or self._hydrated:
            return 0
        with dbmod.get_session() as session:
            rows = session.execute(select(AgentRow)).scalars().all()
        with self._lock:
            self._agents.clear()
            for row in rows:
                self._agents[row.agent_id] = Agent(
                    agent_id=row.agent_id,
                    name=row.name,
                    description=row.description or "",
                    system_prompt=row.system_prompt or "",
                    task=row.task or "",
                    model=row.model,
                    temperature=row.temperature,
                    created_at=row.created_at,
                )
            self._hydrated = True
        return len(rows)

    def list(self) -> List[Dict[str, Any]]:
        with self._lock:
            agents = list(self._agents.values())
        return [agent.to_dict() for agent in sorted(agents, key=lambda a: a.created_at)]

    def get(self, agent_id: str) -> Optional[Agent]:
        with self._lock:
            return self._agents.get(agent_id)

    def create(self, payload: Dict[str, Any]) -> Agent:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")

        requested_id = str(payload.get("agent_id") or "").strip()
        agent_id = _slugify(requested_id) if requested_id else _slugify(name)

        with self._lock:
            if agent_id in self._agents:
                agent_id = f"{agent_id}-{uuid.uuid4().hex[:6]}"

            agent = Agent(
                agent_id=agent_id,
                name=name,
                description=str(payload.get("description") or "").strip(),
                system_prompt=str(payload.get("system_prompt") or "").strip(),
                task=str(payload.get("task") or "").strip(),
                model=_clean_optional_str(payload.get("model")),
                temperature=_clean_optional_float(payload.get("temperature")),
            )
            self._agents[agent_id] = agent
        self._persist(agent)
        return agent

    def update(self, agent_id: str, payload: Dict[str, Any]) -> Optional[Agent]:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return None
            for field in ("name", "description", "system_prompt", "task"):
                if field in payload and payload[field] is not None:
                    setattr(agent, field, str(payload[field]).strip())
            if "model" in payload:
                agent.model = _clean_optional_str(payload.get("model"))
            if "temperature" in payload:
                agent.temperature = _clean_optional_float(payload.get("temperature"))
        self._persist(agent)
        return agent

    def delete(self, agent_id: str) -> bool:
        with self._lock:
            removed = self._agents.pop(agent_id, None)
        if removed is None:
            return False
        if dbmod.is_enabled():
            try:
                with dbmod.get_session() as session:
                    session.query(AgentRow).filter(AgentRow.agent_id == agent_id).delete()
            except Exception:
                pass
        return True

    def reset(self) -> None:
        with self._lock:
            self._agents.clear()
        if dbmod.is_enabled():
            try:
                with dbmod.get_session() as session:
                    session.query(AgentRow).delete()
            except Exception:
                pass

    @staticmethod
    def _persist(agent: Agent) -> None:
        if not dbmod.is_enabled():
            return
        try:
            with dbmod.get_session() as session:
                row = AgentRow(
                    agent_id=agent.agent_id,
                    name=agent.name,
                    description=agent.description,
                    system_prompt=agent.system_prompt,
                    task=agent.task,
                    model=agent.model,
                    temperature=agent.temperature,
                    created_at=agent.created_at,
                )
                session.merge(row)
        except Exception:
            pass


def _clean_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


registry = AgentRegistry()
