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
  user_message?: string;
  label: HealthLabel;
  confidence: number;
  explanation: string;
  greptile_context?: string;
  agent_id?: string;
  agent_name?: string;
  created_at: number;
}

export interface ChatHealth {
  label: HealthLabel;
  confidence: number;
  explanation: string;
  all_scores?: Record<string, number>;
}

export interface ChatResponse {
  reply: string;
  health: ChatHealth;
  agent_id?: string | null;
  session_id?: string;
}

export interface AgentDefinition {
  agent_id: string;
  name: string;
  description: string;
  system_prompt: string;
  task: string;
  model: string | null;
  temperature: number | null;
  created_at: number;
}

export interface AgentCreatePayload {
  name: string;
  description?: string;
  system_prompt?: string;
  task?: string;
  model?: string | null;
  temperature?: number | null;
  agent_id?: string;
}

export type AgentUpdatePayload = Partial<AgentCreatePayload>;

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
