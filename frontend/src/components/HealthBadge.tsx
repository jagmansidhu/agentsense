import type { HealthLabel } from "../types";
import { Badge } from "./ui/badge";

interface Props {
  label: HealthLabel;
}

const LABEL_VARIANT: Record<
  HealthLabel,
  "healthy" | "hallucinating" | "stuck" | "offTopic" | "refusing" | "neutral" | "pending"
> = {
  healthy: "healthy",
  hallucinating: "hallucinating",
  "stuck in a loop": "stuck",
  "off-topic": "offTopic",
  "refusing incorrectly": "refusing",
  unknown: "neutral",
  pending: "pending",
};

const LABEL_DISPLAY: Partial<Record<HealthLabel, string>> = {
  // Subtle "classifying…" wording is friendlier than the raw "pending" token
  // and matches the explanation field the proxy emits with the pending event.
  pending: "classifying…",
};

export function HealthBadge({ label }: Props) {
  return <Badge variant={LABEL_VARIANT[label]}>{LABEL_DISPLAY[label] ?? label}</Badge>;
}
