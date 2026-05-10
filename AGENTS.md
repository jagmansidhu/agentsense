# AGENTS.md — AgentSense

Project context for AI coding agents (Cursor, Claude Code, Codex, etc.).
Built for Cursor Hackathon Vancouver · May 10, 2026.
Source of truth for team intent: `docs/agentsense_team_playbook.md`.

---

## What we're building

AgentSense is a real-time behavioral health monitor for AI agents. It ingests
every reasoning turn from a Cursor (or any) agent — including chain-of-thought,
planned action, tool calls, and output — and classifies agent behavior into:

- `healthy`
- `hallucinating`
- `stuck in a loop`
- `off-topic`
- `refusing incorrectly`

The objective is to catch failures before end-users do, with the classifier
auditing **thinking first, output second**.

## Architecture

```
Cursor Agent → [POST /ingest/turn] → [proxy/ FastAPI + Socket.IO]
                                              ↓
                                    PostgreSQL (sessions / turns / health_events)
                                              ↓
                                    [classifier/ LLM judge]
                                              ↓
                                    [classifier/ reason booster]
                                              ↓
                              ┌────────────────────────────────────────┐
                              │ frontend/ React + TS + Recharts + PWA │
                              └────────────────────────────────────────┘
                                              ↑
                         [GET /proxy/events + GET /proxy/sessions +
                          GET /sessions/{id}/turns]
                                              ↓
                                    [alerts/ OpenClaw notification]
```

## Tech stack

- Backend proxy: FastAPI (Python 3.10+), Socket.IO (`python-socketio`)
- Database: PostgreSQL 16 via SQLAlchemy 2 async + asyncpg, Alembic migrations
- Judge classifier: CLōD API via `httpx` (thinking-first structured prompt)
- Explainability: heuristic reason booster (thinking tokens + loop detection)
- Frontend: Vite + React + TypeScript + Tailwind + shadcn-style primitives
- Charts/state/realtime: Recharts + Zustand + Socket.IO client
- PWA: `vite-plugin-pwa` (auto-update SW, cached `/proxy/events`)
- Alerting: OpenClaw (Telegram/WhatsApp)

## Repo layout

```
agentsense/
├── AGENTS.md
├── README.md
├── requirements.txt
├── .env.example
├── docker-compose.yml           postgres:16 container
├── alembic/                     DB migrations
│   └── versions/
│       └── *_baseline.py        sessions / turns / health_events tables
├── docs/
│   └── agentsense_team_playbook.md
├── proxy/
│   ├── config.py                pydantic-settings env config
│   ├── db.py                    async SQLAlchemy engine + session dep
│   ├── models.py                Session / Turn / HealthEvent ORM models
│   ├── repo.py                  async repo functions (record/list)
│   └── main.py                  FastAPI + Socket.IO + all endpoints
├── classifier/
│   ├── model.py                 LLM judge service (`/classify`)
│   └── explainer.py             Thinking-aware reason booster
├── alerts/
│   └── openclaw.py
└── frontend/
    ├── DESIGN.md                Visual source of truth (Business AI style)
    ├── src/lib/{api,socket,store}.ts
    ├── src/components/*         cards, charts, feed, turn-trace, session views
    ├── src/pages/*              dashboard + session routes
    ├── tailwind.config.ts
    └── vite.config.ts           dev proxy + PWA config
```

## Service contracts (do not break)

### `POST /ingest/turn` (primary ingest endpoint)

Request:
```json
{
  "session_id": "string",
  "agent_id": "cursor-agent | other",
  "turn_id": "uuid (optional, server-generates if missing)",
  "thinking": "string (chain-of-thought / reasoning trace)",
  "action": "string (planned next step, optional)",
  "tool_calls": [{ "name": "str", "args": {} }],
  "output": "string (final user-visible reply, optional)",
  "user_goal": "string (optional, last user message)",
  "metadata": {}
}
```

