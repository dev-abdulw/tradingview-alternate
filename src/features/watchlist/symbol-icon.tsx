import type { AssetClass } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";

const TONE: Record<AssetClass, string> = {
  crypto: "bg-chip-crypto-bg text-chip-crypto",
  metal: "bg-chip-metal-bg text-chip-metal",
  stock: "bg-chip-stock-bg text-chip-stock",
};

/**
 * Monogram tinted by asset class. No third-party logo CDN: no extra requests,
 * no tracking, and it works for every symbol (including newly listed ones).
 */
export function SymbolIcon({
  name,
  assetClass,
  size = 18,
  className,
}: {
  name: string;
  assetClass: AssetClass | undefined;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold",
        assetClass ? TONE[assetClass] : "bg-hover text-fg-subtle",
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
