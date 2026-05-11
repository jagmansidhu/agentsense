# AGENTS.md — AgentSense

Project context for AI coding agents (Cursor, Claude Code, Codex, etc.).
Built for Cursor Hackathon Vancouver · May 10, 2026.
Source of truth for team intent: `docs/agentsense_team_playbook.md`.

---

## What we're building

AgentSense is a real-time behavioral health monitor for AI agents. It sits between
an application and the LLM API, intercepts every turn, and classifies assistant
behavior into:

- `healthy`
- `hallucinating`
- `stuck in a loop`
- `off-topic`
- `refusing incorrectly`

The objective is to catch failures before end-users do.

## Architecture

```
User App → [proxy/ FastAPI + Socket.IO] → CLōD LLM API
                ↓
        [classifier/ LLM judge]
                ↓
       [classifier/ reason booster]
                ↓
 ┌────────────────────────────────────────┐
 │ frontend/ React + TS + Recharts + PWA │
 └────────────────────────────────────────┘
                ↑
   [GET /proxy/events + GET /proxy/sessions]
                ↓
      [greptile/ correlate code path]
                ↓
       [alerts/ OpenClaw notification]
```

## Tech stack

- Backend proxy: FastAPI (Python 3.10+), Socket.IO (`python-socketio`)
- Judge classifier: CLōD API via `httpx` (strict-JSON scoring prompt)
- Explainability: lightweight token/phrase reason booster
- Frontend: Vite + React + TypeScript + Tailwind + shadcn-style primitives
- Charts/state/realtime: Recharts + Zustand + Socket.IO client
- PWA: `vite-plugin-pwa` (auto-update SW, cached `/proxy/events`)
- Code correlation: Greptile API
- Alerting: OpenClaw (Telegram/WhatsApp)

## Repo layout

```
agentsense/
├── AGENTS.md
├── README.md
├── requirements.txt
├── .env.example
├── docs/
│   └── agentsense_team_playbook.md
├── proxy/
│   ├── main.py              FastAPI proxy + Socket.IO + hydration endpoints
│   ├── session.py           In-memory chat history store
│   └── events.py            Ring buffer for frontend hydration
├── classifier/
│   ├── model.py             LLM judge service (`/classify`)
│   └── explainer.py         Optional reason booster
├── alerts/
│   └── openclaw.py
├── frontend/
│   ├── DESIGN.md            Visual source of truth (Swiss/minimal)
│   ├── src/lib/{api,socket,store}.ts
│   ├── src/components/*     cards, charts, feed, session views
│   ├── src/pages/*          dashboard + session routes
│   ├── tailwind.config.ts
│   └── vite.config.ts       dev proxy + PWA config
└── greptile/
    └── correlate.py
```

## Environment — CLōD (upstream LLM)

The proxy calls CLōD’s **OpenAI-compatible** chat completions API.

