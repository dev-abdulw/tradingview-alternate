import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

const chipVariants = cva(
  "inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-meta font-medium tracking-[0.02em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-hover text-fg-muted",
        crypto: "bg-chip-crypto-bg text-chip-crypto",
        metal: "bg-chip-metal-bg text-chip-metal",
        stock: "bg-chip-stock-bg text-chip-stock",
        accent: "bg-accent-muted text-accent",
        warning: "bg-warning-muted text-warning",
        up: "bg-up-muted text-up",
        down: "bg-down-muted text-down",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type ChipProps = ComponentProps<"span"> & VariantProps<typeof chipVariants>;

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}

export type AssetClass = "crypto" | "metal" | "stock";

const ASSET_LABEL: Record<AssetClass, string> = { crypto: "Crypto", metal: "Metal", stock: "Stock" };

export function AssetClassChip({ assetClass, className }: { assetClass: AssetClass; className?: string }) {
  return (
    <Chip tone={assetClass} className={className}>
      {ASSET_LABEL[assetClass]}
    </Chip>
  );
}
