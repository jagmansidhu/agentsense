import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AgentRuntime, ChatTurn } from "../../lib/playgroundStore";
import { usePlaygroundStore } from "../../lib/playgroundStore";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";
import { HealthBadge } from "../HealthBadge";
import { AgentForm, type AgentFormSubmit } from "./AgentForm";

interface Props {
  runtime: AgentRuntime;
}

export function AgentChatPanel({ runtime }: Props) {
  const sendUserMessage = usePlaygroundStore((state) => state.sendUserMessage);
  const updateAgent = usePlaygroundStore((state) => state.updateAgent);
  const resetConversation = usePlaygroundStore((state) => state.resetConversation);

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft("");
    setEditing(false);
  }, [runtime.agent.agent_id]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [runtime.turns.length, runtime.pending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft;
    if (!message.trim()) return;
    setDraft("");
    await sendUserMessage(runtime.agent.agent_id, message);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendUserMessage(runtime.agent.agent_id, draft).then(() => setDraft(""));
    }
  };

  const handleEditSubmit = async (payload: AgentFormSubmit) => {
    await updateAgent(runtime.agent.agent_id, payload);
    setEditing(false);
  };

  const lastHealth = [...runtime.turns].reverse().find((turn) => turn.health)?.health;

  return (
    <section className="grid h-full content-start gap-3 rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-4 shadow-[var(--shadow-light)]">
      <header className="grid gap-2 border-b border-[rgba(51,51,51,0.1)] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <h2 className="text-base font-semibold text-[var(--dark-grey)]">
              {runtime.agent.name}
            </h2>
            <p className="text-xs text-[rgba(51,51,51,0.6)]">
              {runtime.agent.description || "No description"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastHealth ? <HealthBadge label={lastHealth.label} /> : null}
            <Button size="sm" variant="ghost" onClick={() => setEditing((open) => !open)}>
              {editing ? "Close" : "Edit"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetConversation(runtime.agent.agent_id)}
              disabled={runtime.turns.length === 0}
            >
              Reset chat
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-1 text-[11px] text-[rgba(51,51,51,0.65)] sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="uppercase tracking-[0.1em] text-[rgba(51,51,51,0.5)]">Assigned task</dt>
            <dd className="text-[var(--dark-grey)]">
              {runtime.agent.task || "— No task assigned. Edit the agent to give it one."}
            </dd>
          </div>
          <div className="grid gap-0.5 sm:justify-self-end sm:text-right">
            <dt className="uppercase tracking-[0.1em] text-[rgba(51,51,51,0.5)]">Session</dt>
            <dd className="font-mono">{runtime.sessionId}</dd>
          </div>
        </dl>
      </header>

      {editing ? (
        <AgentForm
          initial={runtime.agent}
          submitLabel="Save changes"
          onSubmit={handleEditSubmit}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <div
        ref={scrollRef}
        className="grid max-h-[28rem] gap-3 overflow-auto rounded-[4px] border border-[rgba(51,51,51,0.08)] bg-[rgba(248,250,252,0.6)] p-3"
      >
        {runtime.turns.length === 0 ? (
          <EmptyState />
        ) : (
          runtime.turns.map((turn) => <ChatBubble key={turn.id} turn={turn} />)
        )}
        {runtime.pending ? <PendingBubble /> : null}
        {runtime.lastError ? (
          <p className="rounded-[4px] border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.05)] px-3 py-2 text-xs text-[rgb(220,38,38)]">
            {runtime.lastError}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={`Message ${runtime.agent.name}…  (Enter to send, Shift+Enter for newline)`}
          disabled={runtime.pending}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-[rgba(51,51,51,0.45)]">
            Replies are scored by the AgentSense classifier.
          </span>
          <Button type="submit" variant="primary" size="md" disabled={runtime.pending || !draft.trim()}>
            {runtime.pending ? "Waiting…" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`grid gap-1 ${isUser ? "justify-items-end" : "justify-items-start"}`}>
      <div
        className={`max-w-[85%] rounded-[6px] px-3 py-2 text-sm leading-relaxed shadow-[var(--shadow-light)] ${
          isUser
            ? "bg-[var(--business-blue)] text-white"
            : "border border-[rgba(51,51,51,0.12)] bg-white text-[var(--dark-grey)]"
        }`}
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[rgba(51,51,51,0.45)]">
        <span>{isUser ? "you" : "assistant"}</span>
        <span>· {new Date(turn.createdAt).toLocaleTimeString()}</span>
        {turn.health ? (
          <>
            <HealthBadge label={turn.health.label} />
            <span>{(Number(turn.health.confidence) * 100).toFixed(0)}%</span>
          </>
        ) : null}
      </div>
      {turn.health?.explanation ? (
        <details className="group max-w-[85%] text-[11px]">
          <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.45)] hover:text-[var(--business-blue)]">
            classifier reasoning
          </summary>
          <p className="mt-1 rounded-[4px] border border-[rgba(0,161,224,0.18)] bg-[rgba(0,161,224,0.04)] p-2 leading-relaxed text-[rgba(51,51,51,0.7)]">
            {turn.health.explanation}
          </p>
        </details>
      ) : null}
    </div>
  );
}

function PendingBubble() {
  return (
    <div className="grid justify-items-start gap-1">
      <div className="rounded-[6px] border border-[rgba(51,51,51,0.12)] bg-white px-3 py-2 text-sm text-[rgba(51,51,51,0.55)] shadow-[var(--shadow-light)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--business-blue)]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--business-blue)]" style={{ animationDelay: "120ms" }} />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--business-blue)]" style={{ animationDelay: "240ms" }} />
          <span className="ml-1 text-xs">contacting CLōD &amp; classifier…</span>
        </span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center gap-2 py-10 text-center text-xs text-[rgba(51,51,51,0.55)]">
      <p className="text-sm font-medium text-[var(--dark-grey)]">No turns yet for this agent.</p>
      <p>Send a message below to start testing the persona and assigned task.</p>
    </div>
  );
}
