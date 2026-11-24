/**
 * Technical factors, evaluated causally: `at(i)` uses only bars 0…i, and swing
 * pivots only count once their right-hand confirmation bars exist. That makes
 * the same code safe for the live scorecard and for backtesting.
 */
import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators/indicators";
import type { Factor, Volatility } from "./types";

export type SBar = {
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume?: number | undefined;
};

const PIVOT_K = 3;

type Pivot = { index: number; price: number; confirmedAt: number };

export type Prepared = {
  bars: readonly SBar[];
  close: number[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  rsi: (number | null)[];
  hist: (number | null)[];
  volSma: (number | null)[];
  bbWidth: (number | null)[];
  atr: (number | null)[];
  highs: Pivot[];
  lows: Pivot[];
};

export function prepare(bars: readonly SBar[]): Prepared {
  const close = bars.map((b) => b.close);
  const bb = bollinger(close, 20, 2);
  const tr = bars.map((b, i) => {
    const prev = bars[i - 1]?.close ?? b.close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let j = PIVOT_K; j < bars.length - PIVOT_K; j++) {
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= PIVOT_K; k++) {
      if (bars[j]!.high <= bars[j - k]!.high || bars[j]!.high < bars[j + k]!.high) isHigh = false;
      if (bars[j]!.low >= bars[j - k]!.low || bars[j]!.low > bars[j + k]!.low) isLow = false;
    }
    if (isHigh) highs.push({ index: j, price: bars[j]!.high, confirmedAt: j + PIVOT_K });
    if (isLow) lows.push({ index: j, price: bars[j]!.low, confirmedAt: j + PIVOT_K });
  }
  return {
    bars,
    close,
    ema20: ema(close, 20),
    ema50: ema(close, 50),
    ema200: ema(close, 200),
    rsi: rsi(close, 14),
    hist: macd(close, 12, 26, 9).hist,
    volSma: sma(
      bars.map((b) => b.volume),
      20,
    ),
    bbWidth: bb.basis.map((m, i) =>
      m && bb.upper[i] && bb.lower[i] ? (bb.upper[i]! - bb.lower[i]!) / m : null,
    ),
    atr: sma(tr, 14),
    highs,
    lows,
  };
}

/**
 * Detail values: 6 significant digits with separators (e.g. 61,270.9). One cached
 * formatter — constructing Intl.NumberFormat per call made the backtest 10× slower.
 */
const NF = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });
const fmt = (x: number) => NF.format(x);
const clamp2 = (x: number) => Math.max(-2, Math.min(2, Math.round(x)));
const pct = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}%`;

/** Last two pivots confirmed by bar i. */
function lastTwo(pivots: Pivot[], i: number): [Pivot, Pivot] | null {
  let a: Pivot | null = null;
  let b: Pivot | null = null;
  for (const p of pivots) {
    if (p.confirmedAt > i) break;
    a = b;
    b = p;
  }
  return a && b ? [a, b] : null;
}

/* ------------------------------- factors -------------------------------- */

export function maTrend(p: Prepared, i: number, id = "ma", label = "Moving averages"): Factor {
  const c = p.close[i]!;
  const e20 = p.ema20[i];
  const e50 = p.ema50[i];
  const e200 = p.ema200[i];
  const conds: [boolean, string][] = [];
  if (e20 != null) conds.push([c > e20, "20"]);
  if (e50 != null) conds.push([c > e50, "50"]);
  if (e200 != null) conds.push([c > e200, "200"]);
  const stack: number[] = [];
  if (e20 != null && e50 != null) stack.push(e20 > e50 ? 1 : -1);
  if (e50 != null && e200 != null) stack.push(e50 > e200 ? 1 : -1);
  if (conds.length < 2) {
    return {
      id,
      group: "trend",
      label,
      score: 0,
      weight: 3,
      available: false,
      reading: "Not enough history yet",
    };
  }
  const sum = conds.reduce((a, [above]) => a + (above ? 1 : -1), 0) + stack.reduce((a, b) => a + b, 0);
  const max = conds.length + stack.length;
  const score = clamp2((sum / max) * 2);
  const above = conds.filter(([a]) => a).map(([, n]) => n);
  const below = conds.filter(([a]) => !a).map(([, n]) => n);
  const aligned = stack.length > 0 && stack.every((s) => s === stack[0]);
  const reading =
    below.length === 0
      ? `Above the ${above.join("/")} EMAs${aligned && stack[0] === 1 ? ", stacked bullishly" : ""}`
      : above.length === 0
        ? `Below the ${below.join("/")} EMAs${aligned && stack[0] === -1 ? ", stacked bearishly" : ""}`
        : `Mixed: above ${above.join("/")}, below ${below.join("/")} EMA`;
  return {
    id,
    group: "trend",
    label,
    score,
    weight: 3,
    available: true,
    reading,
    detail: {
      Close: fmt(c),
      "EMA 20": e20 != null ? fmt(e20) : "—",
      "EMA 50": e50 != null ? fmt(e50) : "—",
      "EMA 200": e200 != null ? fmt(e200) : "—",
    },
  };
}

export function structure(p: Prepared, i: number): Factor {
  const h = lastTwo(p.highs, i);
  const l = lastTwo(p.lows, i);
  const base = { id: "structure", group: "trend" as const, label: "Market structure", weight: 2.5 };
  if (!h || !l) return { ...base, score: 0, available: false, reading: "Not enough swing points yet" };
  const hh = h[1].price > h[0].price;
  const hl = l[1].price > l[0].price;
  const score = hh && hl ? 2 : !hh && !hl ? -2 : 0;
  const reading =
    score === 2
      ? "Higher highs and higher lows (uptrend)"
      : score === -2
        ? "Lower highs and lower lows (downtrend)"
        : hh
          ? "Higher high but lower low (expanding range)"
          : "Lower high but higher low (contracting range)";
  return {
    ...base,
    score,
    available: true,
    reading,
    detail: {
      "Last highs": `${fmt(h[0].price)} → ${fmt(h[1].price)}`,
      "Last lows": `${fmt(l[0].price)} → ${fmt(l[1].price)}`,
    },
  };
}

export function rsiFactor(p: Prepared, i: number): Factor {
  const r = p.rsi[i];
  const base = { id: "rsi", group: "momentum" as const, label: "RSI (14)", weight: 2 };
  if (r == null) return { ...base, score: 0, available: false, reading: "Not enough history yet" };
  // Divergences against the last two confirmed swing points (recent only).
  const h = lastTwo(p.highs, i);
  const l = lastTwo(p.lows, i);
  const recent = (pv: Pivot) => i - pv.index <= 30;
  if (h && recent(h[1])) {
    const r0 = p.rsi[h[0].index];
    const r1 = p.rsi[h[1].index];
    if (r0 != null && r1 != null && h[1].price > h[0].price && r1 < r0 - 2) {
      return {
        ...base,
        score: -2,
        available: true,
        reading: `Bearish divergence: price made a higher high, RSI a lower high (now ${r.toFixed(0)})`,
        detail: { RSI: r.toFixed(1) },
      };
    }
  }
  if (l && recent(l[1])) {
    const r0 = p.rsi[l[0].index];
    const r1 = p.rsi[l[1].index];
    if (r0 != null && r1 != null && l[1].price < l[0].price && r1 > r0 + 2) {
      return {
        ...base,
        score: 2,
        available: true,
        reading: `Bullish divergence: price made a lower low, RSI a higher low (now ${r.toFixed(0)})`,
        detail: { RSI: r.toFixed(1) },
      };
    }
  }
  const [score, reading] =
    r >= 80
      ? [-1, "Overextended above 80, pullback risk"]
      : r >= 55
        ? [1, r >= 70 ? "Strong momentum (above 70)" : "Bullish momentum (55–70)"]
        : r > 45
          ? [0, "Neutral (45–55)"]
          : r > 20
            ? [-1, r <= 30 ? "Weak momentum (below 30)" : "Bearish momentum (30–45)"]
            : [1, "Deeply oversold below 20, bounce likely"];
  return {
    ...base,
    score,
    available: true,
    reading: `${reading} · ${r.toFixed(0)}`,
    detail: { RSI: r.toFixed(1) },
  };
}

export function macdFactor(p: Prepared, i: number): Factor {
  const h = p.hist[i];
  const prev = p.hist[i - 1];
  const base = { id: "macd", group: "momentum" as const, label: "MACD (12, 26, 9)", weight: 2 };
  if (h == null || prev == null)
    return { ...base, score: 0, available: false, reading: "Not enough history yet" };
  let cross = "";
  for (let k = 0; k < 3; k++) {
    const a = p.hist[i - k];
    const b = p.hist[i - k - 1];
    if (a != null && b != null && Math.sign(a) !== Math.sign(b)) {
      cross = a > 0 ? " · bullish cross recently" : " · bearish cross recently";
      break;
    }
  }
  const rising = h > prev;
  const score = h > 0 ? (rising ? 2 : 1) : rising ? -1 : -2;
  const reading =
    h > 0
      ? rising
        ? "Above signal and strengthening"
        : "Above signal but fading"
      : rising
        ? "Below signal but recovering"
        : "Below signal and weakening";
  return {
    ...base,
    score,
    available: true,
    reading: reading + cross,
    detail: { Histogram: h.toPrecision(4) },
  };
}

export function volumeFactor(p: Prepared, i: number): Factor {
  const avg = p.volSma[i - 1];
  const base = { id: "volume", group: "flow" as const, label: "Relative volume", weight: 1.5 };
  if (avg == null || avg <= 0)
    return { ...base, score: 0, available: false, reading: "Not enough history yet" };
  let signed = 0;
  let unsigned = 0;
  for (let k = 0; k < 3; k++) {
    const b = p.bars[i - k];
    if (!b) continue;
    const rv = b.volume / avg;
    unsigned += rv / 3;
    signed += ((b.close >= b.open ? 1 : -1) * rv) / 3;
  }
  if (unsigned < 1.2) {
    return { ...base, score: 0, available: true, reading: `Normal volume (${unsigned.toFixed(1)}× average)` };
  }
  const dir = Math.sign(signed);
  const score = dir * (unsigned >= 2 ? 2 : 1);
  return {
    ...base,
    score,
    available: true,
    reading: `${unsigned.toFixed(1)}× average volume on ${dir > 0 ? "up" : "down"} candles`,
    detail: { "Avg relative volume (3 bars)": `${unsigned.toFixed(2)}×` },
  };
}

export function takerFlow(p: Prepared, i: number, window: number): Factor {
  const base = { id: "taker", group: "flow" as const, label: "Buyers vs sellers", weight: 1.5 };
  let buy = 0;
  let total = 0;
  for (let k = 0; k < window; k++) {
    const b = p.bars[i - k];
    if (!b || b.takerBuyVolume === undefined) continue;
    buy += b.takerBuyVolume;
    total += b.volume;
  }
  if (total <= 0) return { ...base, score: 0, available: false, reading: "No taker data" };
  const ratio = buy / total;
  const score = ratio >= 0.55 ? 2 : ratio >= 0.52 ? 1 : ratio <= 0.45 ? -2 : ratio <= 0.48 ? -1 : 0;
  const who =
    score > 0 ? "Aggressive buyers in control" : score < 0 ? "Aggressive sellers in control" : "Balanced";
  return {
    ...base,
    score,
    available: true,
    reading: `${who} · ${(ratio * 100).toFixed(1)}% of volume was market buys`,
    detail: { "Taker buy share": `${(ratio * 100).toFixed(1)}%`, Window: `${window} bars` },
  };
}

export function volatility(p: Prepared, i: number): Volatility {
  const w = p.bbWidth[i];
  const atr = p.atr[i];
  const close = p.close[i]!;
  if (w == null) return { bandwidthPct: null, atrPct: atr ? (atr / close) * 100 : null, state: "unknown" };
  const look: number[] = [];
  for (let k = Math.max(0, i - 120); k <= i; k++) if (p.bbWidth[k] != null) look.push(p.bbWidth[k]!);
  const rank = (look.filter((x) => x <= w).length / look.length) * 100;
  return {
    bandwidthPct: rank,
    atrPct: atr ? (atr / close) * 100 : null,
    state: rank <= 15 ? "squeeze" : rank >= 85 ? "expanding" : "normal",
  };
}

export function relativeStrength(
  p: Prepared,
  i: number,
  bench: Prepared | null,
  benchName: string | null,
  window: number,
  [t1, t2]: readonly [number, number],
): Factor {
  const base = {
    id: "rs",
    group: "relative" as const,
    label: benchName ? `vs ${benchName}` : "Relative strength",
    weight: 1,
  };
  if (!bench || !benchName)
    return { ...base, score: 0, available: false, reading: "No benchmark for this asset" };
  const t = p.bars[i]!.time;
  const t0 = p.bars[i - window]?.time;
  const bi = indexAtOrBefore(bench.bars, t);
  const b0 = t0 === undefined ? -1 : indexAtOrBefore(bench.bars, t0);
  if (t0 === undefined || bi < 0 || b0 < 0)
    return { ...base, score: 0, available: false, reading: "Not enough history yet" };
  const own = (p.close[i]! / p.close[i - window]! - 1) * 100;
  const ref = (bench.close[bi]! / bench.close[b0]! - 1) * 100;
  const diff = own - ref;
  const score = diff >= t2 ? 2 : diff >= t1 ? 1 : diff <= -t2 ? -2 : diff <= -t1 ? -1 : 0;
  const reading =
    score > 0
      ? `Outperforming ${benchName} by ${pct(diff, 1)}`
      : score < 0
        ? `Underperforming ${benchName} by ${pct(diff, 1)}`
        : `In line with ${benchName}`;
  return {
    ...base,
    score,
    available: true,
    reading,
    detail: { Own: pct(own), [benchName]: pct(ref), Window: `${window} bars` },
  };
}

/* ---------------------------- higher timeframe --------------------------- */

const DAY = 86_400_000;
/** Bucket start for the context timeframe: 4h buckets on UTC; weeks start Monday 00:00 UTC (as Binance). */
export function bucketStart(time: number, sizeMs: number): number {
  if (sizeMs === 7 * DAY) return Math.floor((time - 4 * DAY) / sizeMs) * sizeMs + 4 * DAY;
  return Math.floor(time / sizeMs) * sizeMs;
}

/** Resample primary bars into context-timeframe bars (only fully completed buckets are marked closed). */
export function resample(bars: readonly SBar[], sizeMs: number): SBar[] {
  const out: SBar[] = [];
  for (const b of bars) {
    const start = bucketStart(b.time, sizeMs);
    const last = out[out.length - 1];
    if (last && last.time === start) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
      last.closeTime = b.closeTime;
      if (b.takerBuyVolume !== undefined) last.takerBuyVolume = (last.takerBuyVolume ?? 0) + b.takerBuyVolume;
    } else {
      out.push({ ...b, time: start });
    }
  }
  return out;
}

/** Index of the last context bar that had fully closed by `closeTime` (no lookahead). */
export function contextIndex(ctx: Prepared, sizeMs: number, closeTime: number): number {
  let lo = 0;
  let hi = ctx.bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.bars[mid]!.time + sizeMs - 1 <= closeTime) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function indexAtOrBefore(bars: readonly SBar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
