import { create } from "zustand";
import {
  createAgent as apiCreateAgent,
  deleteAgent as apiDeleteAgent,
  fetchAgents,
  sendChat,
  updateAgent as apiUpdateAgent,
} from "./api";
import type {
  AgentCreatePayload,
  AgentDefinition,
  AgentUpdatePayload,
  ChatHealth,
  HealthLabel,
} from "../types";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  health?: ChatHealth;
  error?: string;
  // Proxy-side event id. Matches the ``event_id`` carried by streamed
  // ``assistant_token`` events and by ``agent_event`` Socket.IO emissions
  // so the playground can update an assistant turn's ``health`` in place
  // when the classifier refines a pending classification.
  eventId?: string;
}

export interface StreamingTurn {
  eventId: string;
  content: string;
  done: boolean;
}

export interface AgentRuntime {
  agent: AgentDefinition;
  sessionId: string;
  turns: ChatTurn[];
  pending: boolean;
  lastError?: string;
  // Live-typing assistant bubble while CLōD is streaming. Replaced by a
  // persisted ``ChatTurn`` once the HTTP response resolves.
  streamingTurn?: StreamingTurn;
}

interface PlaygroundState {
  agents: Record<string, AgentRuntime>;
  order: string[];
  activeAgentId: string | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  createAgent: (payload: AgentCreatePayload) => Promise<AgentDefinition | null>;
  updateAgent: (agentId: string, payload: AgentUpdatePayload) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  setActiveAgent: (agentId: string | null) => void;
  sendUserMessage: (agentId: string, message: string) => Promise<void>;
  resetConversation: (agentId: string) => void;
  // Streaming + classification refinement. These actions are dispatched from
  // ``lib/socket.ts`` when CLōD/proxy emit per-token deltas, the stream-done
  // sentinel, and the post-classification ``agent_event`` update.
  appendStreamToken: (sessionId: string, eventId: string, delta: string) => void;
  finalizeStream: (sessionId: string, eventId: string) => void;
  updateTurnHealth: (eventId: string, health: ChatHealth) => void;
}

