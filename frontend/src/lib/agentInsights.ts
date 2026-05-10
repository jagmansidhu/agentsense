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
}

const LABEL_HEALTH_SCORE: Record<HealthLabel, number> = {
  healthy: 96,
  hallucinating: 22,
  "stuck in a loop": 38,
  "off-topic": 55,
  "refusing incorrectly": 44,
  unknown: 60,
};

const ISSUE_GUIDANCE: Record<
  Exclude<HealthLabel, "healthy" | "unknown">,
  { title: string; fix: string; priority: "high" | "medium" | "low" }
> = {
  hallucinating: {
    title: "Hallucinated Business Claim",
    fix:
      "Restrict replies to known CRM fields, require citations in generated answers, and add a low-confidence fallback response.",
    priority: "high",
  },
  "stuck in a loop": {
    title: "Looping Response Pattern",
    fix:
      "Add loop-break logic after repeated intents, inject a fresh task summary, and force next-step planning tokens.",
    priority: "medium",
  },
  "off-topic": {
    title: "Context Drift",
    fix:
      "Re-anchor the system prompt to user objective, include current session goal in every turn, and validate topic alignment before respond.",
    priority: "medium",
  },
  "refusing incorrectly": {
    title: "Over-Strict Refusal",
    fix:
      "Tune refusal policy boundaries and add a safe-completion pathway for benign business requests.",
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
      latestMessage: latest.output_excerpt ?? latest.thinking_excerpt ?? "",
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
        detail: event.explanation || event.output_excerpt || event.thinking_excerpt || "",
        suggestedFix: issueMeta.fix,
        priority: issueMeta.priority,
        confidence: event.confidence,
        createdAt: event.created_at,
      };
    });
}

export function summarizeAgentMetrics(events: AgentEvent[]): {
  averageHealth: number;
  averageConfidence: number;
  openIssues: number;
} {
  const snapshots = buildAgentSnapshots(events);
  if (snapshots.length === 0) {
    return { averageHealth: 0, averageConfidence: 0, openIssues: 0 };
  }

  const averageHealth =
    snapshots.reduce((sum, snapshot) => sum + snapshot.healthScore, 0) / snapshots.length;
  const averageConfidence =
    snapshots.reduce((sum, snapshot) => sum + snapshot.averageConfidence, 0) / snapshots.length;
  const openIssues = snapshots.reduce((sum, snapshot) => sum + snapshot.openIssues, 0);

  return { averageHealth, averageConfidence, openIssues };
}
