import { describe, expect, it } from "vitest";
import {
  derivativesFactors,
  fundingFactor,
  openInterestFactor,
  orderBookFactor,
  topVsCrowdFactor,
  type DerivativesInput,
} from "./derivatives";
import {
  aggregate,
  assessBacktest,
  backtest,
  buildScorecard,
  lastClosedIndex,
  technicalScoreAt,
  verdictWithHysteresis,
} from "./engine";
import { bucketStart, prepare, resample, rsiFactor, structure, type SBar } from "./technical";
import type { Backtest, Factor } from "./types";

const H = 3_600_000;
const DAY = 86_400_000;

/** Synthetic trending series with a wave, taker share `buy` (0..1). */
function series(n: number, drift: number, buy = 0.5, step = H, start = Date.UTC(2026, 0, 5)): SBar[] {
  const out: SBar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    price = price * (1 + drift) * (1 + Math.sin(i / 5) * 0.004);
    const close = price;
    const vol = 100 + (i % 7) * 10;
    out.push({
      time: start + i * step,
      closeTime: start + (i + 1) * step - 1,
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: vol,
      takerBuyVolume: vol * buy,
    });
  }
  return out;
}

const NOW_AFTER = (bars: SBar[]) => bars[bars.length - 1]!.closeTime + 1;

describe("scorecard", () => {
  it("reads a steady uptrend as bullish and a downtrend as bearish", () => {
    const upBars = series(600, 0.003, 0.58);
    const up = buildScorecard({ horizon: "intraday", bars: upBars, isCrypto: true, now: NOW_AFTER(upBars) });
    expect(up.verdict).toBe("bullish");
    expect(up.factors.find((f) => f.id === "ma")?.score).toBe(2);
    expect(up.factors.find((f) => f.id === "taker")?.score).toBe(2);

    const downBars = series(600, -0.003, 0.42);
    const down = buildScorecard({
      horizon: "intraday",
      bars: downBars,
      isCrypto: true,
      now: NOW_AFTER(downBars),
    });
    expect(down.verdict).toBe("bearish");
    expect(down.score).toBeLessThan(-35);
  });

  it("excludes unavailable factors from the score instead of counting them as neutral", () => {
    const f = (score: number, available = true): Factor => ({
      id: String(Math.random()),
      group: "trend",
      label: "",
      score,
      weight: 1,
      available,
      reading: "",
    });
    const vol = { bandwidthPct: null, atrPct: null, state: "unknown" as const };
    expect(aggregate([f(2), f(2), f(0, false), f(0, false)], vol).score).toBe(100);
    expect(aggregate([f(2), f(-2)], vol)).toMatchObject({ score: 0, verdict: "neutral" });
    expect(aggregate([f(2), f(2), f(-1)], vol)).toMatchObject({
      score: 50,
      verdict: "bullish",
      confidence: 67,
    });
    expect(aggregate([f(2), f(1), f(-1)], vol)).toMatchObject({ score: 33, verdict: "neutral" });
  });

  it("uses the last closed candle, not the forming one", () => {
    const bars = series(100, 0.001);
    expect(lastClosedIndex(bars, bars[99]!.closeTime - 1000)).toBe(98);
    expect(lastClosedIndex(bars, bars[99]!.closeTime + 1)).toBe(99);
  });
});

describe("no lookahead", () => {
  it("scoring bar i with future data gives the same result as with data cut at i", () => {
    const bars = series(700, 0.0015, 0.53);
    // Violent future move after i must not change the score at i.
    const spiked = bars.map((b, k) =>
      k > 450 ? { ...b, close: b.close * 3, high: b.high * 3, low: b.low * 3 } : b,
    );
    for (const i of [250, 330, 450]) {
      const cut = technicalScoreAt("intraday", bars.slice(0, i + 1), i).score;
      expect(technicalScoreAt("intraday", bars, i).score).toBe(cut);
      expect(technicalScoreAt("intraday", spiked, i).score).toBe(cut);
    }
  });

  it("only counts context (4h/1W) candles that had fully closed", () => {
    const bars = series(40, 0.001);
    const ctx = resample(bars, 4 * H);
    expect(ctx.length).toBe(10);
    expect(ctx[0]!.time).toBe(bars[0]!.time);
    expect(bucketStart(Date.UTC(2026, 0, 7, 10), 7 * DAY)).toBe(Date.UTC(2026, 0, 5)); // Monday
  });
});

describe("pattern factors", () => {
  it("detects higher highs + higher lows as an uptrend structure", () => {
    const bars = series(200, 0.002);
    const p = prepare(bars);
    expect(structure(p, 199).score).toBe(2);
  });

  it("flags a bearish RSI divergence", () => {
    // Up-leg, pullback, then a marginal new high on fading momentum.
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 100 + i * 1.2),
      ...Array.from({ length: 10 }, (_, i) => 147 - i * 1.5),
      ...Array.from({ length: 12 }, (_, i) => 133 + i * 1.3),
      148.8,
      148.5,
      148,
      147.5,
    ];
    const bars: SBar[] = closes.map((c, i) => ({
      time: i * H,
      closeTime: (i + 1) * H - 1,
      open: c,
      high: c + 0.2,
      low: c - 0.2,
      close: c,
      volume: 1,
    }));
    const p = prepare(bars);
    const f = rsiFactor(p, bars.length - 1);
    expect(f.score).toBe(-2);
    expect(f.reading).toMatch(/Bearish divergence/);
  });
});

