#!/usr/bin/env python3
"""Push a single agent turn into AgentSense from anywhere.

Useful for smoke tests, CI bots, cron jobs, or wiring into your own runtime.
The proxy classifies the reply, persists it (if DATABASE_URL is set), and
broadcasts an `agent_event` so the dashboard updates in real time.

Examples:

    python scripts/ingest.py \
        --session demo-1 \
        --agent-id support-bot \
        --user "My charts are blank" \
        --assistant "Sorry about that — when did this start?"

    echo "I refuse to answer." | python scripts/ingest.py \
        --session safety-eval \
        --origin external \
        --user "What is 2+2?" \
        --assistant -

Reads `--assistant -` from stdin so you can pipe an LLM reply into it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict

import httpx


def _read_assistant(value: str) -> str:
    if value == "-":
        return sys.stdin.read()
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--proxy", default=os.environ.get("AGENTSENSE_PROXY", "http://127.0.0.1:8000"))
    parser.add_argument("--session", required=True, help="session_id (a stable per-conversation id)")
    parser.add_argument("--user", default=None, help="user message (optional)")
    parser.add_argument("--assistant", required=True, help="assistant reply (use - for stdin)")
    parser.add_argument("--agent-id", default=None)
    parser.add_argument("--agent-name", default=None)
    parser.add_argument(
        "--origin",
        default="external",
        choices=["external", "cursor", "ui"],
        help="where this turn came from (default: external)",
    )
    parser.add_argument("--metadata", default=None, help="JSON object with extra metadata")
    args = parser.parse_args()

    payload: Dict[str, Any] = {
        "session_id": args.session,
        "assistant_message": _read_assistant(args.assistant).strip(),
        "origin": args.origin,
    }
    if args.user is not None:
        payload["user_message"] = args.user
    if args.agent_id:
        payload["agent_id"] = args.agent_id
    if args.agent_name:
        payload["agent_name"] = args.agent_name
    if args.metadata:
        try:
            payload["metadata"] = json.loads(args.metadata)
        except json.JSONDecodeError as exc:
            print(f"--metadata is not valid JSON: {exc}", file=sys.stderr)
            return 2

    if not payload["assistant_message"]:
        print("assistant_message is empty", file=sys.stderr)
        return 2

    url = f"{args.proxy.rstrip('/')}/proxy/ingest"
    try:
        response = httpx.post(url, json=payload, timeout=30.0)
    except httpx.RequestError as exc:
        print(f"failed to POST {url}: {exc}", file=sys.stderr)
        return 1

    if response.status_code >= 400:
        print(f"HTTP {response.status_code}: {response.text}", file=sys.stderr)
        return 1

    print(json.dumps(response.json(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
