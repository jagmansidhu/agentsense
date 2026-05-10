import type { AgentEvent, HealthLabel } from "../types";
import { HealthBadge } from "./HealthBadge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  sessionId: string;
  events: AgentEvent[];
}

export function ConversationView({ sessionId, events }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>session conversation</CardTitle>
        <p className="mt-0.5 truncate text-xs text-[rgba(51,51,51,0.55)]">{sessionId}</p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <svg className="h-8 w-8 text-[rgba(51,51,51,0.2)]" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.97-4.03 9-9 9a9.87 9.87 0 0 1-4-.84L3 21l1.84-4A8.96 8.96 0 0 1 3 12c0-4.97 4.03-9 9-9s9 4.03 9 9Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-[rgba(51,51,51,0.5)]">No turns captured yet.</p>
          </div>
        ) : (
          <ul className="grid max-h-[36rem] gap-3 overflow-auto pr-1">
            {[...events].reverse().map((event) => (
              <ConversationTurn key={event.id} event={event} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationTurn({ event }: { event: AgentEvent }) {
  const LABEL_BORDER: Record<HealthLabel, string> = {
    healthy: "#008000",
    hallucinating: "#dc2626",
    "stuck in a loop": "#d97706",
    "off-topic": "#800080",
    "refusing incorrectly": "#00a1e0",
    unknown: "rgba(51,51,51,0.18)",
  };

  return (
    <li
      className="grid gap-3 rounded-[4px] border border-[rgba(51,51,51,0.1)] bg-white p-4 shadow-[var(--shadow-light)]"
      style={{ borderLeft: `3px solid ${LABEL_BORDER[event.label]}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[rgba(51,51,51,0.5)]">
          {event.agent_id ?? "cursor-agent"} · turn · {new Date(event.created_at).toLocaleTimeString()}
        </span>
        <HealthBadge label={event.label} />
      </div>

      {event.thinking_excerpt && (
        <div className="grid gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(51,51,51,0.45)]">thinking</p>
          <p className="rounded-[4px] border border-[rgba(51,51,51,0.08)] bg-[var(--light-grey)] px-2.5 py-2 font-mono text-xs leading-relaxed text-[var(--dark-grey)]">
            {event.thinking_excerpt}
          </p>
        </div>
      )}

      {event.action && (
        <p className="text-xs text-[rgba(51,51,51,0.65)]">
          <span className="font-semibold">action:</span> {event.action}
        </p>
      )}

      {event.tool_count != null && event.tool_count > 0 && (
        <p className="text-xs text-[rgba(51,51,51,0.5)]">
          {event.tool_count} tool call{event.tool_count !== 1 ? "s" : ""}
        </p>
      )}

      {event.output_excerpt && (
        <details className="group text-xs">
          <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.5)] transition-colors hover:text-[var(--business-blue)]">
            output
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-[var(--dark-grey)]">{event.output_excerpt}</p>
        </details>
      )}

      {!event.thinking_excerpt && !event.output_excerpt && event.message && (
        <p className="text-sm leading-relaxed text-[var(--dark-grey)]">{event.message}</p>
      )}

      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.5)] transition-colors hover:text-[var(--business-blue)]">
          classifier reasoning
        </summary>
        <p className="mt-2 rounded-[4px] border border-[rgba(0,161,224,0.15)] bg-[rgba(0,161,224,0.04)] p-2 leading-relaxed text-[rgba(51,51,51,0.7)]">
          {event.explanation}
        </p>
      </details>
    </li>
  );
}
