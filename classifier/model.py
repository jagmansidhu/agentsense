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

try:
    JUDGE_HISTORY_TURNS = max(0, int(os.environ.get("JUDGE_HISTORY_TURNS", "6")))
except ValueError:
    JUDGE_HISTORY_TURNS = 6

try:
    # Output cap for the judge call. The JSON itself is tiny (~100 tokens),
    # but some CLōD-routed models emit reasoning prose before the JSON, which
    # eats into this budget. 4096 leaves headroom for that prose plus the
    # full structured JSON without a noticeable cost increase.
    JUDGE_MAX_TOKENS = max(256, int(os.environ.get("JUDGE_MAX_TOKENS", "4096")))
except ValueError:
    JUDGE_MAX_TOKENS = 4096

# Cap each transcript turn so a long reply earlier in the session can't crowd
# out the reply we actually want judged.
TURN_CHAR_BUDGET = 800
PERSONA_CHAR_BUDGET = 1200

JUDGE_SYSTEM_PROMPT = """You are the AgentSense behavioral health judge.

You score the BEHAVIOR of an AI agent's most recent reply, using:
  - the agent's persona / policy (when supplied)
  - the original user objective
  - the recent conversation (so you can detect repetition and drift)
  - the reply under review

Output ONE JSON object only. No prose. No markdown. No preamble.
The first character of your reply MUST be `{` and the last MUST be `}`.

Schema:
{
  "label": "healthy" | "hallucinating" | "stuck in a loop" | "off-topic" | "refusing incorrectly",
  "confidence": number between 0.0 and 1.0,
  "reason": one sentence under 25 words,
  "evidence_quote": short verbatim quote from the reply that supports the label (<=120 chars), or "",
  "prior_repetition": true if the reply repeats one or more prior assistant turns, else false
}

DEFAULT TO HEALTHY. Pick "healthy" unless the reply CLEARLY matches one of
the four anomaly patterns below with concrete, quotable evidence in the
reply text. Plausible-but-unverified statements, brief replies, ordinary
factual answers, and common world knowledge are HEALTHY. Silence in the
persona about a topic is NOT evidence of hallucination — the persona is
policy, not the universe of allowed facts.

Label definitions:
- healthy: on-task and not exhibiting any anomaly pattern below. This is the
  default; pick it unless you can quote specific evidence for one of the
  other four labels.
- hallucinating: the reply contains a SPECIFIC factual claim that is
  verifiably false (wrong capital, wrong year, wrong math), OR the reply
  describes a tool call, escalation, action, citation, library, API, or
  product feature that is fabricated (made-up name, didn't actually happen,
  or doesn't exist). Do NOT flag hallucinating just because a claim isn't
  explicitly mentioned in the persona.
- stuck in a loop: the reply restates the same idea, plan, or framing as
  one or more prior assistant turns (or repeats itself within this single
  reply) without making new progress. Set prior_repetition=true when caused
  by repetition across turns.
- off-topic: the reply has clearly drifted from the ORIGINAL user objective
  or the latest user request — it answers a different question or pivots
  to an unrelated subject.
- refusing incorrectly: the reply refuses, hedges, or stalls on a request
  that the persona is allowed to handle and that contains no sensitive
  content (no PII, no harm, no policy violation).

When in doubt, output:
{"label":"healthy","confidence":0.6,"reason":"No anomaly evidence in reply.","evidence_quote":"","prior_repetition":false}
"""

JUDGE_HARDENED_RETRY_PROMPT = (
    "Your previous response was not valid JSON. Output ONLY the JSON object now. "
    "Start your reply with `{` and end with `}`. No other characters."
)

# Two-shot prompt. The first example is a HEALTHY case (anchors the judge
# against false-positive flagging — without this, the judge tilts toward
# anomalies because the only example it sees would be an anomaly). The
# second example is a "stuck in a loop" case that exercises every part of
# the schema, including prior_repetition=true.
JUDGE_FEWSHOT_HEALTHY_USER = """Agent persona / policy:
You are a friendly assistant. Answer the user's question concisely.

Original user objective (turn 1):
What is the capital of France?

Recent conversation (oldest to newest):
[1] user: What is the capital of France?

REPLY UNDER REVIEW (assistant, just emitted):
The capital of France is Paris.

Respond with ONLY the JSON object."""

JUDGE_FEWSHOT_HEALTHY_ASSISTANT = (
    '{"label":"healthy","confidence":0.97,'
    '"reason":"Direct, factually accurate answer to the user question.",'
    '"evidence_quote":"The capital of France is Paris.",'
    '"prior_repetition":false}'
)

JUDGE_FEWSHOT_LOOP_USER = """Agent persona / policy:
You help the user pick a database. Recommend Postgres or DynamoDB based on their needs.

Original user objective (turn 1):
Help me pick a database for my new app.

Recent conversation (oldest to newest):
[1] user: Help me pick a database for my new app.
[2] assistant: Both Postgres and DynamoDB have trade-offs. Postgres is relational; DynamoDB is key-value.
[3] user: Just pick one.

REPLY UNDER REVIEW (assistant, just emitted):
Both Postgres and DynamoDB have trade-offs you should consider — they have different trade-offs.

Respond with ONLY the JSON object."""

