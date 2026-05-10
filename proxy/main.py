"""AgentSense proxy — intercepts every LLM call, classifies it, broadcasts to dashboard.

Run:
    uvicorn proxy.main:socket_app --port 8000

Contract: see AGENTS.md §"Service contracts".
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

import httpx
import socketio
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from proxy.agents import registry as agent_registry
from proxy.events import events
from proxy.session import store

logger = logging.getLogger("agentsense.proxy")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

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
try:
    CLASSIFIER_TIMEOUT = float(os.environ.get("CLASSIFIER_TIMEOUT", "65"))
except ValueError:
    CLASSIFIER_TIMEOUT = 65.0

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


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


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


async def _stream_clod_reply(
    *,
    payload: Dict[str, Any],
    session_id: str,
    agent_id: str | None,
    event_id: str,
) -> str:
    """Fetch a CLōD chat completion, emitting per-token deltas over Socket.IO.

    Tries SSE streaming first (``stream: True``). Many CLōD-routed models
    (e.g. DeepSeek V3) buffer the full response before sending it, so the
    SSE path may return no ``data:`` lines at all. When that happens the code
    falls back to parsing the buffered body as a regular chat completion.
    Either way, at least one ``assistant_token`` event is emitted so the
    frontend streaming bubble activates.

    Raises ``HTTPException`` on transport errors or non-200 status.
    """
    stream_payload = {**payload, "stream": True}
    full_reply_chunks: List[str] = []

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream(
                "POST",
                CLOD_API_URL,
                headers={
                    "Authorization": f"Bearer {CLOD_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                json=stream_payload,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    detail = body.decode("utf-8", errors="replace")[:2000]
                    raise HTTPException(
                        status_code=502,
                        detail=f"CLōD HTTP {resp.status_code}: {detail}",
                    )

                # Accumulate all raw body bytes so we can fall back to
                # non-streaming parsing if the SSE path yields nothing.
                raw_body_lines: List[str] = []
                saw_sse = False

                async for line in resp.aiter_lines():
                    raw_body_lines.append(line)
                    if not line:
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = _json.loads(data)
                    except _json.JSONDecodeError:
                        continue
                    try:
                        delta = (
                            chunk.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                    except (AttributeError, IndexError, TypeError):
                        delta = None
                    if not delta:
                        continue
                    saw_sse = True
                    full_reply_chunks.append(delta)
                    try:
                        await sio.emit(
                            "assistant_token",
                            {
                                "session_id": session_id,
                                "agent_id": agent_id,
                                "event_id": event_id,
                                "delta": delta,
                            },
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("assistant_token emit failed: %s", exc)

                # Fallback: model returned a buffered non-SSE JSON body.
                if not saw_sse and raw_body_lines:
                    raw_text = "\n".join(raw_body_lines)
                    try:
                        data = _json.loads(raw_text)
                        content = str(
                            data["choices"][0]["message"]["content"]
                        ).strip()
                    except (KeyError, IndexError, TypeError, _json.JSONDecodeError):
                        content = ""
                    if content:
                        logger.info(
                            "CLōD did not stream (buffered %d chars); "
                            "emitting as single token",
                            len(content),
                        )
                        full_reply_chunks.append(content)
                        try:
                            await sio.emit(
                                "assistant_token",
                                {
                                    "session_id": session_id,
                                    "agent_id": agent_id,
                                    "event_id": event_id,
                                    "delta": content,
                                },
                            )
                        except Exception as exc:  # noqa: BLE001
                            logger.warning("assistant_token fallback emit failed: %s", exc)

    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"CLōD request failed: {exc}") from exc

    return "".join(full_reply_chunks).strip()


async def _classify_and_emit(
    *,
    event_id: str,
    session_id: str,
    user_message: str,
    agent_reply: str,
    history: List[Dict[str, str]],
    agent_persona: str,
    pending_payload: Dict[str, Any],
) -> None:
    """Run the classifier, upsert the refined event, and emit the final ``agent_event``.

    Always emits a final ``agent_event`` so the dashboard card never sticks in
    ``pending`` — classifier errors flatten to ``label="unknown"`` with the
    error message in ``explanation``.
    """
    classification_raw: Dict[str, Any] = {
        "label": "unknown",
        "confidence": 0.0,
        "explanation": "classifier unreachable",
    }
    try:
        async with httpx.AsyncClient(timeout=CLASSIFIER_TIMEOUT) as client:
            cls_resp = await client.post(
                CLASSIFIER_URL,
                json={
                    "session_id": session_id,
                    "history": history,
                    "latest_reply": agent_reply,
                    "agent_system_prompt": agent_persona,
                },
            )
        try:
            classification_raw = cls_resp.json()
        except ValueError:
            classification_raw["explanation"] = (
                f"classifier HTTP {cls_resp.status_code}: {cls_resp.text[:300]}"
            )
    except Exception as exc:  # noqa: BLE001
        classification_raw["explanation"] = f"classifier error: {exc}"

    health = _shape_health(classification_raw)

    refined_payload: Dict[str, Any] = {
        **pending_payload,
        "label": health.get("label"),
        "confidence": health.get("confidence"),
        "explanation": health.get("explanation"),
    }
    refined_event = events.append(refined_payload)
    try:
        await sio.emit("agent_event", refined_event)
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent_event refine emit failed (event=%s): %s", event_id, exc)


@app.post("/proxy/chat")
async def proxy_chat(request: Request) -> JSONResponse:
    """Forward chat to CLōD (streaming) and kick off classification asynchronously.

    Behavior:
      1. Append user turn to session history.
      2. Stream the CLōD chat completion, emitting ``assistant_token`` events
         to Socket.IO for each token so the playground bubble types live.
      3. Emit ``assistant_stream_done`` once the stream completes.
      4. Persist the assistant turn, then emit ``agent_event`` with
         ``label="pending"`` so the dashboard card mounts immediately.
      5. Spawn a background task that calls ``/classify`` and emits a second
         ``agent_event`` with the SAME ``id`` and the real label/confidence.
      6. Return the HTTP response with the full reply and ``health.label``
         set to ``"pending"`` — callers that don't watch the socket still
         get an immediate, well-formed response.

    Optional ``agent_id`` selects a registered agent; its system prompt and
    task are prepended to the messages and its model/temperature override
    the defaults.
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
    history: List[Dict[str, str]] = store.append(
        session_id, {"role": "user", "content": user_message}
    )

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

    # Stamp the event id up front so the streamed tokens, the pending event,
    # and the refined event all share the same id (front-end keys upserts on it).
    event_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)
    agent_id = agent.agent_id if agent else None

    agent_reply = await _stream_clod_reply(
        payload=llm_payload,
        session_id=session_id,
        agent_id=agent_id,
        event_id=event_id,
    )
    if not agent_reply:
        raise HTTPException(status_code=502, detail="CLōD returned an empty reply")

    # Tell the playground bubble it can stop showing the typing cursor.
    try:
        await sio.emit(
            "assistant_stream_done",
            {
                "session_id": session_id,
                "agent_id": agent_id,
                "event_id": event_id,
                "reply": agent_reply,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("assistant_stream_done emit failed: %s", exc)

    history = store.append(session_id, {"role": "assistant", "content": agent_reply})

    # Forward the active agent's persona + task so the classifier can judge
    # "refusing incorrectly" against actual policy. Empty string is fine —
    # the classifier falls back to judging on the conversation alone.
    agent_persona = agent.composed_system_prompt() if agent is not None else ""

    pending_payload: Dict[str, Any] = {
        "id": event_id,
        "created_at": created_at,
        "session_id": session_id,
        "user_message": user_message,
        "message": agent_reply,
        "label": "pending",
        "confidence": 0.0,
        "explanation": "classifying…",
    }
    if agent is not None:
        pending_payload["agent_id"] = agent.agent_id
        pending_payload["agent_name"] = agent.name

    pending_event = events.append(pending_payload)
    try:
        await sio.emit("agent_event", pending_event)
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent_event pending emit failed: %s", exc)

    # Kick off classification in the background. The HTTP response returns
    # immediately below; the second `agent_event` (with the real label) will
    # arrive over Socket.IO whenever the judge finishes.
    asyncio.create_task(
        _classify_and_emit(
            event_id=event_id,
            session_id=session_id,
            user_message=user_message,
            agent_reply=agent_reply,
            history=history,
            agent_persona=agent_persona,
            pending_payload=pending_payload,
        )
    )

    return JSONResponse(
        {
            "reply": agent_reply,
            "health": {
                "label": "pending",
                "confidence": 0.0,
                "explanation": "classifying…",
            },
            "agent_id": agent.agent_id if agent else None,
            "session_id": session_id,
            "event_id": event_id,
        }
    )


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
