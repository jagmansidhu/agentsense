"""Zero-shot classifier service for AgentSense.

Run:
    uvicorn classifier.model:app --port 8001

Uses a small NLI model so it runs fast on CPU. If latency exceeds ~800 ms per
request, switch to the CLōD-as-classifier fallback (see AGENTS.md §Conventions).
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import torch
from fastapi import FastAPI
from transformers import pipeline

from alerts.openclaw import send_alert
from classifier.explainer import get_explanation

app = FastAPI(title="AgentSense Classifier")

LABELS: List[str] = [
    "healthy",
    "hallucinating",
    "stuck in a loop",
    "off-topic",
    "refusing incorrectly",
]

ALERT_CONFIDENCE_THRESHOLD = 0.75

_classifier = pipeline(
    "zero-shot-classification",
    model="cross-encoder/nli-distilroberta-base",
    device=0 if torch.cuda.is_available() else -1,
)


def _build_context(latest_reply: str, history: List[Dict[str, str]]) -> str:
    context = f"Agent reply: {latest_reply}"
    if len(history) >= 3:
        prev = history[-3].get("content", "")
        if prev:
            context += f"\n\nPrevious turn: {prev}"
    return context


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/classify")
async def classify(data: Dict[str, Any]) -> Dict[str, Any]:
    latest_reply: str = data["latest_reply"]
    history: List[Dict[str, str]] = data.get("history", [])
    session_id: str = data.get("session_id", "default")

    context = _build_context(latest_reply, history)

    # transformers pipeline is sync; offload so we don't block the event loop.
    result = await asyncio.to_thread(_classifier, context, LABELS, multi_label=False)

    top_label = result["labels"][0]
    confidence = float(result["scores"][0])
    explanation = get_explanation(latest_reply, top_label)

    if top_label != "healthy" and confidence > ALERT_CONFIDENCE_THRESHOLD:
        try:
            await send_alert(session_id, top_label, confidence, latest_reply)
        except Exception as exc:  # alerting must never break classification
            explanation += f" (alert failed: {exc})"

    return {
        "label": top_label,
        "confidence": round(confidence, 3),
        "explanation": explanation,
        "all_scores": dict(zip(result["labels"], [float(s) for s in result["scores"]])),
    }
