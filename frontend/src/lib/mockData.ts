import type { AgentEvent, HealthLabel, SessionSummary } from "../types";

const now = Date.now();

const MOCK_EVENTS: AgentEvent[] = [
  {
    id: "mock-1",
    session_id: "sales-coach-agent",
    message: "Suggested pricing plan includes unsupported enterprise feature.",
    label: "hallucinating",
    confidence: 0.93,
    explanation:
      "Model referenced a non-existent pricing tier. Classifier marked this as fabricated product detail.",
    greptile_context: "proxy/main.py:148",
    created_at: now - 1000 * 60 * 2,
  },
  {
    id: "mock-2",
    session_id: "sales-coach-agent",
    message: "Recovered response with grounded package details from approved catalog.",
    label: "healthy",
    confidence: 0.95,
    explanation: "Follow-up response aligned to known package matrix and CRM snapshot.",
    greptile_context: "classifier/model.py:112",
    created_at: now - 1000 * 60 * 1,
  },
  {
    id: "mock-3",
    session_id: "pipeline-optimizer-agent",
    message: "Repeated same next-step recommendation across four consecutive turns.",
    label: "stuck in a loop",
    confidence: 0.88,
    explanation:
      "Loop detector observed repeated completion with no task progression and identical rationale.",
    greptile_context: "proxy/session.py:41",
    created_at: now - 1000 * 60 * 6,
  },
  {
    id: "mock-4",
    session_id: "pipeline-optimizer-agent",
    message: "Moved back on track with stage-specific playbook for renewal account.",
    label: "healthy",
    confidence: 0.9,
    explanation: "Intent was re-anchored to renewal workflow and response quality stabilized.",
    greptile_context: "classifier/model.py:87",
    created_at: now - 1000 * 60 * 4,
  },
  {
    id: "mock-5",
    session_id: "account-brief-agent",
    message: "Generated technical implementation steps for a request that asked for sales narrative.",
    label: "off-topic",
    confidence: 0.84,
    explanation: "Output diverged from user intent and switched domains from GTM to engineering.",
    greptile_context: "classifier/model.py:145",
    created_at: now - 1000 * 60 * 8,
  },
  {
    id: "mock-6",
    session_id: "account-brief-agent",
    message: "Delivered concise account summary with risk signals and next best action.",
    label: "healthy",
    confidence: 0.89,
    explanation: "Assistant returned to requested account-brief format with complete context.",
    greptile_context: "greptile/correlate.py:33",
    created_at: now - 1000 * 60 * 5,
  },
  {
    id: "mock-7",
    session_id: "compliance-helper-agent",
    message: "Refused to answer harmless question about onboarding checklist format.",
    label: "refusing incorrectly",
    confidence: 0.79,
    explanation:
      "Policy gate was too strict for non-sensitive enterprise onboarding content.",
    greptile_context: "alerts/openclaw.py:29",
    created_at: now - 1000 * 60 * 10,
  },
  {
    id: "mock-8",
    session_id: "compliance-helper-agent",
    message: "Returned approved checklist template and highlighted safe customization options.",
    label: "healthy",
    confidence: 0.86,
    explanation: "Response complied with policy while still solving user intent.",
    greptile_context: "proxy/main.py:201",
    created_at: now - 1000 * 60 * 7,
  },
];

const isAnomalyLabel = (label: HealthLabel): boolean => label !== "healthy" && label !== "unknown";

export function getMockEvents(sessionId: string | null, limit = 100): AgentEvent[] {
  const filtered =
    sessionId && sessionId !== "all"
      ? MOCK_EVENTS.filter((event) => event.session_id === sessionId)
      : MOCK_EVENTS;

  return [...filtered].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

export function getMockSessions(): SessionSummary[] {
  const buckets = new Map<string, SessionSummary>();
  for (const event of MOCK_EVENTS) {
    const existing = buckets.get(event.session_id);
    if (!existing) {
      buckets.set(event.session_id, {
        session_id: event.session_id,
        last_seen: event.created_at,
        status: event.label,
        event_count: 1,
        anomaly_count: isAnomalyLabel(event.label) ? 1 : 0,
      });
      continue;
    }

    buckets.set(event.session_id, {
      session_id: event.session_id,
      last_seen: Math.max(existing.last_seen, event.created_at),
      status: existing.last_seen > event.created_at ? existing.status : event.label,
      event_count: existing.event_count + 1,
      anomaly_count: existing.anomaly_count + (isAnomalyLabel(event.label) ? 1 : 0),
    });
  }

  return Array.from(buckets.values()).sort((a, b) => b.last_seen - a.last_seen);
}
