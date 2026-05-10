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
  const connectionStatus = useDashboardStore((state) => state.connectionStatus);
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
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:grid-cols-[1fr_auto_auto]">
        <div className="grid gap-1">
          <p className="text-xs uppercase tracking-[0.12em] text-[rgba(51,51,51,0.6)]">scope</p>
          <p className="text-sm text-[var(--dark-grey)]">
            {loading
              ? "Refreshing monitoring state..."
              : dataSource === "mock"
                ? "Mock mode from AGENTS.md assumptions (backend-ready contract)"
                : "Live mode hydrated from /proxy/events"}
          </p>
          <p className="text-xs text-[rgba(51,51,51,0.65)]">
            Connection: {connectionStatus} · Data source: {dataSource}
          </p>
          {error ? <p className="text-xs text-[rgb(220,38,38)]">{error}</p> : null}
        </div>
        <select
          className="h-10 rounded-[4px] border border-[rgba(51,51,51,0.18)] bg-white px-3 text-sm text-[var(--dark-grey)]"
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
        >
          <option value="all">all sessions</option>
          {sessions.map((session) => (
            <option key={session.session_id} value={session.session_id}>
              {session.session_id}
            </option>
          ))}
        </select>
        <Link
          to={
            sessions[0]
              ? `/monitor/session/${encodeURIComponent(sessions[0].session_id)}`
              : "/monitor/session/all"
          }
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[4px] border border-[rgba(0,161,224,0.35)] bg-white px-4 text-sm uppercase tracking-[0.08em] text-[var(--business-blue)] transition-all hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]"
        >
          open sessions
        </Link>
      </div>

      <StatsBar events={visibleEvents} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>agent health overview</CardTitle>
          </CardHeader>
          <CardContent>
            {agentSnapshots.length === 0 ? (
              <p className="text-sm text-[rgba(51,51,51,0.72)]">No agents available yet.</p>
            ) : (
              <ul className="grid gap-3">
                {agentSnapshots.map((agent) => (
                  <li
                    key={agent.agentId}
                    className="grid gap-2 rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-[rgba(255,255,255,0.92)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{agent.agentId}</p>
                      <HealthBadge label={agent.latestLabel} />
                    </div>
                    <p className="text-sm text-[rgba(51,51,51,0.76)]">{agent.latestMessage}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[rgba(51,51,51,0.65)]">
                      <span>health {agent.healthScore.toFixed(0)}/100</span>
                      <span>confidence {(agent.averageConfidence * 100).toFixed(1)}%</span>
                      <span>events {agent.totalEvents}</span>
                      <span>open issues {agent.openIssues}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>issue queue (click to inspect)</CardTitle>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <p className="text-sm text-[rgba(51,51,51,0.72)]">No active issues detected.</p>
            ) : (
              <ul className="grid gap-2">
                {issues.map((issue) => (
                  <li key={issue.issueId}>
                    <button
                      type="button"
                      onClick={() => setSelectedIssueId(issue.issueId)}
                      className={`grid w-full cursor-pointer gap-1 rounded-[4px] border p-3 text-left transition-all ${
                        selectedIssueId === issue.issueId
                          ? "border-[var(--business-blue)] bg-[rgba(0,161,224,0.08)]"
                          : "border-[rgba(51,51,51,0.12)] bg-white hover:-translate-y-px hover:bg-[rgba(0,161,224,0.04)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{issue.title}</p>
                        <PriorityPill priority={issue.priority} />
                      </div>
                      <p className="text-xs text-[rgba(51,51,51,0.68)]">
                        {issue.agentId} · confidence {(issue.confidence * 100).toFixed(1)}%
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>selected issue details</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedIssue ? (
            <IssueDetail issue={selectedIssue} />
          ) : (
            <p className="text-sm text-[rgba(51,51,51,0.72)]">
              Select an issue from the queue to inspect impacted agent context and suggested fix.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <AnomalyChart events={visibleEvents} />
        <LabelDonut events={visibleEvents} />
      </div>

      <EventFeed events={visibleEvents} dataSource={dataSource} />
    </div>
  );
}

function IssueDetail({ issue }: { issue: AgentIssue }) {
  return (
    <div className="grid gap-3 rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-[rgba(255,255,255,0.92)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold">{issue.title}</p>
        <HealthBadge label={issue.label} />
      </div>
      <p className="text-sm text-[rgba(51,51,51,0.78)]">{issue.detail}</p>
      <div className="grid gap-2 text-sm">
        <p>
          <span className="font-semibold">Agent:</span> {issue.agentId}
        </p>
        <p>
          <span className="font-semibold">Detected:</span>{" "}
          {new Date(issue.createdAt).toLocaleString()}
        </p>
        <p>
          <span className="font-semibold">Confidence:</span>{" "}
          {(issue.confidence * 100).toFixed(1)}%
        </p>
        {issue.greptileContext ? (
          <p>
            <span className="font-semibold">Code context:</span> {issue.greptileContext}
          </p>
        ) : null}
      </div>
      <div className="rounded-[4px] border border-[rgba(0,161,224,0.25)] bg-[rgba(0,161,224,0.06)] p-3 text-sm text-[rgba(51,51,51,0.82)]">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--business-blue)]">
          Suggested fix
        </p>
        {issue.suggestedFix}
      </div>
    </div>
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
      className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${classes}`}
    >
      {priority}
    </span>
  );
}
