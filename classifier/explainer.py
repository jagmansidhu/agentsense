"""Reason booster for the LLM judge output.

The judge already returns a one-sentence reason. This module optionally appends
token or phrase hints so operators can quickly spot why a label was assigned.
"""

from __future__ import annotations

from typing import List

HALLUCINATION_SIGNALS = {
    "definitely",
    "certainly",
    "always",
    "never",
    "100%",
    "proven",
    "undoubtedly",
    "exact",
    "exactly",
}

LOOP_SIGNALS = (
    "as i mentioned",
    "as previously stated",
    "i already said",
    "to reiterate",
    "as i said before",
)


def _hint_tokens(text: str, predicted_label: str) -> List[str]:
    flagged: List[str] = []
    lower = text.lower()
    words = [w.lower().rstrip(".,;:!?") for w in text.split()]

    if predicted_label == "hallucinating":
        flagged = [w for w in words if w in HALLUCINATION_SIGNALS]
    elif predicted_label == "stuck in a loop":
        flagged = [f'"{p}"' for p in LOOP_SIGNALS if p in lower]
    return sorted(set(flagged))


def augment_reason(text: str, predicted_label: str, reason: str) -> str:
    """Return judge reason with lightweight token hints when available."""
    base = reason.strip() or "No reason provided."
    hints = _hint_tokens(text=text, predicted_label=predicted_label)
    if not hints:
        return base
    return f"{base} | signals: {', '.join(hints)}"


def get_explanation(text: str, predicted_label: str) -> str:
    """Backward-compatible helper retained for existing callers."""
    default_reason = "No anomaly signals detected." if predicted_label == "healthy" else ""
    return augment_reason(text=text, predicted_label=predicted_label, reason=default_reason)
