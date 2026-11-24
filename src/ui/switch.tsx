"use client";

import { Switch as S } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full bg-active ring-1 ring-line-strong ring-inset",
        "transition-colors duration-[var(--motion-fast)] data-[state=checked]:bg-accent-solid data-[state=checked]:ring-transparent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-fg shadow-sm transition-transform duration-[var(--motion-fast)] ease-out data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent" />
    </S.Root>
  );
}
