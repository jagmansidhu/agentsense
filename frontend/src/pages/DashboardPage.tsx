import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AnomalyChart } from "../components/AnomalyChart";
import { EventFeed } from "../components/EventFeed";
import { LabelDonut } from "../components/LabelDonut";
import { StatsBar } from "../components/StatsBar";
import { useDashboardStore } from "../lib/store";

export function DashboardPage() {
  const events = useDashboardStore((state) => state.events);
  const status = useDashboardStore((state) => state.connectionStatus);
  const sessions = useDashboardStore((state) => state.sessions);
  const selectedSessionId = useDashboardStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useDashboardStore((state) => state.setSelectedSessionId);
  const hydrate = useDashboardStore((state) => state.hydrate);
  const loading = useDashboardStore((state) => state.loading);
  const error = useDashboardStore((state) => state.error);

  useEffect(() => {
    void hydrate(selectedSessionId);
  }, [hydrate, selectedSessionId]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-[1fr_auto_auto]">
        <div className="grid gap-1">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">scope</p>
          <p className="text-sm text-zinc-200">
            {loading ? "Refreshing from backend..." : "Live + hydrated from /proxy/events"}
          </p>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
        <select
          className="h-10 border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
        >
          <option value="all">all sessions</option>
          {sessions.map((session) => (
            <option key={session.session_id} value={session.session_id}>
              {session.session_id}
            </option>
          ))}
        </select>
        <Link
          to={sessions[0] ? `/session/${encodeURIComponent(sessions[0].session_id)}` : "/session/all"}
          className="inline-flex h-10 items-center justify-center border border-zinc-700 bg-zinc-950 px-4 text-sm uppercase tracking-[0.08em] text-zinc-200 transition-colors hover:bg-zinc-900"
        >
          open sessions
        </Link>
      </div>

      <StatsBar status={status} events={events} />

      <div className="grid gap-4 xl:grid-cols-2">
        <AnomalyChart events={events} />
        <LabelDonut events={events} />
      </div>

      <EventFeed events={events} />
    </div>
  );
}
