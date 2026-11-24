/**
 * Candle history cache + live merge, one entry per (symbol, timeframe).
 *
 * - Cache hits render instantly, then revalidate in the background.
 * - Live klines: same open time → replace the last bar; newer → append (a new
 *   candle at the boundary); older → ignored. Missed candles (e.g. after a
 *   reconnect) trigger a refetch to close the gap.
 * - Older history pages in via `endTime` until the exchange has no more.
 */
import { providerForKey } from "./registry";
import { TIMEFRAME_MS, type Timeframe } from "./timeframes";
import type { Kline, MarketDataProvider, SymbolKey } from "./types";

export type CandleEvent =
  | { type: "reset" } // full data replaced (initial load, revalidation, gap fill)
  | { type: "update"; bar: Kline; appended: boolean } // live tick on the last bar, or a new last bar
  | { type: "prepend"; count: number } // older history loaded on the left
  | { type: "status" };

export type CandleStatus = "idle" | "loading" | "ready" | "error";

export type MergeResult = "replace" | "append" | "ignore" | "gap";

/** Pure merge of one live kline into an ascending bar array (mutates `bars`). */
export function mergeLive(bars: Kline[], k: Kline, intervalMs: number): MergeResult {
  const last = bars[bars.length - 1];
  if (!last) {
    bars.push(k);
    return "append";
  }
  if (k.time === last.time) {
    bars[bars.length - 1] = k;
    return "replace";
  }
  if (k.time < last.time) return "ignore";
  bars.push(k);
  // Months have variable length; only flag gaps for fixed intervals.
  return intervalMs > 0 && k.time - last.time > intervalMs * 1.5 ? "gap" : "append";
}

type Entry = {
  key: SymbolKey;
  timeframe: Timeframe;
  bars: Kline[];
  status: CandleStatus;
  error: string | null;
  reachedStart: boolean;
  loadingOlder: boolean;
  fetchedAt: number;
  refs: number;
  closeLive: (() => void) | null;
  listeners: Set<(e: CandleEvent) => void>;
  inflight: Promise<void> | null;
};

const MAX_ENTRIES = 24;
const REVALIDATE_AFTER_MS = 15_000;
const PAGE = 1000;

export class CandleCache {
  private readonly entries = new Map<string, Entry>();
  private readonly watchedProviders = new Set<MarketDataProvider>();

  constructor(
    private readonly resolve: (key: SymbolKey) => {
      provider: MarketDataProvider;
      symbol: string;
    } = providerForKey,
    private readonly now: () => number = Date.now,
  ) {}

  private id(key: SymbolKey, tf: Timeframe) {
    return `${key}|${tf}`;
  }

  private entry(key: SymbolKey, tf: Timeframe): Entry {
    const id = this.id(key, tf);
    let e = this.entries.get(id);
    if (e) {
      // LRU: re-insert to mark as most recently used.
      this.entries.delete(id);
      this.entries.set(id, e);
      return e;
    }
    e = {
      key,
      timeframe: tf,
      bars: [],
      status: "idle",
      error: null,
      reachedStart: false,
      loadingOlder: false,
      fetchedAt: 0,
      refs: 0,
      closeLive: null,
      listeners: new Set(),
      inflight: null,
    };
    this.entries.set(id, e);
    this.evict();
    return e;
  }

  private evict() {
    for (const [id, e] of this.entries) {
      if (this.entries.size <= MAX_ENTRIES) break;
      if (e.refs === 0) this.entries.delete(id);
    }
  }

  get(
    key: SymbolKey,
    tf: Timeframe,
  ): { bars: readonly Kline[]; status: CandleStatus; error: string | null; reachedStart: boolean } {
    const e = this.entries.get(this.id(key, tf));
    return e
      ? { bars: e.bars, status: e.status, error: e.error, reachedStart: e.reachedStart }
      : { bars: [], status: "idle", error: null, reachedStart: false };
  }

