# Backend Engineer 1 — execution checklist

Use this in order so you hit Sprint 1 first, then integration, then Sprint 3 polish.

---

## 0. Environment (once)

- [ ] Fork/clone repo; work on a feature branch (e.g. `backend`).
- [ ] Python venv + install deps (see team playbook: FastAPI, uvicorn, httpx, python-socketio, etc.).
- [ ] `CLOD_API_KEY` in environment; smoke-test CLōD with `curl` (from playbook).
- [ ] Confirm classifier URL/port with Ashish (playbook assumes `http://localhost:8001/classify`).

---

## 1. Sprint 1 — core proxy path (minimum demo)

Goal: **message → proxy → CLōD → classifier → Socket.IO event** (dashboard can subscribe on `:8000`).

- [ ] **`session.py`**: Store history per `session_id` (in-memory dict is fine for hackathon).
  - [ ] Append user message, then assistant reply after CLōD returns.
  - [ ] Optional: cap history length so payloads stay small.
- [ ] **`main.py`**: FastAPI app + Socket.IO ASGI wrapper (playbook pattern: `socketio.ASGIApp`).
- [ ] **POST `/proxy/chat`** (or agreed path):
  - [ ] Parse JSON: `session_id`, user `message` (match contract with dashboard / test client).
  - [ ] Load/update session history.
  - [ ] **CLōD**: `POST` chat with `Bearer` token + `messages` payload.
  - [ ] Parse assistant reply (confirm real CLōD response shape vs playbook’s `choices[0]` example).
  - [ ] **Classifier**: `POST` to `/classify` with `session_id`, `history`, `latest_reply`.
  - [ ] **`sio.emit("agent_event", { ... })`**: Include label, confidence, explanation (and whatever BE2 needs for UI).
  - [ ] HTTP response to client: e.g. `{ "reply": ..., "health": ... }`.
- [ ] Run: `uvicorn proxy.main:socket_app --host 0.0.0.0 --port 8000` (or module path your package uses).

**Definition of done (Sprint 1):** One scripted request produces a classifier result and a visible Socket.IO event when the dashboard connects.

---

## 2. Integration — contracts & stability

- [ ] Align **JSON shapes** with Ashish (`/classify` request/response) and BE2 (`agent_event` fields).
- [ ] **Timeouts** on outbound `httpx` calls (CLōD + classifier) so the server never hangs.
- [ ] **HTTP errors**: Map CLōD/classifier failures to clean JSON errors + optional `emit` with an “error” or degraded payload (don’t crash the process).

---

## 3. Sprint 3 — demo hardening

- [ ] **`POST /reset`** (or per-session reset): Clear history for a `session_id` (or all) between demo runs.
- [ ] **Logging**: Minimal structured logs (session_id, status code, latency) — enough to debug on venue Wi‑Fi.
- [ ] **Failure modes**: Test slow network; optional short retries only where safe (avoid double-send to CLōD unless idempotent).

---

## 4. Greptile + alerts (coordinate, don’t own)

- [ ] Greptile correlation may be appended to `agent_event` after BE2 exposes a callable or shared contract — confirm who calls Greptile (playbook suggests wiring from proxy after unhealthy detection).

---

## Quick reference

| Piece        | Owner | Default in playbook |
|-------------|-------|---------------------|
| Proxy       | BE1   | Port `8000`         |
| Classifier  | Ashish | Port `8001`        |
| CLōD        | Via proxy | Env `CLOD_API_KEY` |

---

## Files you own

- `proxy/main.py` — FastAPI routes, CLōD + classifier clients, Socket.IO emit.
- `proxy/session.py` — Session storage and helpers.
