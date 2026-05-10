import { Link, useLocation } from "react-router-dom";
import type { SessionSummary } from "../types";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { OriginPill } from "./OriginPill";

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
          <p className="text-sm text-[rgba(51,51,51,0.65)]">No active sessions yet.</p>
        ) : null}
        {sessions.map((session) => {
          const href = `/monitor/session/${encodeURIComponent(session.session_id)}`;
          const active = location.pathname === href;
          return (
            <Link
              key={session.session_id}
              to={href}
              className={cn(
                "grid gap-1 rounded-[4px] border px-3 py-2 text-sm transition-all",
                active
                  ? "border-[var(--business-blue)] bg-[rgba(0,161,224,0.08)] text-[var(--dark-grey)]"
                  : "border-[rgba(51,51,51,0.12)] bg-white text-[var(--dark-grey)] hover:bg-[rgba(0,161,224,0.04)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{session.session_id}</span>
                <OriginPill origin={session.origin} />
              </div>
              <span
                className={cn(
                  "text-xs",
                  active ? "text-[rgba(51,51,51,0.7)]" : "text-[rgba(51,51,51,0.6)]",
                )}
              >
                {session.event_count} events · {session.status}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
