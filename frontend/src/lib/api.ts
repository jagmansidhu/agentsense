import type {
  AgentCreatePayload,
  AgentDefinition,
  AgentUpdatePayload,
  ChatResponse,
  ProxyEventsResponse,
  ProxySessionsResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const makeUrl = (path: string) => `${API_BASE}${path}`;

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (data?.detail) return JSON.stringify(data.detail);
    return JSON.stringify(data);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function fetchEvents(sessionId: string | null, limit = 100): Promise<ProxyEventsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (sessionId && sessionId !== "all") {
    params.set("session_id", sessionId);
  }
  const response = await fetch(makeUrl(`/proxy/events?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Failed to load events (${response.status})`);
  }
  const payload = (await response.json()) as ProxyEventsResponse;
  return {
    events: payload.events.map((event) => ({
      ...event,
      id: event.id ?? crypto.randomUUID(),
      created_at: Number(event.created_at ?? Date.now()),
    })),
  };
}

export async function fetchSessions(): Promise<ProxySessionsResponse> {
  const response = await fetch(makeUrl("/proxy/sessions"));
  if (!response.ok) {
    throw new Error(`Failed to load sessions (${response.status})`);
  }
  return response.json();
}

export interface SendChatPayload {
  session_id: string;
  message: string;
  agent_id?: string;
}

export async function sendChat(payload: SendChatPayload): Promise<ChatResponse> {
  const response = await fetch(makeUrl("/proxy/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as ChatResponse;
}

export async function fetchAgents(): Promise<AgentDefinition[]> {
  const response = await fetch(makeUrl("/proxy/agents"));
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const data = (await response.json()) as { agents: AgentDefinition[] };
  return data.agents ?? [];
}

export async function createAgent(payload: AgentCreatePayload): Promise<AgentDefinition> {
  const response = await fetch(makeUrl("/proxy/agents"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as AgentDefinition;
}

export async function updateAgent(
  agentId: string,
  payload: AgentUpdatePayload,
): Promise<AgentDefinition> {
  const response = await fetch(makeUrl(`/proxy/agents/${encodeURIComponent(agentId)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as AgentDefinition;
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(makeUrl(`/proxy/agents/${encodeURIComponent(agentId)}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
