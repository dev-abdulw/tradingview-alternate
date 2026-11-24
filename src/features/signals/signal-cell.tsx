"use client";

import { useQuery } from "@tanstack/react-query";
import type { SymbolKey } from "@/lib/market-data/types";
import { lastClosedIndex, technicalScoreAt } from "@/lib/signals/engine";
import { HORIZON_CONFIG, VERDICT_THRESHOLD, type Horizon } from "@/lib/signals/types";
import { cn } from "@/lib/utils/cn";
import { fetchHistory } from "./use-signals";

/**
 * Lightweight per-row signal for the watchlist: technical factors only (no
 * futures positioning — that would be too many requests for a long list).
 * Rows are virtualized, so only visible rows fetch.
 */
export function useLiteSignal(key: SymbolKey, horizon: Horizon) {
  const cfg = HORIZON_CONFIG[horizon];
  return useQuery({
    queryKey: ["signals", "lite", key, horizon],
    queryFn: async ({ signal }) => {
      const bars = await fetchHistory(key, cfg.primary, 300, signal);
      const i = lastClosedIndex(bars);
      return i >= 60 ? technicalScoreAt(horizon, bars, i).score : null;
    },
    staleTime: horizon === "intraday" ? 10 * 60_000 : 60 * 60_000,
    retry: 1,
  });
}

export function SignalCell({ symbolKey, horizon }: { symbolKey: SymbolKey; horizon: Horizon }) {
  const { data: score, isLoading } = useLiteSignal(symbolKey, horizon);
  if (isLoading) return <span className="text-fg-disabled">·</span>;
  if (score === null || score === undefined) return <span className="text-fg-disabled">–</span>;
  const dir = score >= VERDICT_THRESHOLD ? "up" : score <= -VERDICT_THRESHOLD ? "down" : "flat";
  const label = `${HORIZON_CONFIG[horizon].label} technical signal: ${dir === "up" ? "bullish" : dir === "down" ? "bearish" : "neutral"}, score ${score}`;
  return (
    <span
      title={`${label} (rule-based, not advice)`}
      aria-label={label}
      className={cn(
        "font-medium",
        dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-fg-subtle",
      )}
    >
      {dir === "up" ? "▲" : dir === "down" ? "▼" : "•"}
    </span>
  );
}
