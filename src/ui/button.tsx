import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap select-none " +
    "transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] ease-out " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent-solid text-on-accent hover:bg-accent-solid-hover",
        secondary: "bg-hover text-fg hover:bg-active",
        outline: "text-fg ring-1 ring-line-strong ring-inset hover:bg-hover",
        ghost:
          "text-fg-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg",
        danger: "bg-danger-muted text-danger hover:bg-danger hover:text-on-accent",
      },
      size: {
        xs: "h-6 px-2 text-cell",
        sm: "h-7 px-2.5 text-ui",
        md: "h-8 px-3 text-ui",
        lg: "h-10 px-4 text-ui",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a link) with button styles. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
