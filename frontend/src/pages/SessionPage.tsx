import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConversationView } from "../components/ConversationView";
import { HealthBadge } from "../components/HealthBadge";
import { SessionList } from "../components/SessionList";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { fetchTurns } from "../lib/api";
import { useDashboardStore } from "../lib/store";
import type { TurnDetail } from "../types";

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const decodedSession = decodeURIComponent(sessionId ?? "all");

  const sessions = useDashboardStore((state) => state.sessions);
  const events = useDashboardStore((state) => state.events);
  const hydrate = useDashboardStore((state) => state.hydrate);

  const [turns, setTurns] = useState<TurnDetail[]>([]);
  const [turnsLoading, setTurnsLoading] = useState(false);

  useEffect(() => {
    void hydrate(decodedSession);
  }, [decodedSession, hydrate]);

  useEffect(() => {
    if (decodedSession === "all") return;
    setTurnsLoading(true);
    fetchTurns(decodedSession)
      .then((res) => setTurns(res.turns))
      .catch(() => setTurns([]))
      .finally(() => setTurnsLoading(false));
  }, [decodedSession]);

  const sessionEvents =
    decodedSession === "all"
      ? events
      : events.filter((event) => event.session_id === decodedSession);

  return (
    <div className="grid gap-4">
      <Link
        to="/monitor"
        className="text-xs uppercase tracking-[0.12em] text-[rgba(51,51,51,0.6)] hover:text-[var(--business-blue)]"
      >
        back to dashboard
      </Link>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SessionList sessions={sessions} />
        <div className="grid gap-4">
          <ConversationView sessionId={decodedSession} events={sessionEvents} />
          {decodedSession !== "all" && (
            <TurnTrace turns={turns} loading={turnsLoading} />
          )}
        </div>
      </div>
    </div>
  );
}

function TurnTrace({ turns, loading }: { turns: TurnDetail[]; loading: boolean }) {
  const LABEL_COLOR: Record<string, string> = {
    healthy: "#008000",
    hallucinating: "#dc2626",
    "stuck in a loop": "#d97706",
    "off-topic": "#800080",
    "refusing incorrectly": "#00a1e0",
    unknown: "rgba(51,51,51,0.18)",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>turn trace</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-[rgba(51,51,51,0.5)]">Loading turns...</p>
        ) : turns.length === 0 ? (
          <p className="text-sm text-[rgba(51,51,51,0.5)]">No turns recorded yet.</p>
        ) : (
          <ol className="grid max-h-[40rem] gap-3 overflow-auto pr-1">
            {turns.map((turn) => (
              <li
                key={turn.turn_id}
                className="grid gap-2 rounded-[4px] border border-[rgba(51,51,51,0.1)] bg-white p-4 shadow-[var(--shadow-light)]"
                style={{ borderLeft: `3px solid ${LABEL_COLOR[turn.health.label] ?? LABEL_COLOR.unknown}` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[rgba(51,51,51,0.5)]">turn {turn.turn_index + 1}</span>
                  <HealthBadge label={turn.health.label} />
                </div>
                {turn.user_goal && (
                  <p className="text-xs text-[rgba(51,51,51,0.6)]">
                    <span className="font-semibold">goal:</span> {turn.user_goal}
                  </p>
                )}
                {turn.thinking && (
                  <div className="grid gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(51,51,51,0.45)]">thinking</p>
                    <p className="rounded-[4px] border border-[rgba(51,51,51,0.08)] bg-[var(--light-grey)] px-2.5 py-2 font-mono text-xs leading-relaxed text-[var(--dark-grey)]">
                      {turn.thinking.slice(0, 500)}{turn.thinking.length > 500 ? "\u2026" : ""}
                    </p>
                  </div>
                )}
                {turn.action && (
                  <p className="text-xs text-[rgba(51,51,51,0.65)]">
                    <span className="font-semibold">action:</span> {turn.action}
                  </p>
                )}
                {turn.tool_calls.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.5)] hover:text-[var(--business-blue)]">
                      {turn.tool_calls.length} tool call{turn.tool_calls.length !== 1 ? "s" : ""}
                    </summary>
                    <pre className="mt-1.5 overflow-auto rounded-[4px] bg-[var(--light-grey)] p-2 text-[10px] leading-relaxed">
                      {JSON.stringify(turn.tool_calls, null, 2)}
                    </pre>
                  </details>
                )}
                {turn.output && (
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-[rgba(51,51,51,0.5)] hover:text-[var(--business-blue)]">
                      output
                    </summary>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--dark-grey)]">
                      {turn.output.slice(0, 400)}{turn.output.length > 400 ? "\u2026" : ""}
                    </p>
                  </details>
                )}
                <p className="text-xs text-[rgba(51,51,51,0.55)]">{turn.health.explanation}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
