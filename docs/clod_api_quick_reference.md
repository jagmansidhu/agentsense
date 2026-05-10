# CLōD API — quick reference (developers)

Concise facts for AgentSense integration. Full marketing/docs live at [clod.io](https://clod.io).

## Auth & dashboard

| Item | URL / note |
|------|------------|
| App / signup | https://app.clod.io |
| API keys | Dashboard → API Keys → Generate Key |
| Model catalog | https://app.clod.io/auth/models |
| Swagger | https://newapp.clod.io/api#/ |

Store the key only in env (never commit):

```bash
export CLOD_API_KEY="your_clod_api_key"
```

## Chat API (OpenAI-compatible)

| Item | Value |
|------|--------|
| Base URL | `https://api.clod.io/v1` |
| Chat endpoint | `POST /v1/chat/completions` → full URL **`https://api.clod.io/v1/chat/completions`** |
| Auth header | `Authorization: Bearer <CLOD_API_KEY>` |
| Content-Type | `application/json` |

Request body matches OpenAI chat completions (e.g. `model`, `messages`, optional `temperature`, `max_completion_tokens`, etc.).

### cURL smoke test

```bash
curl -X POST "https://api.clod.io/v1/chat/completions" \
  -H "Authorization: Bearer $CLOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "DeepSeek V3",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "temperature": 0.7,
    "max_completion_tokens": 50
  }'
```

### Python (official pattern)

Use any OpenAI SDK with `baseURL`/`base_url` = `https://api.clod.io/v1` and `apiKey`/`api_key` from `CLOD_API_KEY`.

Success responses use the usual **`choices[0].message.content`** shape.

## Projects (optional)

Dashboard → Projects: isolated keys, logs, budgets, encryption options.
