/**
 * Provider-neutral market data types. Nothing outside `lib/market-data/<provider>/`
 * may depend on a specific exchange's wire format.
 */
import type { Timeframe } from "./timeframes";

export type AssetClass = "crypto" | "metal" | "stock";

/** Globally unique symbol address: provider:market:symbol (e.g. binance:futures:XAUUSDT). */
export type SymbolKey = `${string}:${string}:${string}`;

export type SymbolRef = { provider: string; market: string; symbol: string };

export type Instrument = SymbolRef & {
  key: SymbolKey;
  base: string;
  quote: string;
  assetClass: AssetClass;
  /** Short human ticker, e.g. "AAPL" for the AAPLB bStock, "XAU" for gold. */
  displayName: string;
  /** Optional longer label, e.g. "Gold" (set when the provider knows it). */
  description?: string;
  /** Price increment as a decimal string ("0.01"); drives display precision. */
  tickSize: string;
  stepSize: string;
  priceDecimals: number;
  qtyDecimals: number;
  /** Derivative contract details; undefined for spot. */
  contract?: { type: "perpetual" | "delivery"; marginAsset: string };
};

export type Kline = {
  /** Open time, ms since epoch (UTC). */
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  /** False while the candle is still forming. */
  final: boolean;
};

export type Ticker = {
  key: SymbolKey;
  last: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  /** 24h volume in base units. */
  volume: number;
  /** 24h volume in quote units (USDT etc.) — the number traders compare. */
  quoteVolume: number;
  eventTime: number;
};

export type MarkPrice = {
  key: SymbolKey;
  markPrice: number;
  indexPrice: number;
  /** Funding rate as a fraction (0.0001 = 0.01%). */
  fundingRate: number;
  nextFundingTime: number;
  eventTime: number;
};

export type Unsubscribe = () => void;

export type SubscribeOptions = {
  /**
   * Keep streaming while the tab is hidden (e.g. alert evaluation).
   * Default false: hidden tabs pause the stream to save bandwidth and rate budget.
   */
  background?: boolean;
};

export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

export interface ConnectionSource {
  getStatus(): ConnectionStatus;
  onStatus(cb: (status: ConnectionStatus) => void): Unsubscribe;
}

export type KlineQuery = {
  /** Return candles that open at or before this time (ms) — for paging left. */
  endTime?: number;
  limit?: number;
  signal?: AbortSignal;
};

export type SearchOptions = { assetClass?: AssetClass; limit?: number; signal?: AbortSignal };

export interface MarketDataProvider {
  /** e.g. "binance" */
  readonly provider: string;
  /** e.g. "spot" | "futures" */
  readonly market: string;
  readonly label: string;
  readonly connection: ConnectionSource;
  /** Largest page `getKlines` accepts. */
  readonly maxKlinesPerRequest: number;

  getExchangeInfo(opts?: { signal?: AbortSignal; force?: boolean }): Promise<Instrument[]>;
  searchSymbols(query: string, opts?: SearchOptions): Promise<Instrument[]>;
  getKlines(symbol: string, timeframe: Timeframe, query?: KlineQuery): Promise<Kline[]>;
  /** REST 24h snapshot for many symbols (seeds prices before the first stream push). */
  getTickers(symbols: string[], opts?: { signal?: AbortSignal }): Promise<Ticker[]>;
  subscribeTicker(symbol: string, onTicker: (t: Ticker) => void, opts?: SubscribeOptions): Unsubscribe;
  subscribeKlines(
    symbol: string,
    timeframe: Timeframe,
    onKline: (k: Kline) => void,
    opts?: SubscribeOptions,
  ): Unsubscribe;

  /** Derivatives only. */
  getMarkPrice?(symbol: string, opts?: { signal?: AbortSignal }): Promise<MarkPrice>;
  subscribeMarkPrice?(symbol: string, onMark: (m: MarkPrice) => void, opts?: SubscribeOptions): Unsubscribe;

  /** Pause/resume foreground streams (called on document visibility changes). */
  setHidden(hidden: boolean): void;
}
