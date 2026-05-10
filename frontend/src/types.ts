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
  message?: string;
  turn_id?: string;
  agent_id?: string;
  thinking_excerpt?: string;
  output_excerpt?: string;
  action?: string;
  tool_count?: number;
  label: HealthLabel;
  confidence: number;
  explanation: string;
  created_at: number;
}

export interface SessionSummary {
  session_id: string;
  last_seen: number;
  status: HealthLabel;
  event_count: number;
  anomaly_count: number;
}

export interface TurnDetail {
  turn_id: string;
  session_id: string;
  turn_index: number;
  thinking: string;
  action: string;
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
  output: string;
  user_goal: string;
  created_at: number;
  health: {
    label: HealthLabel;
    confidence: number;
    explanation: string;
  };
}

export interface TurnsResponse {
  turns: TurnDetail[];
}

export interface ProxyEventsResponse {
  events: AgentEvent[];
}

export interface ProxySessionsResponse {
  sessions: SessionSummary[];
  session_ids: string[];
}
