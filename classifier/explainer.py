"""Reason booster for the LLM judge output.

The judge already returns a one-sentence reason. This module optionally appends
token or phrase hints so operators can quickly spot why a label was assigned.
Inspects thinking, output, recent_turns, and tool_calls.
"""

from __future__ import annotations

from typing import Dict, List, Optional


HALLUCINATION_TOKENS = {
    "definitely",
    "certainly",
    "always",
    "never",
    "100%",
    "proven",
    "undoubtedly",
    "exact",
    "exactly",
    "the file exists at",
    "the api supports",
    "i know this works",
    "i know that",
    "this will work",
    "guaranteed",
}

LOOP_PHRASES = (
    "as i mentioned",
    "as previously stated",
    "i already said",
    "to reiterate",
    "as i said before",
    "let me try again",
    "as i planned",
    "same approach",
)


def _jaccard(a: str, b: str) -> float:
    set_a = set(a.lower().split())
    set_b = set(b.lower().split())
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def _collect_hints(
    thinking: str,
    output: str,
    predicted_label: str,
    reason: str,
    recent_turns: List[Dict],
    tool_calls: List[Dict],
) -> List[str]:
    hints: List[str] = []

    # --- Hallucination: check tokens in both thinking and output ---
    if predicted_label == "hallucinating":
        combined = (thinking + " " + output).lower()
        for token in HALLUCINATION_TOKENS:
            if token in combined:
                hints.append(token)

    # --- Loop: phrase detection in thinking ---
    if predicted_label in ("stuck in a loop", "hallucinating", "healthy"):
        thinking_lower = thinking.lower()
        for phrase in LOOP_PHRASES:
            if phrase in thinking_lower:
                hints.append(f'"{phrase}"')

    # --- Loop: repeated action across recent_turns ---
    if recent_turns and len(recent_turns) >= 2:
        last_action = recent_turns[-1].get("action", "")
        prev_action = recent_turns[-2].get("action", "")
        if last_action and last_action == prev_action:
            if predicted_label == "stuck in a loop":
                hints.append(f"action unchanged across turns")
            else:
                hints.append(f"repeated action: {last_action[:60]}")

    # --- Loop: repeated tool call names vs last recent_turn ---
    if tool_calls and recent_turns:
        current_names = [t.get("name", "") for t in tool_calls]
        last_turn_calls = recent_turns[-1].get("tool_calls", [])
        if isinstance(last_turn_calls, list) and last_turn_calls:
            last_names = [
                (t.get("name", "") if isinstance(t, dict) else "")
                for t in last_turn_calls
            ]
            if current_names and current_names == last_names:
                hints.append(f"repeated tool calls: {', '.join(current_names)}")

    # --- Off-topic: Jaccard similarity between thinking and reason ---
    if predicted_label == "off-topic" and len(thinking) > 50:
        if _jaccard(thinking, reason) < 0.1:
            hints.append("low goal alignment")

    return sorted(set(hints))


def augment_reason(
    text: str = "",
    predicted_label: str = "",
    reason: str = "",
    thinking: str = "",
    output: str = "",
    recent_turns: List[Dict] = None,
    tool_calls: List[Dict] = None,
) -> str:
    """Return judge reason with lightweight signal hints when available.

    `text` is kept for backward compatibility and maps to `output` when
    `output` is empty.
    """
    if not output and text:
        output = text

    base = reason.strip() or "No reason provided."
    hints = _collect_hints(
        thinking=thinking,
        output=output,
        predicted_label=predicted_label,
        reason=reason,
        recent_turns=recent_turns or [],
        tool_calls=tool_calls or [],
    )
    if not hints:
        return base
    return f"{base} | signals: {', '.join(hints)}"


def get_explanation(text: str, predicted_label: str) -> str:
    """Backward-compatible helper retained for existing callers."""
    default_reason = "No anomaly signals detected." if predicted_label == "healthy" else ""
    return augment_reason(text=text, predicted_label=predicted_label, reason=default_reason)
