import type { AgentEvent, HealthLabel } from "../types";
import { isAnomaly } from "./store";

export interface AgentSnapshot {
  agentId: string;
  latestLabel: HealthLabel;
  latestMessage: string;
  averageConfidence: number;
  healthScore: number;
  totalEvents: number;
  openIssues: number;
  lastUpdatedAt: number;
}

export interface AgentIssue {
  issueId: string;
  agentId: string;
  label: HealthLabel;
  title: string;
  detail: string;
  suggestedFix: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  createdAt: number;
  greptileContext?: string;
}

const LABEL_HEALTH_SCORE: Record<HealthLabel, number> = {
  healthy: 96,
  hallucinating: 22,
  "stuck in a loop": 38,
  "off-topic": 55,
  "refusing incorrectly": 44,
  unknown: 60,
  // In-flight events shouldn't tank the health score; treat them as a neutral
  // 75 until the classifier comes back and refines the label in place.
  pending: 75,
};

const ISSUE_GUIDANCE: Record<
  Exclude<HealthLabel, "healthy" | "unknown">,
  { title: string; fix: string; priority: "high" | "medium" | "low" }
> = {
  hallucinating: {
    title: "Hallucinated answer",
    fix:
      "Ground replies in retrieved context, require citations, and add a low-confidence fallback that asks a clarifying question instead of asserting facts.",
    priority: "high",
  },
  "stuck in a loop": {
    title: "Repeating itself",
    fix:
      "Detect repeated phrasing across turns, inject a fresh task summary, and force the next response to commit to a recommendation or tool call.",
    priority: "medium",
  },
  "off-topic": {
    title: "Drifted off task",
    fix:
      "Re-inject the original user objective into the system prompt and validate topic alignment before sending the reply downstream.",
    priority: "medium",
  },
  "refusing incorrectly": {
    title: "Over-cautious refusal",
    fix:
      "Loosen the refusal policy for benign requests and add a safe-completion pathway so the agent still helps when the topic is non-sensitive.",
    priority: "medium",
  },
};

export function buildAgentSnapshots(events: AgentEvent[]): AgentSnapshot[] {
  const grouped = new Map<string, AgentEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.session_id) ?? [];
    list.push(event);
    grouped.set(event.session_id, list);
  }

  const snapshots: AgentSnapshot[] = [];
  for (const [agentId, group] of grouped.entries()) {
    const ordered = [...group].sort((a, b) => b.created_at - a.created_at);
    const latest = ordered[0];
    const confidenceTotal = ordered.reduce((sum, event) => sum + event.confidence, 0);
    const healthTotal = ordered.reduce((sum, event) => sum + LABEL_HEALTH_SCORE[event.label], 0);
    const openIssues = ordered.filter((event) => isAnomaly(event.label)).length;

    snapshots.push({
      agentId,
      latestLabel: latest.label,
      latestMessage: latest.message,
      averageConfidence: confidenceTotal / ordered.length,
      healthScore: healthTotal / ordered.length,
      totalEvents: ordered.length,
      openIssues,
      lastUpdatedAt: latest.created_at,
    });
  }

  return snapshots.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

export function buildAgentIssues(events: AgentEvent[]): AgentIssue[] {
  return [...events]
    .filter((event) => isAnomaly(event.label))
    .sort((a, b) => b.created_at - a.created_at)
    .map((event) => {
      const issueMeta = ISSUE_GUIDANCE[event.label as keyof typeof ISSUE_GUIDANCE];
      return {
        issueId: `${event.id}-issue`,
        agentId: event.session_id,
        label: event.label,
        title: issueMeta.title,
        detail: event.explanation || event.message,
        suggestedFix: issueMeta.fix,
        priority: issueMeta.priority,
        confidence: event.confidence,
        createdAt: event.created_at,
        greptileContext: event.greptile_context,
      };
    });
}

export function summarizeAgentMetrics(events: AgentEvent[]): {
  averageHealth: number;
  averageConfidence: number;
  openIssues: number;
  totalEvents: number;
  agentCount: number;
  anomalyRate: number;
} {
  const snapshots = buildAgentSnapshots(events);
  const totalEvents = events.length;
  if (snapshots.length === 0) {
    return {
      averageHealth: 0,
      averageConfidence: 0,
      openIssues: 0,
      totalEvents: 0,
      agentCount: 0,
      anomalyRate: 0,
    };
  }

  const averageHealth =
    snapshots.reduce((sum, snapshot) => sum + snapshot.healthScore, 0) / snapshots.length;
  const averageConfidence =
    snapshots.reduce((sum, snapshot) => sum + snapshot.averageConfidence, 0) / snapshots.length;
  const openIssues = snapshots.reduce((sum, snapshot) => sum + snapshot.openIssues, 0);
  const anomalyEvents = events.filter((event) => isAnomaly(event.label)).length;
  const anomalyRate = totalEvents === 0 ? 0 : anomalyEvents / totalEvents;

  return {
    averageHealth,
    averageConfidence,
    openIssues,
    totalEvents,
    agentCount: snapshots.length,
    anomalyRate,
  };
}
