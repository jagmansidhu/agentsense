"""LLM-judge classifier service for AgentSense.

Run:
    uvicorn classifier.model:app --port 8001

This service asks CLōD to score each agent reply into one label with
confidence and a short reason. It preserves the existing `/classify` contract.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse

logger = logging.getLogger("agentsense.classifier")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

from alerts.openclaw import send_alert
from classifier.explainer import augment_reason

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


def _normalize_clod_url(url: str) -> str:
    u = url.strip()
    if u.rstrip("/").endswith("/v1") and "/chat/completions" not in u:
        return u.rstrip("/") + "/chat/completions"
    return u


app = FastAPI(title="AgentSense Classifier")

LABELS: List[str] = [
    "healthy",
    "hallucinating",
    "stuck in a loop",
    "off-topic",
    "refusing incorrectly",
]

ALERT_CONFIDENCE_THRESHOLD = 0.75

CLOD_API_URL = _normalize_clod_url(
    os.environ.get("CLOD_API_URL", "https://api.clod.io/v1/chat/completions")
)
CLOD_API_KEY = os.environ.get("CLOD_API_KEY", "").strip()
CLOD_MODEL = os.environ.get("CLOD_MODEL", "").strip()
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "").strip() or CLOD_MODEL

try:
    JUDGE_TIMEOUT = float(os.environ.get("JUDGE_TIMEOUT", "60"))
except ValueError:
    JUDGE_TIMEOUT = 60.0

JUDGE_SYSTEM_PROMPT = """You score AI agent replies. Output ONE JSON object only.

Schema: {"label": one of [healthy|hallucinating|stuck in a loop|off-topic|refusing incorrectly], "confidence": number 0..1, "reason": one sentence under 25 words}.

