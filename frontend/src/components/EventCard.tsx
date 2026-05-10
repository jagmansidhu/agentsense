import type { AgentEvent } from "../types";
import { HealthBadge } from "./HealthBadge";

interface Props {
  event: AgentEvent;
}

export function EventCard({ event }: Props) {
  return (
    <li className="grid gap-3 border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HealthBadge label={event.label} />
        <span className="text-xs text-zinc-500">
          session {event.session_id} · {new Date(event.created_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-100">{event.message}</p>
      <p className="text-sm text-zinc-400">{event.explanation}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span>confidence {(event.confidence * 100).toFixed(1)}%</span>
        {event.greptile_context ? <span>code {event.greptile_context}</span> : null}
      </div>
    </li>
  );
}