| Variable       | Typical value |
|----------------|---------------|
| `CLOD_API_URL` | `https://api.clod.io/v1/chat/completions` |
| `CLOD_API_KEY` | from [app.clod.io](https://app.clod.io) |
| `CLOD_MODEL`   | e.g. `DeepSeek V3` (see model catalog in dashboard) |

Reference: [`docs/clod_api_quick_reference.md`](docs/clod_api_quick_reference.md).

## Service contracts (do not break)

### `POST /proxy/chat`

Request:
```json
{ "session_id": "string", "message": "string" }
```

Response:
```json
{
  "reply": "string",
  "health": {
    "label": "string",
    "confidence": 0.0,
    "explanation": "string",
    "all_scores": { "label": 0.0 }
  },
  "event_id": "uuid",
  "session_id": "string",
  "agent_id": "string|null"
}
```

`health.label` may be `"pending"` on this response. The proxy returns as soon
as the assistant reply is in (so the chat UI feels instant) and runs the
classifier in a background task. The refined classification is delivered
over Socket.IO via a second `agent_event` with the same `id`.

### `POST /classify`

Request:
```json
{
  "session_id": "string",
  "history": [{ "role": "user|assistant", "content": "string" }],
  "latest_reply": "string"
}
```

Response (unchanged contract):
```json
{
  "label": "healthy | hallucinating | stuck in a loop | off-topic | refusing incorrectly",
  "confidence": 0.0,
  "explanation": "string",
  "all_scores": { "label": 0.0 }
}
```

### `agent_event` (Socket.IO: proxy → frontend)

Emitted **twice per turn**, sharing the same `id`:
1. **Pending** — the moment the assistant reply finishes streaming, with
   `label="pending"` and `confidence=0`. Lets the dashboard mount the card
   immediately.
2. **Classified** — once the background classifier returns, with the real
   label / confidence / explanation. Consumers should upsert by `id` so the
   first card refines in place rather than producing a duplicate.

```json
{
  "id": "uuid",
  "session_id": "string",
  "user_message": "optional: latest user utterance",
  "message": "string",
  "label": "string",
  "confidence": 0.0,
  "explanation": "string",
  "greptile_context": "optional file:line",
  "created_at": 1710000000000
}
```

### `assistant_token` (Socket.IO: proxy → frontend)

Per-token delta from the streaming CLōD chat completion. Emitted many times
per turn while the assistant is generating its reply.

```json
{
  "session_id": "string",
  "agent_id": "string|null",
  "event_id": "uuid (matches the agent_event.id for this turn)",
  "delta": "string"
}
```

### `assistant_stream_done` (Socket.IO: proxy → frontend)

Stream-complete sentinel — emitted once after the last `assistant_token`
for a turn so the playground bubble can stop showing its typing cursor.

```json
{
  "session_id": "string",
  "agent_id": "string|null",
  "event_id": "uuid",
  "reply": "full assembled reply"
}
```

### Hydration endpoints (new)

`GET /proxy/events?session_id=...&limit=100`
```json
{ "events": [{ "...": "agent_event shape" }] }
```

`GET /proxy/sessions`
```json
{
  "sessions": [
    {
      "session_id": "string",
      "last_seen": 1710000000000,
      "status": "healthy",
      "event_count": 10,
      "anomaly_count": 2
    }
  ],
  "session_ids": ["demo-1", "demo-2"]
}
```

## Run locally

```bash
bash scripts/setup_venv.sh    # optional: creates ./venv + pip install -r requirements.txt
source venv/bin/activate

# Equivalent manual setup:
# python -m venv venv && source venv/bin/activate
# pip install -r requirements.txt

cp .env.example .env

# Optional: standalone CLōD connectivity test
python scripts/test_clod_chat.py

# Terminal 1
uvicorn classifier.model:app --port 8001

# Terminal 2
uvicorn proxy.main:socket_app --port 8000

# Terminal 3
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

## Environment variables

- `CLOD_API_URL`
- `CLOD_API_KEY`
- `JUDGE_MODEL` (optional override)
- `CLASSIFIER_URL`
- `JUDGE_HISTORY_TURNS` (optional, default `6`) — how many recent turns the judge sees.
- `JUDGE_MAX_TOKENS` (optional, default `4096`) — judge output cap; raise if you see truncation.
- `JUDGE_TIMEOUT` (optional, default `60`) — seconds before the judge call gives up.
- `AGENTSENSE_DB_PATH` (optional) — path to a SQLite file. Unset = in-memory; set = persistent sessions + events across restarts.
- `GREPTILE_API_KEY`
- `GREPTILE_REPO`
- `GREPTILE_BRANCH`
- `OPENCLAW_URL`
- `OPENCLAW_CHANNEL`

## Implementation conventions for agents

1. Keep `proxy/`, `classifier/`, `alerts/`, `greptile/` decoupled.
2. Do not rename JSON fields in any contract above.
3. Fail soft: external API failures must not crash `/proxy/chat`.
4. Keep async on proxy hot paths (`httpx.AsyncClient`).
5. Secrets only via env vars. Never commit a real `.env`.
6. Frontend uses TypeScript strict mode and route-based composition.
7. Realtime ingestion must stay centralized in `frontend/src/lib/socket.ts`.
8. State source-of-truth is `frontend/src/lib/store.ts` (Zustand).
9. Frontend styling follows `frontend/DESIGN.md`:
   - minimal Swiss style
   - grid-first layout
   - no decorative clutter or gradients
   - strong typography hierarchy
10. Prefer shadcn-style primitives in `frontend/src/components/ui/` over ad-hoc styles.
11. Mobile-first responsiveness is required (web-first, PWA installable).

## Team ownership

| Area | Owner | Files |
|---|---|---|
| Judge classifier + alerts | Ashish | `classifier/`, `alerts/` |
| Proxy + history/hydration | Backend Engineer 1 | `proxy/` |
| Frontend dashboard + Greptile | Backend Engineer 2 | `frontend/`, `greptile/` |

## References

- Team playbook and demo script: `docs/agentsense_team_playbook.md`
- Contact: ashishdawar2@gmail.com

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---|---|---|---|
| Classifier (LLM judge) | `source venv/bin/activate && uvicorn classifier.model:app --port 8001` | 8001 | Start first; proxy calls it on every chat turn |
| Proxy (FastAPI + Socket.IO) | `source venv/bin/activate && uvicorn proxy.main:socket_app --port 8000` | 8000 | Core backend; reads `.env` from repo root automatically |
| Frontend (Vite React) | `cd frontend && npm run dev` | 5173 | Vite proxies `/proxy/*` and `/socket.io` to port 8000 |

### Startup notes

- `python3.12-venv` system package is required to create the virtualenv (installed via `sudo apt-get install -y python3.12-venv`).
- The proxy and classifier both auto-load `/workspace/.env` at import time — no need to manually export env vars. Copy `.env.example` to `.env` and fill in `CLOD_API_KEY`.
- `CLOD_API_KEY` is the only hard-blocking secret. Without it, `/proxy/chat` returns HTTP 500.
- The classifier's `/classify` response time depends on the upstream CLōD model (~10-25s). The proxy's `CLASSIFIER_TIMEOUT` defaults to 65s to avoid premature timeouts.
- Greptile and OpenClaw are optional; failures are silently swallowed.

### Lint / typecheck / build

- **Frontend typecheck**: `cd frontend && npx tsc --noEmit`
- **Frontend build**: `cd frontend && npm run build`
- No Python linter is currently configured in the repo; backend validation is via running the services and testing endpoints.

### Testing a live event

```bash
curl -X POST http://localhost:8000/proxy/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"demo","message":"hello"}'
```

Verify hydration: `GET http://localhost:8000/proxy/events?limit=20` and `GET http://localhost:8000/proxy/sessions`.

## Change Log

Use this section as a running log of repository changes made during active development sessions.
Keep entries brief and append-only.

- 2026-05-10: Added a persistent change log section to track updates made during this session.
- 2026-05-10: Added `scripts/setup_venv.sh` to create `./venv` and install `requirements.txt`; documented in Run it locally.
- 2026-05-10: Tightened `scripts/test_clod_chat.py` into a deterministic PASS/FAIL smoke test (`Paris` one-word check, low temperature, truncation guard).
- 2026-05-10: Smoke test: higher default `max_completion_tokens`, shorter prompts, optional `CLOD_SMOKE_MAX_TOKENS`; accept `Paris` on last line if model adds a short preamble.
- 2026-05-10: Proxy: `.env` auto-load from repo root, CLōD URL normalization, CORS for dashboard `fetch`, optional `CLOD_*` generation envs; `agent_event` includes `user_message`. Dashboard chat form POSTs `/proxy/chat`.
- 2026-05-10: Frontend: removed standalone landing page; `/` is now the dashboard, `/playground` and `/session/:id` move under root (old `/monitor/*` URLs redirect). Dashboard redesigned: KPI strip (4 cards) → graphs at the top → agents in scope + issue queue → issue detail → event feed. Mock data and issue copy rewritten to match the AI-agent observability use case (no more CRM/sales narrative).
- 2026-05-10: Classifier: judge now receives full context — agent persona/task, original user objective, last `JUDGE_HISTORY_TURNS` (default 6) turns, and the reply under review clearly delimited. Schema extended with optional `evidence_quote` (≤120 chars) and `prior_repetition` (bool); both fold into `explanation` so the public `/classify` contract (`label`, `confidence`, `explanation`, `all_scores`) is unchanged. Proxy forwards `agent.composed_system_prompt()` as `agent_system_prompt`.
- 2026-05-10: Classifier: bumped judge output cap from 1024 → 4096 (env-tunable via `JUDGE_MAX_TOKENS`) to stop CLōD-routed reasoning models from getting truncated mid-JSON.
- 2026-05-10: Repo cleanup: removed stale Sprint-1 carry-overs (`classifier.py` orphan that shadowed the `classifier/` package, `test_classifier.py` standalone script, `proxy/BE1_CHECKLIST.md`); deleted untracked junk (`#/` accidental venv, empty `alembic/` stub, all `__pycache__/` and `frontend/dist/`); resolved unmerged conflict markers in `.gitignore`. All imports and frontend typecheck clean afterward.
- 2026-05-10: Classifier: fixed false-positive "hallucinating" labels on healthy first-turn replies. System prompt rewritten with explicit "default to healthy" rule, tightened the hallucinating definition to require *specific* verifiably-false or fabricated content (silence in the persona is no longer evidence), dropped the "must commit to a next step" gate from healthy. Switched judge to two-shot prompting (healthy example before the loop example) so the model has a positive baseline to anchor against.
- 2026-05-10: Classifier: hybrid loop detection. Computes a deterministic Jaccard similarity score (3-word shingles) between the reply under review and prior assistant turns within the same window the judge sees, plus an intra-reply self-similarity (catches single-turn loops like "I apologize. Let me fix. I apologize. Let me fix."). The signal is rendered as evidence in the prompt with an interpretation guide so the judge sets `prior_repetition` against hard numbers instead of guessing.
- 2026-05-10: Proxy: optional SQLite persistence via `AGENTSENSE_DB_PATH`. Unset → original in-memory `SessionStore` / `EventStore` (zero setup, fastest). Set → `SqliteSessionStore` / `SqliteEventStore` persist sessions + events to the given file across restarts. Stdlib `sqlite3` only — no new deps. WAL mode + per-call connections keep it thread-safe under uvicorn workers. New `proxy/db.py` houses the schema and connection helper.
- 2026-05-10: Live demo flow optimized. (1) `/proxy/chat` now streams the CLōD reply: it emits per-token `assistant_token` Socket.IO events plus an `assistant_stream_done` sentinel so the playground bubble types live. (2) The classifier call moved into a background `asyncio.create_task` — the HTTP response returns the moment the reply finishes streaming with `health.label="pending"`. (3) `agent_event` is now emitted twice per turn with the same `id` (pending → classified); the dashboard store became an id-keyed upsert so the card refines in place. (4) Default judge prompt budgets shrunk (`JUDGE_HISTORY_TURNS` 6→4, `TURN_CHAR_BUDGET` 800→400, `PERSONA_CHAR_BUDGET` 1200→600) and `.env.example` recommends pointing `JUDGE_MODEL` at a smaller fast model. Net effect: per-turn user-perceived latency drops from ~6s blocking to instant streaming with classification arriving ~1s later.
