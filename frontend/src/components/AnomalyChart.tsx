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
    byMinute.set(key, (byMinute.get(key) ?? 0) + (isAnomaly(event.label) ? 1 : 0));
  }
  const chartData = Array.from(byMinute.entries())
    .map(([minute, anomalies]) => ({ minute, anomalies }))
    .reverse()
    .slice(-20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>anomalies over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="rgba(51,51,51,0.08)" strokeDasharray="4 4" />
              <XAxis
                dataKey="minute"
                tick={{ fill: "rgba(51,51,51,0.45)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "rgba(51,51,51,0.45)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid rgba(0,161,224,0.2)",
                  borderRadius: 4,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                  fontSize: 12,
                  color: "#333",
                }}
                cursor={{ stroke: "rgba(0,161,224,0.2)", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="anomalies"
                stroke="#00a1e0"
                strokeWidth={2}
                dot={{ fill: "#00a1e0", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#00a1e0", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
