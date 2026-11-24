import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { field } from "./styles";

export type InputProps = ComponentProps<"input"> & {
  /** Icon rendered inside the field on the left. */
  leading?: ReactNode;
  /** Content inside the field on the right (shortcut hint, clear button, unit). */
  trailing?: ReactNode;
};

export function Input({ className, leading, trailing, ...props }: InputProps) {
  if (!leading && !trailing) return <input className={cn(field, className)} {...props} />;
  return (
    <div className={cn("relative flex w-full items-center", className)}>
      {leading && (
        <span className="pointer-events-none absolute left-2.5 flex text-fg-subtle [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input className={cn(field, leading && "pl-8", trailing && "pr-10")} {...props} />
      {trailing && <span className="absolute right-2 flex items-center text-fg-subtle">{trailing}</span>}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-cell font-medium text-fg-muted", className)} {...props} />;
}
