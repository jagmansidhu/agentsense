import { summarizeAgentMetrics } from "../lib/agentInsights";
import type { AgentEvent } from "../types";

interface Props {
  events: AgentEvent[];
}

export function StatsBar({ events }: Props) {
  const { averageHealth, averageConfidence, openIssues } = summarizeAgentMetrics(events);

  return (
    <section className="grid animate-fade-up gap-3 md:grid-cols-3">
      <KpiCard
        label="Average Health"
        value={`${averageHealth.toFixed(0)}`}
        suffix="/100"
        accentColor="var(--business-blue)"
        bar={{ value: averageHealth, max: 100, color: "var(--business-blue)" }}
      />
      <KpiCard
        label="Average Confidence"
        value={`${(averageConfidence * 100).toFixed(1)}`}
        suffix="%"
        accentColor="var(--success-green)"
        bar={{ value: averageConfidence * 100, max: 100, color: "var(--success-green)" }}
      />
      <KpiCard
        label="Open Issues"
        value={String(openIssues)}
        accentColor={openIssues > 0 ? "var(--warm-orange)" : "var(--success-green)"}
      />
    </section>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  suffix?: string;
  accentColor: string;
  bar?: { value: number; max: number; color: string };
}

function KpiCard({ label, value, suffix, accentColor, bar }: KpiCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[4px] border border-[rgba(51,51,51,0.1)] bg-white p-5 shadow-[var(--shadow-card)]"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[rgba(51,51,51,0.55)]">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight" style={{ color: accentColor }}>
        {value}
        {suffix && (
          <span className="ml-0.5 text-base font-medium text-[rgba(51,51,51,0.4)]">{suffix}</span>
        )}
      </p>
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
