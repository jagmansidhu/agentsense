#!/usr/bin/env python3
"""Stream Cursor agent transcripts into AgentSense.

Cursor writes one JSONL file per chat under
`~/.cursor/projects/<project-id>/agent-transcripts/<chat-uuid>/<chat-uuid>.jsonl`.
Each line looks like:

    {"role": "user", "message": {"content": [{"type": "text", "text": "…"}]}}
    {"role": "assistant", "message": {"content": [
        {"type": "text", "text": "…"},
        {"type": "tool_use", "name": "Shell", "input": {...}}
    ]}}

This script polls the configured directory, tails each transcript from where
it last left off (state stored next to the script), pairs user→assistant
turns, and POSTs them to `/proxy/ingest` with `origin: "cursor"`. The dashboard
then shows them like any other agent.

Environment / flags:

    CURSOR_TRANSCRIPTS_DIR  Directory to watch (required unless --dir given).
    CURSOR_AGENT_NAME       Display name (default: "Cursor Agent").
    AGENTSENSE_PROXY        Proxy base URL (default: http://127.0.0.1:8000).

Run:

    python scripts/watch_cursor_transcripts.py \
        --dir ~/.cursor/projects/<project-id>/agent-transcripts \
        --interval 2

Stops on Ctrl-C. Backfills existing turns on first run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


DEFAULT_INTERVAL = 2.0
STATE_FILE = Path(__file__).resolve().parent / ".cursor_watcher_state.json"


def _load_state() -> Dict[str, Dict[str, Any]]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_state(state: Dict[str, Dict[str, Any]]) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2))
    except OSError as exc:
        print(f"warning: could not persist watcher state: {exc}", file=sys.stderr)


def _extract_text(message: Any) -> str:
    """Return only the natural-language text from a Cursor message payload."""
    if isinstance(message, str):
        return message.strip()
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks: List[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                text = part.get("text") or ""
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
        return "\n\n".join(chunks).strip()
    return ""


def _iter_jsonl(path: Path, offset: int) -> tuple[List[Dict[str, Any]], int]:
    """Read new JSONL records starting at byte offset; return (records, new_offset)."""
    records: List[Dict[str, Any]] = []
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return records, offset
    if size < offset:
        # File was truncated/replaced — start over.
        offset = 0
    if size == offset:
        return records, offset
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            fh.seek(offset)
            for line in fh:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    records.append(json.loads(stripped))
                except json.JSONDecodeError:
                    continue
            new_offset = fh.tell()
    except OSError as exc:
        print(f"warning: failed to read {path}: {exc}", file=sys.stderr)
        return records, offset
    return records, new_offset


def _post_turn(
    client: httpx.Client,
    proxy_url: str,
    session_id: str,
    agent_name: str,
    user_text: Optional[str],
    assistant_text: str,
    transcript_path: Path,
) -> bool:
    payload: Dict[str, Any] = {
        "session_id": session_id,
        "agent_id": "cursor-agent",
        "agent_name": agent_name,
        "origin": "cursor",
        "assistant_message": assistant_text,
        "metadata": {
            "transcript_path": str(transcript_path),
        },
    }
    if user_text:
        payload["user_message"] = user_text
    try:
        response = client.post(f"{proxy_url}/proxy/ingest", json=payload, timeout=30.0)
    except httpx.RequestError as exc:
        print(f"warning: ingest failed: {exc}", file=sys.stderr)
        return False
    if response.status_code >= 400:
        print(f"warning: ingest HTTP {response.status_code}: {response.text[:200]}", file=sys.stderr)
        return False
    return True


def _process_file(
    client: httpx.Client,
    proxy_url: str,
    transcript: Path,
    state: Dict[str, Dict[str, Any]],
    agent_name: str,
) -> int:
    key = str(transcript)
    file_state = state.setdefault(
        key,
        {"offset": 0, "pending_user": None, "session_id": _session_id_for(transcript)},
    )
    offset_before = int(file_state.get("offset", 0))
    records, new_offset = _iter_jsonl(transcript, offset_before)
    if not records:
        if new_offset != offset_before:
            file_state["offset"] = new_offset
        return 0

    pending_user: Optional[str] = file_state.get("pending_user")
    session_id: str = file_state.get("session_id") or _session_id_for(transcript)
    sent = 0
    for record in records:
        role = record.get("role")
        text = _extract_text(record.get("message"))
        if not text:
            continue
        if role == "user":
            pending_user = text
        elif role == "assistant":
            ok = _post_turn(client, proxy_url, session_id, agent_name, pending_user, text, transcript)
            if ok:
                sent += 1
                pending_user = None
    file_state["offset"] = new_offset
    file_state["pending_user"] = pending_user
    file_state["session_id"] = session_id
    return sent


def _session_id_for(transcript: Path) -> str:
    """Stable session_id derived from the transcript path so each Cursor chat
    keeps its own session even if subagent JSONL files appear later."""
    chat_uuid = transcript.stem  # filename without .jsonl
    suffix = "-sub" if "subagents" in transcript.parts else ""
    return f"cursor-{chat_uuid}{suffix}"


def _discover_transcripts(root: Path) -> List[Path]:
    if not root.exists():
        return []
    return sorted(root.rglob("*.jsonl"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dir",
        default=os.environ.get("CURSOR_TRANSCRIPTS_DIR"),
        help="Cursor agent-transcripts directory to watch.",
    )
    parser.add_argument(
        "--proxy",
        default=os.environ.get("AGENTSENSE_PROXY", "http://127.0.0.1:8000"),
    )
    parser.add_argument(
        "--agent-name",
        default=os.environ.get("CURSOR_AGENT_NAME", "Cursor Agent"),
    )
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL, help="Poll interval in seconds.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single sweep instead of looping (useful for cron).",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Forget previously processed offsets (re-ingests everything).",
    )
    args = parser.parse_args()

    if not args.dir:
        print("--dir or CURSOR_TRANSCRIPTS_DIR is required.", file=sys.stderr)
        return 2

    root = Path(args.dir).expanduser().resolve()
    if not root.exists():
        print(f"directory does not exist: {root}", file=sys.stderr)
        return 2

    if args.reset and STATE_FILE.exists():
        STATE_FILE.unlink()

    state = _load_state()
    proxy_url = args.proxy.rstrip("/")
    print(f"watching {root} → {proxy_url} (every {args.interval}s)", flush=True)

    with httpx.Client() as client:
        try:
            while True:
                total_sent = 0
                for transcript in _discover_transcripts(root):
                    total_sent += _process_file(
                        client, proxy_url, transcript, state, args.agent_name
                    )
                if total_sent:
                    print(f"ingested {total_sent} turn(s)", flush=True)
                _save_state(state)
                if args.once:
                    return 0
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nstopped.", flush=True)
            _save_state(state)
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
