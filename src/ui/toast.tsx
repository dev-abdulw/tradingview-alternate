"use client";

import { Toaster as Sonner, toast } from "sonner";

/**
 * App-wide toaster. Styled entirely with tokens (sonner's defaults are off).
 * Use `toast("…")`, `toast.success`, `toast.error`, and `action: { label: "Undo", onClick }`.
 */
export function Toaster({ theme }: { theme: "dark" | "light" }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      offset={16}
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-[356px] items-start gap-2.5 rounded-popover bg-elevated px-3.5 py-3 text-ui text-fg shadow-dialog",
          title: "font-medium text-fg",
          description: "mt-0.5 text-cell text-fg-muted",
          icon: "mt-0.5 [&_svg]:size-4",
          success: "[&_[data-icon]]:text-up",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-accent",
          actionButton:
            "ml-auto h-6 shrink-0 self-center rounded-control bg-hover px-2 text-cell font-medium text-fg hover:bg-active",
          cancelButton:
            "h-6 shrink-0 self-center rounded-control px-2 text-cell font-medium text-fg-muted hover:bg-hover",
          closeButton: "text-fg-subtle",
        },
      }}
    />
  );
}

export { toast };