Response:
```json
{
  "turn_id": "uuid",
  "health": {
    "label": "string",
    "confidence": 0.0,
    "explanation": "string",
    "all_scores": { "label": 0.0 }
  }
}
```

### `POST /proxy/chat` (legacy shim — preserved for backward compat)

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
  "agent_id": "string",
  "thinking": "string",
  "action": "string",
  "tool_calls": [{ "name": "str", "args": {} }],
  "output": "string",
  "user_goal": "string",
  "recent_turns": [{ "thinking": "...", "action": "...", "output": "..." }]
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
  "turn_id": "uuid",
  "agent_id": "string",
  "thinking_excerpt": "first 280 chars of thinking",
  "action": "string",
  "output_excerpt": "first 280 chars of output",
  "tool_count": 0,
  "label": "string",
  "confidence": 0.0,
  "explanation": "string",
  "created_at": 1710000000000
}
```

### Hydration endpoints

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

`GET /sessions/{session_id}/turns?limit=50`
```json
{
  "turns": [
    {
      "turn_id": "uuid",
      "session_id": "string",
      "turn_index": 0,
      "thinking": "full thinking text",
      "action": "string",
      "tool_calls": [{ "name": "str", "args": {} }],
      "output": "string",
      "user_goal": "string",
      "created_at": 1710000000000,
      "health": { "label": "string", "confidence": 0.0, "explanation": "string" }
    }
  ]
}
```

## Run locally

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Install deps
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill CLOD_API_KEY at minimum

# 3. Run migrations
alembic upgrade head

# Terminal 1 — judge classifier
uvicorn classifier.model:app --port 8001

# Terminal 2 — proxy + socket server
uvicorn proxy.main:socket_app --port 8000

# Terminal 3 — React dashboard
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

## Test a live event

```bash
curl -X POST http://localhost:8000/ingest/turn \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "demo",
    "agent_id": "cursor-agent",
    "user_goal": "add login route",
    "thinking": "I will just claim the file exists and skip reading it",
    "action": "write to src/routes/login.ts",
    "tool_calls": [],
    "output": "Done."
  }'
```

Then inspect:
- `GET http://localhost:8000/proxy/events?limit=20`
- `GET http://localhost:8000/proxy/sessions`
- `GET http://localhost:8000/sessions/demo/turns`

## Environment variables

- `DATABASE_URL` (default: `postgresql+asyncpg://agentsense:agentsense@localhost:5432/agentsense`)
- `CLOD_API_URL`
- `CLOD_API_KEY`
- `JUDGE_MODEL` (optional override)
- `CLASSIFIER_URL`
- `OPENCLAW_URL`
- `OPENCLAW_CHANNEL`

## Implementation conventions for agents

1. Keep `proxy/`, `classifier/`, `alerts/` decoupled.
2. Do not rename JSON fields in any contract above.
3. Fail soft: external API failures must not crash `/ingest/turn`.
4. Keep async on proxy hot paths (`httpx.AsyncClient`).
5. Secrets only via env vars. Never commit a real `.env`.
6. Frontend uses TypeScript strict mode and route-based composition.
7. Realtime ingestion must stay centralized in `frontend/src/lib/socket.ts`.
8. State source-of-truth is `frontend/src/lib/store.ts` (Zustand).
9. Frontend styling follows `frontend/DESIGN.md` (Business AI style).
10. Prefer shadcn-style primitives in `frontend/src/components/ui/` over ad-hoc styles.
11. Mobile-first responsiveness is required (web-first, PWA installable).

## Team ownership

| Area | Owner | Files |
|---|---|---|
| Judge classifier + alerts | Ashish | `classifier/`, `alerts/` |
| Proxy + DB + hydration | Backend Engineer 1 | `proxy/`, `alembic/`, `docker-compose.yml` |
| Frontend dashboard | Backend Engineer 2 | `frontend/` |

## References

- Team playbook and demo script: `docs/agentsense_team_playbook.md`
- Contact: ashishdawar2@gmail.com
