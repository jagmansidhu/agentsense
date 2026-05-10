import * as React from "react";
import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[4px] border border-[rgba(51,51,51,0.18)] bg-white px-3 text-sm text-[var(--dark-grey)] placeholder:text-[rgba(51,51,51,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--business-blue)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-[4px] border border-[rgba(51,51,51,0.18)] bg-white px-3 py-2 text-sm text-[var(--dark-grey)] placeholder:text-[rgba(51,51,51,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--business-blue)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
