# AgentSense

Real-time behavioral health monitor for AI agents.
Built for **Cursor Hackathon Vancouver · May 10, 2026**.

AgentSense sits between any LLM application and the LLM API, intercepts every
agent reply, and uses an ML classifier to flag hallucinations, loops, off-topic
responses, and incorrect refusals — before the user ever sees a bad output.

## Quickstart

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in CLOD_API_KEY, GREPTILE_API_KEY

# Terminal 1 — classifier (port 8001)
uvicorn classifier.model:app --port 8001

# Terminal 2 — proxy + Socket.IO (port 8000)
uvicorn proxy.main:socket_app --port 8000

# Terminal 3 — dashboard (any static server)
python -m http.server 5500 --directory dashboard
# open http://localhost:5500
```

## Send a test request

```bash
curl -X POST http://localhost:8000/proxy/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo", "message": "Hello!"}'
```

Watch the dashboard light up.

## Project layout

```
agentsense/
├── AGENTS.md             ← context for AI coding agents (read this first)
├── README.md
├── requirements.txt
├── .env.example
├── docs/
│   └── agentsense_team_playbook.md
├── proxy/                ← FastAPI proxy + Socket.IO server
├── classifier/           ← ML classifier service + SHAP explainer
├── alerts/               ← OpenClaw → Telegram/WhatsApp
├── dashboard/            ← live monitor UI
└── greptile/             ← code-correlation integration
```

## Docs

- **Agent context** for AI coding tools: [`AGENTS.md`](AGENTS.md)
- **Full team plan**, sprint schedule, demo script: [`docs/agentsense_team_playbook.md`](docs/agentsense_team_playbook.md)

## Stack

FastAPI · HuggingFace Transformers · SHAP · Socket.IO · CLōD · Greptile · OpenClaw
