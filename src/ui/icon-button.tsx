"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip, type TooltipProps } from "./tooltip";

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-control text-fg-muted select-none " +
    "transition-[background-color,color] duration-[var(--motion-fast)] ease-out " +
    "hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:text-fg-disabled " +
    "aria-pressed:bg-accent-muted aria-pressed:text-accent data-[state=open]:bg-hover data-[state=open]:text-fg",
  {
    variants: {
      size: {
        xs: "size-6 [&_svg]:size-3.5",
        sm: "size-7 [&_svg]:size-4",
        md: "size-8 [&_svg]:size-[18px]",
        lg: "size-10 [&_svg]:size-5",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label" | "children"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Accessible name; also the tooltip text unless `tooltip` is false. */
    label: string;
    icon: ReactNode;
    shortcut?: TooltipProps["shortcut"];
    tooltip?: boolean;
    tooltipSide?: TooltipProps["side"];
    /** Toggle state; renders aria-pressed. */
    active?: boolean;
  };

/** Square icon button. Always has an accessible name and (by default) a tooltip. */
export function IconButton({
  label,
  icon,
  shortcut,
  tooltip = true,
  tooltipSide,
  active,
  size,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cn(iconButtonVariants({ size }), className)}
      {...props}
    >
      {icon}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
