/**
 * Binance adapters (Spot and USDⓈ-M Futures) behind MarketDataProvider.
 * All Binance specifics — hosts, weights, wire formats — stay in this folder.
 */
import { z } from "zod";
import { getJson, query, WeightLimiter } from "../http";
import { InstrumentCache } from "../instrument-cache";
import { decimalsFromStep } from "../precision";
import { rankInstruments } from "../search";
import { toSymbolKey } from "../symbol-key";
import type { Timeframe } from "../timeframes";
import type {
  Instrument,
  Kline,
  KlineQuery,
  MarketDataProvider,
  MarkPrice,
  SearchOptions,
  SubscribeOptions,
  Ticker,
  Unsubscribe,
} from "../types";
import { StreamManager } from "../ws/stream-manager";
import { classifyFutures, classifySpot } from "./classify";
import {
  futuresExchangeInfo,
  klines as klinesSchema,
  premiumIndex,
  restMiniTickers,
  restTicker,
  restTickers,
  spotExchangeInfo,
  wsKline,
  wsMarkPrice,
  wsTicker,
} from "./schemas";

export const BINANCE_HOSTS = {
  spot: {
    // Market-data-only hosts: not region-gated like api.binance.com, no API key needed.
    rest: "https://data-api.binance.vision",
    ws: "wss://data-stream.binance.vision/stream",
  },
  futures: {
    rest: "https://fapi.binance.com",
    // Market streams moved to /market; the legacy /stream path acks SUBSCRIBE but sends no data.
    ws: "wss://fstream.binance.com/market/stream",
  },
} as const;

type MarketName = keyof typeof BINANCE_HOSTS;

type MarketConfig = {
  market: MarketName;
  label: string;
  /** Requests budget at half the published limit to leave room for retries and other tabs. */
  weightBudget: number;
  maxControlPerSecond: number;
  maxKlines: number;
  klineWeight: (limit: number) => number;
  exchangeInfo: { path: string; weight: number };
  parseInstruments: (json: unknown) => Instrument[];
  klinesPath: string;
};

const BINANCE_INTERVAL: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

function filterValue(filters: { filterType: string }[], type: string, field: string): string {
  const f = filters.find((x) => x.filterType === type) as Record<string, unknown> | undefined;
  const v = f?.[field];
  return typeof v === "string" ? v : "0.01";
}

const SPOT: MarketConfig = {
  market: "spot",
  label: "Binance Spot",
  weightBudget: 3000, // limit 6000/min
  maxControlPerSecond: 5,
  maxKlines: 1000,
  klineWeight: () => 2,
  // showPermissionSets=false cuts the payload ~10×; TRADING-only drops delisted pairs.
  exchangeInfo: { path: "/api/v3/exchangeInfo?showPermissionSets=false&symbolStatus=TRADING", weight: 20 },
  klinesPath: "/api/v3/klines",
  parseInstruments: (json) => {
    const info = spotExchangeInfo.parse(json);
    return info.symbols
      .filter((s) => s.status === "TRADING")
      .map((s) => {
        const tickSize = filterValue(s.filters, "PRICE_FILTER", "tickSize");
        const stepSize = filterValue(s.filters, "LOT_SIZE", "stepSize");
        const { assetClass, displayName, description } = classifySpot(s);
        const ref = { provider: "binance", market: "spot", symbol: s.symbol };
        return {
          ...ref,
          key: toSymbolKey(ref),
          base: s.baseAsset,
          quote: s.quoteAsset,
          assetClass,
          displayName,
          ...(description ? { description } : {}),
          tickSize,
          stepSize,
          priceDecimals: decimalsFromStep(tickSize),
          qtyDecimals: decimalsFromStep(stepSize),
        } satisfies Instrument;
      });
  },
};

const FUTURES: MarketConfig = {
  market: "futures",
  label: "Binance USDⓈ-M Futures",
  weightBudget: 1200, // limit 2400/min
  maxControlPerSecond: 10,
  maxKlines: 1500,
  klineWeight: (limit) => (limit <= 100 ? 1 : limit <= 500 ? 2 : limit <= 1000 ? 5 : 10),
  exchangeInfo: { path: "/fapi/v1/exchangeInfo", weight: 1 },
  klinesPath: "/fapi/v1/klines",
  parseInstruments: (json) => {
    const info = futuresExchangeInfo.parse(json);
    const out: Instrument[] = [];
    for (const s of info.symbols) {
      if (s.status !== "TRADING") continue;
      if (s.contractType !== "PERPETUAL" && s.contractType !== "TRADIFI_PERPETUAL") continue;
      const cls = classifyFutures(s);
      if (!cls) continue;
      const tickSize = filterValue(s.filters, "PRICE_FILTER", "tickSize");
      const stepSize = filterValue(s.filters, "LOT_SIZE", "stepSize");
      const ref = { provider: "binance", market: "futures", symbol: s.symbol };
      out.push({
        ...ref,
        key: toSymbolKey(ref),
        base: s.baseAsset,
        quote: s.quoteAsset,
        assetClass: cls.assetClass,
        displayName: cls.displayName,
        ...(cls.description ? { description: cls.description } : {}),
        tickSize,
        stepSize,
        priceDecimals: decimalsFromStep(tickSize),
        qtyDecimals: decimalsFromStep(stepSize),
        contract: { type: "perpetual", marginAsset: s.marginAsset },
      });
    }
    return out;
  },
};

