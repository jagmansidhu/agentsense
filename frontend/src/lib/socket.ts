import { io } from "socket.io-client";
import type { AgentEvent, HealthLabel } from "../types";
import { useDashboardStore } from "./store";

const SOCKET_URL = import.meta.env.VITE_PROXY_URL ?? "http://localhost:8000";

const normalizeLabel = (value: string | undefined): HealthLabel => {
  const normalized = (value ?? "").toLowerCase().trim();
  if (
    normalized === "healthy" ||
    normalized === "hallucinating" ||
    normalized === "stuck in a loop" ||
    normalized === "off-topic" ||
    normalized === "refusing incorrectly"
  ) {
    return normalized;
  }
  return "unknown";
};

export const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  autoConnect: false,
});

let initialized = false;

export function startSocket() {
  if (initialized) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }
  initialized = true;

  socket.on("connect", () => {
    useDashboardStore.getState().setConnectionStatus("connected");
  });

  socket.on("disconnect", () => {
    useDashboardStore.getState().setConnectionStatus("disconnected");
  });

  socket.on("agent_event", (payload: Partial<AgentEvent>) => {
    const event: AgentEvent = {
      id: payload.id ?? crypto.randomUUID(),
      session_id: payload.session_id ?? "default",
      turn_id: payload.turn_id,
      agent_id: payload.agent_id,
      thinking_excerpt: payload.thinking_excerpt,
      output_excerpt: payload.output_excerpt,
      action: payload.action,
      tool_count: payload.tool_count,
      label: normalizeLabel(payload.label),
      confidence: Number(payload.confidence ?? 0),
      explanation: payload.explanation ?? "No explanation provided",
      created_at: Number(payload.created_at ?? Date.now()),
    };
    useDashboardStore.getState().addEvent(event);
  });

  socket.connect();
  return socket;
}
