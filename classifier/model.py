"""LLM-judge classifier service for AgentSense.

Run:
    uvicorn classifier.model:app --port 8001

This service asks CLōD to score each agent reply into one label with
confidence and a short reason. It preserves the existing `/classify` contract.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI

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

JUDGE_SYSTEM_PROMPT = """You are an agent behavior auditor.
Classify the assistant reply into exactly one label:
- healthy
- hallucinating
- stuck in a loop
- off-topic
- refusing incorrectly

Rules:
- Return strict JSON only.
- `label` must be one of the five labels exactly.
- `confidence` must be a number between 0 and 1.
- `reason` must be one concise sentence.

JSON schema:
{"label":"...","confidence":0.0,"reason":"..."}
"""


def _build_context(latest_reply: str, history: List[Dict[str, str]]) -> str:
    context = f"Agent reply: {latest_reply}"
    if len(history) >= 3:
        prev = history[-3].get("content", "")
        if prev:
            context += f"\n\nPrevious turn: {prev}"
    return context


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
        "Recent conversation context and latest agent output follow.\n\n"
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


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/classify")
async def classify(data: Dict[str, Any]) -> Dict[str, Any]:
    latest_reply: str = data["latest_reply"]
    history: List[Dict[str, str]] = data.get("history", [])
    session_id: str = data.get("session_id", "default")

    context = _build_context(latest_reply, history)
    judge_result = await _judge_with_clod(context)

    top_label = _normalize_label(judge_result.get("label"))
    confidence = max(0.0, min(1.0, float(judge_result.get("confidence", 0.0))))
    explanation = augment_reason(
        text=latest_reply,
        predicted_label=top_label,
        reason=str(judge_result.get("reason", "No reason provided")),
    )

    if top_label != "healthy" and confidence > ALERT_CONFIDENCE_THRESHOLD:
        try:
            await send_alert(session_id, top_label, confidence, latest_reply)
        except Exception as exc:  # alerting must never break classification
            explanation += f" (alert failed: {exc})"

    return {
        "label": top_label,
        "confidence": round(confidence, 3),
        "explanation": explanation,
        "all_scores": _build_all_scores(top_label, round(confidence, 3)),
    }
