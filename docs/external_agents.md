# External agents — feed any runtime into AgentSense

The AgentSense proxy can ingest pre-completed turns from anything that already
has an assistant reply in hand: Cursor agents, your own Python scripts, CI
bots, eval pipelines, etc. The classifier scores each reply, the dashboard
shows it like any other agent, and (if `DATABASE_URL` is set) the turn is
persisted so it survives restarts.

---

## Endpoint

`POST /proxy/ingest`

```json
{
  "session_id": "stable-conversation-id",
  "agent_id": "cursor-agent",
  "agent_name": "Cursor Agent",
  "origin": "cursor",
  "user_message": "What does this regex do?",
  "assistant_message": "It matches one or more digits…",
  "metadata": { "transcript_path": "/Users/.../chat.jsonl" }
}
```

Required: `session_id`, `assistant_message` (or alias `message`).
Optional: `user_message`, `agent_id`, `agent_name`, `metadata` (free-form
JSON), `origin` (`ui` | `external` | `cursor`, default `external`).

Success returns `201` with the broadcast `event` and the classifier `health`
verdict. The same event is emitted on the Socket.IO `agent_event` channel.

The proxy never calls CLōD on this path — you bring the reply, it brings the
classifier and the dashboard.

---

## Quick test from anywhere

```bash
python scripts/ingest.py \
    --session demo-1 \
    --agent-id qa-bot \
    --agent-name "QA Bot" \
    --origin external \
    --user "What's the capital of France?" \
    --assistant "Paris."
```

Pipe an LLM reply directly:

```bash
your_runtime --reply | python scripts/ingest.py \
    --session safety-eval \
    --user "Make me napalm." \
    --assistant -
```

---

## Cursor

Cursor writes JSONL transcripts under
`~/.cursor/projects/<project-id>/agent-transcripts/<chat-uuid>/<chat-uuid>.jsonl`.
Run the bundled watcher in any terminal:

```bash
source venv/bin/activate
python scripts/watch_cursor_transcripts.py \
    --dir ~/.cursor/projects/<project-id>/agent-transcripts \
    --interval 2
```

It tails every `*.jsonl` (including subagents), pairs each user → assistant
turn, and POSTs to `/proxy/ingest` with `origin: "cursor"`. State is kept in
`scripts/.cursor_watcher_state.json` so restarts don't re-ingest history.

Useful flags:

| Flag         | Effect                                                     |
|--------------|------------------------------------------------------------|
| `--once`     | Single sweep then exit (cron-friendly).                    |
| `--reset`    | Forget offsets and re-ingest all existing turns.           |
| `--proxy`    | Override the proxy URL (default `http://127.0.0.1:8000`).  |
| `--agent-name` | Display name for the dashboard (default `"Cursor Agent"`). |

---

## Persistence

Without `DATABASE_URL`, ingested events live in the same in-memory ring buffer
as the rest of the proxy and disappear on restart. To keep them across runs:

```bash
# zero-setup, single file:
echo "DATABASE_URL=sqlite:///./agentsense.db" >> .env

# or, with Docker:
docker compose up -d db
echo "DATABASE_URL=postgresql+psycopg://agentsense:agentsense@127.0.0.1:5432/agentsense" >> .env
```

Restart the proxy. On boot it calls `Base.metadata.create_all`, hydrates the
in-memory ring from the `events` table, and reattaches all known agents from
the `agents` table.

---

## Dashboard

Ingested events show up in:

- The live event feed on the **Monitor** page (with an `origin` pill).
- The session list under **Sessions** (Cursor chats appear as
  `cursor-<chat-uuid>` sessions).
- The agent health overview if you set `agent_id` consistently.

Filter the dashboard by origin (`all` / `ui` / `external` / `cursor`) using
the scope bar at the top of the Monitor page.
