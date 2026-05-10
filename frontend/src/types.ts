export type HealthLabel =
  | "healthy"
  | "hallucinating"
  | "stuck in a loop"
  | "off-topic"
  | "refusing incorrectly"
  | "unknown";

export interface AgentEvent {
  id: string;
  session_id: string;
  message: string;
  label: HealthLabel;
  confidence: number;
  explanation: string;
  greptile_context?: string;
  created_at: number;
}

export interface SessionSummary {
  session_id: string;
  last_seen: number;
  status: HealthLabel;
  event_count: number;
  anomaly_count: number;
}

export interface ProxyEventsResponse {
  events: AgentEvent[];
}

export interface ProxySessionsResponse {
  sessions: SessionSummary[];
  session_ids: string[];
}
