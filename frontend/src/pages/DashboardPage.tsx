import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnomalyChart } from "../components/AnomalyChart";
import { EventFeed } from "../components/EventFeed";
import { HealthBadge } from "../components/HealthBadge";
import { LabelDonut } from "../components/LabelDonut";
import { StatsBar } from "../components/StatsBar";
import type { AgentIssue } from "../lib/agentInsights";
import { buildAgentIssues, buildAgentSnapshots } from "../lib/agentInsights";
import { getVisibleEvents, useDashboardStore } from "../lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export function DashboardPage() {
  const events = useDashboardStore((state) => state.events);
  const dataSource = useDashboardStore((state) => state.dataSource);
  const sessions = useDashboardStore((state) => state.sessions);
  const selectedSessionId = useDashboardStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useDashboardStore((state) => state.setSelectedSessionId);
  const hydrate = useDashboardStore((state) => state.hydrate);
  const loading = useDashboardStore((state) => state.loading);
  const error = useDashboardStore((state) => state.error);
  const visibleEvents = getVisibleEvents(events, selectedSessionId);
  const [selectedIssueId, setSelectedIssueId] = useState<string>("");

  useEffect(() => {
    void hydrate(selectedSessionId);
  }, [hydrate, selectedSessionId]);

  const agentSnapshots = useMemo(
    () => buildAgentSnapshots(visibleEvents),
    [visibleEvents],
  );
  const issues = useMemo(() => buildAgentIssues(visibleEvents), [visibleEvents]);

  useEffect(() => {
    if (!issues.length) {
      setSelectedIssueId("");
      return;
    }
    if (!issues.some((issue) => issue.issueId === selectedIssueId)) {
      setSelectedIssueId(issues[0].issueId);
    }
  }, [issues, selectedIssueId]);

  const selectedIssue = issues.find((issue) => issue.issueId === selectedIssueId);

  return (
    <div className="grid gap-5">
      <header className="grid animate-fade-up gap-3 rounded-[6px] border border-[rgba(51,51,51,0.08)] bg-gradient-to-br from-white to-[rgba(0,161,224,0.04)] p-5 shadow-[var(--shadow-card)] md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,161,224,0.25)] bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-blue)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--business-blue)]" />
              live monitor
            </span>
            {dataSource === "mock" ? (
              <span className="inline-flex items-center rounded-full bg-[rgba(255,165,0,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--warm-orange)]">
                mock data
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Agent behavioral health
          </h1>
          <p className="max-w-[68ch] text-sm text-[rgba(51,51,51,0.7)]">
            Every assistant turn is intercepted, classified, and scored in real time.
            Catch agents looping on phantom failures, hallucinating data they can't access,
            drifting off task, or refusing harmless requests — before users notice or credits drain.
          </p>
          {error ? (
            <p className="mt-1 text-xs text-[rgb(220,38,38)]">{error}</p>
          ) : loading ? (
            <p className="mt-1 text-xs text-[rgba(51,51,51,0.55)]">Refreshing monitoring state…</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(51,51,51,0.55)]">
            Scope
          </label>
          <select
            className="h-9 rounded-[4px] border border-[rgba(51,51,51,0.18)] bg-white px-3 text-sm text-[var(--dark-grey)] focus:border-[var(--business-blue)] focus:outline-none"
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.target.value)}
          >
            <option value="all">All agents</option>
            {sessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id}
              </option>
            ))}
          </select>
          <Link
            to={
              sessions[0]
                ? `/session/${encodeURIComponent(sessions[0].session_id)}`
                : "/session/all"
            }
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-[4px] border border-[rgba(0,161,224,0.35)] bg-white px-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--business-blue)] transition-all hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]"
          >
            Open sessions
          </Link>
        </div>
      </header>

      <StatsBar events={visibleEvents} />

      <div className="grid animate-fade-up gap-4 lg:grid-cols-[1.4fr_minmax(0,1fr)]">
        <AnomalyChart events={visibleEvents} />
        <LabelDonut events={visibleEvents} />
      </div>

      <div className="grid animate-fade-up gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Agents in scope</CardTitle>
          </CardHeader>
          <CardContent>
            {agentSnapshots.length === 0 ? (
              <p className="text-sm text-[rgba(51,51,51,0.6)]">
                No agents have produced traffic yet. Start one in the playground.
              </p>
            ) : (
              <ul className="grid gap-2.5">
                {agentSnapshots.map((agent) => (
                  <li
                    key={agent.agentId}
                    className="grid gap-2 rounded-[6px] border border-[rgba(51,51,51,0.08)] bg-white p-3 transition-all hover:border-[rgba(0,161,224,0.3)] hover:shadow-[var(--shadow-light)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="grid gap-0.5">
                        <p className="text-sm font-semibold text-[var(--dark-grey)]">
                          {agent.agentId}
                        </p>
                        <p className="text-[11px] text-[rgba(51,51,51,0.5)]">
                          last seen {timeAgo(agent.lastUpdatedAt)}
                        </p>
                      </div>
                      <HealthBadge label={agent.latestLabel} />
                    </div>
                    <p className="line-clamp-2 text-xs text-[rgba(51,51,51,0.7)]">
                      {agent.latestMessage}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-[rgba(51,51,51,0.6)]">
                      <Metric
                        label="health"
                        value={`${agent.healthScore.toFixed(0)}/100`}
                        accent={agent.healthScore >= 70 ? "var(--success-green)" : "var(--warm-orange)"}
                      />
                      <Metric
                        label="confidence"
                        value={`${(agent.averageConfidence * 100).toFixed(0)}%`}
                      />
                      <Metric
                        label="issues"
                        value={String(agent.openIssues)}
                        accent={agent.openIssues === 0 ? "var(--success-green)" : "rgb(220,38,38)"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Issue queue</CardTitle>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(51,51,51,0.55)]">
              {issues.length} open
            </span>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <div className="grid place-items-center gap-1 rounded-[4px] border border-dashed border-[rgba(0,128,0,0.25)] bg-[rgba(0,128,0,0.04)] py-8 text-center text-sm text-[rgba(0,128,0,0.85)]">
                <span className="text-base">✓</span>
                No anomalies detected — all agents healthy.
              </div>
            ) : (
              <ul className="grid gap-2">
                {issues.map((issue) => (
                  <li key={issue.issueId}>
                    <button
                      type="button"
                      onClick={() => setSelectedIssueId(issue.issueId)}
                      className={`grid w-full cursor-pointer gap-1 rounded-[6px] border p-3 text-left transition-all ${
                        selectedIssueId === issue.issueId
                          ? "border-[var(--business-blue)] bg-[rgba(0,161,224,0.06)] shadow-[var(--shadow-light)]"
                          : "border-[rgba(51,51,51,0.08)] bg-white hover:-translate-y-px hover:border-[rgba(0,161,224,0.25)] hover:bg-[rgba(0,161,224,0.03)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--dark-grey)]">
                          {issue.title}
                        </p>
                        <PriorityPill priority={issue.priority} />
                      </div>
                      <p className="text-[11px] text-[rgba(51,51,51,0.6)]">
                        {issue.agentId} · {(issue.confidence * 100).toFixed(0)}% confidence ·{" "}
                        {timeAgo(issue.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedIssue ? (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Issue detail</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueDetail issue={selectedIssue} />
          </CardContent>
        </Card>
      ) : null}

      <EventFeed events={visibleEvents} dataSource={dataSource} />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(51,51,51,0.45)]">
        {label}
      </span>
      <span
        className="text-xs font-semibold"
        style={{ color: accent ?? "var(--dark-grey)" }}
      >
        {value}
      </span>
    </div>
  );
}

function IssueDetail({ issue }: { issue: AgentIssue }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold">{issue.title}</p>
        <HealthBadge label={issue.label} />
      </div>
      <p className="text-sm text-[rgba(51,51,51,0.78)]">{issue.detail}</p>
      <div className="grid gap-2 rounded-[6px] border border-[rgba(51,51,51,0.08)] bg-[rgba(248,250,252,0.7)] p-3 text-sm sm:grid-cols-2">
        <DetailRow label="Agent" value={issue.agentId} mono />
        <DetailRow label="Detected" value={new Date(issue.createdAt).toLocaleString()} />
        <DetailRow
          label="Confidence"
          value={`${(issue.confidence * 100).toFixed(1)}%`}
        />
        {issue.greptileContext ? (
          <DetailRow label="Code context" value={issue.greptileContext} mono />
        ) : null}
      </div>
      <div className="rounded-[6px] border border-[rgba(0,161,224,0.25)] bg-[rgba(0,161,224,0.06)] p-3 text-sm text-[rgba(51,51,51,0.82)]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-blue)]">
          Suggested fix
        </p>
        {issue.suggestedFix}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <p className="grid gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(51,51,51,0.5)]">
        {label}
      </span>
      <span
        className={`text-[var(--dark-grey)] ${mono ? "font-mono text-[12px]" : "text-sm"}`}
      >
        {value}
      </span>
    </p>
  );
}

function PriorityPill({ priority }: { priority: AgentIssue["priority"] }) {
  const classes =
    priority === "high"
      ? "border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.08)] text-[rgb(220,38,38)]"
      : priority === "medium"
        ? "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-[rgb(180,83,9)]"
        : "border-[rgba(0,161,224,0.35)] bg-[rgba(0,161,224,0.08)] text-[var(--business-blue)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${classes}`}
    >
      {priority}
    </span>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
