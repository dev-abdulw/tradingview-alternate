"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./icon-button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export type DialogContentProps = Omit<ComponentProps<typeof D.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** Visually hide the header (title stays available to screen readers). */
  hideHeader?: boolean;
  showClose?: boolean;
};

export function DialogContent({
  className,
  title,
  description,
  hideHeader,
  showClose = true,
  children,
  ...props
}: DialogContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 flex-col",
          "rounded-dialog bg-elevated text-fg shadow-dialog outline-none data-[state=open]:animate-pop-in",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className={cn("flex items-start gap-3 px-5 pt-4 pb-3", hideHeader && "sr-only")}>
          <div className="min-w-0 flex-1">
            <D.Title className="text-title font-semibold text-fg">{title}</D.Title>
            {description && (
              <D.Description className="mt-0.5 text-ui text-fg-muted">{description}</D.Description>
            )}
          </div>
          {showClose && !hideHeader && (
            <D.Close asChild>
              <IconButton label="Close" icon={<X />} tooltip={false} className="-mt-0.5 -mr-2" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-line px-5 py-3", className)}
      {...props}
    />
  );
}
