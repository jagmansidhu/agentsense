from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="healthy")
    last_seen: Mapped[datetime] = mapped_column(nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    anomaly_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)

    turns: Mapped[list[Turn]] = relationship("Turn", back_populates="session")
    health_events: Mapped[list[HealthEvent]] = relationship("HealthEvent", back_populates="session")


class Turn(Base):
    __tablename__ = "turns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"), nullable=False)
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    thinking: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str | None] = mapped_column(String, nullable=True)
    tool_calls: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_goal: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    session: Mapped[Session] = relationship("Session", back_populates="turns")
    health_events: Mapped[list[HealthEvent]] = relationship("HealthEvent", back_populates="turn")

    __table_args__ = (
        Index("ix_turns_session_id", "session_id"),
        Index("ix_turns_created_at", "created_at"),
    )


class HealthEvent(Base):
    __tablename__ = "health_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    turn_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("turns.id"), nullable=False)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    all_scores: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    turn: Mapped[Turn] = relationship("Turn", back_populates="health_events")
    session: Mapped[Session] = relationship("Session", back_populates="health_events")

    __table_args__ = (
        Index("ix_health_events_turn_id", "turn_id"),
        Index("ix_health_events_session_id", "session_id"),
        Index("ix_health_events_created_at", "created_at"),
    )
