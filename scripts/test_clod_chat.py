#!/usr/bin/env python3
"""Strict CLōD smoke test: verifies a deterministic one-word response.

Loads repo-root `.env` if present (KEY=value lines); otherwise use shell env.

Usage (from repo root):
    python scripts/test_clod_chat.py
    CLOD_MODEL="Some Other Model" python scripts/test_clod_chat.py
    CLOD_SMOKE_MAX_TOKENS=256 python scripts/test_clod_chat.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://api.clod.io/v1/chat/completions"
DEFAULT_MODEL = "DeepSeek V3"
EXPECTED_ANSWER = "Paris"
# Room for a short preamble before a one-word answer; override: CLOD_SMOKE_MAX_TOKENS
DEFAULT_MAX_COMPLETION_TOKENS = 192


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


def main() -> int:
    _load_dotenv(REPO_ROOT)

    api_key = os.environ.get("CLOD_API_KEY", "").strip()
    if not api_key:
        print("Missing CLOD_API_KEY. Set it or add to .env (see .env.example).", file=sys.stderr)
        return 1

    url = os.environ.get("CLOD_API_URL", DEFAULT_URL).strip()
    # Accept base URL mistakenly set without full path — normalize to completions.
    if url.rstrip("/").endswith("/v1") and "/chat/completions" not in url:
        url = url.rstrip("/") + "/chat/completions"

    model = os.environ.get("CLOD_MODEL", DEFAULT_MODEL).strip()
    try:
        max_tokens = int(os.environ.get("CLOD_SMOKE_MAX_TOKENS", str(DEFAULT_MAX_COMPLETION_TOKENS)))
    except ValueError:
        max_tokens = DEFAULT_MAX_COMPLETION_TOKENS
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Reply with one word only. No preamble, no punctuation, no explanation.",
            },
            {"role": "user", "content": "Capital of France?"},
        ],
        "temperature": 0.0,
        "max_completion_tokens": max_tokens,
    }

    print(f"POST {url}\nmodel={model!r}\n")

    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if r.status_code != 200:
        print(f"HTTP {r.status_code}\n{r.text}", file=sys.stderr)
        return 1

    data = r.json()
    print("Raw JSON:")
    print(json.dumps(data, indent=2)[:4000])

    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        print("\n(No choices[0].message.content — see raw JSON.)", file=sys.stderr)
        return 0

    finish_reason = ""
    try:
        finish_reason = str(data["choices"][0].get("finish_reason", ""))
    except (KeyError, IndexError, TypeError):
        pass

    raw = str(text)
    answer = " ".join(raw.split())
    answer_clean = answer.strip(" .,!?:;\"'()[]{}")
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    last_word = ""
    if lines:
        last_word = lines[-1].split()[0].strip(" .,!?:;\"'()[]{}")
    is_expected = answer_clean.lower() == EXPECTED_ANSWER.lower() or (
        last_word.lower() == EXPECTED_ANSWER.lower() and len(lines[-1].split()) <= 3
    )
    is_not_truncated = finish_reason != "length"
    passed = is_expected and is_not_truncated

    print("\n--- Assistant reply ---\n")
    print(answer)
    print("\n--- Smoke test verdict ---")
    print(f"expected={EXPECTED_ANSWER!r} got={answer!r} finish_reason={finish_reason!r}")
    print("PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