describe("derivatives factors", () => {
  const base: DerivativesInput = {
    perp: "BTCUSDT",
    fundingRates: [0.0001, 0.0001, 0.0001],
    fundingIntervalHours: 8,
    openInterest: [100, 101],
    priceChangePct: 0,
    topTraderRatios: Array(20).fill(1.5),
    crowdRatios: Array(20).fill(1.5),
    takerRatios: [1],
  };
  it("fades crowded funding, normalised to 8h", () => {
    expect(fundingFactor({ ...base, fundingRates: [0.0012] }).score).toBe(-2);
    expect(fundingFactor({ ...base, fundingRates: [-0.001] }).score).toBe(2);
    // 0.03% every 4h = 0.06% / 8h → crowded
    expect(fundingFactor({ ...base, fundingRates: [0.0003], fundingIntervalHours: 4 }).score).toBe(-1);
  });
  it("reads open interest against price in four quadrants", () => {
    expect(openInterestFactor({ ...base, openInterest: [100, 105], priceChangePct: 2 }).score).toBe(2);
    expect(openInterestFactor({ ...base, openInterest: [100, 95], priceChangePct: 2 }).score).toBe(1);
    expect(openInterestFactor({ ...base, openInterest: [100, 105], priceChangePct: -2 }).score).toBe(-2);
    expect(openInterestFactor({ ...base, openInterest: [100, 95], priceChangePct: -2 }).score).toBe(-1);
  });
  it("compares top traders to the crowd against the symbol's own usual gap (not raw ratios)", () => {
    // Structurally less long than the crowd every period → that's normal, not bearish.
    const wobble = (k: number) => 1.6 + (k % 3) * 0.02;
    const top = Array.from({ length: 30 }, (_, k) => wobble(k === 29 ? 1 : k)); // ends on a typical value
    const crowd = Array(30).fill(2.5);
    expect(topVsCrowdFactor({ ...base, topTraderRatios: top, crowdRatios: crowd }).score).toBe(0);
    // Today top traders jump far longer than usual → bullish.
    expect(
      topVsCrowdFactor({ ...base, topTraderRatios: [...top.slice(0, -1), 2.4], crowdRatios: crowd }).score,
    ).toBe(2);
    expect(
      topVsCrowdFactor({ ...base, topTraderRatios: [...top.slice(0, -1), 1.2], crowdRatios: crowd }).score,
    ).toBe(-2);
  });
  it("marks everything unavailable when there's no futures twin", () => {
    expect(derivativesFactors(null).every((f) => !f.available)).toBe(true);
  });
  it("measures order-book imbalance within ±1%", () => {
    expect(
      orderBookFactor(
        [
          [100, 10],
          [99.5, 10],
        ],
        [
          [100.1, 2],
          [102, 100],
        ],
      ).score,
    ).toBe(2); // far ask ignored
  });
});

describe("backtest", () => {
  it("in a persistent uptrend, bullish calls are right more often than the baseline", () => {
    const bars = series(1200, 0.002, 0.56);
    const bt = backtest("intraday", bars, null, NOW_AFTER(bars));
    expect(bt.bullish.n).toBeGreaterThan(100);
    expect(bt.bullish.hitRate).toBeGreaterThan(50);
    expect(bt.baselineUp + bt.baselineDown).toBeLessThanOrEqual(100);
    expect(bt.currentTechnicalScore).not.toBeNull();
  });
  it("runs fast enough for the main thread (3000 hourly bars)", () => {
    const bars = series(3000, 0.0005, 0.5);
    const t0 = performance.now();
    backtest("intraday", bars, null, NOW_AFTER(bars));
    expect(performance.now() - t0).toBeLessThan(150); // ~25ms locally; guards against per-bar allocations (e.g. Intl formatters)
  });
});

describe("hysteresis", () => {
  it("doesn't flip back to neutral until the score falls well below the entry threshold", () => {
    expect(verdictWithHysteresis(40, "neutral")).toBe("bullish");
    expect(verdictWithHysteresis(30, "bullish")).toBe("bullish");
    expect(verdictWithHysteresis(20, "bullish")).toBe("neutral");
    expect(verdictWithHysteresis(-36, "bullish")).toBe("bearish");
  });
});

describe("assessBacktest", () => {
  const bt = (over: Partial<Backtest>): Backtest => ({
    horizon: "intraday",
    bars: 1000,
    from: 0,
    to: 1,
    bullish: { n: 200, hitRate: 51, avgReturnPct: 0.1 },
    bearish: { n: 200, hitRate: 60, avgReturnPct: -0.3 },
    baselineUp: 50,
    baselineDown: 49,
    currentTechnicalScore: 40,
    ...over,
  });
  it("calls out the absence of an edge honestly", () => {
    expect(assessBacktest(bt({}), "bullish")).toMatchObject({ kind: "no-edge" });
    expect(assessBacktest(bt({}), "bullish").summary).toMatch(/no measurable edge/);
  });
  it("reports a real edge, a negative one, and too-little-history", () => {
    expect(assessBacktest(bt({}), "bearish")).toMatchObject({ kind: "edge", edge: 11 });
    expect(assessBacktest(bt({ bullish: { n: 200, hitRate: 40, avgReturnPct: -1 } }), "bullish").kind).toBe(
      "worse",
    );
    expect(assessBacktest(bt({ bullish: { n: 12, hitRate: 90, avgReturnPct: 2 } }), "bullish").kind).toBe(
      "insufficient",
    );
  });
});
