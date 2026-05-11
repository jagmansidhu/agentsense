#!/usr/bin/env python3
"""AgentSense — Cursor transcript watcher.

Tails every agent transcript JSONL under ~/.cursor/projects/*/agent-transcripts/
and classifies each new assistant turn through the AgentSense /classify endpoint.
Results are printed to the terminal and POSTed to the proxy as agent_events so
they stream live into the dashboard.

Usage:
    # From repo root with venv active:
    python scripts/watch_cursor_transcripts.py

    # Watch a specific project directory:
    python scripts/watch_cursor_transcripts.py --projects-dir ~/.cursor/projects/Users-jagman-IdeaProjects-agentsense

    # Point at a running proxy on a non-default port:
    python scripts/watch_cursor_transcripts.py --classifier http://localhost:8001/classify

Environment variables (loaded from .env automatically):
    CLOD_API_KEY          — required for the classifier to call the judge
    CLASSIFIER_URL        — overrides --classifier flag
    AGENTSENSE_PROXY_URL  — where to POST agent_events (default: http://localhost:8000/proxy/chat)

Press Ctrl-C to stop.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

# --------------------------------------------------------------------------- #
# Optional httpx import — fall back to urllib if unavailable                  #
# --------------------------------------------------------------------------- #
try:
    import httpx
    _USE_HTTPX = True
except ImportError:
    import urllib.request as _urllib_req
    import urllib.error as _urllib_err
    _USE_HTTPX = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("cursor-watcher")

# --------------------------------------------------------------------------- #
# .env loader                                                                 #
# --------------------------------------------------------------------------- #
_REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    env_file = _REPO_ROOT / ".env"
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


_load_dotenv()

# --------------------------------------------------------------------------- #
# Config                                                                      #
# --------------------------------------------------------------------------- #
DEFAULT_CURSOR_PROJECTS = Path.home() / ".cursor" / "projects"
DEFAULT_CLASSIFIER_URL = os.environ.get("CLASSIFIER_URL", "http://localhost:8001/classify")
DEFAULT_PROXY_EVENTS_URL = os.environ.get(
    "AGENTSENSE_PROXY_URL", "http://localhost:8000/proxy/events-ingest"
)

POLL_INTERVAL = 1.0   # seconds between file-size checks
MAX_TEXT_LEN  = 4000  # chars sent to classifier per assistant turn

# --------------------------------------------------------------------------- #
# Transcript parsing                                                          #
# --------------------------------------------------------------------------- #

def _extract_text_blocks(content: List[Dict[str, Any]]) -> str:
    """Pull plain text out of a Cursor message content array."""
    parts: List[str] = []
    for block in content or []:
        if block.get("type") == "text":
            t = str(block.get("text") or "").strip()
            if t:
                parts.append(t)
    return "\n\n".join(parts)


def _extract_user_text(content: List[Dict[str, Any]]) -> str:
    """Extract user message, stripping XML wrapper tags Cursor adds."""
    raw = _extract_text_blocks(content)
    # Strip <user_query> and <timestamp> wrappers that Cursor injects.
    import re
    raw = re.sub(r"<timestamp>[^<]*</timestamp>\s*", "", raw)
    raw = re.sub(r"<user_query>\s*", "", raw)
    raw = re.sub(r"\s*</user_query>", "", raw)
    return raw.strip()


def _iter_new_lines(path: Path, offset: int) -> Generator[str, None, int]:
    """Yield new lines from `path` starting at byte `offset`.

    Returns the new offset via StopIteration value (Python generator trick);
    callers should use next(gen) in a loop and catch StopIteration.value.
    """
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            fh.seek(offset)
            for line in fh:
                yield line.rstrip("\n")
            return fh.tell()
    except OSError:
        return offset


# --------------------------------------------------------------------------- #
# Classifier call                                                              #
# --------------------------------------------------------------------------- #

def _classify(
    classifier_url: str,
    session_id: str,
    history: List[Dict[str, str]],
    latest_reply: str,
    agent_system_prompt: str = "",
) -> Optional[Dict[str, Any]]:
    payload = {
        "session_id": session_id,
        "history": history,
        "latest_reply": latest_reply[:MAX_TEXT_LEN],
        "agent_system_prompt": agent_system_prompt,
    }
    body = json.dumps(payload).encode()

    if _USE_HTTPX:
        try:
            with httpx.Client(timeout=90.0) as client:
                resp = client.post(
                    classifier_url,
                    content=body,
                    headers={"Content-Type": "application/json"},
                )
            return resp.json()
        except Exception as exc:
            log.warning("classifier error: %s", exc)
            return None
    else:
        req = _urllib_req.Request(
            classifier_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with _urllib_req.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except Exception as exc:
            log.warning("classifier error (urllib): %s", exc)
            return None


# --------------------------------------------------------------------------- #
# Print helpers                                                               #
# --------------------------------------------------------------------------- #
_LABEL_COLORS = {
    "healthy":              "\033[92m",   # bright green
    "hallucinating":        "\033[91m",   # bright red
    "stuck in a loop":      "\033[93m",   # bright yellow
    "off-topic":            "\033[95m",   # bright magenta
    "refusing incorrectly": "\033[96m",   # bright cyan
    "unknown":              "\033[90m",   # dark grey
    "pending":              "\033[90m",
}
_RESET = "\033[0m"
_BOLD  = "\033[1m"


def _fmt_label(label: str, confidence: float) -> str:
    color = _LABEL_COLORS.get(label, "")
    return f"{color}{_BOLD}{label.upper()}{_RESET} ({confidence * 100:.0f}%)"


# --------------------------------------------------------------------------- #
# Per-file watcher state                                                      #
# --------------------------------------------------------------------------- #

class TranscriptWatcher:
    """Tracks read position and conversation history for one JSONL file."""

    def __init__(self, path: Path, classifier_url: str) -> None:
        self.path = path
        self.classifier_url = classifier_url
        self.offset: int = 0
        self.history: List[Dict[str, str]] = []
        self.session_id = path.parent.name          # uuid directory name
        self.turn_count = 0

        # Seek to end so we only classify NEW turns from this point forward.
        try:
            self.offset = path.stat().st_size
        except OSError:
            pass

    def poll(self) -> None:
        """Read any new lines written since last poll and classify assistant turns."""
        try:
            current_size = self.path.stat().st_size
        except OSError:
            return
        if current_size <= self.offset:
            return

        new_lines: List[str] = []
        gen = _iter_new_lines(self.path, self.offset)
        try:
            while True:
                new_lines.append(next(gen))
        except StopIteration as exc:
            self.offset = exc.value  # type: ignore[assignment]

        for raw in new_lines:
            if not raw.strip():
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue

            role = obj.get("role", "")
            content = obj.get("message", {}).get("content", [])

            if role == "user":
                text = _extract_user_text(content)
                if text:
                    self.history.append({"role": "user", "content": text[:MAX_TEXT_LEN]})

            elif role == "assistant":
                text = _extract_text_blocks(content)
                if not text:
                    continue

                self.turn_count += 1
                self.history.append({"role": "assistant", "content": text[:MAX_TEXT_LEN]})

                log.info(
                    "Classifying turn %d  [%s]  %.60s…",
                    self.turn_count,
                    self.session_id[:8],
                    text.replace("\n", " "),
                )

                result = _classify(
                    classifier_url=self.classifier_url,
                    session_id=self.session_id,
                    history=self.history,
                    latest_reply=text,
                )

                if result:
                    label      = result.get("label", "unknown")
                    confidence = float(result.get("confidence", 0.0))
                    explanation = result.get("explanation", "")

                    print(
                        f"\n  {_BOLD}Session:{_RESET} {self.session_id[:8]}"
                        f"  Turn {self.turn_count}\n"
                        f"  {_BOLD}Label:{_RESET}   {_fmt_label(label, confidence)}\n"
                        f"  {_BOLD}Reason:{_RESET}  {explanation}\n"
                        f"  {_BOLD}Reply:{_RESET}   {text[:120].replace(chr(10), ' ')}…\n",
                        flush=True,
                    )

                    if label not in ("healthy", "unknown") and confidence > 0.6:
                        print(
                            f"  ⚠️  {_LABEL_COLORS.get(label, '')}{_BOLD}"
                            f"ANOMALY DETECTED{_RESET} — check the AgentSense dashboard.\n",
                            flush=True,
                        )
                else:
                    log.warning("  No result from classifier for turn %d", self.turn_count)


# --------------------------------------------------------------------------- #
# Directory scanner                                                           #
# --------------------------------------------------------------------------- #

def _find_jsonl_files(projects_dir: Path) -> List[Path]:
    """Return all *.jsonl transcript files under the projects directory."""
    return sorted(projects_dir.rglob("agent-transcripts/**/*.jsonl"))


# --------------------------------------------------------------------------- #
# Main loop                                                                   #
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description="AgentSense — Cursor transcript watcher")
    parser.add_argument(
        "--projects-dir",
        default=str(DEFAULT_CURSOR_PROJECTS),
        help="Root directory to search for agent-transcripts (default: ~/.cursor/projects)",
    )
    parser.add_argument(
        "--classifier",
        default=DEFAULT_CLASSIFIER_URL,
        help=f"AgentSense classifier URL (default: {DEFAULT_CLASSIFIER_URL})",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show per-poll debug output",
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    projects_dir = Path(args.projects_dir).expanduser().resolve()
    if not projects_dir.is_dir():
        log.error("Projects directory not found: %s", projects_dir)
        sys.exit(1)

    classifier_url = args.classifier

    print(
        f"\n  {_BOLD}AgentSense — Cursor Transcript Watcher{_RESET}\n"
        f"  Watching:   {projects_dir}\n"
        f"  Classifier: {classifier_url}\n"
        f"  Press Ctrl-C to stop.\n",
        flush=True,
    )

    watchers: Dict[Path, TranscriptWatcher] = {}

    # Seed watchers for files that already exist (seek to end so we only see new turns).
    for path in _find_jsonl_files(projects_dir):
        watchers[path] = TranscriptWatcher(path, classifier_url)

    log.info("Watching %d existing transcript file(s). Waiting for new turns…", len(watchers))

    try:
        while True:
            # Discover any new transcript files that appeared since last poll.
            for path in _find_jsonl_files(projects_dir):
                if path not in watchers:
                    log.info("New transcript: %s", path.parent.name[:8])
                    watchers[path] = TranscriptWatcher(path, classifier_url)

            for watcher in watchers.values():
                watcher.poll()

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n  {_BOLD}Stopped.{_RESET}\n", flush=True)


if __name__ == "__main__":
    main()