const newSessionId = (slug: string) =>
  `playground-${slug}-${Date.now().toString(36).slice(-4)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

const newTurnId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HEALTH_LABELS: HealthLabel[] = [
  "healthy",
  "hallucinating",
  "stuck in a loop",
  "off-topic",
  "refusing incorrectly",
  "unknown",
  "pending",
];

const normalizeLabel = (value: unknown): HealthLabel => {
  const str = String(value ?? "").toLowerCase().trim();
  return (HEALTH_LABELS.find((label) => label === str) ?? "unknown") as HealthLabel;
};

const buildRuntime = (agent: AgentDefinition, existing?: AgentRuntime): AgentRuntime => ({
  agent,
  sessionId: existing?.sessionId ?? newSessionId(agent.agent_id),
  turns: existing?.turns ?? [],
  pending: existing?.pending ?? false,
  lastError: existing?.lastError,
});

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  agents: {},
  order: [],
  activeAgentId: null,
  loading: false,
  error: null,
  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await fetchAgents();
      set((state) => {
        const next: Record<string, AgentRuntime> = {};
        for (const agent of agents) {
          next[agent.agent_id] = buildRuntime(agent, state.agents[agent.agent_id]);
        }
        const order = agents.map((agent) => agent.agent_id);
        const activeAgentId =
          state.activeAgentId && next[state.activeAgentId]
            ? state.activeAgentId
            : (order[0] ?? null);
        return { agents: next, order, activeAgentId, loading: false, error: null };
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
  createAgent: async (payload) => {
    try {
      const agent = await apiCreateAgent(payload);
      set((state) => ({
        agents: { ...state.agents, [agent.agent_id]: buildRuntime(agent) },
        order: state.order.includes(agent.agent_id) ? state.order : [...state.order, agent.agent_id],
        activeAgentId: agent.agent_id,
        error: null,
      }));
      return agent;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },
  updateAgent: async (agentId, payload) => {
    try {
      const agent = await apiUpdateAgent(agentId, payload);
      set((state) => ({
        agents: {
          ...state.agents,
          [agent.agent_id]: buildRuntime(agent, state.agents[agent.agent_id]),
        },
        error: null,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
  deleteAgent: async (agentId) => {
    try {
      await apiDeleteAgent(agentId);
      set((state) => {
        const next = { ...state.agents };
        delete next[agentId];
        const order = state.order.filter((id) => id !== agentId);
        const activeAgentId =
          state.activeAgentId === agentId ? (order[0] ?? null) : state.activeAgentId;
        return { agents: next, order, activeAgentId, error: null };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
  setActiveAgent: (agentId) => set({ activeAgentId: agentId }),
  sendUserMessage: async (agentId, message) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const runtime = get().agents[agentId];
    if (!runtime || runtime.pending) return;

    const userTurn: ChatTurn = {
      id: newTurnId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    set((state) => ({
      agents: {
        ...state.agents,
        [agentId]: {
          ...runtime,
          turns: [...runtime.turns, userTurn],
          pending: true,
          lastError: undefined,
        },
      },
    }));

    try {
      const response = await sendChat({
        session_id: runtime.sessionId,
        message: trimmed,
        agent_id: runtime.agent.agent_id,
      });
      const health: ChatHealth = {
        label: normalizeLabel(response.health?.label),
        confidence: Number(response.health?.confidence ?? 0),
        explanation: response.health?.explanation ?? "",
        all_scores: response.health?.all_scores,
      };
      const assistantTurn: ChatTurn = {
        id: newTurnId(),
        role: "assistant",
        content: response.reply,
        createdAt: Date.now(),
        health,
        eventId: response.event_id,
      };
      set((state) => {
        const current = state.agents[agentId];
        if (!current) return {};
        return {
          agents: {
            ...state.agents,
            [agentId]: {
              ...current,
              turns: [...current.turns, assistantTurn],
              pending: false,
              lastError: undefined,
              // Replace the live-typing bubble with the persisted turn.
              streamingTurn: undefined,
            },
          },
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => {
        const current = state.agents[agentId];
        if (!current) return {};
        return {
          agents: {
            ...state.agents,
            [agentId]: {
              ...current,
              pending: false,
              lastError: message,
              streamingTurn: undefined,
            },
          },
        };
      });
    }
  },
  appendStreamToken: (sessionId, eventId, delta) => {
    set((state) => {
      const entry = Object.entries(state.agents).find(
        ([, runtime]) => runtime.sessionId === sessionId,
      );
      if (!entry) return {};
      const [agentId, runtime] = entry;
      const existing = runtime.streamingTurn;
      // If we're already streaming a different event, the new delta wins —
      // ditch the old fragment so the bubble doesn't show stale content.
      const base =
        existing && existing.eventId === eventId
          ? existing
          : { eventId, content: "", done: false };
      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...runtime,
            streamingTurn: {
              ...base,
              content: base.content + delta,
              done: false,
            },
          },
        },
      };
    });
  },
  finalizeStream: (sessionId, eventId) => {
    set((state) => {
      const entry = Object.entries(state.agents).find(
        ([, runtime]) => runtime.sessionId === sessionId,
      );
      if (!entry) return {};
      const [agentId, runtime] = entry;
      if (!runtime.streamingTurn || runtime.streamingTurn.eventId !== eventId) {
        return {};
      }
      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...runtime,
            streamingTurn: { ...runtime.streamingTurn, done: true },
          },
        },
      };
    });
  },
  updateTurnHealth: (eventId, health) => {
    set((state) => {
      let mutated = false;
      const nextAgents: Record<string, AgentRuntime> = {};
      for (const [agentId, runtime] of Object.entries(state.agents)) {
        const idx = runtime.turns.findIndex((turn) => turn.eventId === eventId);
        if (idx < 0) {
          nextAgents[agentId] = runtime;
          continue;
        }
        mutated = true;
        const nextTurns = runtime.turns.map((turn, i) =>
          i === idx ? { ...turn, health } : turn,
        );
        nextAgents[agentId] = { ...runtime, turns: nextTurns };
      }
      return mutated ? { agents: nextAgents } : {};
    });
  },
  resetConversation: (agentId) => {
    set((state) => {
      const current = state.agents[agentId];
      if (!current) return {};
      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...current,
            turns: [],
            sessionId: newSessionId(agentId),
            lastError: undefined,
          },
        },
      };
    });
  },
}));
