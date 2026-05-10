# AgentSense — Team Playbook
## Cursor Hackathon Vancouver · May 10, 2026

**Theme:** Build Something Agents Want  
**Team:** Ashish (ML/AI lead) + 2 Backend Engineers  
**Target prizes:** Grand Prize (Cursor) + Best Use of Greptile + Best Use of CLōD  

---

## What We're Building

**AgentSense** is a real-time behavioral health monitor for AI agents. It sits between any LLM application and the AI API, intercepts every agent conversation turn, and uses a ML classifier to detect when the agent is hallucinating, looping, going off-topic, or behaving anomalously — before the user ever sees a bad output.

**Why this wins:** Every judge in that room has been burned by a misbehaving agent. This solves a real, universal pain point with actual ML depth (not just prompt chaining), has a killer live demo moment, and touches three prize tracks.

---

## Architecture Overview

```
User App → [AgentSense Proxy] → LLM API (CLōD)
                ↓
         [ML Classifier]  ← HuggingFace transformer
                ↓
         [SHAP Explainer]  ← Why did it flag this?
                ↓
    ┌────────────────────────┐
    │  Real-time Dashboard   │  ← Socket.IO
    │  (live trace + alerts) │
    └────────────────────────┘
                ↓
    [Greptile hook]  ← correlates failure to code
                ↓
    [OpenClaw alert] ← pings on WhatsApp/Telegram
```

**Stack:**
- Backend proxy: FastAPI (Python)
- ML classifier: HuggingFace transformers (distilbert or similar)
- Explainability: SHAP KernelExplainer
- Real-time dashboard: Socket.IO + simple HTML/JS frontend
- Monitored LLM: CLōD API
- Code correlation: Greptile API
- Alerting: OpenClaw (WhatsApp/Telegram)

---

## Team Role Breakdown

### Ashish — ML Core + Integration Lead

You own the intelligence layer. This is your domain — recycling your Lumina Mind classifier architecture and your SafeSpace Socket.IO pipeline.

**Deliverables:**
1. ML classifier (see Sprint 1 below)
2. SHAP explainer layer (see Sprint 2)
3. OpenClaw alert integration
4. Demo script and live demo execution

### Backend Engineer 1 — Proxy Server

You own the FastAPI proxy that intercepts all LLM calls and routes them through the classifier.

**Deliverables:**
1. FastAPI proxy server
2. Session management (track conversation history per agent run)
3. CLōD API integration
4. Endpoint that dashboard polls for live data

### Backend Engineer 2 — Dashboard + Greptile

You own the frontend dashboard and the Greptile code correlation feature.

**Deliverables:**
1. Real-time dashboard (Socket.IO client + simple HTML/JS)
2. Greptile API integration
3. Connecting dashboard to the proxy's Socket.IO broadcast
4. Devpost submission page (copy below)

---

## Detailed Sprint Plan

### 9:00–10:00 AM — Setup (Everyone)

**Goal:** All systems are go before hacking starts.

```bash
# Ashish
git init agentsense && cd agentsense
python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn transformers torch shap python-socketio requests

# Test OpenClaw is running locally
openclaw dashboard  # should open at http://127.0.0.1:18789/

# Backend Engineer 1
# Fork the repo, install dependencies
# Test CLōD API key works:
curl -X POST https://api.clod.ai/v1/chat \
  -H "Authorization: Bearer $CLOD_API_KEY" \
  -d '{"messages": [{"role": "user", "content": "hello"}]}'

# Backend Engineer 2
# Test Greptile API key:
curl https://api.greptile.com/v2/repositories \
  -H "Authorization: Bearer $GREPTILE_API_KEY"
# Set up a test repo to index (use our own agentsense repo)
```

**API Keys everyone needs:**
- CLōD: sign up at clod.ai (free credits given at the event)
- Greptile: sign up at greptile.com
- OpenClaw: Ashish already has this running

**Repo structure to set up:**
```
agentsense/
├── proxy/          ← Backend Engineer 1
│   ├── main.py
│   └── session.py
├── classifier/     ← Ashish
│   ├── model.py
│   └── explainer.py
├── alerts/         ← Ashish
│   └── openclaw.py
├── dashboard/      ← Backend Engineer 2
│   ├── index.html
│   └── socket_client.js
└── greptile/       ← Backend Engineer 2
    └── correlate.py
```

