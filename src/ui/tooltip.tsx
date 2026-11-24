"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "./kbd";
import { surface } from "./styles";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </T.Provider>
  );
}

export type TooltipProps = {
  content: ReactNode;
  /** Keyboard shortcut shown next to the label, e.g. "⌘K" or ["⌥", "W"]. */
  shortcut?: string | string[];
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactNode;
  /** Suppress the tooltip (e.g. while a menu anchored to the trigger is open). */
  disabled?: boolean;
};

export function Tooltip({
  content,
  shortcut,
  side = "bottom",
  align = "center",
  children,
  disabled,
}: TooltipProps) {
  if (disabled) return <>{children}</>;
  const keys = shortcut === undefined ? [] : Array.isArray(shortcut) ? shortcut : [shortcut];
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(surface.tooltip)}
        >
          <span className="flex items-center gap-2">
            <span>{content}</span>
            {keys.length > 0 && (
              <span className="flex gap-0.5">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            )}
          </span>
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