export type BinanceProviderDeps = {
  fetchImpl?: typeof fetch;
  streams?: StreamManager;
  onWarning?: (message: string) => void;
};

export class BinanceProvider implements MarketDataProvider {
  readonly provider = "binance";
  readonly market: MarketName;
  readonly label: string;
  readonly maxKlinesPerRequest: number;
  readonly streams: StreamManager;
  readonly limiter: WeightLimiter;
  readonly instruments: InstrumentCache;
  private readonly cfg: MarketConfig;
  protected readonly fetchImpl: typeof fetch;
  private readonly warn: (m: string) => void;
  private readonly warned = new Set<string>();

  constructor(cfg: MarketConfig, deps: BinanceProviderDeps = {}) {
    this.cfg = cfg;
    this.market = cfg.market;
    this.label = cfg.label;
    this.maxKlinesPerRequest = cfg.maxKlines;
    this.fetchImpl = deps.fetchImpl ?? ((...a) => fetch(...a));
    this.warn = deps.onWarning ?? ((m) => console.warn(`[${this.label}] ${m}`));
    this.limiter = new WeightLimiter(cfg.weightBudget);
    this.streams =
      deps.streams ??
      new StreamManager({
        url: BINANCE_HOSTS[cfg.market].ws,
        maxControlPerSecond: cfg.maxControlPerSecond,
        onWarning: this.warn,
      });
    this.instruments = new InstrumentCache(`binance:${cfg.market}`, (signal) =>
      this.fetchInstruments(signal),
    );
  }

  get connection() {
    return this.streams;
  }

  protected url(path: string) {
    return `${BINANCE_HOSTS[this.cfg.market].rest}${path}`;
  }

  private async fetchInstruments(signal?: AbortSignal): Promise<Instrument[]> {
    // Validate in the parser (zod) rather than in getJson so we parse the big payload once.
    const json = await getJson(this.url(this.cfg.exchangeInfo.path), z.unknown(), {
      weight: this.cfg.exchangeInfo.weight,
      limiter: this.limiter,
      fetchImpl: this.fetchImpl,
      ...(signal ? { signal } : {}),
    });
    return this.cfg.parseInstruments(json);
  }

  getExchangeInfo(opts: { signal?: AbortSignal; force?: boolean } = {}): Promise<Instrument[]> {
    return this.instruments.get(opts);
  }

  async searchSymbols(q: string, opts: SearchOptions = {}): Promise<Instrument[]> {
    const all = await this.getExchangeInfo(opts.signal ? { signal: opts.signal } : {});
    return rankInstruments(all, q, opts);
  }

  async getKlines(symbol: string, timeframe: Timeframe, q: KlineQuery = {}): Promise<Kline[]> {
    const limit = Math.min(q.limit ?? this.cfg.maxKlines, this.cfg.maxKlines);
    const url = this.url(
      this.cfg.klinesPath +
        query({ symbol, interval: BINANCE_INTERVAL[timeframe], limit, endTime: q.endTime }),
    );
    const rows = await getJson(url, klinesSchema, {
      weight: this.cfg.klineWeight(limit),
      limiter: this.limiter,
      fetchImpl: this.fetchImpl,
      ...(q.signal ? { signal: q.signal } : {}),
    });
    const now = Date.now();
    return rows.map((r) => ({
      time: r[0],
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: r[5],
      closeTime: r[6],
      quoteVolume: r[7],
      trades: r[8],
      final: r[6] < now,
    }));
  }

  async getTickers(symbols: string[], opts: { signal?: AbortSignal } = {}): Promise<Ticker[]> {
    if (symbols.length === 0) return [];
    const signal = opts.signal ? { signal: opts.signal } : {};
    const requests =
      this.market === "spot"
        ? // Spot batches: weight 2 for ≤20 symbols, 40 for ≤100.
          chunk(symbols, 100).map((part) => ({
            url: this.url(`/api/v3/ticker/24hr${query({ symbols: JSON.stringify(part) })}`),
            weight: part.length <= 20 ? 2 : 40,
          }))
        : // Futures has no multi-symbol filter (all-symbols costs 40); single symbol costs 1.
          symbols.map((s) => ({ url: this.url(`/fapi/v1/ticker/24hr${query({ symbol: s })}`), weight: 1 }));

    const results = await Promise.all(
      requests.map((r) =>
        getJson(r.url, this.market === "spot" ? restTickers : restTicker, {
          weight: r.weight,
          limiter: this.limiter,
          fetchImpl: this.fetchImpl,
          ...signal,
        }),
      ),
    );
    return results.flat().map((d) => ({
      key: toSymbolKey({ provider: "binance", market: this.market, symbol: d.symbol }),
      last: d.lastPrice,
      open: d.openPrice,
      high: d.highPrice,
      low: d.lowPrice,
      change: d.priceChange,
      changePct: d.priceChangePercent,
      volume: d.volume,
      quoteVolume: d.quoteVolume,
      eventTime: d.closeTime,
    }));
  }

