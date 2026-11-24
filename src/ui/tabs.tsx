"use client";

import { Tabs as T, ToggleGroup as TG } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/* ---------- Tabs: underline style for navigating views ---------- */

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-4 border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px h-8 border-b-2 border-transparent text-ui font-medium text-fg-muted transition-colors duration-[var(--motion-fast)]",
        "hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg",
        "focus-visible:outline-offset-[-2px]",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Segmented control: compact single-choice toggle (timeframes, chart types) ---------- */

export type SegmentedOption<V extends string> = {
  value: V;
  label: ReactNode;
  /** Accessible label when `label` is an icon. */
  ariaLabel?: string;
};

export type SegmentedControlProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  "aria-label": string;
  size?: "xs" | "sm";
  className?: string;
};

export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  size = "sm",
  className,
  ...aria
}: SegmentedControlProps<V>) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as V); // ignore deselect: a segmented control always has a value
      }}
      className={cn("inline-flex items-center gap-0.5 rounded-control bg-input p-0.5", className)}
      {...aria}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cn(
            "num inline-flex items-center justify-center rounded-[5px] font-medium text-fg-muted transition-colors duration-[var(--motion-fast)]",
            "hover:text-fg data-[state=on]:bg-active data-[state=on]:text-fg [&_svg]:size-4",
            size === "xs" ? "h-6 min-w-7 px-1.5 text-cell" : "h-7 min-w-8 px-2 text-ui",
          )}
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}
