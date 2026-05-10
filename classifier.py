from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Optional
from dotenv import load_dotenv
import requests
import time
import json
import os
import re

# 1. LOAD ENVIRONMENT VARIABLES
load_dotenv()

app = FastAPI(title="AgentSense Classifier Service")
CACHE_FILE = "classifier_cache.json"

# --- THE PROMPT (UPDATED LABELS) ---
SYSTEM_PROMPT = """You are AgentSense, a behavioral health monitor for AI agents.
Your job is to classify the final agent response into exactly one category based on the conversation history.

Categories:
- healthy: accurate, on-topic, appropriately uncertain
- hallucinating: states false/unverifiable facts or invents details not in the context
- stuck in a loop: repetitive, restates what was already said in previous turns
- off-topic: ignores the user's question or deviates from the conversation history
- refusing incorrectly: refuses a safe, reasonable request

Respond ONLY with this exact JSON object. You MUST use the 'chain_of_thought' field to write out your step-by-step logical evaluation BEFORE assigning the final label.
{
  "chain_of_thought": "<step-by-step reasoning evaluating the history and the final reply>",
  "label": "<exactly one of the five categories above>",
  "confidence": <float between 0.0 and 1.0>,
  "explanation": "<one short summary sentence>"
}"""

# --- INITIALIZATION ---
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE, "r") as f:
        request_cache = json.load(f)
    print(f"📦 Loaded {len(request_cache)} cached responses.")
else:
    request_cache = {}

# --- CONTRACT DATA MODELS ---
class Message(BaseModel):
    role: str
    content: str

class ClassifyRequest(BaseModel):
    session_id: str
    history: List[Message]
    latest_reply: str

# --- TELEGRAM ALERT ---
def push_telegram_alert(session_id, label, confidence, explanation, thoughts):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    
    if not token or not chat_id:
        print("⚠️  Telegram credentials not configured. Skipping alert.")
        return
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    message = (
        f"🚨 *AgentSense Alert* [{session_id}] 🚨\n\n"
        f"*State:* {label.upper()} ({confidence})\n"
        f"*Diagnosis:* {explanation}\n\n"
        f"🧠 *Judge Log:* _{thoughts[:100]}..._\n\n"
    )
    try:
        requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "Markdown"})
        print(f"📲 Alert pushed to phone for session: {session_id}")
    except Exception as e:
        print(f"❌ Failed to push alert: {e}")

# --- THE LLM ENGINE ---
def analyze_behavior(session_id: str, history: List[Message], latest_reply: str):
    # 1. Format the history (The contract says the last element is the latest_reply, so we just use the whole history)
    transcript = ""
    for msg in history:
        transcript += f"[{msg.role.upper()}]: {msg.content}\n"

    # 2. Build the cache key
    cache_key = f"S:{session_id}|R:{latest_reply}"
    
    if cache_key in request_cache:
        print("⚡ CACHE HIT: Returning saved local response")
        c = request_cache[cache_key]
        return c["thoughts"], c["label"], c["confidence"], c["explanation"]
        
    print("🚀 CACHE MISS: Calling CLōD API (DeepSeek V3)...")
    
    prompt = (
        f"--- CONVERSATION TRANSCRIPT ---\n{transcript}\n\n"
        f"Evaluate the final [ASSISTANT] reply based on the preceding context."
    )
    
    CLOD_API_URL = os.environ.get("CLOD_API_URL", "https://api.clod.io/v1/chat/completions")
    api_key = os.environ.get("CLOD_API_KEY")
    
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    payload = {
        "model": os.environ.get("CLOD_MODEL", "DeepSeek V3"),
        "response_format": {"type": "json_object"}, 
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0, 
        "max_completion_tokens": 1500
    }
    
    try:
        response = requests.post(CLOD_API_URL, headers=headers, json=payload)
        if response.status_code != 200:
            return "Error", "error", 0.0, "API Error"
            
        raw = response.json()['choices'][0]['message']['content'].strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        clean_json = json_match.group(0) if json_match else raw
        
        result = json.loads(clean_json)
        thoughts = result.get("chain_of_thought", "No thoughts.")
        label = result.get("label", "error")
        # Ensure confidence is a float between 0.0 and 1.0 per the contract
        confidence = float(result.get("confidence", 0.0))
        if confidence > 1.0: confidence = confidence / 100.0 
        
        explanation = result.get("explanation", "No explanation.")
        
        # Save to Cache
        request_cache[cache_key] = {
            "thoughts": thoughts, "label": label, 
            "confidence": confidence, "explanation": explanation
        }
        with open(CACHE_FILE, "w") as f:
            json.dump(request_cache, f, indent=4)
            
        return thoughts, label, confidence, explanation
        
    except Exception as e:
        print(f"❌ Parsing Error: {e}")
        return "Error", "error", 0.0, "Parse Error"

# --- THE CONTRACT ENDPOINT ---

@app.get("/")
async def root():
    return {"status": "online", "service": "AgentSense Classifier", "version": "1.0"}

@app.post("/classify")
async def classify_chat(req: ClassifyRequest, background_tasks: BackgroundTasks):
    
    thoughts, label, confidence, explanation = analyze_behavior(
        req.session_id, req.history, req.latest_reply
    )
    
    # Fire Telegram alert if it's not healthy
    if label.lower() != "healthy" and label.lower() != "error":
        background_tasks.add_task(push_telegram_alert, req.session_id, label, confidence, explanation, thoughts)
    
    # EXACT CONTRACT RESPONSE
    response_data = {
        "label": label,
        "confidence": confidence,
        "explanation": explanation,
        "chain_of_thought": thoughts # Added this bonus field for the UI!
    }
    
    return response_data

if __name__ == "__main__":
    import uvicorn
    # RUNNING ON PORT 8001 PER THE HANDOFF DOC
    uvicorn.run(app, host="0.0.0.0", port=8001)