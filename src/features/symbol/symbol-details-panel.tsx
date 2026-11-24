"use client";

import { ChevronDown } from "lucide-react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { useShell } from "@/features/shell/shell-context";
import { useInstrument, useTicker } from "@/lib/market-data/hooks";
import { formatPercent, formatPrice, formatVolume } from "@/lib/market-data/precision";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import { cn } from "@/lib/utils/cn";
import { AssetClassChip } from "@/ui/chip";
import { Skeleton } from "@/ui/skeleton";

/** Collapsible symbol details: 24h range bar, high/low, volume. Skeletons mirror the real rows. */
export function SymbolDetailsPanel() {
  const { detailsCollapsed, toggleDetails } = useShell();
  const key = useChart((s) => s.symbol);
  const { symbol } = parseSymbolKey(key);
  const instrument = useInstrument(key);
  const t = useTicker(key);
  const locale = useSettings((s) => s.numberFormat);
  const d = instrument?.priceDecimals;
  const ready = t && d !== undefined;

  // Where the last price sits in today's range (0–100%).
  const pos = ready && t.high > t.low ? ((t.last - t.low) / (t.high - t.low)) * 100 : 50;

  const rows: [string, string | null][] = ready
    ? [
        ["24h high", formatPrice(t.high, d, locale)],
        ["24h low", formatPrice(t.low, d, locale)],
        ["24h open", formatPrice(t.open, d, locale)],
        [`24h volume (${instrument?.base ?? "base"})`, formatVolume(t.volume, locale)],
        [`24h volume (${instrument?.quote ?? "quote"})`, formatVolume(t.quoteVolume, locale)],
      ]
    : [
        ["24h high", null],
        ["24h low", null],
        ["24h open", null],
        ["24h volume", null],
        ["24h turnover", null],
      ];

  return (
    <section aria-label="Symbol details" className="flex h-full min-h-0 flex-col bg-panel">
      <button
        type="button"
        onClick={toggleDetails}
        aria-expanded={!detailsCollapsed}
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left hover:bg-hover"
      >
        <span className="meta-label">Details</span>
        <span className="text-cell font-medium text-fg-muted">{instrument?.displayName ?? symbol}</span>
        {instrument && <AssetClassChip assetClass={instrument.assetClass} />}
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-fg-subtle transition-transform duration-[var(--motion-base)]",
            detailsCollapsed && "-rotate-90",
          )}
        />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-busy={!ready}>
        {instrument?.description && <p className="mb-2 text-cell text-fg-muted">{instrument.description}</p>}
        <div className="mb-3">
          <div className="mb-1.5 flex justify-between text-cell">
            <span className="text-fg-muted">24h range</span>
            {ready && (
              <span className={cn("num font-medium", t.changePct >= 0 ? "text-up" : "text-down")}>
                {formatPercent(t.changePct, locale)}
              </span>
            )}
          </div>
          {ready ? (
            <div
              role="meter"
              aria-label="Last price within the 24 hour range"
              aria-valuemin={t.low}
              aria-valuemax={t.high}
              aria-valuenow={t.last}
              className="relative h-1 rounded-full bg-hover"
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  t.changePct >= 0 ? "bg-up" : "bg-down",
                )}
                style={{ width: `${pos}%`, opacity: 0.55 }}
              />
              <div
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-panel"
                style={{ left: `${pos}%` }}
              />
            </div>
          ) : (
            <Skeleton className="h-1 w-full rounded-full" />
          )}
          <div className="num mt-1.5 flex justify-between text-meta text-fg-subtle">
            {ready ? (
              <>
                <span>{formatPrice(t.low, d, locale)}</span>
                <span>{formatPrice(t.high, d, locale)}</span>
              </>
            ) : (
              <>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-14" />
              </>
            )}
          </div>
        </div>
        <dl className="divide-y divide-line">
          {rows.map(([label, value], i) => (
            <div key={label} className="flex h-8 items-center justify-between">
              <dt className="text-cell text-fg-muted">{label}</dt>
              <dd className="num text-cell text-fg">
                {value ?? <Skeleton className="h-3" style={{ width: 56 + ((i * 17) % 28) }} />}
              </dd>
            </div>
          ))}
          {instrument && (
            <div className="flex h-8 items-center justify-between">
              <dt className="text-cell text-fg-muted">Tick size</dt>
              <dd className="num text-cell text-fg">{instrument.tickSize.replace(/\.?0+$/, "")}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
