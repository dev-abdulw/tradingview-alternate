/**
 * Asset-class classification for Binance instruments, derived from
 * exchangeInfo at runtime — no hardcoded stock symbol lists.
 *
 * bStocks (tokenized US stocks/ETFs on spot) — see docs/market-data.md:
 *   1. base asset = "<TICKER>B" (AAPLB, NVDAB, SPYB), quoted in USDT, and
 *   2. PERCENT_PRICE_BY_SIDE uses the tight "low-volatility" band
 *      (bid 1.1/0.8, ask 1.2/0.9) instead of the crypto band (1.2/0.5, 2/0.8).
 * Rule 1 alone is ambiguous (BNB, ARB, SHIB, BB, CKB are crypto). Rule 2
 * alone also matches fiat pairs, PAXG and XAUT. Together they matched
 * exactly the 113 bStocks on 2026-11-24, 109 of which also have a futures
 * EQUITY perpetual on the same ticker.
 *
 * Metals (futures): underlyingType COMMODITY with a precious/industrial metal
 * base (XAU, XAG, XPT, XPD, COPPER). Energy commodities are excluded in v1.
 */
import type { AssetClass } from "../types";
import type { FuturesSymbol, SpotSymbol } from "./schemas";

export const STOCK_QUOTES = new Set(["USDT"]);
const STOCK_BAND = { bidUp: 1.1, bidDown: 0.8, askUp: 1.2, askDown: 0.9 };

/** ISO-4217-style metal codes Binance uses as base assets — codes, not symbols. */
export const METAL_BASES: Record<string, string> = {
  XAU: "Gold",
  XAG: "Silver",
  XPT: "Platinum",
  XPD: "Palladium",
  COPPER: "Copper",
};

type Band = { bidUp: number; bidDown: number; askUp: number; askDown: number };

export function priceBand(filters: { filterType: string }[]): Band | null {
  const f = filters.find((x) => x.filterType === "PERCENT_PRICE_BY_SIDE") as
    | {
        bidMultiplierUp?: string;
        bidMultiplierDown?: string;
        askMultiplierUp?: string;
        askMultiplierDown?: string;
      }
    | undefined;
  if (!f) return null;
  return {
    bidUp: Number(f.bidMultiplierUp),
    bidDown: Number(f.bidMultiplierDown),
    askUp: Number(f.askMultiplierUp),
    askDown: Number(f.askMultiplierDown),
  };
}

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function isStockBand(b: Band | null): boolean {
  return (
    b !== null &&
    eq(b.bidUp, STOCK_BAND.bidUp) &&
    eq(b.bidDown, STOCK_BAND.bidDown) &&
    eq(b.askUp, STOCK_BAND.askUp) &&
    eq(b.askDown, STOCK_BAND.askDown)
  );
}

export function isBStock(s: Pick<SpotSymbol, "baseAsset" | "quoteAsset" | "filters">): boolean {
  return (
    STOCK_QUOTES.has(s.quoteAsset) &&
    s.baseAsset.length >= 2 &&
    s.baseAsset.endsWith("B") &&
    isStockBand(priceBand(s.filters))
  );
}

/**
 * Gold-backed tokens on spot (asset codes, like METAL_BASES). Binance spot has
 * no silver. The user trades spot only, so these are the app's Metals.
 */
export const SPOT_METAL_BASES: Record<string, string> = {
  PAXG: "Gold (Pax Gold)",
  XAUT: "Gold (Tether Gold)",
};

export function classifySpot(s: Pick<SpotSymbol, "baseAsset" | "quoteAsset" | "filters">): {
  assetClass: AssetClass;
  displayName: string;
  description?: string;
} {
  if (isBStock(s)) return { assetClass: "stock", displayName: s.baseAsset.slice(0, -1) };
  const metal = SPOT_METAL_BASES[s.baseAsset];
  if (metal) return { assetClass: "metal", displayName: s.baseAsset, description: metal };
  return { assetClass: "crypto", displayName: s.baseAsset };
}

/** Returns null for futures contracts the app doesn't expose in v1. */
export function classifyFutures(
  s: Pick<FuturesSymbol, "baseAsset" | "underlyingType">,
): { assetClass: AssetClass; displayName: string; description?: string } | null {
  if (s.underlyingType === "COMMODITY" && s.baseAsset in METAL_BASES) {
    return { assetClass: "metal", displayName: s.baseAsset, description: METAL_BASES[s.baseAsset] };
  }
  return null;
}
