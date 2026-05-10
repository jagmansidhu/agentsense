import type { AgentEvent, HealthLabel } from "../types";
import { HealthBadge } from "./HealthBadge";

interface Props {
  event: AgentEvent;
}

const LABEL_BORDER: Record<HealthLabel, string> = {
  healthy: "#008000",
  hallucinating: "#dc2626",
  "stuck in a loop": "#d97706",
  "off-topic": "#800080",
  "refusing incorrectly": "#00a1e0",
  unknown: "rgba(51,51,51,0.18)",
};

export function EventCard({ event }: Props) {
  const accentColor = LABEL_BORDER[event.label];

  return (
    <li
      className="grid gap-3 rounded-[4px] border border-[rgba(51,51,51,0.1)] bg-white p-4 shadow-[var(--shadow-light)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-card)]"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HealthBadge label={event.label} />
        <span className="text-xs text-[rgba(51,51,51,0.5)]">
          {event.session_id} · {new Date(event.created_at).toLocaleTimeString()}
        </span>
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
      {event.output_excerpt && (
        <details className="group text-xs">
          <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.5)] transition-colors hover:text-[var(--business-blue)]">
            output
          </summary>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--dark-grey)]">{event.output_excerpt}</p>
        </details>
      )}
      {!event.thinking_excerpt && !event.output_excerpt && event.message && (
        <p className="text-sm leading-relaxed text-[var(--dark-grey)]">{event.message}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[rgba(51,51,51,0.5)]">
        <span>
          confidence{" "}
          <span className="font-semibold text-[rgba(51,51,51,0.75)]">
            {(event.confidence * 100).toFixed(1)}%
          </span>
          {event.tool_count != null && event.tool_count > 0 && (
            <span className="ml-2">{event.tool_count} tool{event.tool_count !== 1 ? "s" : ""}</span>
          )}
        </span>
      </div>
      <p className="text-xs text-[rgba(51,51,51,0.65)]">{event.explanation}</p>
    </li>
  );
}
