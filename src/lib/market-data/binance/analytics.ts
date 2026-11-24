/**
 * Market-analytics data for the signal scorecard: futures positioning (used
 * for analysis only — the app never trades futures), spot order book, and the
 * crypto Fear & Greed index. All public, keyless and CORS-enabled.
 */
import { z } from "zod";
import { getJson, query, WeightLimiter } from "../http";
import type { Instrument } from "../types";
import { BINANCE_HOSTS } from "./provider";

const num = z.union([z.string(), z.number()]).transform((v) => Number(v));

// /futures/data/* is limited to 1000 requests / 5 min per IP; budget well under it.
const futuresLimiter = new WeightLimiter(120);
const spotDepthLimiter = new WeightLimiter(600);

const F = BINANCE_HOSTS.futures.rest;
const opts = (weight: number, signal?: AbortSignal) => ({
  weight,
  limiter: futuresLimiter,
  ...(signal ? { signal } : {}),
});

/* --------------------------------- perps --------------------------------- */

const perpInfo = z.object({
  symbols: z.array(
    z.looseObject({
      symbol: z.string(),
      status: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      contractType: z.string(),
      underlyingType: z.string(),
      underlyingSubType: z.array(z.string()).optional(),
    }),
  ),
});
const fundingInfo = z.array(z.looseObject({ symbol: z.string(), fundingIntervalHours: z.number() }));

export type PerpCatalog = {
  /** USDT-margined perpetuals that are trading, by symbol → underlying type. */
  perps: Map<string, string>;
  fundingHours: Map<string, number>;
  /** Perp base asset → Binance sector tags (crypto perps only). */
  sectorTags: Map<string, string[]>;
};

export async function fetchPerpCatalog(signal?: AbortSignal): Promise<PerpCatalog> {
  const [info, funding] = await Promise.all([
    getJson(`${F}/fapi/v1/exchangeInfo`, perpInfo, opts(1, signal)),
    getJson(`${F}/fapi/v1/fundingInfo`, fundingInfo, opts(1, signal)),
  ]);
  const perps = new Map<string, string>();
  const sectorTags = new Map<string, string[]>();
  for (const s of info.symbols) {
    if (s.status !== "TRADING" || s.quoteAsset !== "USDT") continue;
    if (s.contractType !== "PERPETUAL" && s.contractType !== "TRADIFI_PERPETUAL") continue;
    perps.set(s.symbol, s.underlyingType);
    if (s.underlyingType === "COIN" && s.underlyingSubType?.length)
      sectorTags.set(s.baseAsset, s.underlyingSubType);
  }
  return {
    perps,
    fundingHours: new Map(funding.map((f) => [f.symbol, f.fundingIntervalHours])),
    sectorTags,
  };
}

/**
 * The futures twin used for positioning data. Ratios (funding, OI change,
 * long/short) are scale-free, so "1000PEPE" style contracts are fine.
 */
export function perpFor(i: Instrument, catalog: PerpCatalog): string | null {
  const has = (s: string, type?: string) => catalog.perps.has(s) && (!type || catalog.perps.get(s) === type);
  if (i.assetClass === "metal") return has("XAUUSDT") ? "XAUUSDT" : null; // PAXG/XAUT track gold
  if (i.assetClass === "stock") return has(`${i.displayName}USDT`, "EQUITY") ? `${i.displayName}USDT` : null;
  for (const s of [`${i.base}USDT`, `1000${i.base}USDT`, `1000000${i.base}USDT`])
    if (has(s, "COIN")) return s;
  return null;
}

/* ------------------------------- positioning ----------------------------- */

const fundingHist = z.array(z.looseObject({ fundingRate: num, fundingTime: z.number() }));
const oiHist = z.array(z.looseObject({ sumOpenInterestValue: num, timestamp: z.number() }));
const lsRatio = z.array(z.looseObject({ longShortRatio: num, timestamp: z.number() }));
const takerRatio = z.array(z.looseObject({ buySellRatio: num, timestamp: z.number() }));

export type Positioning = {
  fundingRates: number[];
  openInterest: { t: number; v: number }[];
  topTraderRatios: number[];
  crowdRatios: number[];
  takerRatios: number[];
};

/** `period` and `limit` set the window (intraday: 1h × 7 ≈ 6h; swing: 4h × 19 ≈ 3 days). */
export async function fetchPositioning(
  perp: string,
  period: "1h" | "4h",
  limit: number,
  signal?: AbortSignal,
): Promise<Positioning> {
  const q = (path: string, extra: Record<string, string | number> = {}) =>
    `${F}${path}${query({ symbol: perp, period, limit, ...extra })}`;
  const [funding, oi, top, crowd, taker] = await Promise.all([
    getJson(`${F}/fapi/v1/fundingRate${query({ symbol: perp, limit: 3 })}`, fundingHist, opts(1, signal)),
    getJson(q("/futures/data/openInterestHist"), oiHist, opts(1, signal)),
    getJson(q("/futures/data/topLongShortPositionRatio", { limit: 30 }), lsRatio, opts(1, signal)),
    getJson(q("/futures/data/globalLongShortAccountRatio", { limit: 30 }), lsRatio, opts(1, signal)),
    getJson(q("/futures/data/takerlongshortRatio"), takerRatio, opts(1, signal)),
  ]);
  return {
    fundingRates: funding.map((f) => f.fundingRate),
    openInterest: oi.map((o) => ({ t: o.timestamp, v: o.sumOpenInterestValue })),
    topTraderRatios: top.map((x) => x.longShortRatio),
    crowdRatios: crowd.map((x) => x.longShortRatio),
    takerRatios: taker.map((t) => t.buySellRatio),
  };
}

/* ------------------------------- order book ------------------------------ */

const depth = z.object({
  bids: z.array(z.tuple([num, num])),
  asks: z.array(z.tuple([num, num])),
});

export async function fetchOrderBook(symbol: string, signal?: AbortSignal) {
  return getJson(`${BINANCE_HOSTS.spot.rest}/api/v3/depth${query({ symbol, limit: 100 })}`, depth, {
    weight: 5,
    limiter: spotDepthLimiter,
    ...(signal ? { signal } : {}),
  });
}

/* ------------------------------- sentiment ------------------------------- */

const fng = z.object({
  data: z.array(z.looseObject({ value: num, value_classification: z.string() })).min(1),
});

/** alternative.me Crypto Fear & Greed Index (free, CORS-enabled, updates daily). */
export async function fetchFearGreed(signal?: AbortSignal): Promise<{ value: number; label: string }> {
  const r = await getJson("https://api.alternative.me/fng/?limit=1", fng, {
    weight: 1,
    limiter: futuresLimiter,
    ...(signal ? { signal } : {}),
  });
  return { value: r.data[0]!.value, label: r.data[0]!.value_classification };
}
