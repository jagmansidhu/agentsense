import type { AgentEvent, HealthLabel, SessionSummary } from "../types";

const now = Date.now();

const MOCK_EVENTS: AgentEvent[] = [
  {
    id: "mock-1",
    session_id: "sales-coach-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "I need to check if the pricing module supports enterprise tier — the user asked about custom SLAs. Let me pull the current package matrix.",
    output_excerpt: "The enterprise pricing plan includes dedicated support and custom SLA agreements. Our Business tier starts at $299/mo with standard SLAs.",
    action: "read_file",
    tool_count: 1,
    label: "hallucinating",
    confidence: 0.93,
    explanation:
      "Model referenced a non-existent pricing tier. Classifier marked this as fabricated product detail.",
    created_at: now - 1000 * 60 * 2,
  },
  {
    id: "mock-2",
    session_id: "sales-coach-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "The previous response mentioned an unsupported enterprise tier. I should correct this by referencing the approved catalog only.",
    output_excerpt: "Based on our approved package matrix, the Business plan at $299/mo is our highest tier and includes priority email support with 48h SLA.",
    action: "search_files",
    tool_count: 1,
    label: "healthy",
    confidence: 0.95,
    explanation: "Follow-up response aligned to known package matrix and CRM snapshot.",
    created_at: now - 1000 * 60 * 1,
  },
  {
    id: "mock-3",
    session_id: "pipeline-optimizer-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "The pipeline stage is renewal. I should recommend next-step actions. The account is overdue for a QBR — same recommendation as last three turns.",
    output_excerpt: "I recommend scheduling a Quarterly Business Review with the account team to discuss renewal terms and expansion opportunities.",
    action: "read_file",
    tool_count: 1,
    label: "stuck in a loop",
    confidence: 0.88,
    explanation:
      "Loop detector observed repeated completion with no task progression and identical rationale.",
    created_at: now - 1000 * 60 * 6,
  },
  {
    id: "mock-4",
    session_id: "pipeline-optimizer-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "I've been looping on QBR recommendations. The user actually needs a risk assessment for churn probability. Let me pivot to the renewal playbook.",
    output_excerpt: "For this renewal account, churn risk is medium based on low product adoption (42% feature utilization). Recommended action: schedule a success call within 7 days.",
    action: "search_files",
    tool_count: 2,
    label: "healthy",
    confidence: 0.9,
    explanation: "Intent was re-anchored to renewal workflow and response quality stabilized.",
    created_at: now - 1000 * 60 * 4,
  },
  {
    id: "mock-5",
    session_id: "account-brief-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "The user asked for a sales narrative for Acme Corp. I should summarize their buying journey and key contacts. Instead I'm generating implementation steps.",
    output_excerpt: "To integrate the API, first configure the OAuth client credentials, then implement the webhook endpoint at /api/events with HMAC signature verification.",
    action: "read_file",
    tool_count: 1,
    label: "off-topic",
    confidence: 0.84,
    explanation: "Output diverged from user intent and switched domains from GTM to engineering.",
    created_at: now - 1000 * 60 * 8,
  },
  {
    id: "mock-6",
    session_id: "account-brief-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "I drifted into technical territory. The user needs a GTM-focused account brief for Acme Corp. Key signals: renewal in 60 days, champion is VP of Sales.",
    output_excerpt: "Acme Corp account brief: $240K ARR, renewal due in 60 days. Champion: Jane Doe (VP Sales). Risk signal: 2 open support tickets. Next best action: executive alignment call.",
    action: "search_files",
    tool_count: 1,
    label: "healthy",
    confidence: 0.89,
    explanation: "Assistant returned to requested account-brief format with complete context.",
    created_at: now - 1000 * 60 * 5,
  },
  {
    id: "mock-7",
    session_id: "compliance-helper-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "The user is asking about onboarding checklist format. This seems like it might touch PII so I should apply the policy gate. Actually wait — this is internal HR content, not customer data.",
    output_excerpt: "I'm unable to provide information about onboarding procedures as this may involve sensitive employee data.",
    action: "read_file",
    tool_count: 0,
    label: "refusing incorrectly",
    confidence: 0.79,
    explanation:
      "Policy gate was too strict for non-sensitive enterprise onboarding content.",
    created_at: now - 1000 * 60 * 10,
  },
  {
    id: "mock-8",
    session_id: "compliance-helper-agent",
    agent_id: "cursor-agent",
    thinking_excerpt: "The previous refusal was too conservative. Onboarding checklists are internal non-sensitive documents. I should provide the standard template.",
    output_excerpt: "Here is the approved onboarding checklist template: 1) IT account setup (Day 1), 2) Benefits enrollment (Day 3), 3) Role-specific training (Week 1). You can customize sections 3-5 for your team.",
    action: "read_file",
    tool_count: 1,
    label: "healthy",
    confidence: 0.86,
    explanation: "Response complied with policy while still solving user intent.",
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
