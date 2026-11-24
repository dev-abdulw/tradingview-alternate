"use client";

import { Popover as P } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { surface } from "./styles";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(surface.floating, "w-72 p-3", className)}
        {...props}
      />
    </P.Portal>
  );
}
