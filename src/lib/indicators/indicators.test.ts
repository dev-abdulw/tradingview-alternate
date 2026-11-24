import { describe, expect, it } from "vitest";
import ref from "./__fixtures__/btcusdt-1h-reference.json";
import {
  bollinger,
  ema,
  heikinAshi,
  macd,
  rsi,
  sma,
  source,
  vwap,
  type Bar,
  type Series,
} from "./indicators";

const bars = ref.bars as Bar[];
const close = source(bars, "close");

function expectSeries(actual: Series, expected: (number | null)[], tol = 1e-8) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => {
    const e = expected[i];
    if (e === null || e === undefined) expect(v, `index ${i}`).toBeNull();
    else
      expect(Math.abs((v as number) - e), `index ${i}: ${v} vs ${e}`).toBeLessThan(
        tol * Math.max(1, Math.abs(e)),
      );
  });
}

describe("indicators match an independent reference implementation (real BTCUSDT 1h data)", () => {
  it("SMA(20)", () => expectSeries(sma(close, 20), ref.sma20));
  it("EMA(21), SMA-seeded", () => expectSeries(ema(close, 21), ref.ema21));
  it("RSI(14), Wilder", () => expectSeries(rsi(close, 14), ref.rsi14));
  it("Bollinger(20, 2)", () => {
    const b = bollinger(close, 20, 2);
    expectSeries(b.basis, ref.bbBasis);
    expectSeries(b.upper, ref.bbUpper);
    expectSeries(b.lower, ref.bbLower);
  });
  it("MACD(12, 26, 9)", () => {
    const m = macd(close, 12, 26, 9);
    expectSeries(m.macd, ref.macd);
    expectSeries(m.signal, ref.macdSignal);
    expectSeries(m.hist, ref.macdHist);
  });
  it("VWAP, anchored to UTC days", () => expectSeries(vwap(bars), ref.vwap));
});

describe("published reference values", () => {
  // StockCharts' RSI(14) worked example (Wilder smoothing).
  const prices = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
    43.42, 42.66, 43.13,
  ];
  const expected = [
    70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87,
    45.46, 37.3, 33.08, 37.77,
  ];
  // StockCharts rounds the average gain/loss to 2 dp in its spreadsheet (first RSI 70.53 vs exact 70.46);
  // exact math stays within 0.07 of every published value, so 0.1 is the honest tolerance.
  it("RSI(14) matches StockCharts within their spreadsheet rounding", () => {
    const r = rsi(prices, 14);
    expect(r.slice(0, 14).every((v) => v === null)).toBe(true);
    r.slice(14).forEach((v, i) => expect(Math.abs((v as number) - expected[i]!)).toBeLessThan(0.1));
  });

  it("SMA and EMA on a hand-checkable series", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect(sma(xs, 3)).toEqual([null, null, 2, 3, 4, 5]);
    // seed = mean(1,2,3) = 2; α = 0.5 → 3, 4, 5
    expect(ema(xs, 3)).toEqual([null, null, 2, 3, 4, 5]);
  });
});

describe("edge cases", () => {
  it("returns all-null when there isn't enough data", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
  });
  it("RSI is 100 when price only rises and 0 when it only falls", () => {
    const up = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(up, 14).at(-1)).toBe(100);
    expect(rsi([...up].reverse(), 14).at(-1)).toBe(0);
  });
  it("VWAP resets at the UTC day boundary", () => {
    const day = 86_400_000;
    const b = (t: number, p: number, v: number): Bar => ({
      time: t,
      open: p,
      high: p,
      low: p,
      close: p,
      volume: v,
    });
    expect(vwap([b(day - 3_600_000, 10, 1), b(day - 1, 20, 1), b(day, 100, 1)])).toEqual([10, 15, 100]);
  });
  it("Heikin-Ashi transforms candles", () => {
    const ha = heikinAshi([
      { time: 0, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { time: 1, open: 11, high: 13, low: 10, close: 12, volume: 1 },
    ]);
    expect(ha[0]).toMatchObject({ open: 10.5, close: 10.5, high: 12, low: 9 });
    expect(ha[1]).toMatchObject({ open: 10.5, close: 11.5, high: 13, low: 10 });
  });
});
