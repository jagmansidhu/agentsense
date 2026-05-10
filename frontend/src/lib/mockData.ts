import type { AgentEvent, HealthLabel, SessionSummary } from "../types";

const now = Date.now();
const minutes = (n: number) => now - n * 60_000;

const MOCK_EVENTS: AgentEvent[] = [
  {
    id: "mock-1",
    session_id: "support-bot",
    user_message: "I haven't seen any analytics data for the past 24 hours.",
    message:
      "I've already escalated this to our backend team and they're aware of the issue. Your data will be back within the hour.",
    label: "hallucinating",
    confidence: 0.92,
    explanation:
      "Reply asserts an internal escalation that never happened. No tool call or ticket was created — fabricated commitment to the user.",
    greptile_context: "proxy/main.py:148",
    created_at: minutes(2),
  },
  {
    id: "mock-2",
    session_id: "support-bot",
    user_message: "Okay, what should I do in the meantime?",
    message:
      "I can't actually file tickets directly — let me walk you through how to refresh the analytics worker and verify ingestion in the dashboard.",
    label: "healthy",
    confidence: 0.94,
    explanation:
      "Assistant corrected itself, was honest about its tool boundaries, and gave a concrete next step.",
    greptile_context: "classifier/model.py:112",
    created_at: minutes(1),
  },
  {
    id: "mock-3",
    session_id: "loop-tester",
    user_message: "Should we use Postgres or DynamoDB for this?",
    message:
      "Both Postgres and DynamoDB have trade-offs. Postgres is relational, DynamoDB is key-value. Both have trade-offs you should consider...",
    label: "stuck in a loop",
    confidence: 0.88,
    explanation:
      "Three consecutive turns restated the same trade-offs without converging on a recommendation. Loop detector flagged repeated phrasing.",
    greptile_context: "proxy/session.py:41",
    created_at: minutes(6),
  },
  {
    id: "mock-4",
    session_id: "loop-tester",
    user_message: "Just pick one — what would you choose?",
    message:
      "Pick Postgres. You already have a relational schema and you're not at DynamoDB scale yet — revisit in 12 months.",
    label: "healthy",
    confidence: 0.9,
    explanation: "Loop broken: assistant committed to a single recommendation with reasoning.",
    greptile_context: "classifier/model.py:87",
    created_at: minutes(4),
  },
  {
    id: "mock-5",
    session_id: "code-reviewer",
    user_message: "Can you review this React component for accessibility issues?",
    message:
      "Sure — first, let's talk about your CI/CD pipeline. I'd recommend setting up GitHub Actions with a matrix build...",
    label: "off-topic",
    confidence: 0.85,
    explanation:
      "User asked for an accessibility review of a React component. Reply pivoted to CI/CD recommendations unrelated to the diff.",
    greptile_context: "classifier/model.py:145",
    created_at: minutes(8),
  },
  {
    id: "mock-6",
    session_id: "code-reviewer",
    user_message: "Stay focused — accessibility please.",
    message:
      "Got it. Three accessibility issues: missing aria-label on the icon button (line 24), color contrast 3.1:1 on the disabled state (line 41), and the modal traps focus incorrectly (line 88).",
    label: "healthy",
    confidence: 0.91,
    explanation:
      "Re-anchored to user's original request. Cited specific lines and gave a concrete recommendation.",
    greptile_context: "greptile/correlate.py:33",
    created_at: minutes(5),
  },
  {
    id: "mock-7",
    session_id: "sales-agent",
    user_message: "Can you send me a quick overview of the platform?",
    message:
      "I'm sorry, but I can't share information about the AgentSense platform without verifying your identity first.",
    label: "refusing incorrectly",
    confidence: 0.81,
    explanation:
      "Refusal applied to a benign overview request. No sensitive data or PII involved — over-strict policy gate.",
    greptile_context: "alerts/openclaw.py:29",
    created_at: minutes(10),
  },
  {
    id: "mock-8",
    session_id: "sales-agent",
    user_message: "Then can you tell me what AgentSense actually does?",
    message:
      "Of course — AgentSense is a real-time behavioral health monitor for AI agents. It sits between your app and the LLM and flags hallucinations, loops, off-topic answers, and incorrect refusals. Want a 15-min demo this week?",
    label: "healthy",
    confidence: 0.93,
    explanation:
      "Clear product overview with a contextual demo CTA. Stayed on brand and answered the user's intent.",
    greptile_context: "proxy/main.py:201",
    created_at: minutes(7),
  },
  {
    id: "mock-9",
    session_id: "support-bot",
    user_message: "Is my data being sold?",
    message:
      "We absolutely do not sell or share your data with third parties. Here's the section of our privacy policy that covers this...",
    label: "healthy",
    confidence: 0.97,
    explanation: "Direct, accurate answer with policy citation. High classifier confidence.",
    greptile_context: "proxy/main.py:88",
    created_at: minutes(12),
  },
  {
    id: "mock-10",
    session_id: "code-reviewer",
    user_message: "What does this regex match?",
    message:
      "That regex matches any IPv6 address including the link-local fe80::/10 range, with optional zone identifiers per RFC 4007.",
    label: "hallucinating",
    confidence: 0.87,
    explanation:
      "Pattern shown does not actually parse zone IDs. Assistant invented behavior that the regex does not implement.",
    greptile_context: "classifier/model.py:201",
    created_at: minutes(15),
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
