import type { AgentEvent } from "../types";
import { HealthBadge } from "./HealthBadge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  sessionId: string;
  events: AgentEvent[];
}

export function ConversationView({ sessionId, events }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>session conversation</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{sessionId}</p>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No turns captured for this session yet.</p>
        ) : null}
        <ul className="grid max-h-[36rem] gap-3 overflow-auto pr-1">
          {[...events].reverse().map((event) => (
            <li key={event.id} className="grid gap-2 border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">
                  assistant · {new Date(event.created_at).toLocaleTimeString()}
                </span>
                <HealthBadge label={event.label} />
              </div>
              <p className="text-sm text-zinc-100">{event.message}</p>
              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer uppercase tracking-[0.1em] text-zinc-500">
                  judge reasoning
                </summary>
                <p className="pt-2">{event.explanation}</p>
              </details>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
