import type { Ticker } from "./types";

/**
 * Change basis:
 * - "daily":   since the daily candle opened at 00:00 UTC — what TradingView shows
 * - "rolling": versus exactly 24 hours ago — what Binance's ticker reports
 */
export type ChangeBasis = "daily" | "rolling";

/** Change for display. Returns null in daily mode until the day's open is known (avoids a visible jump). */
export function changeFor(t: Ticker, basis: ChangeBasis): { change: number; changePct: number } | null {
  if (basis === "rolling") return { change: t.change, changePct: t.changePct };
  if (t.dayOpen === undefined || t.dayOpen <= 0) return null;
  const change = t.last - t.dayOpen;
  return { change, changePct: (change / t.dayOpen) * 100 };
}
