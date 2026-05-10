import type { AgentEvent, HealthLabel } from "../types";
import { HealthBadge } from "./HealthBadge";
import { OriginPill } from "./OriginPill";

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
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge label={event.label} />
          <OriginPill origin={event.origin} />
          {event.agent_name ? (
            <span className="text-xs font-medium text-[rgba(51,51,51,0.7)]">
              {event.agent_name}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-[rgba(51,51,51,0.5)]">
          {event.session_id} · {new Date(event.created_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--dark-grey)]">{event.message}</p>
      <p className="text-sm text-[rgba(51,51,51,0.65)]">{event.explanation}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[rgba(51,51,51,0.5)]">
        <span>
          confidence{" "}
          <span className="font-semibold text-[rgba(51,51,51,0.75)]">
            {(event.confidence * 100).toFixed(1)}%
          </span>
        </span>
        {event.greptile_context && (
          <code className="rounded bg-[var(--light-grey)] px-1.5 py-0.5 font-mono text-[10px]">
            {event.greptile_context}
          </code>
        )}
      </div>
    </li>
  );
}
