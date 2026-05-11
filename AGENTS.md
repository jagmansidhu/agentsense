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
  }
}
```

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
