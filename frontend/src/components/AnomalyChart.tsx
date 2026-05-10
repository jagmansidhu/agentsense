import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isAnomaly } from "../lib/store";
import type { AgentEvent } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  events: AgentEvent[];
}

export function AnomalyChart({ events }: Props) {
  const byMinute = new Map<string, number>();
  for (const event of events) {
    const minute = new Date(event.created_at);
    const key = `${minute.getHours().toString().padStart(2, "0")}:${minute
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const increment = isAnomaly(event.label) ? 1 : 0;
    byMinute.set(key, (byMinute.get(key) ?? 0) + increment);
  }
  const chartData = Array.from(byMinute.entries())
    .map(([minute, anomalies]) => ({ minute, anomalies }))
    .reverse()
    .slice(-20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>anomalies per minute</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="minute" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="anomalies"
                stroke="#f87171"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
