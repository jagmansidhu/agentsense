import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-[4px] text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--business-blue)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-[var(--business-blue)] text-white shadow-[var(--shadow-light)] hover:-translate-y-px hover:brightness-95",
        ghost:
          "border border-[rgba(0,161,224,0.35)] bg-transparent text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";
