import { Link, useLocation } from "react-router-dom";
import type { SessionSummary } from "../types";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  sessions: SessionSummary[];
}

export function SessionList({ sessions }: Props) {
  const location = useLocation();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>sessions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">No active sessions yet.</p>
        ) : null}
        {sessions.map((session) => {
          const href = `/session/${encodeURIComponent(session.session_id)}`;
          const active = location.pathname === href;
          return (
            <Link
              key={session.session_id}
              to={href}
              className={cn(
                "grid gap-1 border border-zinc-800 px-3 py-2 text-sm transition-colors",
                active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-950/70 text-zinc-200 hover:bg-zinc-900",
              )}
            >
              <span className="font-medium">{session.session_id}</span>
              <span className={cn("text-xs", active ? "text-zinc-700" : "text-zinc-500")}>
                {session.event_count} events · {session.status}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
