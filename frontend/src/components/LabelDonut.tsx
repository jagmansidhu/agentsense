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

export function LabelDonut({ events }: Props) {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.label, (counts.get(event.label) ?? 0) + 1);
  }
  const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>label distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="h-56 w-full max-w-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={80}
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
                    borderRadius: 4,
                    fontSize: 12,
                    color: "#333",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <ul className="grid gap-1.5">
            {data.map((entry) => (
              <li key={entry.name} className="flex items-center gap-2 text-xs text-[var(--dark-grey)]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: LABEL_COLORS[entry.name as HealthLabel] ?? "#a3a3a3" }}
                />
                <span className="capitalize">{entry.name}</span>
                <span className="ml-auto pl-4 font-semibold text-[rgba(51,51,51,0.6)]">
                  {entry.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
