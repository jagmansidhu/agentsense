import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] font-semibold",
  {
    variants: {
      variant: {
        neutral: "border-zinc-700 text-zinc-200",
        healthy: "border-emerald-500/60 text-emerald-300",
        hallucinating: "border-red-500/60 text-red-300",
        stuck: "border-amber-500/60 text-amber-300",
        offTopic: "border-violet-500/60 text-violet-300",
        refusing: "border-sky-500/60 text-sky-300",
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