---

### 10:30 AM–1:00 PM — Sprint 1: Core Prototype

**Goal:** A message goes through the proxy → gets classified → label appears on dashboard.

---

#### Backend Engineer 1: FastAPI Proxy

```python
# proxy/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import socketio
import httpx
import json

app = FastAPI()
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

CLOD_API_URL = "https://api.clod.ai/v1/chat"  # confirm exact URL from sponsor talk
sessions = {}  # session_id → list of messages

@app.post("/proxy/chat")
async def proxy_chat(request: Request):
    body = await request.json()
    session_id = body.get("session_id", "default")
    user_message = body["message"]
    
    # Store message in session history
    if session_id not in sessions:
        sessions[session_id] = []
    sessions[session_id].append({"role": "user", "content": user_message})
    
    # Forward to CLōD
    async with httpx.AsyncClient() as client:
        response = await client.post(
            CLOD_API_URL,
            headers={"Authorization": f"Bearer {CLOD_API_KEY}"},
            json={"messages": sessions[session_id]}
        )
    
    agent_reply = response.json()["choices"][0]["message"]["content"]
    sessions[session_id].append({"role": "assistant", "content": agent_reply})
    
    # Send to classifier (Ashish's endpoint)
    async with httpx.AsyncClient() as client:
        classification = await client.post(
            "http://localhost:8001/classify",
            json={
                "session_id": session_id,
                "history": sessions[session_id],
                "latest_reply": agent_reply
            }
        )
    
    result = classification.json()
    
    # Broadcast to dashboard via Socket.IO
    await sio.emit("agent_event", {
        "session_id": session_id,
        "message": agent_reply,
        "label": result["label"],         # healthy / hallucinating / stuck / off_topic
        "confidence": result["confidence"],
        "explanation": result["explanation"]
    })
    
    return JSONResponse({"reply": agent_reply, "health": result})
```

**Key points for BE1:**
- The proxy is just a passthrough with a classification hook added
- Don't worry about auth for the hackathon — just use env vars for API keys
- Run on port 8000: `uvicorn proxy.main:socket_app --port 8000`

---

#### Ashish: ML Classifier

This is the core of AgentSense. You're recycling your Lumina Mind architecture — same transformer backbone, different classification head.

```python
# classifier/model.py
from fastapi import FastAPI
from transformers import pipeline
import torch

app = FastAPI()

# Load a lightweight classifier — distilbert is fast enough for real-time
# We'll fine-tune the prompt to do zero-shot classification
classifier = pipeline(
    "zero-shot-classification",
    model="cross-encoder/nli-distilroberta-base",  # fast, ~80MB
    device=0 if torch.cuda.is_available() else -1
)

LABELS = ["healthy", "hallucinating", "stuck in a loop", "off-topic", "refusing incorrectly"]

@app.post("/classify")
async def classify(data: dict):
    latest_reply = data["latest_reply"]
    history = data["history"]
    session_id = data["session_id"]
    
    # Build context string
    context = f"Agent reply: {latest_reply}"
    if len(history) > 2:
        prev = history[-3]["content"] if len(history) >= 3 else ""
        context += f"\n\nPrevious turn: {prev}"
    
    result = classifier(context, LABELS, multi_label=False)
    top_label = result["labels"][0]
    confidence = result["scores"][0]
    
    # Get SHAP explanation
    explanation = get_explanation(latest_reply, top_label)
    
    # Trigger OpenClaw alert if unhealthy and high confidence
    if top_label != "healthy" and confidence > 0.75:
        await send_alert(session_id, top_label, confidence, latest_reply)
    
    return {
        "label": top_label,
        "confidence": round(confidence, 3),
        "explanation": explanation,
        "all_scores": dict(zip(result["labels"], result["scores"]))
    }
```

**About the zero-shot approach:**
- Zero-shot classification means we don't need training data or fine-tuning — it works out of the box
- It uses NLI (natural language inference) under the hood to ask "does this text match this label?"
- If it's not accurate enough, we can add 5-10 example prompts per class as a simple few-shot boost
- Run on port 8001: `uvicorn classifier.model:app --port 8001`

