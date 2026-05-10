import { create } from "zustand";
import { fetchEvents, fetchSessions } from "./api";
import { getMockEvents, getMockSessions } from "./mockData";
import type { AgentEvent, HealthLabel, SessionSummary } from "../types";

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type DataSource = "live" | "mock";

interface DashboardState {
  connectionStatus: ConnectionStatus;
  dataSource: DataSource;
  selectedSessionId: string;
  events: AgentEvent[];
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSelectedSessionId: (sessionId: string) => void;
  addEvent: (event: AgentEvent) => void;
  setEvents: (events: AgentEvent[]) => void;
  setSessions: (sessions: SessionSummary[]) => void;
  hydrate: (sessionId?: string | null) => Promise<void>;
  clearEvents: () => void;
}

const MAX_EVENTS = 400;

export const useDashboardStore = create<DashboardState>((set) => ({
  connectionStatus: "connecting",
  dataSource: "live",
  selectedSessionId: "all",
  events: [],
  sessions: [],
  loading: false,
  error: null,
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSelectedSessionId: (sessionId) => set({ selectedSessionId: sessionId }),
  addEvent: (event) =>
    set((state) => ({
      dataSource: "live",
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      sessions: (() => {
        const existing = state.sessions.find((session) => session.session_id === event.session_id);
        if (!existing) {
          return [
            {
              session_id: event.session_id,
              last_seen: event.created_at,
              status: event.label,
              event_count: 1,
              anomaly_count: isAnomaly(event.label) ? 1 : 0,
            },
            ...state.sessions,
          ];
        }
        return state.sessions
          .map((session) =>
            session.session_id === event.session_id
              ? {
                  ...session,
                  last_seen: event.created_at,
                  status: event.label,
                  event_count: session.event_count + 1,
                  anomaly_count: session.anomaly_count + (isAnomaly(event.label) ? 1 : 0),
                }
              : session,
          )
          .sort((a, b) => b.last_seen - a.last_seen);
      })(),
    })),
  setEvents: (events) => set({ events }),
  setSessions: (sessions) => set({ sessions }),
  hydrate: async (sessionId = null) => {
    set({ loading: true, error: null });
    try {
      const [eventsResponse, sessionsResponse] = await Promise.all([
        fetchEvents(sessionId, 200),
        fetchSessions(),
      ]);
      set({
        events: eventsResponse.events,
        sessions: sessionsResponse.sessions,
        dataSource: "live",
        loading: false,
        error: null,
      });
    } catch {
      const mockEvents = getMockEvents(sessionId, 200);
      const mockSessions = getMockSessions();
      set({
        events: mockEvents,
        sessions: mockSessions,
        dataSource: "mock",
        loading: false,
        error: null,
      });
    }
  },
  clearEvents: () => set({ events: [] }),
}));

export const getVisibleEvents = (
  events: AgentEvent[],
  selectedSession: string,
): AgentEvent[] =>
  selectedSession === "all"
    ? events
    : events.filter((event) => event.session_id === selectedSession);

export const getSessionIds = (events: AgentEvent[]): string[] =>
  ["all", ...new Set(events.map((event) => event.session_id))];

export const getSessionById = (
  sessions: SessionSummary[],
  sessionId: string,
): SessionSummary | undefined => sessions.find((session) => session.session_id === sessionId);

export const isAnomaly = (label: HealthLabel): boolean =>
  label !== "healthy" && label !== "unknown";