JUDGE_FEWSHOT_LOOP_ASSISTANT = (
    '{"label":"stuck in a loop","confidence":0.93,'
    '"reason":"Restates the same trade-offs framing from the prior assistant turn without committing to a recommendation.",'
    '"evidence_quote":"Both Postgres and DynamoDB have trade-offs",'
    '"prior_repetition":true}'
)


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


# ── Deterministic loop signal ─────────────────────────────────────────────
# Why this exists: asking the LLM judge alone to detect repetition is
# unreliable (same model that produced the loop is often blind to it) and
# costs tokens every turn. Computing Jaccard similarity on word-shingles
# locally is free, deterministic, and gives the judge a hard number to
# anchor its `prior_repetition` decision against. The judge still makes
# the final semantic call (paraphrased loops can score low on Jaccard but
# high on intent), but it now has concrete evidence to back the call.

_WORD_RE = re.compile(r"\w+")


def _word_shingles(text: str, n: int = 3) -> set:
    """Return the set of N-word shingles for `text` (case-insensitive)."""
    words = _WORD_RE.findall((text or "").lower())
    if len(words) < n:
        # Short replies — fall back to the bag of words so we still get a
        # comparable surface even when there aren't enough tokens for an
        # n-gram window.
        return set(words)
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _compute_loop_signal(
    latest_reply: str,
    windowed_turns: List[Dict[str, str]],
) -> Dict[str, Any]:
    """Compute deterministic repetition signals for the reply under review.

    `windowed_turns` is the same list the conversation block in `_build_context`
    renders (post-window, post-strip-of-latest-assistant), so the 1-based
    `matched_turn` index this returns lines up with the `[N]` labels the judge
    sees in the prompt.

    Returns:
      max_similarity:    highest Jaccard score (0..1) against any prior assistant
                         turn (3-word shingles).
      matched_turn:      1-based index of the most-similar prior assistant turn
                         within `windowed_turns`, or None.
      intra_repetition:  Jaccard score of the reply's first half vs its
                         second half — catches single-turn self-loops like
                         "I apologize. Let me fix. I apologize. Let me fix."
    """
    target = _word_shingles(latest_reply)

    max_sim = 0.0
    matched_turn: int | None = None
    for idx, msg in enumerate(windowed_turns or [], start=1):
        if msg.get("role") != "assistant":
            continue
        prior_shingles = _word_shingles(str(msg.get("content") or ""))
        sim = _jaccard(target, prior_shingles)
        if sim > max_sim:
            max_sim = sim
            matched_turn = idx

    intra = 0.0
    words = _WORD_RE.findall((latest_reply or "").lower())
    if len(words) >= 8:
        mid = len(words) // 2
        first = _word_shingles(" ".join(words[:mid]))
        second = _word_shingles(" ".join(words[mid:]))
        intra = _jaccard(first, second)

    return {
        "max_similarity": round(max_sim, 3),
        "matched_turn": matched_turn,
        "intra_repetition": round(intra, 3),
    }


def _format_loop_signal(signal: Dict[str, Any]) -> str:
    """Render the loop signal as a section the judge can read as evidence."""
    max_sim = float(signal.get("max_similarity", 0.0))
    intra = float(signal.get("intra_repetition", 0.0))
    matched = signal.get("matched_turn")

    lines: List[str] = []
    if max_sim > 0 and matched is not None:
        lines.append(
            f"- Jaccard similarity vs assistant turn [{matched}]: {max_sim:.2f}"
        )
    if intra > 0:
        lines.append(f"- Intra-reply self-similarity (first half vs second half): {intra:.2f}")

    if not lines:
        lines.append("- No prior assistant turns to compare against.")

    lines.append(
        "Interpretation: ≥0.60 is strong repetition evidence; 0.40–0.60 is "
        "partial overlap; <0.40 is unrelated. Use this to set prior_repetition."
    )
    return "Loop signal (deterministic Jaccard on 3-word shingles, computed locally):\n" + "\n".join(lines)


