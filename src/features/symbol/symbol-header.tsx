"use client";

import { useEffect } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { SHORTCUTS } from "@/features/shell/shell-context";
import { useUi } from "@/features/shell/ui-store";
import { formatHotkey } from "@/lib/hooks/use-hotkeys";
import { useTickFlash } from "@/lib/hooks/use-tick-flash";
import { useInstrument, useMarkPrice, useTicker } from "@/lib/market-data/hooks";
import { formatChange, formatFundingRate, formatPercent, formatPrice } from "@/lib/market-data/precision";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import { cn } from "@/lib/utils/cn";
import { AssetClassChip } from "@/ui/chip";
import { Skeleton } from "@/ui/skeleton";
import { Tooltip } from "@/ui/tooltip";

/** Symbol + live price + change (and mark/funding for futures) in the top bar. */
export function SymbolHeader() {
  const key = useChart((s) => s.symbol);
  const { symbol, market } = parseSymbolKey(key);
  const instrument = useInstrument(key);
  const ticker = useTicker(key);
  const mark = useMarkPrice(key);
  const locale = useSettings((s) => s.numberFormat);
  const decimals = instrument?.priceDecimals;

  const flash = useTickFlash(ticker?.last);
  useDocumentTitle(
    ticker && decimals !== undefined
      ? `${symbol} ${formatPrice(ticker.last, decimals, locale)} ${ticker.changePct >= 0 ? "▲" : "▼"}${Math.abs(ticker.changePct).toFixed(2)}%`
      : null,
  );

  const dir = ticker ? (ticker.change > 0 ? "up" : ticker.change < 0 ? "down" : "flat") : "flat";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Tooltip content="Change symbol" shortcut={formatHotkey(SHORTCUTS.search)}>
        <button
          type="button"
          onClick={() => useUi.getState().setSearchOpen(true)}
          className="flex h-7 items-center gap-2 rounded-control px-2 hover:bg-hover"
        >
          <span className="text-title font-semibold tracking-tight">{instrument?.displayName ?? symbol}</span>
          {instrument && instrument.displayName !== symbol && (
            <span className="hidden text-cell text-fg-subtle xl:inline">{symbol}</span>
          )}
          {instrument && (
            <AssetClassChip assetClass={instrument.assetClass} className="hidden md:inline-flex" />
          )}
          {market === "futures" && <span className="hidden text-meta text-fg-subtle md:inline">PERP</span>}
        </button>
      </Tooltip>

      {ticker && decimals !== undefined ? (
        <div className="hidden items-baseline gap-2 md:flex">
          <span
            className={cn(
              "num -mx-1 rounded-[3px] px-1 text-title font-semibold",
              flash.dir === "up" && "animate-flash-up",
              flash.dir === "down" && "animate-flash-down",
            )}
            key={flash.seq}
          >
            {formatPrice(ticker.last, decimals, locale)}
          </span>
          <span
            className={cn(
              "num text-cell font-medium",
              dir === "up" && "text-up",
              dir === "down" && "text-down",
              dir === "flat" && "text-fg-muted",
            )}
          >
            {formatChange(ticker.change, decimals, locale)} ({formatPercent(ticker.changePct, locale)})
          </span>
          <span className="sr-only">
            {`24 hour change ${dir === "down" ? "down" : "up"} ${Math.abs(ticker.changePct).toFixed(2)} percent`}
          </span>
        </div>
      ) : (
        <div className="hidden items-baseline gap-2 md:flex" aria-label="Price loading">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}

      {market === "futures" && (
        <div className="hidden items-center gap-3 border-l border-line pl-3 text-cell 2xl:flex">
          <span className="text-fg-subtle">
            Mark{" "}
            <span className="num text-fg-muted">
              {mark && decimals !== undefined ? formatPrice(mark.markPrice, decimals, locale) : "—"}
            </span>
          </span>
          <span className="text-fg-subtle">
            Funding{" "}
            <span className={cn("num", mark && (mark.fundingRate >= 0 ? "text-up" : "text-down"))}>
              {mark ? formatFundingRate(mark.fundingRate, locale) : "—"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const original = document.title;
    document.title = title;
    return () => {
      document.title = original;
    };
  }, [title]);
}
