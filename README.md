# AgentSense

Real-time behavioral health monitor for AI agents — purpose-built for Cursor agents.

AgentSense ingests every reasoning turn from a Cursor (or any) agent, scores the
**thinking trace** with an LLM judge, and streams health events to a React dashboard
in real time. It catches failures before end-users do.

## Current architecture

- `proxy/` — FastAPI ingest server (`POST /ingest/turn`), Socket.IO broadcast, PostgreSQL persistence
- `classifier/` — LLM judge (`/classify`) that audits chain-of-thought first, output second
- `alerts/` — OpenClaw push notifications on high-confidence anomalies
- `frontend/` — Vite + React + TypeScript PWA consuming live Socket.IO events and REST hydration

## Quickstart

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Python environment
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in at minimum: CLOD_API_KEY

# 3. Run migrations
alembic upgrade head
```

Run services:

```bash
# Terminal 1 — judge classifier
uvicorn classifier.model:app --port 8001

# Terminal 2 — proxy + socket server
uvicorn proxy.main:socket_app --port 8000

# Terminal 3 — React dashboard
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Ingest a turn

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

The response includes `health.label` and `health.explanation`. The dashboard
updates in real time via Socket.IO.

Then inspect:

- `GET http://localhost:8000/proxy/events?limit=20`
- `GET http://localhost:8000/proxy/sessions`
- `GET http://localhost:8000/sessions/demo/turns`

## Legacy chat proxy

The old `POST /proxy/chat` shim is still available for backward compatibility:

```bash
curl -X POST http://localhost:8000/proxy/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"demo","message":"hello"}'
```

## Frontend notes

- Design spec: `frontend/DESIGN.md` (Business AI style)
- Session drill-down with Turn Trace view: `/monitor/session/:sessionId`
- Turn Trace shows: thinking → action → tool calls → output, color-coded by health label
- PWA enabled via `vite-plugin-pwa`

## Project layout

```
agentsense/
├── AGENTS.md
├── README.md
├── requirements.txt
├── .env.example
├── docker-compose.yml
├── alembic/
├── proxy/
│   ├── config.py
│   ├── db.py
│   ├── models.py
│   ├── repo.py
│   └── main.py
├── classifier/
│   ├── model.py
│   └── explainer.py
├── alerts/
│   └── openclaw.py
├── frontend/
└── docs/
```
