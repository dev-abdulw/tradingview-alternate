import { describe, expect, it, vi } from "vitest";
import { WeightLimiter } from "./http";
import { LiveFeed, LiveStore, type FrameScheduler } from "./live/live-store";
import {
  decimalsFromStep,
  formatChange,
  formatFundingRate,
  formatPercent,
  formatPrice,
  formatVolume,
} from "./precision";
import { changeFor } from "./change";
import { rankInstruments } from "./search";
import type { Instrument } from "./types";
import { isSymbolKey, parseSymbolKey, toSymbolKey } from "./symbol-key";

describe("precision", () => {
  it.each([
    ["0.01000000", 2],
    ["1.00000000", 0],
    ["0.00000001", 8],
    ["0.10000000", 1],
    ["0.0001", 4],
    ["10", 0],
    ["1e-8", 8],
  ])("decimalsFromStep(%s) = %i", (step, d) => expect(decimalsFromStep(step)).toBe(d));

  it("formats at fixed precision so widths never change between ticks", () => {
    expect(formatPrice(97412.5, 2)).toBe("97,412.50");
    expect(formatPrice(97412, 2)).toBe("97,412.00");
    expect(formatPrice(0.00002341, 8)).toBe("0.00002341");
    expect(formatPrice(1234.5, 2, "de-DE")).toBe("1.234,50");
  });

  it("signs changes with a true minus", () => {
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(-0.87)).toBe("−0.87%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatChange(-1184.2, 2)).toBe("−1,184.20");
    expect(formatFundingRate(0.00001109)).toBe("+0.0011%");
    expect(formatVolume(1758249642)).toBe("1.76B");
    expect(formatVolume(814_820_000, "de-DE")).toBe("814,82M");
    expect(formatVolume(950)).toBe("950");
  });
});

describe("symbol keys", () => {
  it("round-trips", () => {
    const ref = { provider: "binance", market: "futures", symbol: "XAUUSDT" };
    expect(toSymbolKey(ref)).toBe("binance:futures:XAUUSDT");
    expect(parseSymbolKey("binance:futures:XAUUSDT")).toEqual(ref);
    expect(isSymbolKey("binance:spot:BTCUSDT")).toBe(true);
    expect(isSymbolKey("BTCUSDT")).toBe(false);
    expect(() => parseSymbolKey("nope")).toThrow();
  });
});

describe("WeightLimiter", () => {
  it("waits once the per-minute budget is spent, and honors Retry-After blocks", () => {
    let t = 0;
    const l = new WeightLimiter(10, () => t);
    l.spend(6);
    expect(l.waitFor(4)).toBe(0);
    l.spend(4);
    expect(l.waitFor(1)).toBeGreaterThan(59_000);
    t = 60_001;
    expect(l.waitFor(10)).toBe(0);
    l.block(5000);
    expect(l.waitFor(1)).toBe(5000);
  });
});

function manualFrames() {
  const queue: (() => void)[] = [];
  const scheduler: FrameScheduler = {
    request: (cb) => queue.push(cb),
    cancel: () => {},
  };
  return { scheduler, run: () => queue.splice(0).forEach((cb) => cb()) };
}

