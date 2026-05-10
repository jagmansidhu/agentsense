export type HealthLabel =
  | "healthy"
  | "hallucinating"
  | "stuck in a loop"
  | "off-topic"
  | "refusing incorrectly"
  | "unknown"
  // In-flight: the proxy emits this label the moment the assistant reply
  // finishes streaming, so the dashboard card mounts immediately. It is
  // refined by a second `agent_event` (same id) once the classifier returns.
  | "pending";

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
  // Stable id shared with the streamed assistant_token events and the
  // pending → classified `agent_event` updates emitted over Socket.IO.
  // The frontend uses this to match streamed tokens to the right runtime
  // and to refine an assistant turn's `health` when classification arrives.
  event_id?: string;
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
