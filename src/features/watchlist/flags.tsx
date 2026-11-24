"use client";

import { Flag, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { FLAG_COLORS, type FlagColor } from "@/lib/persistence/schema";
import { cn } from "@/lib/utils/cn";

export const FLAG_META: Record<FlagColor, { label: string; dot: string; text: string }> = {
  red: { label: "Red", dot: "bg-flag-red", text: "text-flag-red" },
  orange: { label: "Orange", dot: "bg-flag-orange", text: "text-flag-orange" },
  green: { label: "Green", dot: "bg-flag-green", text: "text-flag-green" },
  blue: { label: "Blue", dot: "bg-flag-blue", text: "text-flag-blue" },
  violet: { label: "Violet", dot: "bg-flag-violet", text: "text-flag-violet" },
};

export function FlagDot({ color, className }: { color: FlagColor; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${FLAG_META[color].label} flag`}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", FLAG_META[color].dot, className)}
    />
  );
}

type ItemProps = { onSelect: () => void; icon?: ReactNode; children?: ReactNode; className?: string };

/** Renders flag choices with whichever menu item component the caller uses (dropdown or context). */
export function FlagMenuItems({
  current,
  onChange,
  Item,
}: {
  current: FlagColor | null;
  onChange: (color: FlagColor | null) => void;
  Item: ComponentType<ItemProps>;
}) {
  return (
    <>
      {FLAG_COLORS.map((c) => (
        <Item
          key={c}
          onSelect={() => onChange(current === c ? null : c)}
          icon={<Flag className={cn(FLAG_META[c].text, "fill-current")} />}
        >
          {FLAG_META[c].label}
          {current === c && <span className="ml-auto text-cell text-fg-subtle">current</span>}
        </Item>
      ))}
      {current && (
        <Item onSelect={() => onChange(null)} icon={<X />}>
          Remove flag
        </Item>
      )}
    </>
  );
}