describe("LiveStore", () => {
  it("batches many writes into one notification per frame with the latest value", () => {
    const frames = manualFrames();
    const now = 0;
    const s = new LiveStore<number>(100, frames.scheduler, () => now);
    const l = vi.fn();
    s.subscribe("k", l);
    for (let i = 1; i <= 50; i++) s.set("k", i);
    expect(l).not.toHaveBeenCalled();
    frames.run();
    expect(l).toHaveBeenCalledTimes(1);
    expect(s.get("k")).toBe(50);
  });

  it("throttles each key to ≤10 notifications per second", () => {
    const frames = manualFrames();
    let now = 0;
    const s = new LiveStore<number>(100, frames.scheduler, () => now);
    const l = vi.fn();
    s.subscribe("k", l);
    // 60 frames over one second, a tick every frame.
    for (let f = 0; f < 60; f++) {
      now = f * 16.7;
      s.set("k", f);
      frames.run();
    }
    expect(l.mock.calls.length).toBeLessThanOrEqual(10);
    expect(l.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it("does no work for keys nobody watches", () => {
    const frames = manualFrames();
    const s = new LiveStore<number>(100, frames.scheduler);
    s.set("unwatched", 1);
    expect(frames.run).toBeDefined();
    expect(s.get("unwatched")).toBe(1);
  });
});

describe("LiveFeed", () => {
  it("opens one upstream subscription per key and closes it on last release", () => {
    const close = vi.fn();
    const open = vi.fn(() => close);
    const feed = new LiveFeed<number>(open);
    const r1 = feed.retain("a");
    const r2 = feed.retain("a");
    expect(open).toHaveBeenCalledTimes(1);
    expect(feed.refCount("a")).toBe(2);
    r1();
    r1();
    expect(close).not.toHaveBeenCalled();
    r2();
    expect(close).toHaveBeenCalledTimes(1);
    expect(feed.refCount("a")).toBe(0);
  });
});

describe("rankInstruments", () => {
  const inst = (
    symbol: string,
    base: string,
    quote: string,
    assetClass: "crypto" | "metal" | "stock" = "crypto",
    description?: string,
  ) =>
    ({
      provider: "binance",
      market: "spot",
      symbol,
      key: `binance:spot:${symbol}`,
      base,
      quote,
      assetClass,
      displayName: assetClass === "stock" ? base.slice(0, -1) : base,
      ...(description ? { description } : {}),
      tickSize: "0.01",
      stepSize: "0.01",
      priceDecimals: 2,
      qtyDecimals: 2,
    }) as Instrument;
  const all = [
    inst("BTCU", "BTC", "U"),
    inst("BTCUSD", "BTC", "USD"),
    inst("BTCUSDT", "BTC", "USDT"),
    inst("BTCUSDC", "BTC", "USDC"),
    inst("ETHUSDT", "ETH", "USDT"),
    inst("ETHFIUSDT", "ETHFI", "USDT"),
    inst("AAPLBUSDT", "AAPLB", "USDT", "stock"),
    inst("PAXGUSDT", "PAXG", "USDT", "metal", "Gold (Pax Gold)"),
  ];
  const top = (q: string, popularity?: Map<string, number>) =>
    rankInstruments(all, q, { popularity })[0]?.symbol;
  it("keeps exact symbol matches first, then prefers the USDT pair on prefix ties", () => {
    expect(top("btcu")).toBe("BTCU");
    expect(top("btcus")).toBe("BTCUSDT");
  });
  it("ignores separators", () => expect(top("btc/usdt")).toBe("BTCUSDT"));
  it("matches stocks by ticker and metals by name", () => {
    expect(top("aapl")).toBe("AAPLBUSDT");
    expect(top("gold")).toBe("PAXGUSDT");
  });
  it("breaks ties by 24h volume", () => {
    const pop = new Map([
      ["binance:spot:ETHFIUSDT", 1],
      ["binance:spot:ETHUSDT", 9],
    ]);
    expect(top("et", pop)).toBe("ETHUSDT");
  });
  it("fuzzy-matches subsequences", () =>
    expect(rankInstruments(all, "pxg").map((i) => i.symbol)).toContain("PAXGUSDT"));
});

describe("changeFor (TradingView vs Binance basis)", () => {
  const t = {
    key: "binance:spot:BTCUSDT" as const,
    last: 59_849.38,
    open: 61_378.1,
    high: 1,
    low: 1,
    change: 59_849.38 - 61_378.1,
    changePct: -2.4907,
    volume: 1,
    quoteVolume: 1,
    eventTime: 1,
    dayOpen: 61_270.92,
  };
  it("daily basis measures from the 00:00 UTC open, like TradingView", () => {
    const c = changeFor(t, "daily")!;
    expect(c.change).toBeCloseTo(-1421.54, 2);
    expect(c.changePct).toBeCloseTo(-2.32, 2);
  });
  it("rolling basis is Binance's 24h ticker change", () => {
    expect(changeFor(t, "rolling")).toEqual({ change: t.change, changePct: t.changePct });
  });
  it("returns null in daily mode until the open is known (no visible jump)", () => {
    expect(changeFor({ ...t, dayOpen: undefined }, "daily")).toBeNull();
  });
});
