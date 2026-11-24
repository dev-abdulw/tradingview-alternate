/**
 * zod schemas for the Binance responses we consume. Only fields we read are
 * declared; unknown fields pass through untouched so Binance adding fields
 * never breaks us, while a missing or retyped field fails loudly here.
 */
import { z } from "zod";

const num = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `Not a number: ${String(v)}` });
    return z.NEVER;
  }
  return n;
});

const filter = z.looseObject({ filterType: z.string() });

export const priceFilter = z.looseObject({ filterType: z.literal("PRICE_FILTER"), tickSize: z.string() });
export const lotSizeFilter = z.looseObject({ filterType: z.literal("LOT_SIZE"), stepSize: z.string() });
export const percentPriceBySide = z.looseObject({
  filterType: z.literal("PERCENT_PRICE_BY_SIDE"),
  bidMultiplierUp: z.string(),
  bidMultiplierDown: z.string(),
  askMultiplierUp: z.string(),
  askMultiplierDown: z.string(),
});

export const spotSymbol = z.looseObject({
  symbol: z.string(),
  status: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  filters: z.array(filter),
});
export type SpotSymbol = z.infer<typeof spotSymbol>;

export const spotExchangeInfo = z.looseObject({
  serverTime: z.number(),
  symbols: z.array(spotSymbol),
});

export const futuresSymbol = z.looseObject({
  symbol: z.string(),
  status: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  marginAsset: z.string(),
  contractType: z.string(),
  underlyingType: z.string(),
  filters: z.array(filter),
});
export type FuturesSymbol = z.infer<typeof futuresSymbol>;

export const futuresExchangeInfo = z.looseObject({
  serverTime: z.number(),
  symbols: z.array(futuresSymbol),
});

/** [openTime, o, h, l, c, v, closeTime, quoteVol, trades, takerBase, takerQuote, ignore] */
export const klineRow = z
  .tuple([z.number(), num, num, num, num, num, z.number(), num, z.number(), num])
  .rest(z.unknown());
export const klines = z.array(klineRow);

export const premiumIndex = z.looseObject({
  symbol: z.string(),
  markPrice: num,
  indexPrice: num,
  lastFundingRate: num,
  nextFundingTime: z.number(),
  time: z.number(),
});

/* ------------------------------ WebSocket events ------------------------------ */

export const wsTicker = z.looseObject({
  e: z.literal("24hrTicker"),
  E: z.number(),
  s: z.string(),
  p: num,
  P: num,
  c: num,
  o: num,
  h: num,
  l: num,
  v: num,
  q: num,
});

export const wsKline = z.looseObject({
  e: z.literal("kline"),
  E: z.number(),
  s: z.string(),
  k: z.looseObject({
    t: z.number(),
    T: z.number(),
    i: z.string(),
    o: num,
    c: num,
    h: num,
    l: num,
    v: num,
    q: num,
    n: z.number(),
    x: z.boolean(),
    V: num.optional(),
  }),
});

export const wsMarkPrice = z.looseObject({
  e: z.literal("markPriceUpdate"),
  E: z.number(),
  s: z.string(),
  p: num,
  i: num,
  r: num,
  T: z.number(),
});

export const restTicker = z.looseObject({
  symbol: z.string(),
  priceChange: num,
  priceChangePercent: num,
  lastPrice: num,
  openPrice: num,
  highPrice: num,
  lowPrice: num,
  volume: num,
  quoteVolume: num,
  closeTime: z.number(),
});
export const restTickers = z.array(restTicker);

/** `type=MINI` 24h ticker (no change fields — computed from open/last). */
export const restMiniTickers = z.array(
  z.looseObject({
    symbol: z.string(),
    openPrice: num,
    highPrice: num,
    lowPrice: num,
    lastPrice: num,
    volume: num,
    quoteVolume: num,
    closeTime: z.number(),
  }),
);
