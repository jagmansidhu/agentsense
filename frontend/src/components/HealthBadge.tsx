import type { HealthLabel } from "../types";
import { Badge } from "./ui/badge";

interface Props {
  label: HealthLabel;
}

const LABEL_VARIANT: Record<
  HealthLabel,
  "healthy" | "hallucinating" | "stuck" | "offTopic" | "refusing" | "neutral"
> = {
  healthy: "healthy",
  hallucinating: "hallucinating",
  "stuck in a loop": "stuck",
  "off-topic": "offTopic",
  "refusing incorrectly": "refusing",
  unknown: "neutral",
};

export function HealthBadge({ label }: Props) {
  return <Badge variant={LABEL_VARIANT[label]}>{label}</Badge>;
}
