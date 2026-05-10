# AGENTS.md — AgentSense

> Project context for AI coding agents (Cursor, Claude Code, Codex, etc.).
> Built for **Cursor Hackathon Vancouver · May 10, 2026** · Theme: *Build Something Agents Want*.
> Source of truth for the human plan: `docs/agentsense_team_playbook.md`.

---

## What we're building

**AgentSense** is a real-time behavioral health monitor for AI agents. It sits between any LLM
application and the LLM API, intercepts every conversation turn, and uses an ML classifier to
detect when an agent is **hallucinating, looping, going off-topic, or behaving anomalously** —
before the user ever sees a bad output.

Target prizes: Grand Prize (Cursor), Best Use of Greptile, Best Use of CLōD.

## Architecture

```
User App → [proxy/ FastAPI] → CLōD LLM API
                ↓
         [classifier/ ML model]
                ↓
         [classifier/ SHAP explainer]
                ↓
   ┌────────────────────────────┐
   │  dashboard/ (Socket.IO UI) │
   └────────────────────────────┘
                ↓
       [greptile/ correlate code]
                ↓
       [alerts/ OpenClaw → WhatsApp/Telegram]
```

## Tech stack

- **Backend proxy**: FastAPI (Python 3.10+)
- **ML classifier**: HuggingFace transformers (zero-shot `cross-encoder/nli-distilroberta-base`)
- **Explainability**: SHAP (heuristic fallback for live demo speed)
- **Real-time UI**: Socket.IO + vanilla HTML/JS
- **Monitored LLM**: CLōD API
- **Code correlation**: Greptile API
- **Alerting**: OpenClaw (local) → WhatsApp/Telegram

## Repo layout

```
agentsense/
├── AGENTS.md                ← you are here
├── README.md
├── requirements.txt
├── .env.example
├── docs/
│   └── agentsense_team_playbook.md
├── proxy/                   ← Backend Engineer 1
│   ├── main.py              FastAPI proxy + Socket.IO server (port 8000)
│   └── session.py           Per-session conversation history
├── classifier/              ← Ashish (ML lead)
│   ├── model.py             FastAPI classifier service (port 8001)
│   └── explainer.py         SHAP / heuristic token attribution
├── alerts/                  ← Ashish
│   └── openclaw.py          OpenClaw → Telegram/WhatsApp alert
├── dashboard/               ← Backend Engineer 2
│   ├── index.html           Live monitor UI
│   └── socket_client.js     Socket.IO client
└── greptile/                ← Backend Engineer 2
    └── correlate.py         Map agent failures back to source code
```

## Service contracts (don't break these)

### `POST /proxy/chat` — proxy → caller
Request:
```json
{ "session_id": "string", "message": "string" }
```
Response:
```json
{ "reply": "string", "health": { "label": "...", "confidence": 0.0, "explanation": "..." } }
```

### `POST /classify` — proxy → classifier
Request:
```json
{ "session_id": "string", "history": [{"role":"...","content":"..."}], "latest_reply": "string" }
```
Response:
```json
{
  "label": "healthy | hallucinating | stuck in a loop | off-topic | refusing incorrectly",
  "confidence": 0.0,
  "explanation": "string",
  "all_scores": { "label": 0.0 }
}
```

### `agent_event` — Socket.IO emit (proxy → dashboard)
```json
{
  "session_id": "string",
  "message": "string",
  "label": "string",
  "confidence": 0.0,
  "explanation": "string",
  "greptile_context": "optional file:line"
}
```

## Run it locally

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in CLOD_API_KEY, GREPTILE_API_KEY

# Terminal 1 — classifier
uvicorn classifier.model:app --port 8001

# Terminal 2 — proxy + Socket.IO
uvicorn proxy.main:socket_app --port 8000

# Terminal 3 — dashboard (any static server)
python -m http.server 5500 --directory dashboard
# open http://localhost:5500
```

## Conventions for AI agents working on this repo

1. **Keep services decoupled.** `proxy/`, `classifier/`, `alerts/`, `greptile/` must be runnable
   independently. Cross-service calls go over HTTP, not Python imports.
2. **Don't break the JSON contracts above.** The dashboard, proxy, and classifier are wired by
   field names — rename a key, break the demo.
3. **Optimize for demo, not production.** No auth, no DB, no retries. In-memory state is fine.
4. **Fail soft.** Alerting/Greptile failures must never crash the proxy chat path. Wrap external
   calls in try/except and log.
5. **Secrets via env vars only.** Read `os.environ["CLOD_API_KEY"]`, `GREPTILE_API_KEY`, etc.
   Never commit a real `.env`.
6. **Async-first.** Use `httpx.AsyncClient`, not `requests`, anywhere on the proxy hot path.
7. **Real-time budget**: per-turn classification should stay < 800 ms. If a model is slower,
   fall back to the CLōD-as-classifier prompt (see playbook §Sprint 1).
8. **Dashboard**: monospace, dark theme, color-coded labels (green=healthy, red=hallucinating,
   yellow=stuck, purple=off-topic). Newest event on top.
9. **Python style**: type hints on public functions, docstring on each FastAPI route.
10. **No comments narrating obvious code.** Comment intent and trade-offs only.

## Team & ownership

| Area | Owner | Files |
|---|---|---|
| ML classifier + SHAP + alerts | Ashish | `classifier/`, `alerts/` |
| FastAPI proxy + sessions | Backend Engineer 1 | `proxy/` |
| Dashboard + Greptile | Backend Engineer 2 | `dashboard/`, `greptile/` |

## Demo trigger (do not remove)

The hallucination-trigger prompt lives in the playbook (§Sprint 3). The classifier MUST flag
this reliably — it's the live demo's wow moment.

## Contingencies

- **Classifier too slow** → swap to `CLASSIFY_PROMPT` against CLōD (see playbook).
- **Greptile indexing slow** → drop `greptile_context` from socket event; mention as "see Devpost".
- **OpenClaw alert fails** → fall back to pre-recorded notification clip.
- **Wifi flaky** → cache one CLōD reply; classifier + dashboard still work locally.

## References

- Full plan, sprint-by-sprint code, and demo script: `docs/agentsense_team_playbook.md`
- Contact: ashishdawar2@gmail.com