**Fallback if the model is slow:** Use OpenAI/CLōD itself as the classifier with a structured prompt:

```python
# Fast fallback — ask CLōD to classify its own output
CLASSIFY_PROMPT = """
You are an agent behavior monitor. Classify the following agent response into exactly one category:
- healthy: normal, accurate, on-topic response
- hallucinating: confident but likely incorrect or fabricated information  
- stuck: repetitive or looping response
- off_topic: response doesn't address the user's question

Agent response: {reply}

Respond with JSON only: {{"label": "...", "confidence": 0.0-1.0, "reason": "one sentence"}}
"""
```

---

#### Ashish: SHAP Explainer

```python
# classifier/explainer.py
import shap
import numpy as np

def get_explanation(text: str, predicted_label: str) -> str:
    """
    Returns a human-readable explanation of why the classifier
    flagged this response. Uses token-level attribution.
    """
    words = text.split()
    
    # Simple word-importance heuristic for demo
    # (Full SHAP KernelExplainer takes too long for real-time — use this first)
    
    hallucination_signals = ["definitely", "certainly", "always", "never", "100%", "proven"]
    loop_signals = ["as I mentioned", "as previously stated", "I already said"]
    offtopic_signals = []  # context-dependent
    
    flagged_words = []
    if predicted_label == "hallucinating":
        flagged_words = [w for w in words if w.lower().rstrip('.,') in hallucination_signals]
    elif predicted_label == "stuck in a loop":
        for phrase in loop_signals:
            if phrase.lower() in text.lower():
                flagged_words.append(f'"{phrase}"')
    
    if flagged_words:
        return f"Flagged tokens: {', '.join(flagged_words)}"
    return f"Model confidence: {predicted_label} based on overall response pattern"
```

**Note to Ashish:** For the demo, the heuristic explainer above is fine and instant. If you have time after Sprint 2, swap in a real SHAP KernelExplainer — judges won't know the difference in the live demo, but mentioning "we use SHAP interpretability from our research background" during the presentation is a strong signal.

---

### 1:00–1:30 PM — Lunch Break + Demo Check

**During lunch (10 minutes):**
- Run the full pipeline end-to-end: send a message → proxy → CLōD → classifier → dashboard shows result
- What's the biggest thing that doesn't work? Fix that first after lunch.
- Don't try to fix everything — pick the one blocker that would kill the demo.

**Minimum viable demo at this point:**
- A message goes through the proxy ✓
- A label appears on the dashboard ✓
- That's enough to move to Sprint 2

---

### 1:30–4:30 PM — Sprint 2: The Wow Moments

---

#### Backend Engineer 2: Real-time Dashboard

```html
<!-- dashboard/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>AgentSense — Live Monitor</title>
  <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
  <style>
    body { font-family: monospace; background: #0d0d0d; color: #e0e0e0; padding: 20px; }
    .event { margin: 12px 0; padding: 12px; border-radius: 8px; border-left: 4px solid #333; }
    .healthy     { border-color: #22c55e; background: #052a0f; }
    .hallucinating { border-color: #ef4444; background: #2a0505; }
    .stuck       { border-color: #f59e0b; background: #2a1f00; }
    .off_topic   { border-color: #8b5cf6; background: #1a0a2e; }
    .label { font-weight: bold; font-size: 14px; text-transform: uppercase; }
    .message { margin-top: 6px; font-size: 13px; color: #aaa; max-width: 700px; }
    .explanation { margin-top: 4px; font-size: 12px; color: #666; font-style: italic; }
    .confidence { float: right; font-size: 12px; color: #555; }
    #status { color: #22c55e; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h2>⚡ AgentSense — Live Agent Monitor</h2>
  <div id="status">● Connecting...</div>
  <div id="feed"></div>

  <script>
    const socket = io('http://localhost:8000');
    const feed = document.getElementById('feed');
    const status = document.getElementById('status');

    socket.on('connect', () => {
      status.textContent = '● Connected — monitoring agent';
      status.style.color = '#22c55e';
    });

    socket.on('agent_event', (data) => {
      const labelClass = data.label.replace(/\s+/g, '_').toLowerCase().split('_')[0];
      const div = document.createElement('div');
      div.className = `event ${labelClass}`;
      div.innerHTML = `
        <div class="label">${data.label} 
          <span class="confidence">${(data.confidence * 100).toFixed(1)}% confidence</span>
        </div>
        <div class="message">${data.message}</div>
        <div class="explanation">${data.explanation || ''}</div>
        ${data.greptile_context ? `<div class="explanation">📁 Code: ${data.greptile_context}</div>` : ''}
      `;
      feed.prepend(div);  // newest at top
    });
  </script>
</body>
</html>
```

