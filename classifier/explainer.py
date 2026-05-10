"""Explain *why* the classifier flagged a response.

Token-level heuristics used for live-demo speed. Real SHAP KernelExplainer is
too slow for sub-second inference; we keep the API stable so we can swap it in
later without touching the rest of the system.
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


def get_explanation(text: str, predicted_label: str) -> str:
    """Return a human-readable reason for the flag."""
    if predicted_label == "healthy":
        return "No anomaly signals detected."

    flagged: List[str] = []
    lower = text.lower()
    words = [w.lower().rstrip(".,;:!?") for w in text.split()]

    if predicted_label == "hallucinating":
        flagged = [w for w in words if w in HALLUCINATION_SIGNALS]
    elif predicted_label == "stuck in a loop":
        flagged = [f'"{p}"' for p in LOOP_SIGNALS if p in lower]

    if flagged:
        return f"Flagged tokens: {', '.join(sorted(set(flagged)))}"
    return f"Model confidence: {predicted_label} based on overall response pattern"
