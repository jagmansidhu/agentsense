import type { EventOrigin } from "../types";

const ORIGIN_STYLES: Record<EventOrigin, string> = {
  ui: "border-[rgba(0,161,224,0.35)] bg-[rgba(0,161,224,0.08)] text-[var(--business-blue)]",
  external: "border-[rgba(128,0,128,0.35)] bg-[rgba(128,0,128,0.08)] text-[var(--accent-purple)]",
  cursor: "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.12)] text-[rgb(180,83,9)]",
};

const ORIGIN_LABEL: Record<EventOrigin, string> = {
  ui: "ui",
  external: "external",
  cursor: "cursor",
};

interface Props {
  origin: EventOrigin | undefined;
  className?: string;
}

export function OriginPill({ origin, className }: Props) {
  const value: EventOrigin = origin ?? "ui";
  const styles = ORIGIN_STYLES[value];
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${styles} ${className ?? ""}`}
    >
      {ORIGIN_LABEL[value]}
    </span>
  );
}
