"""OpenClaw push-alert client.

Fires Telegram/WhatsApp notifications when AgentSense detects an unhealthy
agent state with high confidence. Confirm the local OpenClaw send endpoint via
its dashboard at http://127.0.0.1:18789/.
"""

from __future__ import annotations

import os

import httpx

OPENCLAW_URL = os.environ.get("OPENCLAW_URL", "http://127.0.0.1:18789/api")
OPENCLAW_CHANNEL = os.environ.get("OPENCLAW_CHANNEL", "telegram")


async def send_alert(
    session_id: str,
    label: str,
    confidence: float,
    snippet: str,
) -> None:
    """Send a single alert. Errors are swallowed — alerting is best-effort."""
    message = (
        "AgentSense Alert\n"
        f"Session: {session_id}\n"
        f"Status: {label.upper()} ({confidence * 100:.0f}% confidence)\n"
        f"Snippet: {snippet[:140]}{'...' if len(snippet) > 140 else ''}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{OPENCLAW_URL}/send",
                json={"channel": OPENCLAW_CHANNEL, "message": message},
            )
    except Exception as exc:
        print(f"[openclaw] alert failed: {exc}")
