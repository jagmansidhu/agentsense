import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        neutral: "border-[rgba(51,51,51,0.25)] bg-[rgba(51,51,51,0.04)] text-[var(--dark-grey)]",
        healthy: "border-[rgba(0,128,0,0.35)] bg-[rgba(0,128,0,0.08)] text-[var(--success-green)]",
        hallucinating:
          "border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.08)] text-[rgb(220,38,38)]",
        stuck: "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.1)] text-[rgb(180,83,9)]",
        offTopic:
          "border-[rgba(128,0,128,0.35)] bg-[rgba(128,0,128,0.08)] text-[var(--accent-purple)]",
        refusing: "border-[rgba(0,161,224,0.35)] bg-[rgba(0,161,224,0.08)] text-[var(--business-blue)]",
        pending:
          "border-[rgba(51,51,51,0.18)] bg-[rgba(51,51,51,0.04)] text-[rgba(51,51,51,0.7)] animate-pulse",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
