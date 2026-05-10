import type { AgentEvent } from "../types";
import { EventCard } from "./EventCard";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  events: AgentEvent[];
  dataSource: "live" | "mock";
}

export function EventFeed({ events, dataSource }: Props) {
  if (!events.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>event feed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-[rgba(51,51,51,0.72)]">
          <p className="text-[var(--dark-grey)]">Waiting for live agent events</p>
          <p>
            Send a prompt through <code>/proxy/chat</code> and new events will stream here in real
            time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          event feed {dataSource === "mock" ? "(mock data mode)" : "(live stream mode)"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid max-h-[30rem] gap-3 overflow-auto pr-1">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
