import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ConversationView } from "../components/ConversationView";
import { SessionList } from "../components/SessionList";
import { useDashboardStore } from "../lib/store";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const decodedSession = decodeURIComponent(sessionId ?? "all");

  const sessions = useDashboardStore((state) => state.sessions);
  const events = useDashboardStore((state) => state.events);
  const hydrate = useDashboardStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate(decodedSession);
  }, [decodedSession, hydrate]);

  const sessionEvents =
    decodedSession === "all"
      ? events
      : events.filter((event) => event.session_id === decodedSession);

  return (
    <div className="grid gap-4">
      <Link to="/" className="text-xs uppercase tracking-[0.12em] text-zinc-400 hover:text-zinc-200">
        back to dashboard
      </Link>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SessionList sessions={sessions} />
        <ConversationView sessionId={decodedSession} events={sessionEvents} />
      </div>
    </div>
  );
}
