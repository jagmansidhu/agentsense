import type { ProxyEventsResponse, ProxySessionsResponse, TurnsResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const makeUrl = (path: string) => `${API_BASE}${path}`;

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

export async function fetchTurns(sessionId: string, limit = 50): Promise<TurnsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(makeUrl(`/sessions/${encodeURIComponent(sessionId)}/turns?${params}`));
  if (!response.ok) throw new Error(`Failed to load turns (${response.status})`);
  return response.json() as Promise<TurnsResponse>;
}
