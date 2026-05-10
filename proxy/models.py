"""SQLAlchemy ORM models for AgentSense persistence.

Hackathon scope: two tables, no migrations — `Base.metadata.create_all` on
startup is enough. If we ever need real migrations, drop in Alembic and
autogenerate from these models.
"""

from __future__ import annotations

import time
from typing import Any, Optional

from sqlalchemy import JSON, BigInteger, Float, Index, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now_ms() -> int:
    return int(time.time() * 1000)


class Base(DeclarativeBase):
    pass


class AgentRow(Base):
    """Persona+task wrapper around CLōD chat completions."""

    __tablename__ = "agents"

    agent_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    task: Mapped[str] = mapped_column(Text, default="", nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, default=_now_ms, nullable=False)

    def to_dict(self) -> dict[str, Any]:
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


class EventRow(Base):
    """One captured assistant turn with classifier verdict + origin."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    origin: Mapped[str] = mapped_column(String(32), default="ui", nullable=False)
    agent_id: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)
    agent_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    user_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extra: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, index=True, default=_now_ms, nullable=False)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "session_id": self.session_id,
            "origin": self.origin,
            "user_message": self.user_message,
            "message": self.message,
            "label": self.label,
            "confidence": self.confidence,
            "explanation": self.explanation,
            "created_at": self.created_at,
        }
        if self.agent_id:
            out["agent_id"] = self.agent_id
        if self.agent_name:
            out["agent_name"] = self.agent_name
        if self.extra:
            for k, v in self.extra.items():
                out.setdefault(k, v)
        return out


Index("ix_events_created_at_desc", EventRow.created_at.desc())
