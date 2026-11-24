import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-hover px-1 font-sans text-meta font-medium text-fg-muted ring-1 ring-line ring-inset",
        className,
      )}
      {...props}
    />
  );
}
