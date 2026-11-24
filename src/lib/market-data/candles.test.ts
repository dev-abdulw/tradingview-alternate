import { describe, expect, it, vi } from "vitest";
import { CandleCache, mergeLive, type CandleEvent } from "./candles";
import type { ConnectionStatus, Kline, MarketDataProvider, SymbolKey } from "./types";

const M = 60_000;
const k = (time: number, close: number, final = false): Kline => ({
  time,
  closeTime: time + M - 1,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
  quoteVolume: close,
  trades: 1,
  final,
});

describe("mergeLive at candle boundaries", () => {
  it("replaces the forming candle, then appends exactly one new candle at the boundary", () => {
    const bars = [k(0, 1, true), k(M, 2)];
    expect(mergeLive(bars, k(M, 2.5), M)).toBe("replace");
    expect(bars).toHaveLength(2);
    expect(bars[1]!.close).toBe(2.5);
    // The closing tick of the minute (x=true), then the first tick of the next minute.
    expect(mergeLive(bars, k(M, 2.7, true), M)).toBe("replace");
    expect(bars[1]).toMatchObject({ close: 2.7, final: true });
    expect(mergeLive(bars, k(2 * M, 3), M)).toBe("append");
    expect(bars.map((b) => b.time)).toEqual([0, M, 2 * M]);
  });

  it("ignores stale out-of-order klines", () => {
    const bars = [k(0, 1), k(M, 2)];
    expect(mergeLive(bars, k(0, 9), M)).toBe("ignore");
    expect(bars[0]!.close).toBe(1);
  });

  it("flags missed candles as a gap", () => {
    const bars = [k(0, 1)];
    expect(mergeLive(bars, k(3 * M, 2), M)).toBe("gap");
  });

  it("never flags gaps for monthly candles (variable length)", () => {
    const bars = [k(0, 1)];
    expect(mergeLive(bars, k(40 * 86_400_000, 2), 0)).toBe("append");
  });
});

function fakeProvider(pages: Kline[][]) {
  let onKline: ((k: Kline) => void) | null = null;
  let statusCb: ((s: ConnectionStatus) => void) | null = null;
  const getKlines = vi.fn(async () => pages.shift() ?? []);
  const provider = {
    getKlines,
    subscribeKlines: vi.fn((_s: string, _tf: string, cb: (k: Kline) => void) => {
      onKline = cb;
      return () => (onKline = null);
    }),
    connection: {
      getStatus: () => "live" as ConnectionStatus,
      onStatus: (cb: (s: ConnectionStatus) => void) => ((statusCb = cb), () => {}),
    },
  } as unknown as MarketDataProvider;
  return {
    provider,
    getKlines,
    push: (x: Kline) => onKline?.(x),
    status: (s: ConnectionStatus) => statusCb?.(s),
    live: () => onKline !== null,
  };
}

const KEY = "binance:spot:BTCUSDT" as SymbolKey;

describe("CandleCache", () => {
  it("loads once, streams live updates, and serves cache hits instantly", async () => {
    const latest = Array.from({ length: 5 }, (_, i) => k(i * M, i));
    const f = fakeProvider([latest, latest]);
    let t = 0;
    const cache = new CandleCache(
      () => ({ provider: f.provider, symbol: "BTCUSDT" }),
      () => t,
    );
    const events: CandleEvent["type"][] = [];
    cache.subscribe(KEY, "1m", (e) => events.push(e.type));

    const release = cache.retain(KEY, "1m");
    await vi.waitFor(() => expect(cache.get(KEY, "1m").status).toBe("ready"));
    expect(cache.get(KEY, "1m").bars).toHaveLength(5);

    f.push(k(4 * M, 4.5)); // replace forming bar
    f.push(k(5 * M, 5)); // boundary → append
    expect(cache.get(KEY, "1m").bars).toHaveLength(6);
    expect(events).toEqual(["status", "reset", "update", "update"]);
    release();
    expect(f.live()).toBe(false);

    // Cache hit within the revalidation window: no refetch, data available synchronously.
    t = 5_000;
    cache.retain(KEY, "1m");
    expect(cache.get(KEY, "1m").bars).toHaveLength(6);
    expect(f.getKlines).toHaveBeenCalledTimes(1);
  });

  it("pages older history with endTime and stops at the start", async () => {
    const f = fakeProvider([
      Array.from({ length: 1000 }, (_, i) => k((i + 2000) * M, i)),
      Array.from({ length: 1000 }, (_, i) => k((i + 1000) * M, i)),
      [],
    ]);
    const cache = new CandleCache(() => ({ provider: f.provider, symbol: "BTCUSDT" }));
    cache.retain(KEY, "1m");
    await vi.waitFor(() => expect(cache.get(KEY, "1m").status).toBe("ready"));
    expect(await cache.loadOlder(KEY, "1m")).toBe(1000);
    expect(f.getKlines).toHaveBeenLastCalledWith("BTCUSDT", "1m", { endTime: 2000 * M - 1, limit: 1000 });
    expect(cache.get(KEY, "1m").bars).toHaveLength(2000);
    expect(await cache.loadOlder(KEY, "1m")).toBe(0);
    expect(cache.get(KEY, "1m").reachedStart).toBe(true);
    expect(await cache.loadOlder(KEY, "1m")).toBe(0);
    expect(f.getKlines).toHaveBeenCalledTimes(3);
  });

  it("refetches to fill a gap after missed candles", async () => {
    const f = fakeProvider([[k(0, 1)], [k(0, 1), k(M, 2), k(2 * M, 3), k(3 * M, 4)]]);
    const cache = new CandleCache(() => ({ provider: f.provider, symbol: "BTCUSDT" }));
    cache.retain(KEY, "1m");
    await vi.waitFor(() => expect(cache.get(KEY, "1m").status).toBe("ready"));
    f.push(k(3 * M, 4));
    await vi.waitFor(() => expect(cache.get(KEY, "1m").bars).toHaveLength(4));
    expect(cache.get(KEY, "1m").bars.map((b) => b.close)).toEqual([1, 2, 3, 4]);
  });

  it("revalidates after the connection comes back", async () => {
    const f = fakeProvider([[k(0, 1)], [k(0, 1), k(M, 2)]]);
    const cache = new CandleCache(() => ({ provider: f.provider, symbol: "BTCUSDT" }));
    cache.retain(KEY, "1m");
    await vi.waitFor(() => expect(cache.get(KEY, "1m").status).toBe("ready"));
    f.status("reconnecting");
    f.status("live");
    await vi.waitFor(() => expect(cache.get(KEY, "1m").bars).toHaveLength(2));
  });
});
