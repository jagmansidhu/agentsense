import type { AgentEvent } from "../types";
import { isAnomaly } from "../lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  status: "connecting" | "connected" | "disconnected";
  events: AgentEvent[];
}

export function StatsBar({ status, events }: Props) {
  const total = events.length;
  const anomalies = events.filter((event) => isAnomaly(event.label)).length;
  const healthy = events.filter((event) => event.label === "healthy").length;

  return (
    <section className="grid gap-3 md:grid-cols-4">
      <StatCard title="connection" value={status} tone={statusTone(status)} />
      <StatCard title="total events" value={String(total)} />
      <StatCard title="anomalies" value={String(anomalies)} />
      <StatCard title="healthy" value={String(healthy)} />
    </section>
  );
}

function statusTone(status: Props["status"]): string {
  if (status === "connected") return "text-emerald-300";
  if (status === "connecting") return "text-amber-300";
  return "text-red-300";
}

function StatCard({
  title,
  value,
  tone = "text-zinc-100",
}: {
  title: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
