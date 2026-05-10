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
    set((state) => {
      // Upsert by id so the proxy's pending → classified refinement updates
      // the existing card in place instead of producing a duplicate.
      const existingIdx = state.events.findIndex((e) => e.id === event.id);
      const isUpdate = existingIdx >= 0;
      const previous = isUpdate ? state.events[existingIdx] : null;

      const nextEvents = isUpdate
        ? state.events.map((e, i) => (i === existingIdx ? { ...e, ...event } : e))
        : [event, ...state.events].slice(0, MAX_EVENTS);

      const wasAnomaly = previous ? isAnomaly(previous.label) : false;
      const isAnomalyNow = isAnomaly(event.label);

      const existingSession = state.sessions.find(
        (session) => session.session_id === event.session_id,
      );
      const sessions = !existingSession
        ? [
            {
              session_id: event.session_id,
              last_seen: event.created_at,
              status: event.label,
              event_count: 1,
              anomaly_count: isAnomalyNow ? 1 : 0,
            },
            ...state.sessions,
          ]
        : state.sessions
            .map((session) =>
              session.session_id === event.session_id
                ? {
                    ...session,
                    last_seen: event.created_at,
                    status: event.label,
                    // For an upsert, neither event count nor anomaly count
                    // grows — we only adjust the anomaly count by the delta
                    // between the previous and current label classifications.
                    event_count: isUpdate ? session.event_count : session.event_count + 1,
                    anomaly_count:
                      session.anomaly_count +
                      (isUpdate
                        ? (isAnomalyNow ? 1 : 0) - (wasAnomaly ? 1 : 0)
                        : isAnomalyNow
                          ? 1
                          : 0),
                  }
                : session,
            )
            .sort((a, b) => b.last_seen - a.last_seen);

      return {
        dataSource: "live",
        events: nextEvents,
        sessions,
      };
    }),
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
  label !== "healthy" && label !== "unknown" && label !== "pending";
