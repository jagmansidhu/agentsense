"""AgentSense proxy — intercepts every LLM call, classifies it, broadcasts to dashboard.

Run:
    uvicorn proxy.main:socket_app --port 8000

Contract: see AGENTS.md §"Service contracts".
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

import httpx
import socketio
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from proxy import db as dbmod
from proxy.agents import registry as agent_registry
from proxy.events import events
from proxy.session import store

_REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv(repo_root: Path) -> None:
    env_file = repo_root / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_dotenv(_REPO_ROOT)

CLOD_API_URL = os.environ.get("CLOD_API_URL", "https://api.clod.io/v1/chat/completions").strip()
CLOD_API_KEY = os.environ.get("CLOD_API_KEY", "").strip()
CLOD_MODEL = os.environ.get("CLOD_MODEL", "DeepSeek V3").strip()
CLOD_TEMPERATURE = float(os.environ.get("CLOD_TEMPERATURE", "0.7"))
CLOD_MAX_TOKENS_RAW = os.environ.get("CLOD_MAX_COMPLETION_TOKENS")
CLASSIFIER_URL = os.environ.get("CLASSIFIER_URL", "http://localhost:8001/classify")

if CLOD_MAX_TOKENS_RAW is None or CLOD_MAX_TOKENS_RAW == "":
    CLOD_MAX_COMPLETION_TOKENS: int | None = None
else:
    try:
        CLOD_MAX_COMPLETION_TOKENS = int(str(CLOD_MAX_TOKENS_RAW).strip())
    except ValueError:
        CLOD_MAX_COMPLETION_TOKENS = None


def _normalize_clod_url(url: str) -> str:
    u = url.strip()
    if u.rstrip("/").endswith("/v1") and "/chat/completions" not in u:
        return u.rstrip("/") + "/chat/completions"
    return u


CLOD_API_URL = _normalize_clod_url(CLOD_API_URL)

app = FastAPI(title="AgentSense Proxy")
_origins_raw = os.environ.get("AGENTSENSE_CORS_ORIGINS", "*")
_allow_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)


@app.on_event("startup")
def _startup() -> None:
    if dbmod.is_enabled():
        dbmod.init_db()
        agent_registry.hydrate_from_db()
        events.hydrate_from_db()


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "persistence": dbmod.describe()}


VALID_ORIGINS = {"ui", "external", "cursor"}


def _normalize_origin(value: Any, default: str = "ui") -> str:
    candidate = str(value or default).strip().lower()
    return candidate if candidate in VALID_ORIGINS else default


async def _classify(
    session_id: str, history: List[Dict[str, str]], latest_reply: str
) -> Dict[str, Any]:
    """Best-effort POST to the classifier; returns a degraded shape on failure."""
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
                    "latest_reply": latest_reply,
                },
            )
            cls_resp.raise_for_status()
            classification = cls_resp.json()
    except Exception as exc:
        classification["explanation"] = f"classifier error: {exc}"
    return classification


def _shape_health(payload: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "label": payload.get("label"),
        "confidence": payload.get("confidence"),
        "explanation": payload.get("explanation"),
    }
    scores = payload.get("all_scores")
    if scores is not None:
        out["all_scores"] = scores
    return out


@app.post("/proxy/chat")
async def proxy_chat(request: Request) -> JSONResponse:
    """Forward chat to CLōD, classify the reply, and broadcast to the dashboard.

    Optional `agent_id` selects a registered agent; its system prompt and task are
    prepended to the messages and its model/temperature override the defaults.
    """
    if not CLOD_API_KEY:
        raise HTTPException(status_code=500, detail="CLOD_API_KEY is not configured")

    body = await request.json()
    session_id = str(body.get("session_id") or "default").strip() or "default"
    user_message = body.get("message")
    if user_message is None or not str(user_message).strip():
        raise HTTPException(status_code=400, detail="message is required")

    agent_id_raw = body.get("agent_id")
    agent = None
    if agent_id_raw is not None and str(agent_id_raw).strip():
        agent = agent_registry.get(str(agent_id_raw).strip())
        if agent is None:
            raise HTTPException(status_code=404, detail=f"agent '{agent_id_raw}' not found")

    user_message = str(user_message).strip()
    history: List[Dict[str, str]] = store.append(session_id, {"role": "user", "content": user_message})

    messages: List[Dict[str, str]] = list(history)
    if agent is not None:
        composed = agent.composed_system_prompt()
        if composed:
            messages = [{"role": "system", "content": composed}, *messages]

    chosen_model = agent.model if (agent and agent.model) else CLOD_MODEL
    chosen_temperature = (
        agent.temperature if (agent and agent.temperature is not None) else CLOD_TEMPERATURE
    )

    llm_payload: Dict[str, Any] = {
        "model": chosen_model,
        "messages": messages,
        "temperature": chosen_temperature,
    }
    if CLOD_MAX_COMPLETION_TOKENS is not None:
        llm_payload["max_completion_tokens"] = CLOD_MAX_COMPLETION_TOKENS

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            llm_resp = await client.post(
                CLOD_API_URL,
                headers={
                    "Authorization": f"Bearer {CLOD_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=llm_payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"CLōD request failed: {exc}") from exc

    if llm_resp.status_code != 200:
        detail = llm_resp.text[:2000]
        raise HTTPException(status_code=502, detail=f"CLōD HTTP {llm_resp.status_code}: {detail}")

    try:
        data = llm_resp.json()
        agent_reply = str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected CLōD response shape: {exc}") from exc

    history = store.append(session_id, {"role": "assistant", "content": agent_reply})

    classification_raw = await _classify(session_id, history, agent_reply)
    health = _shape_health(classification_raw)

    event_payload: Dict[str, Any] = {
        "session_id": session_id,
        "origin": "ui",
        "user_message": user_message,
        "message": agent_reply,
        "label": health.get("label"),
        "confidence": health.get("confidence"),
        "explanation": health.get("explanation"),
    }
    if agent is not None:
        event_payload["agent_id"] = agent.agent_id
        event_payload["agent_name"] = agent.name

    event = events.append(event_payload)

    await sio.emit("agent_event", event)

    return JSONResponse(
        {
            "reply": agent_reply,
            "health": health,
            "agent_id": agent.agent_id if agent else None,
            "session_id": session_id,
        }
    )


@app.post("/proxy/ingest")
async def proxy_ingest(request: Request) -> JSONResponse:
    """Accept a pre-completed turn from an external agent runtime.

    Use this when something else (a Cursor agent, a CI bot, your own Python
    script) already produced the assistant reply and just wants AgentSense to
    classify, persist, and broadcast it. The proxy does not call CLōD here.

    Body:
        {
          "session_id": str,
          "agent_id": str?,
          "agent_name": str?,
          "origin": "external" | "cursor" | "ui"?,
          "user_message": str?,
          "assistant_message": str  (alias: "message"),
          "metadata": object?
        }
    """
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid JSON: {exc}") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")

    session_id = str(body.get("session_id") or "default").strip() or "default"
    assistant_message = body.get("assistant_message")
    if assistant_message is None:
        assistant_message = body.get("message")
    if assistant_message is None or not str(assistant_message).strip():
        raise HTTPException(status_code=400, detail="assistant_message is required")
    assistant_message = str(assistant_message).strip()

    user_message_raw = body.get("user_message")
    user_message = str(user_message_raw).strip() if user_message_raw is not None else None

    origin = _normalize_origin(body.get("origin"), default="external")

    agent_id_raw = body.get("agent_id")
    agent_id = str(agent_id_raw).strip() if agent_id_raw else None
    agent_name_raw = body.get("agent_name")
    agent_name = str(agent_name_raw).strip() if agent_name_raw else None

    # Track this conversation in the in-process session store too so future
    # /proxy/chat calls with the same session_id pick up where we left off.
    if user_message:
        store.append(session_id, {"role": "user", "content": user_message})
    history = store.append(session_id, {"role": "assistant", "content": assistant_message})

    classification_raw = await _classify(session_id, history, assistant_message)
    health = _shape_health(classification_raw)

    event_payload: Dict[str, Any] = {
        "session_id": session_id,
        "origin": origin,
        "user_message": user_message,
        "message": assistant_message,
        "label": health.get("label"),
        "confidence": health.get("confidence"),
        "explanation": health.get("explanation"),
    }
    if agent_id:
        event_payload["agent_id"] = agent_id
    if agent_name:
        event_payload["agent_name"] = agent_name
    metadata = body.get("metadata")
    if isinstance(metadata, dict):
        event_payload["metadata"] = metadata

    event = events.append(event_payload)
    await sio.emit("agent_event", event)

    return JSONResponse({"event": event, "health": health}, status_code=201)


@app.get("/proxy/events")
async def get_events(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    origin: str | None = Query(default=None),
) -> Dict[str, Any]:
    """Return recent events for dashboard hydration and reconnect."""
    return {
        "events": events.list_events(session_id=session_id, limit=limit, origin=origin),
    }


@app.get("/proxy/sessions")
async def get_sessions() -> Dict[str, Any]:
    """Return known sessions with their latest status and counts."""
    return {"sessions": events.session_summaries(), "session_ids": store.list_ids()}


@app.post("/proxy/reset")
async def reset(request: Request) -> Dict[str, str]:
    """Clear session history. Handy between demo runs."""
    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        body = {}
    session_id = body.get("session_id")
    store.reset(session_id)
    events.reset(session_id)
    return {"status": "reset"}


# ── Agent registry ─────────────────────────────────────────────────────────
# These endpoints power the multi-agent playground in the dashboard. Agents
# are persona+task wrappers around `/proxy/chat`; deleting one drops only the
# registry entry, not the captured event/session history.


@app.get("/proxy/agents")
async def list_agents() -> Dict[str, Any]:
    return {"agents": agent_registry.list()}


@app.post("/proxy/agents")
async def create_agent(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid JSON: {exc}") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    try:
        agent = agent_registry.create(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(agent.to_dict(), status_code=201)


@app.patch("/proxy/agents/{agent_id}")
async def update_agent(agent_id: str, request: Request) -> Dict[str, Any]:
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid JSON: {exc}") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    agent = agent_registry.update(agent_id, body)
    if agent is None:
        raise HTTPException(status_code=404, detail=f"agent '{agent_id}' not found")
    return agent.to_dict()


@app.delete("/proxy/agents/{agent_id}")
async def delete_agent(agent_id: str) -> Dict[str, str]:
    if not agent_registry.delete(agent_id):
        raise HTTPException(status_code=404, detail=f"agent '{agent_id}' not found")
    return {"status": "deleted", "agent_id": agent_id}
