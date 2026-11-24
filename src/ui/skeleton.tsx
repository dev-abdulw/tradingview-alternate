import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/** Placeholder block. Shape it like the content it replaces (same height, rough width). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-shimmer rounded-[4px] bg-hover motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
