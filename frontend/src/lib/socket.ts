import { io } from "socket.io-client";
import type { AgentEvent, ChatHealth, HealthLabel } from "../types";
import { useDashboardStore } from "./store";
import { usePlaygroundStore } from "./playgroundStore";

const SOCKET_URL = import.meta.env.VITE_PROXY_URL ?? "http://localhost:8000";

const normalizeLabel = (value: string | undefined): HealthLabel => {
  const normalized = (value ?? "").toLowerCase().trim();
  if (
    normalized === "healthy" ||
    normalized === "hallucinating" ||
    normalized === "stuck in a loop" ||
    normalized === "off-topic" ||
    normalized === "refusing incorrectly" ||
    normalized === "pending"
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
      message: payload.message ?? "",
      label: normalizeLabel(payload.label),
      confidence: Number(payload.confidence ?? 0),
      explanation: payload.explanation ?? "No explanation provided",
      greptile_context: payload.greptile_context,
      created_at: Number(payload.created_at ?? Date.now()),
    };
    // Dashboard upserts by id (pending → classified refines in place).
    useDashboardStore.getState().addEvent(event);

    // If a classified refinement comes in, update any matching playground
    // turn's `health` so the chat bubble's badge resolves from "classifying…"
    // to the real label without the user having to re-fetch.
    if (event.label !== "pending") {
      const health: ChatHealth = {
        label: event.label,
        confidence: event.confidence,
        explanation: event.explanation,
      };
      usePlaygroundStore.getState().updateTurnHealth(event.id, health);
    }
  });

  // Per-token deltas from CLōD streaming. Drives the live-typing assistant
  // bubble in the playground.
  socket.on(
    "assistant_token",
    (payload: { session_id?: string; event_id?: string; delta?: string }) => {
      const sessionId = payload.session_id;
      const eventId = payload.event_id;
      const delta = payload.delta;
      if (!sessionId || !eventId || typeof delta !== "string" || !delta) return;
      usePlaygroundStore.getState().appendStreamToken(sessionId, eventId, delta);
    },
  );

  // Stream-complete sentinel. Stops the typing cursor in the playground; the
  // HTTP /proxy/chat response then replaces the streaming bubble with the
  // persisted ChatTurn (which carries the event_id for later health updates).
  socket.on(
    "assistant_stream_done",
    (payload: { session_id?: string; event_id?: string }) => {
      const sessionId = payload.session_id;
      const eventId = payload.event_id;
      if (!sessionId || !eventId) return;
      usePlaygroundStore.getState().finalizeStream(sessionId, eventId);
    },
  );

  socket.connect();
  return socket;
}
