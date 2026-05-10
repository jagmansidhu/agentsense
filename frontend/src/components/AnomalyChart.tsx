import {
  Area,
  AreaChart,
  CartesianGrid,
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
  const buckets = new Map<string, { anomalies: number; healthy: number }>();
  for (const event of events) {
    const minute = new Date(event.created_at);
    const key = `${minute.getHours().toString().padStart(2, "0")}:${minute
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const current = buckets.get(key) ?? { anomalies: 0, healthy: 0 };
    if (isAnomaly(event.label)) current.anomalies += 1;
    else current.healthy += 1;
    buckets.set(key, current);
  }
  const chartData = Array.from(buckets.entries())
    .map(([minute, value]) => ({ minute, ...value }))
    .reverse()
    .slice(-20);

  const totalAnomalies = chartData.reduce((sum, d) => sum + d.anomalies, 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Anomalies over time</CardTitle>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(220,38,38,0.85)]">
          {totalAnomalies} flagged
        </span>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          {chartData.length === 0 ? (
            <EmptyChartState message="Waiting for traffic — anomaly trend will appear here." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="anomalyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="healthyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00a1e0" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#00a1e0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(51,51,51,0.06)" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="minute"
                  tick={{ fill: "rgba(51,51,51,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "rgba(51,51,51,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid rgba(0,161,224,0.2)",
                    borderRadius: 6,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    fontSize: 12,
                    color: "#333",
                    padding: "6px 10px",
                  }}
                  labelStyle={{ color: "rgba(51,51,51,0.55)", fontSize: 11 }}
                  cursor={{ stroke: "rgba(0,161,224,0.25)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="healthy"
                  stroke="#00a1e0"
                  strokeWidth={1.6}
                  fill="url(#healthyFill)"
                  name="healthy"
                />
                <Area
                  type="monotone"
                  dataKey="anomalies"
                  stroke="#dc2626"
                  strokeWidth={2}
                  fill="url(#anomalyFill)"
                  name="anomalies"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-[rgba(51,51,51,0.6)]">
          <LegendDot color="#dc2626" label="anomalies" />
          <LegendDot color="#00a1e0" label="healthy" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="capitalize">{label}</span>
    </span>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center rounded-[4px] border border-dashed border-[rgba(51,51,51,0.14)] bg-[rgba(248,250,252,0.6)] text-center text-xs text-[rgba(51,51,51,0.55)]">
      {message}
    </div>
  );
}
