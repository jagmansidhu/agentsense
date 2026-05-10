"""Repository layer — all async DB operations for the AgentSense proxy."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from proxy.models import HealthEvent, Session, Turn

_ANOMALY_LABELS = {"hallucinating", "stuck in a loop", "off-topic", "refusing incorrectly"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def upsert_session(
    db: AsyncSession,
    session_id: str,
    agent_id: str,
    label: str,
) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if session is None:
        session = Session(
            id=session_id,
            agent_id=agent_id,
            status=label,
            last_seen=_now_utc(),
            event_count=1,
            anomaly_count=1 if label in _ANOMALY_LABELS else 0,
            meta={},
        )
        db.add(session)
    else:
        session.agent_id = agent_id
        session.status = label
        session.last_seen = _now_utc()
        session.event_count = (session.event_count or 0) + 1
        if label in _ANOMALY_LABELS:
            session.anomaly_count = (session.anomaly_count or 0) + 1

    await db.commit()


async def record_turn(
    db: AsyncSession,
    session_id: str,
    agent_id: str,
    turn_index: int,
    thinking: str,
    action: str,
    tool_calls: list[dict],
    output: str,
    user_goal: str,
) -> Turn:
    turn = Turn(
        id=uuid.uuid4(),
        session_id=session_id,
        turn_index=turn_index,
        thinking=thinking or None,
        action=action or None,
        tool_calls=tool_calls,
        output=output or None,
        user_goal=user_goal or None,
    )
    db.add(turn)
    await db.commit()
    await db.refresh(turn)
    return turn


async def record_health(
    db: AsyncSession,
    turn_id: uuid.UUID,
    session_id: str,
    label: str,
    confidence: float,
    explanation: str,
    all_scores: dict[str, float],
) -> HealthEvent:
    he = HealthEvent(
        id=uuid.uuid4(),
        turn_id=turn_id,
        session_id=session_id,
        label=label,
        confidence=confidence,
        explanation=explanation,
        all_scores=all_scores,
    )
    db.add(he)
    await db.commit()
    await db.refresh(he)
    return he


async def _get_turn_index(db: AsyncSession, session_id: str) -> int:
    result = await db.execute(
        select(func.count()).where(Turn.session_id == session_id)
    )
    return result.scalar_one() or 0


async def list_events(
    db: AsyncSession,
    session_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    stmt = (
        select(HealthEvent, Turn, Session)
        .join(Turn, HealthEvent.turn_id == Turn.id)
        .join(Session, HealthEvent.session_id == Session.id)
        .order_by(HealthEvent.created_at.desc())
        .limit(limit)
    )
    if session_id:
        stmt = stmt.where(HealthEvent.session_id == session_id)

    result = await db.execute(stmt)
    rows = result.all()

    events = []
    for he, turn, sess in rows:
        thinking_excerpt = (turn.thinking or "")[:280]
        output_excerpt = (turn.output or "")[:280]
        tool_calls = turn.tool_calls or []
        events.append(
            {
                "id": str(he.id),
                "session_id": he.session_id,
                "turn_id": str(he.turn_id),
                "agent_id": sess.agent_id,
                "thinking_excerpt": thinking_excerpt,
                "action": turn.action,
                "output_excerpt": output_excerpt,
                "tool_count": len(tool_calls),
                "label": he.label,
                "confidence": he.confidence,
                "explanation": he.explanation,
                "created_at": int(he.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000)
                if he.created_at.tzinfo is None
                else int(he.created_at.timestamp() * 1000),
            }
        )
    return events


async def list_sessions(db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(select(Session).order_by(Session.last_seen.desc()))
    sessions = result.scalars().all()
    return [
        {
            "session_id": s.id,
            "last_seen": int(s.last_seen.replace(tzinfo=timezone.utc).timestamp() * 1000)
            if s.last_seen.tzinfo is None
            else int(s.last_seen.timestamp() * 1000),
            "status": s.status,
            "event_count": s.event_count,
            "anomaly_count": s.anomaly_count,
        }
        for s in sessions
    ]


async def list_turns_for_session(
    db: AsyncSession,
    session_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    stmt = (
        select(Turn)
        .where(Turn.session_id == session_id)
        .order_by(Turn.turn_index.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    turns = result.scalars().all()

    turn_list = []
    for turn in turns:
        he_result = await db.execute(
            select(HealthEvent)
            .where(HealthEvent.turn_id == turn.id)
            .order_by(HealthEvent.created_at.desc())
            .limit(1)
        )
        he = he_result.scalar_one_or_none()

        created_ms = (
            int(turn.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000)
            if turn.created_at.tzinfo is None
            else int(turn.created_at.timestamp() * 1000)
        )

        turn_list.append(
            {
                "turn_id": str(turn.id),
                "session_id": turn.session_id,
                "turn_index": turn.turn_index,
                "thinking": turn.thinking,
                "action": turn.action,
                "tool_calls": turn.tool_calls or [],
                "output": turn.output,
                "user_goal": turn.user_goal,
                "created_at": created_ms,
                "health": {
                    "label": he.label if he else "unknown",
                    "confidence": he.confidence if he else 0.0,
                    "explanation": he.explanation if he else "",
                }
                if he
                else None,
            }
        )
    return turn_list


async def reset_data(db: AsyncSession, session_id: str | None = None) -> None:
    if session_id:
        await db.execute(delete(HealthEvent).where(HealthEvent.session_id == session_id))
        await db.execute(delete(Turn).where(Turn.session_id == session_id))
        await db.execute(delete(Session).where(Session.id == session_id))
    else:
        await db.execute(delete(HealthEvent))
        await db.execute(delete(Turn))
        await db.execute(delete(Session))
    await db.commit()