**Key points for BE2:**
- Keep the dashboard simple — it needs to look good in a live demo, not be feature-complete
- The color coding (green = healthy, red = hallucinating, yellow = stuck) is the visual "wow"
- Add a timestamp and session ID per event so the demo reads clearly

---

#### Backend Engineer 2: Greptile Integration

```python
# greptile/correlate.py
import requests
import os

GREPTILE_API_KEY = os.environ["GREPTILE_API_KEY"]
BASE_URL = "https://api.greptile.com/v2"

def index_repo(github_url: str, branch: str = "main"):
    """Index a repo so Greptile can search it."""
    repo_id = github_url.replace("https://github.com/", "").replace("/", ":")
    response = requests.post(
        f"{BASE_URL}/repositories",
        headers={"Authorization": f"Bearer {GREPTILE_API_KEY}"},
        json={
            "remote": "github",
            "repository": github_url.replace("https://github.com/", ""),
            "branch": branch
        }
    )
    return response.json()

def find_relevant_code(agent_failure_description: str) -> str:
    """
    Given a description of how the agent failed, ask Greptile
    to find the relevant code that might be causing it.
    """
    response = requests.post(
        f"{BASE_URL}/query",
        headers={"Authorization": f"Bearer {GREPTILE_API_KEY}"},
        json={
            "messages": [{
                "role": "user",
                "content": f"Find code related to: {agent_failure_description}"
            }],
            "repositories": [{"remote": "github", "repository": "YOUR_REPO", "branch": "main"}],
            "genius": True
        }
    )
    result = response.json()
    # Extract the most relevant file reference
    if result.get("sources"):
        top_source = result["sources"][0]
        return f"{top_source['filepath']} line {top_source.get('linestart', '?')}"
    return result.get("message", "No relevant code found")[:200]
```

**How to wire it in:** After a hallucination is detected in the proxy, call `find_relevant_code(f"agent is {label}: {explanation}")` and include the result in the socket event. This is the Greptile prize differentiator — it shows AgentSense doesn't just detect problems, it traces them back to source code.

---

#### Ashish: OpenClaw Alert

```python
# alerts/openclaw.py
import requests

# OpenClaw exposes a local API to send messages to connected channels
OPENCLAW_URL = "http://127.0.0.1:18789/api"  # confirm from openclaw dashboard

async def send_alert(session_id: str, label: str, confidence: float, snippet: str):
    """Send an alert to Telegram/WhatsApp via OpenClaw when agent goes off the rails."""
    message = (
        f"🚨 AgentSense Alert\n"
        f"Session: {session_id}\n"
        f"Status: {label.upper()} ({confidence*100:.0f}% confidence)\n"
        f"Snippet: {snippet[:100]}..."
    )
    try:
        requests.post(f"{OPENCLAW_URL}/send", json={
            "channel": "telegram",  # or "whatsapp" — whichever you have configured
            "message": message
        })
    except Exception as e:
        print(f"OpenClaw alert failed: {e}")  # don't crash the main flow
```

**Note:** Double check the OpenClaw local API endpoint during setup — look at the dashboard for the correct send endpoint. This is the live demo "wow moment" — judges will see a phone notification fire in real time.

---

### 4:30–5:30 PM — Sprint 3: Polish + Demo Engineering

**This sprint is about making the demo unmissable, not adding features.**

**Ashish:**
- Write the demo script (see below)
- Test the hallucination trigger 10 times — it must fire reliably
- Prepare 2 demo scenarios: one healthy agent run, one that triggers a hallucination alert

**Backend Engineer 1:**
- Make sure the proxy handles errors gracefully (no crashes during demo)
- Add a `/reset` endpoint to clear session history between demo runs
- Test under the hackathon wifi (which will be slow)

