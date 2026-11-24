"use client";

import { ChevronDown } from "lucide-react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { useShell } from "@/features/shell/shell-context";
import { SignalsPanel } from "@/features/signals/signals-panel";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";
import { useInstrument, useTicker } from "@/lib/market-data/hooks";
import { formatPercent, formatPrice, formatVolume } from "@/lib/market-data/precision";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import { cn } from "@/lib/utils/cn";
import { AssetClassChip } from "@/ui/chip";
import { Skeleton } from "@/ui/skeleton";

/** Collapsible symbol panel: Details (24h range, high/low, volume) and Signals (scorecard). */
export const usePanelTab = create<{
  tab: "details" | "signals";
  setTab: (t: "details" | "signals") => void;
}>()(
  persist((set) => ({ tab: "details", setTab: (tab) => set({ tab }) }), {
    name: storageKey("symbol-panel-tab"),
    storage: createJSONStorage(() => zustandStorage),
  }),
);

export function SymbolDetailsPanel() {
  const { detailsCollapsed, toggleDetails } = useShell();
  const tab = usePanelTab((s) => s.tab);
  const setTab = usePanelTab((s) => s.setTab);
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
      <div className="flex h-9 shrink-0 items-center gap-1 pr-1 pl-2">
        <div role="tablist" aria-label="Symbol panel" className="flex items-center gap-0.5">
          {(["details", "signals"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                if (detailsCollapsed) toggleDetails();
              }}
              className={cn(
                "h-6 rounded-[5px] px-2 text-cell font-medium",
                tab === t ? "bg-hover text-fg" : "text-fg-subtle hover:text-fg",
              )}
            >
              {t === "details" ? "Details" : "Signals"}
            </button>
          ))}
        </div>
        <span className="ml-1 truncate text-cell text-fg-muted">{instrument?.displayName ?? symbol}</span>
        {instrument && <AssetClassChip assetClass={instrument.assetClass} />}
        <button
          type="button"
          onClick={toggleDetails}
          aria-expanded={!detailsCollapsed}
          aria-label={detailsCollapsed ? "Expand panel" : "Collapse panel"}
          className="ml-auto inline-flex size-7 items-center justify-center rounded-control text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-[var(--motion-base)]",
              detailsCollapsed && "-rotate-90",
            )}
          />
        </button>
      </div>
      {tab === "signals" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1">
          {!detailsCollapsed && <SignalsPanel symbol={key} />}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-busy={!ready}>
          {instrument?.description && (
            <p className="mb-2 text-cell text-fg-muted">{instrument.description}</p>
          )}
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
      )}
    </section>
  );
}