  subscribe(key: SymbolKey, tf: Timeframe, listener: (e: CandleEvent) => void): () => void {
    const e = this.entry(key, tf);
    e.listeners.add(listener);
    return () => e.listeners.delete(listener);
  }

  /** Start (or keep) loading + streaming this series. Returns a release function. */
  retain(key: SymbolKey, tf: Timeframe): () => void {
    const e = this.entry(key, tf);
    e.refs += 1;
    if (e.status === "idle" || e.status === "error") void this.load(e);
    else if (this.now() - e.fetchedAt > REVALIDATE_AFTER_MS) void this.load(e);
    if (!e.closeLive) this.openLive(e);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      e.refs -= 1;
      if (e.refs === 0) {
        e.closeLive?.();
        e.closeLive = null;
        this.evict();
      }
    };
  }

  async loadOlder(key: SymbolKey, tf: Timeframe): Promise<number> {
    const e = this.entry(key, tf);
    const first = e.bars[0];
    if (!first || e.reachedStart || e.loadingOlder || e.status !== "ready") return 0;
    e.loadingOlder = true;
    try {
      const { provider, symbol } = this.resolve(key);
      const older = (await provider.getKlines(symbol, tf, { endTime: first.time - 1, limit: PAGE })).filter(
        (k) => k.time < first.time,
      );
      if (older.length === 0) e.reachedStart = true;
      else e.bars = [...older, ...e.bars];
      this.emit(e, { type: "prepend", count: older.length });
      return older.length;
    } catch {
      return 0;
    } finally {
      e.loadingOlder = false;
    }
  }

  private load(e: Entry): Promise<void> {
    e.inflight ??= (async () => {
      const first = e.status !== "ready";
      if (first) {
        e.status = "loading";
        this.emit(e, { type: "status" });
      }
      try {
        const { provider, symbol } = this.resolve(e.key);
        const latest = await provider.getKlines(symbol, e.timeframe, { limit: first ? PAGE : 500 });
        if (latest.length < PAGE && first) e.reachedStart = true;
        // Keep already-loaded older history; replace everything from the fetched window on.
        const from = latest[0]?.time ?? Infinity;
        e.bars = [...e.bars.filter((b) => b.time < from), ...latest];
        e.status = "ready";
        e.error = null;
        e.fetchedAt = this.now();
        this.emit(e, { type: "reset" });
        this.watchReconnects(provider);
      } catch (err) {
        if (e.status !== "ready") {
          e.status = "error";
          e.error = err instanceof Error ? err.message : String(err);
          this.emit(e, { type: "status" });
        }
      } finally {
        e.inflight = null;
      }
    })();
    return e.inflight;
  }

  private openLive(e: Entry) {
    const { provider, symbol } = this.resolve(e.key);
    const interval = e.timeframe === "1M" ? 0 : TIMEFRAME_MS[e.timeframe];
    e.closeLive = provider.subscribeKlines(symbol, e.timeframe, (k) => {
      if (e.status !== "ready") return; // the initial load will include this candle
      const res = mergeLive(e.bars, k, interval);
      if (res === "ignore") return;
      if (res === "gap") {
        void this.load(e); // refetch to fill the missed candles
        return;
      }
      this.emit(e, { type: "update", bar: k, appended: res === "append" });
    });
  }

  /** After a reconnect, candles may have been missed: revalidate everything that's on screen. */
  private watchReconnects(provider: MarketDataProvider) {
    if (this.watchedProviders.has(provider)) return;
    this.watchedProviders.add(provider);
    let prev = provider.connection.getStatus();
    provider.connection.onStatus((s) => {
      if (s === "live" && (prev === "reconnecting" || prev === "offline")) {
        for (const e of this.entries.values()) if (e.refs > 0 && e.status === "ready") void this.load(e);
      }
      prev = s;
    });
  }

  private emit(e: Entry, ev: CandleEvent) {
    for (const l of [...e.listeners]) l(ev);
  }
}

export const candleCache = new CandleCache();