def _build_context(
    latest_reply: str,
    history: List[Dict[str, str]],
    agent_system_prompt: str = "",
) -> str:
    """Build a rich judging context.

    Includes (when available):
      - the agent's persona / policy (for grounded "refusing incorrectly" calls)
      - the original user objective (first user turn — for "off-topic")
      - the last JUDGE_HISTORY_TURNS turns excluding the reply under review
        (for "stuck in a loop")
      - the reply under review, clearly delimited

    The proxy appends the latest user message AND the latest assistant reply
    to `history` before calling /classify, so we drop the trailing assistant
    turn here to avoid presenting `latest_reply` twice.
    """
    sections: List[str] = []

    persona = _truncate(agent_system_prompt, PERSONA_CHAR_BUDGET)
    sections.append(
        "Agent persona / policy:\n"
        + (persona or "(no persona supplied — judge purely on the reply and conversation)")
    )

    prior_history = list(history or [])
    if prior_history and prior_history[-1].get("role") == "assistant":
        # The proxy already appended the reply we're judging — drop it here so
        # the model isn't confused into thinking it's a prior turn.
        prior_history = prior_history[:-1]

    first_user = next(
        (msg.get("content", "") for msg in prior_history if msg.get("role") == "user"),
        "",
    )
    if first_user:
        sections.append(
            "Original user objective (turn 1):\n" + _truncate(first_user, TURN_CHAR_BUDGET)
        )

    # Window the recent conversation. The same `recent` list is reused below
    # so the loop-signal turn indices line up with the `[N]` labels rendered
    # in this section.
    recent: List[Dict[str, str]] = []
    if JUDGE_HISTORY_TURNS > 0 and prior_history:
        recent = prior_history[-JUDGE_HISTORY_TURNS:]
        lines: List[str] = []
        for idx, msg in enumerate(recent, start=1):
            role = "user" if msg.get("role") == "user" else "assistant"
            content = _truncate(str(msg.get("content") or ""), TURN_CHAR_BUDGET)
            if content:
                lines.append(f"[{idx}] {role}: {content}")
        if lines:
            sections.append("Recent conversation (oldest to newest):\n" + "\n".join(lines))

    # Hard, deterministic loop signal — gives the judge concrete numbers to
    # anchor `prior_repetition` against instead of relying on the model
    # noticing repetition on its own.
    sections.append(_format_loop_signal(_compute_loop_signal(latest_reply, recent)))

    sections.append(
        "REPLY UNDER REVIEW (assistant, just emitted):\n"
        + _truncate(latest_reply, TURN_CHAR_BUDGET * 2)
    )

    return "\n\n".join(sections)


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
        "max_completion_tokens": JUDGE_MAX_TOKENS,
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

    # Two-shot prompt: the HEALTHY example anchors the judge against
    # false-positive anomaly flagging (without it, the judge sees only an
    # anomaly demonstration and tilts toward labeling everything anomalous);
    # the LOOP example exercises every field of the schema, including
    # prior_repetition=true. On DeepSeek V3 through CLōD, two-shot is
    # dramatically more reliable than one-shot at preserving "healthy" as
    # the default and at forcing strict JSON.
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": JUDGE_FEWSHOT_HEALTHY_USER},
        {"role": "assistant", "content": JUDGE_FEWSHOT_HEALTHY_ASSISTANT},
        {"role": "user", "content": JUDGE_FEWSHOT_LOOP_USER},
        {"role": "assistant", "content": JUDGE_FEWSHOT_LOOP_ASSISTANT},
        {"role": "user", "content": user_prompt},
    ]

    async with httpx.AsyncClient(timeout=JUDGE_TIMEOUT) as client:
        first = await _post_clod(messages, client)
        try:
            return _extract_json_object(first["content"])
        except (ValueError, json.JSONDecodeError):
            if first["finish_reason"] == "length":
                raise RuntimeError(
                    f"Judge output truncated at {JUDGE_MAX_TOKENS} tokens. "
                    "Raise JUDGE_MAX_TOKENS in your .env (or shell env) and restart "
                    "the classifier."
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


def _compose_explanation(
    latest_reply: str,
    top_label: str,
    judge_result: Dict[str, Any],
) -> str:
    """Combine the judge's reason with optional structured fields.

    The public `/classify` response shape is fixed (label, confidence,
    explanation, all_scores) per AGENTS.md, so any new judge-emitted detail
    has to ride inside `explanation`. We append a short evidence quote and a
    "prior repetition confirmed" tag when the judge supplies them so the
    dashboard surfaces them automatically.
    """
    base = augment_reason(
        text=latest_reply,
        predicted_label=top_label,
        reason=str(judge_result.get("reason") or "No reason provided"),
    )

    extras: List[str] = []

    quote = str(judge_result.get("evidence_quote") or "").strip()
    if quote:
        # Trim defensively in case the judge ignored its own 120-char rule.
        extras.append(f'evidence: "{quote[:200]}"')

    prior_repetition = bool(judge_result.get("prior_repetition"))
    if prior_repetition and top_label == "stuck in a loop":
        extras.append("prior repetition confirmed across turns")

    if not extras:
        return base
    return f"{base} | " + " | ".join(extras)


@app.post("/classify")
async def classify(data: Dict[str, Any]) -> Any:
    latest_reply: str = data.get("latest_reply", "")
    history: List[Dict[str, str]] = data.get("history", [])
    session_id: str = data.get("session_id", "default")
    # Optional: the proxy forwards the active agent's persona+task here so
    # the judge can ground "refusing incorrectly" calls in actual policy.
    # Older callers that omit this field still work — we just lose persona
    # context for that one call.
    agent_system_prompt: str = str(data.get("agent_system_prompt") or "")

    context = _build_context(latest_reply, history, agent_system_prompt)
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
    explanation = _compose_explanation(latest_reply, top_label, judge_result)

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
