import { summarizeAgentMetrics } from "../lib/agentInsights";
import type { AgentEvent } from "../types";

interface Props {
  events: AgentEvent[];
}

export function StatsBar({ events }: Props) {
  const {
    averageHealth,
    averageConfidence,
    openIssues,
    totalEvents,
    agentCount,
    anomalyRate,
  } = summarizeAgentMetrics(events);

  const issueAccent =
    openIssues > 0 ? "var(--warm-orange)" : "var(--success-green)";
  const anomalyAccent =
    anomalyRate >= 0.25
      ? "rgb(220,38,38)"
      : anomalyRate >= 0.1
        ? "var(--warm-orange)"
        : "var(--success-green)";

  return (
    <section className="grid animate-fade-up gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Health score"
        value={averageHealth.toFixed(0)}
        suffix="/100"
        helper={`${agentCount} ${agentCount === 1 ? "agent" : "agents"} monitored`}
        accentColor="var(--business-blue)"
        bar={{ value: averageHealth, max: 100, color: "var(--business-blue)" }}
      />
      <KpiCard
        label="Anomaly rate"
        value={`${(anomalyRate * 100).toFixed(1)}`}
        suffix="%"
        helper={`${totalEvents} turns classified`}
        accentColor={anomalyAccent}
        bar={{ value: anomalyRate * 100, max: 100, color: anomalyAccent }}
      />
      <KpiCard
        label="Avg confidence"
        value={(averageConfidence * 100).toFixed(1)}
        suffix="%"
        helper="classifier certainty"
        accentColor="var(--success-green)"
        bar={{
          value: averageConfidence * 100,
          max: 100,
          color: "var(--success-green)",
        }}
      />
      <KpiCard
        label="Open issues"
        value={String(openIssues)}
        helper={openIssues === 0 ? "all clear" : "needs attention"}
        accentColor={issueAccent}
        pulse={openIssues > 0}
      />
    </section>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  suffix?: string;
  helper?: string;
  accentColor: string;
  bar?: { value: number; max: number; color: string };
  pulse?: boolean;
}

function KpiCard({ label, value, suffix, helper, accentColor, bar, pulse }: KpiCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[6px] border border-[rgba(51,51,51,0.08)] bg-white p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ borderTop: `2px solid ${accentColor}` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(51,51,51,0.55)]">
          {label}
        </p>
        {pulse ? (
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: accentColor }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: accentColor }}
            />
          </span>
        ) : null}
      </div>
      <p className="text-3xl font-bold tracking-tight" style={{ color: accentColor }}>
        {value}
        {suffix && (
          <span className="ml-0.5 text-base font-medium text-[rgba(51,51,51,0.4)]">{suffix}</span>
        )}
      </p>
      {helper ? (
        <p className="mt-1 text-[11px] text-[rgba(51,51,51,0.5)]">{helper}</p>
      ) : null}
      {bar && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(51,51,51,0.08)]">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(100, (bar.value / bar.max) * 100)}%`,
              background: bar.color,
            }}
          />
        </div>
      )}
    </div>
  );
}
