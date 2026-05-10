"""LLM-judge classifier service for AgentSense.

Run:
    uvicorn classifier.model:app --port 8001

Accepts a thinking-first payload (thinking/action/tool_calls/output/recent_turns)
and returns the unchanged {label, confidence, explanation, all_scores} contract.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from alerts.openclaw import send_alert
from classifier.explainer import augment_reason

app = FastAPI(title="AgentSense Classifier")

LABELS: List[str] = [
    "healthy",
    "hallucinating",
    "stuck in a loop",
    "off-topic",
    "refusing incorrectly",
]

ALERT_CONFIDENCE_THRESHOLD = 0.75

CLOD_API_URL = os.environ.get("CLOD_API_URL", "https://api.clod.ai/v1/chat")
CLOD_API_KEY = os.environ.get("CLOD_API_KEY", "")
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "")

JUDGE_SYSTEM_PROMPT = """You are an auditor of AI coding agents (especially Cursor agents).
You receive the agent's THINKING (chain-of-thought), its planned ACTION,
recent TOOL CALLS, the visible OUTPUT, and the USER GOAL. Decide which
single label best describes this turn:

- healthy: thinking is grounded in the goal and prior turns, plan is sensible
- hallucinating: thinking asserts facts/tool capabilities not supported by context
- stuck in a loop: same plan or same tool call recurring without progress
- off-topic: thinking drifts away from the stated user goal
- refusing incorrectly: refuses despite the goal being legitimate and feasible

Return strict JSON only: {"label":"...","confidence":0.0,"reason":"..."}
Base your classification on THINKING first, OUTPUT second.
confidence must be between 0.0 and 1.0."""


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ToolCallItem(BaseModel):
    name: str
    args: dict = {}


class ClassifyRequest(BaseModel):
    session_id: str = "default"
    agent_id: str = "unknown"
    thinking: str = ""
    action: str = ""
    tool_calls: list[ToolCallItem] = []
    output: str = ""
    user_goal: str = ""
    recent_turns: list[dict] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(text: str, limit: int = 800) -> str:
    return text[:limit] if len(text) > limit else text


def _build_context(request: ClassifyRequest) -> str:
    lines: List[str] = []

    lines.append(f"USER GOAL: {request.user_goal or '(not specified)'}")
    lines.append("")

    if request.recent_turns:
        lines.append("RECENT TURNS:")
        turns = request.recent_turns[-3:]
        offset = len(turns)
        for i, turn in enumerate(turns):
            n = offset - i
            t_thinking = _truncate(str(turn.get("thinking", "")))
            t_action = str(turn.get("action", ""))
            lines.append(f"  [t-{n}] thinking={t_thinking} | action={t_action}")
        lines.append("")

    tool_calls_payload = json.dumps([t.dict() for t in request.tool_calls])
    lines.append("THIS TURN:")
    lines.append(f"  thinking={_truncate(request.thinking)}")
    lines.append(f"  action={request.action}")
    lines.append(f"  tool_calls={tool_calls_payload}")
    lines.append(f"  output={_truncate(request.output)}")

    return "\n".join(lines)


def _extract_json_object(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            raise ValueError("judge did not return JSON")
        return json.loads(match.group(0))


def _normalize_label(value: Any) -> str:
    label = str(value or "").strip().lower()
    if label in LABELS:
        return label
    return "healthy"


def _build_all_scores(label: str, confidence: float) -> Dict[str, float]:
    scores = {item: 0.0 for item in LABELS}
    scores[label] = confidence
    return scores


async def _judge_with_clod(context: str) -> Dict[str, Any]:
    if not CLOD_API_KEY:
        raise RuntimeError("CLOD_API_KEY is missing")

    user_prompt = (
        "Agent turn context follows.\n\n"
        f"{context}\n\n"
        "Return only JSON in the required schema."
    )

    payload: Dict[str, Any] = {
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    }
    if JUDGE_MODEL:
        payload["model"] = JUDGE_MODEL

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            CLOD_API_URL,
            headers={"Authorization": f"Bearer {CLOD_API_KEY}"},
            json=payload,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    return _extract_json_object(content)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/classify")
async def classify(request: ClassifyRequest) -> dict:
    context = _build_context(request)
    judge_result = await _judge_with_clod(context)

    top_label = _normalize_label(judge_result.get("label"))
    confidence = max(0.0, min(1.0, float(judge_result.get("confidence", 0.0))))

    explanation = augment_reason(
        thinking=request.thinking,
        output=request.output,
        predicted_label=top_label,
        reason=str(judge_result.get("reason", "No reason provided")),
        recent_turns=request.recent_turns,
        tool_calls=[t.dict() for t in request.tool_calls],
    )

    if top_label != "healthy" and confidence > ALERT_CONFIDENCE_THRESHOLD:
        snippet = request.thinking[:140] or request.output[:140]
        try:
            await send_alert(request.session_id, top_label, confidence, snippet)
        except Exception as exc:
            explanation += f" (alert failed: {exc})"

    rounded = round(confidence, 3)
    return {
        "label": top_label,
        "confidence": rounded,
        "explanation": explanation,
        "all_scores": _build_all_scores(top_label, rounded),
    }
