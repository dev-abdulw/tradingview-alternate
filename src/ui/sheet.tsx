"use client";

import { Dialog as D } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Slide-over panel (right edge). Built on Dialog: focus trap, Esc, scrim click to close. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
} & Pick<ComponentProps<typeof D.Content>, "onOpenAutoFocus">) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in" />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-40 flex w-[min(380px,92vw)] flex-col bg-panel shadow-dialog outline-none",
            "data-[state=open]:animate-[sheet-in_var(--motion-slow)_var(--motion-ease)]",
            className,
          )}
        >
          <D.Title className="sr-only">{title}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
