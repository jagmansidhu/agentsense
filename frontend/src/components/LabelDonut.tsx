import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AgentEvent } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Props {
  events: AgentEvent[];
}

const COLORS = ["#a1a1aa", "#f87171", "#fbbf24", "#a78bfa", "#38bdf8", "#4b5563"];

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
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
