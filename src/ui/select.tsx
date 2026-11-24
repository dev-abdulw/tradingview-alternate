"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as S } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { field, menu } from "./styles";

export type SelectOption<V extends string> = { value: V; label: ReactNode; hint?: ReactNode };

export type SelectProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  id?: string;
  "aria-label"?: string;
  className?: string;
};

export function Select<V extends string>({
  value,
  onValueChange,
  options,
  id,
  className,
  ...aria
}: SelectProps<V>) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as V)}>
      <S.Trigger
        id={id}
        className={cn(field, "flex items-center justify-between gap-2 text-left", className)}
        {...aria}
      >
        <span className="truncate">
          <S.Value />
        </span>
        <S.Icon className="text-fg-subtle">
          <ChevronDown className="size-4" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            menu.content,
            "max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className={cn(menu.item, menu.indicatorItem)}>
                <S.ItemIndicator className={menu.indicator}>
                  <Check />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className={menu.shortcut}>{o.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
