import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AgentEvent } from "../types";
import type { HealthLabel } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  events: AgentEvent[];
}

const LABEL_COLORS: Record<HealthLabel, string> = {
  healthy: "#008000",
  hallucinating: "#dc2626",
  "stuck in a loop": "#d97706",
  "off-topic": "#800080",
  "refusing incorrectly": "#00a1e0",
  unknown: "#a3a3a3",
};

const LABEL_ORDER: HealthLabel[] = [
  "healthy",
  "hallucinating",
  "stuck in a loop",
  "off-topic",
  "refusing incorrectly",
  "unknown",
];

export function LabelDonut({ events }: Props) {
  const counts = new Map<HealthLabel, number>();
  for (const event of events) {
    counts.set(event.label, (counts.get(event.label) ?? 0) + 1);
  }
  const total = events.length;
  const data = LABEL_ORDER.filter((label) => (counts.get(label) ?? 0) > 0).map((label) => ({
    name: label,
    value: counts.get(label) ?? 0,
  }));

  const healthyCount = counts.get("healthy") ?? 0;
  const healthyPct = total === 0 ? 0 : Math.round((healthyCount / total) * 100);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Behavior distribution</CardTitle>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(0,128,0,0.85)]">
          {healthyPct}% healthy
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="relative mx-auto h-40 w-40">
            {total === 0 ? (
              <div className="grid h-full place-items-center rounded-full border border-dashed border-[rgba(51,51,51,0.14)] text-center text-[11px] text-[rgba(51,51,51,0.5)]">
                no data
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={74}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {data.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={LABEL_COLORS[entry.name as HealthLabel] ?? "#a3a3a3"}
                        />
                      ))}
                    </Pie>
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
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="grid place-items-center">
                    <span className="text-2xl font-bold text-[var(--dark-grey)]">{total}</span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[rgba(51,51,51,0.5)]">
                      events
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <ul className="grid gap-1.5">
            {data.length === 0 ? (
              <li className="text-xs text-[rgba(51,51,51,0.5)]">No classifications yet.</li>
            ) : null}
            {data.map((entry) => {
              const pct = total === 0 ? 0 : Math.round((entry.value / total) * 100);
              return (
                <li
                  key={entry.name}
                  className="flex items-center gap-2 text-xs text-[var(--dark-grey)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: LABEL_COLORS[entry.name as HealthLabel] ?? "#a3a3a3" }}
                  />
                  <span className="capitalize">{entry.name}</span>
                  <span className="ml-auto pl-4 text-[rgba(51,51,51,0.5)]">{pct}%</span>
                  <span className="w-6 text-right font-semibold text-[rgba(51,51,51,0.75)]">
                    {entry.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
