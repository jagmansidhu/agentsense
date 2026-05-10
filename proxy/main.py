"""AgentSense ingest proxy — receives agent thinking turns, classifies, broadcasts.

Run:
    uvicorn proxy.main:socket_app --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import httpx
import socketio
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from proxy.config import settings
from proxy.db import AsyncSessionLocal, async_engine, get_session
from proxy.models import Base
from proxy.repo import (
    _get_turn_index,
    list_events,
    list_sessions,
    list_turns_for_session,
    record_health,
    record_turn,
    reset_data,
    upsert_session,
)

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class ToolCall(BaseModel):
    name: str
    args: dict = {}


class IngestTurnRequest(BaseModel):
    session_id: str
    agent_id: str = "unknown"
    turn_id: str | None = None
    thinking: str = ""
    action: str = ""
    tool_calls: list[ToolCall] = []
    output: str = ""
    user_goal: str = ""
    metadata: dict = {}


# ---------------------------------------------------------------------------
# App + Socket.IO
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="AgentSense Proxy", lifespan=lifespan)
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FALLBACK_HEALTH: dict[str, Any] = {
    "label": "unknown",
    "confidence": 0.0,
    "explanation": "classifier unreachable",
    "all_scores": {},
}


async def _classify(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(settings.CLASSIFIER_URL, json=payload)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        return {**_FALLBACK_HEALTH, "explanation": f"classifier error: {exc}"}


async def _get_recent_turns(db: AsyncSession, session_id: str, n: int = 3) -> list[dict]:
    turns = await list_turns_for_session(db, session_id, limit=n)
    return [
        {"thinking": t.get("thinking") or "", "action": t.get("action") or "", "output": t.get("output") or ""}
        for t in turns
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest/turn")
async def ingest_turn(
    body: IngestTurnRequest,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    session_id = body.session_id
    agent_id = body.agent_id
    tool_calls_raw = [tc.model_dump() for tc in body.tool_calls]

    # Initial upsert (creates session row so FK constraints pass for Turn insert)
    await upsert_session(db, session_id, agent_id, "unknown")

    turn_index = await _get_turn_index(db, session_id)

    turn = await record_turn(
        db,
        session_id=session_id,
        agent_id=agent_id,
        turn_index=turn_index,
        thinking=body.thinking,
        action=body.action,
        tool_calls=tool_calls_raw,
        output=body.output,
        user_goal=body.user_goal,
    )

    recent_turns = await _get_recent_turns(db, session_id, n=3)

    classify_payload = {
        "session_id": session_id,
        "agent_id": agent_id,
        "thinking": body.thinking,
        "action": body.action,
        "tool_calls": tool_calls_raw,
        "output": body.output,
        "user_goal": body.user_goal,
        "recent_turns": recent_turns,
    }
    classification = await _classify(classify_payload)

    label = classification.get("label", "unknown")
    confidence = float(classification.get("confidence", 0.0))
    explanation = classification.get("explanation", "")
    all_scores = classification.get("all_scores", {})

    he = await record_health(db, turn.id, session_id, label, confidence, explanation, all_scores)

    await upsert_session(db, session_id, agent_id, label)

    event: dict[str, Any] = {
        "id": str(he.id),
        "session_id": session_id,
        "turn_id": str(turn.id),
        "agent_id": agent_id,
        "thinking_excerpt": (body.thinking or "")[:280],
        "action": body.action,
        "output_excerpt": (body.output or "")[:280],
        "tool_count": len(tool_calls_raw),
        "label": label,
        "confidence": confidence,
        "explanation": explanation,
        "created_at": int(he.created_at.timestamp() * 1000),
    }
    await sio.emit("agent_event", event)

    return JSONResponse(
        {
            "turn_id": str(turn.id),
            "health": {
                "label": label,
                "confidence": confidence,
                "explanation": explanation,
                "all_scores": all_scores,
            },
        }
    )


@app.post("/proxy/chat")
async def proxy_chat(request: Request, db: AsyncSession = Depends(get_session)) -> JSONResponse:
    """Legacy shim — proxies to CLōD then ingests the turn."""
    body = await request.json()
    session_id = body.get("session_id", "default")
    user_message = body.get("message")
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    agent_reply = ""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            llm_resp = await client.post(
                settings.CLOD_API_URL,
                headers={"Authorization": f"Bearer {settings.CLOD_API_KEY}"},
                json={"messages": [{"role": "user", "content": user_message}]},
            )
            llm_resp.raise_for_status()
            agent_reply = llm_resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        agent_reply = f"[CLōD unreachable: {exc}]"

    # Inline ingest so we go through the same classify/record path
    ingest_req = IngestTurnRequest(
        session_id=session_id,
        agent_id="clod",
        output=agent_reply,
        thinking="",
        user_goal=user_message,
    )
    ingest_resp = await ingest_turn(ingest_req, db=db)
    ingest_data = ingest_resp.body
    import json as _json

    parsed = _json.loads(ingest_data)
    health = parsed.get("health", _FALLBACK_HEALTH)

    return JSONResponse({"reply": agent_reply, "health": health})


@app.get("/proxy/events")
async def get_events(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return {"events": await list_events(db, session_id=session_id, limit=limit)}


@app.get("/proxy/sessions")
async def get_sessions(db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    sessions = await list_sessions(db)
    return {"sessions": sessions, "session_ids": [s["session_id"] for s in sessions]}


@app.get("/sessions/{session_id}/turns")
async def get_turns(
    session_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return {"turns": await list_turns_for_session(db, session_id, limit=limit)}


@app.post("/proxy/reset")
async def reset(request: Request, db: AsyncSession = Depends(get_session)) -> dict[str, str]:
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    session_id = body.get("session_id") if body else None
    await reset_data(db, session_id=session_id)
    return {"status": "reset"}
