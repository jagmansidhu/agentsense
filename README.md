# AgentSense

Real-time behavioral health monitor for AI agents.

AgentSense sits between your app and the LLM API, scores each assistant reply,
and streams health events to a React dashboard in real time.

## Current architecture

- `proxy/` receives chat messages and forwards to CLōD
- `classifier/` acts as an LLM judge (`/classify`) and returns
  `label + confidence + explanation`
- `proxy/events.py` stores a ring buffer for hydration
- `frontend/` is a Vite + React + TypeScript PWA that consumes:
  - live Socket.IO `agent_event`
  - `GET /proxy/events` and `GET /proxy/sessions` for backfill

## Quickstart

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill at minimum:

- `CLOD_API_KEY`
- `GREPTILE_API_KEY` (optional for early frontend work)

Optional classifier override:

- `JUDGE_MODEL`

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

## Test a live event

```bash
curl -X POST http://localhost:8000/proxy/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"demo","message":"hello"}'
```

Then refresh data from:

- `GET http://localhost:8000/proxy/events?limit=20`
- `GET http://localhost:8000/proxy/sessions`

## Frontend notes

- Design spec lives in `frontend/DESIGN.md`
- Styling follows minimal Swiss style
- Session drill-down route: `/session/:sessionId`
- PWA is enabled via `vite-plugin-pwa`

## Project layout

```
agentsense/
├── AGENTS.md
├── README.md
├── requirements.txt
├── .env.example
├── proxy/
├── classifier/
├── alerts/
├── frontend/
├── greptile/
└── docs/
```