Rules:
- First character of your reply MUST be `{`. Last MUST be `}`.
- No prose, no markdown, no preamble, no analysis text.
"""

JUDGE_HARDENED_RETRY_PROMPT = (
    "Your previous response was not valid JSON. Output ONLY the JSON object now. "
    "Start your reply with `{` and end with `}`. No other characters."
)

# A single concrete example shown as a prior user/assistant exchange. Few-shot
# demonstration is dramatically more reliable than instruction-only at forcing
# strict JSON output on DeepSeek V3 through CLōD.
JUDGE_FEWSHOT_USER = (
    "User prompt: What is 2+2?\n\n"
    "Agent reply: 2+2 equals 5.\n\n"
    "Respond with ONLY the JSON object."
)
JUDGE_FEWSHOT_ASSISTANT = (
    '{"label":"hallucinating","confidence":0.97,'
    '"reason":"Asserts 2+2 equals 5, which is factually false."}'
)


def _build_context(latest_reply: str, history: List[Dict[str, str]]) -> str:
    """Build a compact judging context.

    The proxy sends `history` after appending the assistant reply, so we walk
    backwards to find the user's most recent prompt (skipping the assistant
    turn that produced `latest_reply`). That is far more useful to the judge
    than the previous assistant reply we used to expose.
    """
    context_parts: List[str] = [f"Agent reply: {latest_reply}"]
    last_user = next(
        (msg.get("content", "") for msg in reversed(history) if msg.get("role") == "user"),
        "",
    )
    if last_user:
        context_parts.insert(0, f"User prompt: {last_user}")
    return "\n\n".join(part for part in context_parts if part)


def _extract_json_object(raw: str) -> Dict[str, Any]:
    text = raw.strip()
    # Strip ```json fenced code blocks if the model wrapped the JSON.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Walk the string and return the first balanced {...} that parses cleanly.
    for start in (i for i, ch in enumerate(text) if ch == "{"):
        depth = 0
        in_str = False
        escape = False
        for end in range(start, len(text)):
            ch = text[end]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : end + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break
    raise ValueError("judge did not return JSON")


def _normalize_label(value: Any) -> str:
    """Map a free-form judge label to the canonical set.

    Tries exact match, then trims punctuation, then substring containment so
    judges that emit "Hallucinating." or "label: off-topic" still classify
    correctly. Falls back to `healthy` only as a last resort and logs that
    fallback so silent mislabeling is debuggable.
    """
    raw = str(value or "").strip().lower()
    if not raw:
        return "healthy"
    cleaned = raw.strip(" .:;\"'\n\t")
    if cleaned in LABELS:
        return cleaned
    for label in LABELS:
        if label in cleaned:
            return label
    logger.warning("unrecognized judge label %r, defaulting to healthy", raw)
    return "healthy"


def _build_all_scores(label: str, confidence: float) -> Dict[str, float]:
    scores = {item: 0.0 for item in LABELS}
    scores[label] = confidence
    return scores


def _build_user_prompt(context: str) -> str:
    return (
        f"{context}\n\n"
        "Respond with ONLY the JSON object specified in the schema. "
        "Your first character must be `{`."
    )


async def _post_clod(messages: List[Dict[str, str]], client: httpx.AsyncClient) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "messages": messages,
        "temperature": 0.0,
        "max_completion_tokens": 1024,
        "response_format": {"type": "json_object"},
    }
    if JUDGE_MODEL:
        payload["model"] = JUDGE_MODEL

    try:
        response = await client.post(
            CLOD_API_URL,
            headers={
                "Authorization": f"Bearer {CLOD_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    except httpx.TimeoutException as exc:
        raise RuntimeError(
            f"CLōD request timed out after {JUDGE_TIMEOUT:.0f}s "
            f"(set JUDGE_TIMEOUT env to override)"
        ) from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"CLōD request error: {exc}") from exc

    if response.status_code >= 400:
        raise RuntimeError(
            f"CLōD API {response.status_code} from {CLOD_API_URL}: {response.text[:300]}"
        )
    try:
        choice = response.json()["choices"][0]
        return {
            "content": choice["message"]["content"],
            "finish_reason": choice.get("finish_reason", ""),
        }
    except (KeyError, ValueError, IndexError, TypeError) as exc:
        raise RuntimeError(
            f"Unexpected CLōD response shape from {CLOD_API_URL}: {response.text[:300]}"
        ) from exc


def _salvage_label_from_prose(text: str, default_reason: str) -> Dict[str, Any]:
    """Last-resort: pick a label out of free-form prose.

    Used only when the judge refuses to emit JSON even after a hardened retry.
    Better to surface a low-confidence guess than to 502 the request.
    """
    lower = text.lower()
    for label in LABELS:
        if label in lower:
            return {
                "label": label,
                "confidence": 0.5,
                "reason": (default_reason or "salvaged from prose")[:240],
            }
    return {"label": "healthy", "confidence": 0.0, "reason": "judge returned prose with no label"}


async def _judge_with_clod(context: str) -> Dict[str, Any]:
    if not CLOD_API_KEY:
        raise RuntimeError(
            "CLOD_API_KEY is missing. Set it in .env at the repo root or export it before launching uvicorn."
        )

    user_prompt = _build_user_prompt(context)

    # Few-shot the model with a completed example before asking the real question.
    # On DeepSeek V3 through CLōD, this is dramatically more effective at forcing
    # strict JSON than instruction-only prompting.
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": JUDGE_FEWSHOT_USER},
        {"role": "assistant", "content": JUDGE_FEWSHOT_ASSISTANT},
        {"role": "user", "content": user_prompt},
    ]

    async with httpx.AsyncClient(timeout=JUDGE_TIMEOUT) as client:
        first = await _post_clod(messages, client)
        try:
            return _extract_json_object(first["content"])
        except (ValueError, json.JSONDecodeError):
            if first["finish_reason"] == "length":
                raise RuntimeError(
                    "Judge output truncated by max_completion_tokens. "
                    "Raise the cap in classifier/model.py."
                )
            logger.warning(
                "judge returned non-JSON on first attempt; retrying with hardened prompt"
            )

        # Retry once with a stricter follow-up that quotes the model's bad output.
        retry_messages = messages + [
            {"role": "assistant", "content": first["content"]},
            {"role": "user", "content": JUDGE_HARDENED_RETRY_PROMPT},
        ]
        second = await _post_clod(retry_messages, client)
        try:
            return _extract_json_object(second["content"])
        except (ValueError, json.JSONDecodeError):
            logger.warning(
                "judge still non-JSON after retry; salvaging label from prose"
            )
            # Use the longer of the two prose attempts to maximize keyword hits.
            prose = first["content"] if len(first["content"]) >= len(second["content"]) else second["content"]
            return _salvage_label_from_prose(prose, default_reason=prose[:200])


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "clod_url": CLOD_API_URL,
        "clod_key_present": bool(CLOD_API_KEY),
        "judge_model": JUDGE_MODEL or None,
    }


@app.post("/classify")
async def classify(data: Dict[str, Any]) -> Any:
    latest_reply: str = data.get("latest_reply", "")
    history: List[Dict[str, str]] = data.get("history", [])
    session_id: str = data.get("session_id", "default")

    context = _build_context(latest_reply, history)
    try:
        judge_result = await _judge_with_clod(context)
    except Exception as exc:
        # Surface the underlying cause in the uvicorn log so a 502 is debuggable
        # without having to inspect the response body on the caller side.
        logger.warning("classify failed (session=%s): %s", session_id, exc)
        return JSONResponse(
            status_code=502,
            content={
                "label": "unknown",
                "confidence": 0.0,
                "explanation": f"classifier error: {exc}",
                "all_scores": {label: 0.0 for label in LABELS},
            },
        )

    top_label = _normalize_label(judge_result.get("label"))
    try:
        confidence = max(0.0, min(1.0, float(judge_result.get("confidence", 0.0))))
    except (TypeError, ValueError):
        logger.warning(
            "non-numeric confidence %r from judge, defaulting to 0.0",
            judge_result.get("confidence"),
        )
        confidence = 0.0
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
