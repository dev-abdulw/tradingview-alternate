/**
 * Technical indicators, computed client-side. Definitions follow TradingView's
 * Pine built-ins so values match what traders compare against:
 *  - EMA:  α = 2/(n+1), seeded with the SMA of the first n values (pine_ema)
 *  - RMA:  α = 1/n (Wilder), seeded with SMA — used by RSI
 *  - BB:   SMA ± k·σ with population standard deviation (ta.stdev, biased)
 *  - VWAP: Σ(hlc3·volume)/Σvolume, anchored to each UTC day (crypto session)
 *  - MACD: EMA(fast) − EMA(slow); signal = EMA(signal) of MACD; hist = MACD − signal
 *
 * All functions are O(n), allocation-light and return arrays aligned with the
 * input (null where the indicator isn't defined yet).
 */

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Source = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";
export type Series = (number | null)[];

export const SOURCES: readonly Source[] = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"];

export function source(bars: readonly Bar[], src: Source): number[] {
  switch (src) {
    case "open":
      return bars.map((b) => b.open);
    case "high":
      return bars.map((b) => b.high);
    case "low":
      return bars.map((b) => b.low);
    case "close":
      return bars.map((b) => b.close);
    case "hl2":
      return bars.map((b) => (b.high + b.low) / 2);
    case "hlc3":
      return bars.map((b) => (b.high + b.low + b.close) / 3);
    case "ohlc4":
      return bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
  }
}

export function sma(values: readonly (number | null)[], length: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0; // consecutive non-null values in the window
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count += 1;
    if (count > length) {
      sum -= values[i - length] as number;
      count = length;
    }
    if (count === length) out[i] = sum / length;
  }
  return out;
}

/** Exponential smoothing with a given α, seeded by the SMA of the first `length` defined values. */
function smooth(values: readonly (number | null)[], length: number, alpha: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (prev === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === length) {
        prev = seedSum / length;
        out[i] = prev;
      }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export const ema = (values: readonly (number | null)[], length: number): Series =>
  smooth(values, length, 2 / (length + 1));

export const rma = (values: readonly (number | null)[], length: number): Series =>
  smooth(values, length, 1 / length);

export function bollinger(
  values: readonly number[],
  length: number,
  mult: number,
): { basis: Series; upper: Series; lower: Series } {
  const basis = sma(values, length);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i++) {
    const m = basis[i];
    if (m === null || m === undefined) continue;
    let acc = 0;
    for (let j = i - length + 1; j <= i; j++) acc += (values[j]! - m) ** 2;
    const sd = Math.sqrt(acc / length); // population (biased) stdev, as Pine's ta.stdev
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { basis, upper, lower };
}

export function rsi(values: readonly number[], length: number): Series {
  const gains: (number | null)[] = [null];
  const losses: (number | null)[] = [null];
  for (let i = 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const up = rma(gains, length);
  const down = rma(losses, length);
  return values.map((_, i) => {
    const u = up[i];
    const d = down[i];
    if (u === null || u === undefined || d === null || d === undefined) return null;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

export function macd(
  values: readonly number[],
  fast: number,
  slow: number,
  signalLength: number,
): { macd: Series; signal: Series; hist: Series } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => {
    const a = f[i];
    const b = s[i];
    return a === null || a === undefined || b === null || b === undefined ? null : a - b;
  });
  const signal = ema(line, signalLength);
  const hist: Series = line.map((m, i) => {
    const sg = signal[i];
    return m === null || sg === null || sg === undefined ? null : m - sg;
  });
  return { macd: line, signal, hist };
}

const DAY_MS = 86_400_000;

/** Session VWAP anchored to UTC days. `time` is in ms. */
export function vwap(bars: readonly Bar[], src: Source = "hlc3"): Series {
  const prices = source(bars, src);
  const out: Series = new Array(bars.length).fill(null);
  let day = -1;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const d = Math.floor(b.time / DAY_MS);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    pv += prices[i]! * b.volume;
    vol += b.volume;
    out[i] = vol > 0 ? pv / vol : prices[i]!;
  }
  return out;
}

/** Heikin-Ashi candles (first HA open = (open+close)/2 of the first bar). */
export function heikinAshi(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const close = (b.open + b.high + b.low + b.close) / 4;
    const prev = out[i - 1];
    const open = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2;
    out.push({
      time: b.time,
      open,
      close,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      volume: b.volume,
    });
  }
  return out;
}
