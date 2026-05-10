"""AgentSense proxy — intercepts every LLM call, classifies it, broadcasts to dashboard.

Run:
    uvicorn proxy.main:socket_app --port 8000

Contract: see AGENTS.md §"Service contracts".
"""

from __future__ import annotations

import os
from typing import Any, Dict

import httpx
import socketio
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from proxy.events import events
from proxy.session import store

CLOD_API_URL = os.environ.get("CLOD_API_URL", "https://api.clod.ai/v1/chat")
CLOD_API_KEY = os.environ.get("CLOD_API_KEY", "")
CLASSIFIER_URL = os.environ.get("CLASSIFIER_URL", "http://localhost:8001/classify")

app = FastAPI(title="AgentSense Proxy")
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/proxy/chat")
async def proxy_chat(request: Request) -> JSONResponse:
    """Forward chat to CLōD, classify the reply, and broadcast to the dashboard."""
    body = await request.json()
    session_id = body.get("session_id", "default")
    user_message = body.get("message")
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    history = store.append(session_id, {"role": "user", "content": user_message})

    async with httpx.AsyncClient(timeout=30.0) as client:
        llm_resp = await client.post(
            CLOD_API_URL,
            headers={"Authorization": f"Bearer {CLOD_API_KEY}"},
            json={"messages": history},
        )
        llm_resp.raise_for_status()
        agent_reply = llm_resp.json()["choices"][0]["message"]["content"]

    history = store.append(session_id, {"role": "assistant", "content": agent_reply})

    classification: Dict[str, Any] = {
        "label": "unknown",
        "confidence": 0.0,
        "explanation": "classifier unreachable",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            cls_resp = await client.post(
                CLASSIFIER_URL,
                json={
                    "session_id": session_id,
                    "history": history,
                    "latest_reply": agent_reply,
                },
            )
            cls_resp.raise_for_status()
            classification = cls_resp.json()
    except Exception as exc:  # never crash the chat path on classifier failure
        classification["explanation"] = f"classifier error: {exc}"

    event = events.append(
        {
            "session_id": session_id,
            "message": agent_reply,
            "label": classification.get("label"),
            "confidence": classification.get("confidence"),
            "explanation": classification.get("explanation"),
        }
    )

    await sio.emit("agent_event", event)

    return JSONResponse({"reply": agent_reply, "health": classification})


@app.get("/proxy/events")
async def get_events(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
) -> Dict[str, Any]:
    """Return recent events for dashboard hydration and reconnect."""
    return {"events": events.list_events(session_id=session_id, limit=limit)}


@app.get("/proxy/sessions")
async def get_sessions() -> Dict[str, Any]:
    """Return known sessions with their latest status and counts."""
    return {"sessions": events.session_summaries(), "session_ids": store.list_ids()}


@app.post("/proxy/reset")
async def reset(request: Request) -> Dict[str, str]:
    """Clear session history. Handy between demo runs."""
    body = await request.json() if await request.body() else {}
    session_id = body.get("session_id")
    store.reset(session_id)
    events.reset(session_id)
    return {"status": "reset"}