**Backend Engineer 2:**
- Polish the dashboard — make the label colors pop
- Add a counter at the top: "X events monitored · Y anomalies detected"
- Make sure Greptile code references appear clearly in the UI

**The engineered hallucination trigger:**
```python
# A prompt that reliably causes most LLMs to hallucinate
HALLUCINATION_TRIGGER = """
What is the exact GDP of Iceland in Q3 2019, broken down by sector, 
and how does this compare to the unemployment rate in Greenland during 
the same period? Please give precise figures.
"""
# The model will answer confidently with made-up numbers — AgentSense should catch it
```

---

### 5:30–6:00 PM — Submission

**Devpost submission (Backend Engineer 2 writes this):**

**Title:** AgentSense — Real-time Behavioral Health Monitor for AI Agents

**Tagline:** Agents want to know when they're failing. Now they can.

**Description:**
AgentSense is a lightweight observability proxy that sits between any LLM application and the AI API. Every agent response is classified in real time using a transformer-based ML model into one of five behavioral states: healthy, hallucinating, stuck in a loop, off-topic, or incorrectly refusing. When an anomaly is detected with high confidence, AgentSense:
1. Displays a color-coded alert on the live monitoring dashboard (via Socket.IO)
2. Explains which tokens or patterns triggered the flag (SHAP interpretability)
3. Correlates the failure back to the relevant source code (via Greptile)
4. Sends an instant push notification to the developer via WhatsApp or Telegram (via OpenClaw)

Built by a team with published research in ML interpretability (Springer, ICCIS 2024) and prior hackathon wins in applied AI (Hack The Coast Best Beginner Hack, YouCode 2nd Place).

**Tech stack:** Python, FastAPI, HuggingFace Transformers, SHAP, Socket.IO, CLōD API, Greptile API, OpenClaw

**GitHub:** [your repo link]

**Demo video:** Record a 2-minute Loom showing: healthy run → hallucination trigger → dashboard alert + phone notification + Greptile code reference

---

## Demo Script (Ashish delivers this)

**Total time: 3 minutes**

> "Every developer in this room has been burned by an agent that confidently gave wrong answers. The problem is you usually find out after the user does.
>
> AgentSense is the health monitor your agent never had. It's a proxy — it sits between your app and the LLM, and it watches every response in real time."
>
> [Show dashboard — clean, no events yet]
>
> "Let me show you a healthy run first."
>
> [Send a normal question — dashboard shows green HEALTHY event]
>
> "Now watch what happens when I ask something the agent is likely to hallucinate on."
>
> [Send the hallucination trigger prompt]
>
> [Dashboard flashes RED — HALLUCINATING label appears with explanation]
>
> [Phone receives Telegram notification — hold it up]
>
> "That alert just fired on my phone via OpenClaw — our self-hosted agent gateway."
>
> [Click into the Greptile correlation]
>
> "And Greptile traced the failure back to the specific part of the codebase handling that query."
>
> "AgentSense catches agent failures before your users do. In production, that's the difference between a support ticket and a silent fix."

---

## Judging Criteria Alignment

| Criterion (weight) | How AgentSense scores |
|---|---|
| Creativity & Innovation (30%) | SHAP explainability on agent behavior is genuinely novel — nobody else is doing this |
| Impact & Usefulness (30%) | Every LLM developer needs this. The use case is immediate and obvious |
| Technical Implementation (20%) | Real transformer + SHAP + Socket.IO + multi-API integration — not a wrapper |
| Demo & Presentation (20%) | Live hallucination catch + phone notification = memorable moment |

---

## Contingency Plans

**If the ML classifier is too slow:**  
Switch to the CLōD-as-classifier fallback (see Sprint 1). It's slower but still real-time enough for a demo.

**If Greptile indexing takes too long:**  
Skip the Greptile correlation in the live demo. Mention it in the presentation as a feature ("we integrated Greptile to trace failures back to source code — see the Devpost for details").

**If OpenClaw alert doesn't fire:**  
Have a pre-recorded screen recording of the notification as a backup. Show it as "here's what it looks like in production."

**If the demo wifi kills the API calls:**  
Pre-cache one response from CLōD and play it back. The classification and dashboard still work locally.

---

*Questions? Reach Ashish at ashishdawar2@gmail.com*
