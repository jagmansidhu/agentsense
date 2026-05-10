"""Greptile integration — map an agent failure back to the source code that caused it.

Set GREPTILE_API_KEY and GREPTILE_REPO (e.g. "your-org/your-repo") in the env.
"""

from __future__ import annotations

import os
from typing import Dict

import httpx

GREPTILE_API_KEY = os.environ.get("GREPTILE_API_KEY", "")
GREPTILE_REPO = os.environ.get("GREPTILE_REPO", "")
GREPTILE_BRANCH = os.environ.get("GREPTILE_BRANCH", "main")
BASE_URL = "https://api.greptile.com/v2"


async def index_repo(github_url: str, branch: str = "main") -> Dict:
    """Index a repo so Greptile can search it. Run once per repo."""
    repository = github_url.replace("https://github.com/", "").rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE_URL}/repositories",
            headers={"Authorization": f"Bearer {GREPTILE_API_KEY}"},
            json={"remote": "github", "repository": repository, "branch": branch},
        )
    return resp.json()


async def find_relevant_code(failure_description: str) -> str:
    """Return a short 'file:line' breadcrumb for the most relevant source file."""
    if not GREPTILE_API_KEY or not GREPTILE_REPO:
        return ""

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{BASE_URL}/query",
            headers={"Authorization": f"Bearer {GREPTILE_API_KEY}"},
            json={
                "messages": [
                    {"role": "user", "content": f"Find code related to: {failure_description}"},
                ],
                "repositories": [
                    {"remote": "github", "repository": GREPTILE_REPO, "branch": GREPTILE_BRANCH},
                ],
                "genius": True,
            },
        )
    data = resp.json()
    sources = data.get("sources") or []
    if sources:
        top = sources[0]
        return f"{top.get('filepath', '?')}:{top.get('linestart', '?')}"
    return (data.get("message") or "")[:200]