  async getAllTickers(opts: { signal?: AbortSignal } = {}): Promise<Ticker[]> {
    // Spot: type=MINI for all symbols costs 80; futures all-symbols costs 40.
    const spot = this.market === "spot";
    const rows = await getJson(
      this.url(spot ? "/api/v3/ticker/24hr?type=MINI" : "/fapi/v1/ticker/24hr"),
      restMiniTickers,
      {
        weight: spot ? 80 : 40,
        limiter: this.limiter,
        fetchImpl: this.fetchImpl,
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
    );
    return rows.map((d) => {
      const change = d.lastPrice - d.openPrice;
      return {
        key: toSymbolKey({ provider: "binance", market: this.market, symbol: d.symbol }),
        last: d.lastPrice,
        open: d.openPrice,
        high: d.highPrice,
        low: d.lowPrice,
        change,
        changePct: d.openPrice ? (change / d.openPrice) * 100 : 0,
        volume: d.volume,
        quoteVolume: d.quoteVolume,
        eventTime: d.closeTime,
      };
    });
  }

  subscribeTicker(symbol: string, onTicker: (t: Ticker) => void, opts: SubscribeOptions = {}): Unsubscribe {
    const key = toSymbolKey({ provider: "binance", market: this.market, symbol });
    const stream = `${symbol.toLowerCase()}@ticker`;
    return this.streams.subscribe(
      stream,
      (data) => {
        const p = wsTicker.safeParse(data);
        if (!p.success) return this.warnOnce(stream, p.error.issues[0]?.message);
        const d = p.data;
        onTicker({
          key,
          last: d.c,
          open: d.o,
          high: d.h,
          low: d.l,
          change: d.p,
          changePct: d.P,
          volume: d.v,
          quoteVolume: d.q,
          eventTime: d.E,
        });
      },
      opts,
    );
  }

  subscribeKlines(
    symbol: string,
    timeframe: Timeframe,
    onKline: (k: Kline) => void,
    opts: SubscribeOptions = {},
  ): Unsubscribe {
    const stream = `${symbol.toLowerCase()}@kline_${BINANCE_INTERVAL[timeframe]}`;
    return this.streams.subscribe(
      stream,
      (data) => {
        const p = wsKline.safeParse(data);
        if (!p.success) return this.warnOnce(stream, p.error.issues[0]?.message);
        const k = p.data.k;
        onKline({
          time: k.t,
          closeTime: k.T,
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
          volume: k.v,
          quoteVolume: k.q,
          trades: k.n,
          final: k.x,
        });
      },
      opts,
    );
  }

  setHidden(hidden: boolean): void {
    this.streams.setHidden(hidden);
  }

  private warnOnce(stream: string, msg: string | undefined) {
    if (this.warned.has(stream)) return;
    this.warned.add(stream);
    this.warn(`Unexpected ${stream} payload: ${msg ?? "invalid"}`);
  }
}

export class BinanceFuturesProvider extends BinanceProvider {
  constructor(deps: BinanceProviderDeps = {}) {
    super(FUTURES, deps);
  }

  async getMarkPrice(symbol: string, opts: { signal?: AbortSignal } = {}): Promise<MarkPrice> {
    const d = await getJson(this.url(`/fapi/v1/premiumIndex${query({ symbol })}`), premiumIndex, {
      weight: 1,
      limiter: this.limiter,
      fetchImpl: this.fetchImpl,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    return {
      key: toSymbolKey({ provider: "binance", market: "futures", symbol }),
      markPrice: d.markPrice,
      indexPrice: d.indexPrice,
      fundingRate: d.lastFundingRate,
      nextFundingTime: d.nextFundingTime,
      eventTime: d.time,
    };
  }

  subscribeMarkPrice(
    symbol: string,
    onMark: (m: MarkPrice) => void,
    opts: SubscribeOptions = {},
  ): Unsubscribe {
    const key = toSymbolKey({ provider: "binance", market: "futures", symbol });
    return this.streams.subscribe(
      `${symbol.toLowerCase()}@markPrice@1s`,
      (data) => {
        const p = wsMarkPrice.safeParse(data);
        if (!p.success) return;
        const d = p.data;
        onMark({
          key,
          markPrice: d.p,
          indexPrice: d.i,
          fundingRate: d.r,
          nextFundingTime: d.T,
          eventTime: d.E,
        });
      },
      opts,
    );
  }
}

export class BinanceSpotProvider extends BinanceProvider {
  constructor(deps: BinanceProviderDeps = {}) {
    super(SPOT, deps);
  }
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export const __test = { SPOT, FUTURES, BINANCE_INTERVAL };
