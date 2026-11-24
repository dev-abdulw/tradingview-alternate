/**
 * Derivatives-positioning factors (from the symbol's perpetual-futures twin).
 * Inputs are plain numbers so these stay pure and testable.
 */
import type { Factor } from "./types";

export type DerivativesInput = {
  perp: string;
  /** Recent funding rates (fractions), oldest → newest, and the funding interval. */
  fundingRates: number[];
  fundingIntervalHours: number;
  /** Open interest (value) over the window, oldest → newest. */
  openInterest: number[];
  /** Spot price change over the same window, in %. */
  priceChangePct: number;
  /**
   * Long/short ratio history (oldest → newest, same timestamps). Top traders are
   * structurally less long than the crowd, so we compare today's gap with the
   * symbol's own recent gap instead of comparing the raw ratios.
   */
  topTraderRatios: number[];
  crowdRatios: number[];
  /** Futures taker buy/sell volume ratios over the window. */
  takerRatios: number[];
};

const pct = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}%`;

export function fundingFactor(d: DerivativesInput): Factor {
  const base = { id: "funding", group: "derivatives" as const, label: "Funding rate", weight: 1.5 };
  const recent = d.fundingRates.slice(-3);
  if (recent.length === 0) return { ...base, score: 0, available: false, reading: "No funding data" };
  // Normalise to an 8h rate so 4h-funded contracts compare fairly.
  const avg8h = (recent.reduce((a, b) => a + b, 0) / recent.length) * (8 / d.fundingIntervalHours) * 100;
  // Contrarian at extremes: crowded longs pay a lot → downside squeeze risk, and vice versa.
  const score = avg8h >= 0.1 ? -2 : avg8h >= 0.05 ? -1 : avg8h <= -0.08 ? 2 : avg8h <= -0.03 ? 1 : 0;
  const reading =
    score < 0
      ? "Longs paying a high premium: crowded long, squeeze risk"
      : score > 0
        ? "Shorts paying longs: crowded short, squeeze risk upward"
        : "Normal funding: positioning not stretched";
  return {
    ...base,
    score,
    available: true,
    reading: `${reading} · ${avg8h.toFixed(4)}% / 8h`,
    detail: { "Avg (8h basis)": `${avg8h.toFixed(4)}%`, Contract: d.perp },
  };
}

export function openInterestFactor(d: DerivativesInput): Factor {
  const base = { id: "oi", group: "derivatives" as const, label: "Open interest vs price", weight: 1.5 };
  const first = d.openInterest[0];
  const last = d.openInterest[d.openInterest.length - 1];
  if (!first || !last) return { ...base, score: 0, available: false, reading: "No open-interest data" };
  const oiChg = (last / first - 1) * 100;
  const up = d.priceChangePct > 0.3;
  const down = d.priceChangePct < -0.3;
  const oiUp = oiChg > 2;
  const oiDown = oiChg < -2;
  const [score, reading] =
    up && oiUp
      ? [2, "Price up with rising open interest: new longs backing the move"]
      : up && oiDown
        ? [1, "Price up while open interest falls: short covering, weaker rally"]
        : down && oiUp
          ? [-2, "Price down with rising open interest: new shorts pressing"]
          : down && oiDown
            ? [-1, "Price down while open interest falls: longs exiting"]
            : [0, "No clear positioning shift"];
  return {
    ...base,
    score,
    available: true,
    reading,
    detail: { "OI change": pct(oiChg), "Price change": pct(d.priceChangePct) },
  };
}

export function topVsCrowdFactor(d: DerivativesInput): Factor {
  const base = { id: "toptraders", group: "derivatives" as const, label: "Top traders vs crowd", weight: 1 };
  const n = Math.min(d.topTraderRatios.length, d.crowdRatios.length);
  if (n < 10) return { ...base, score: 0, available: false, reading: "Not enough long/short history" };
  const top = d.topTraderRatios.slice(-n);
  const crowd = d.crowdRatios.slice(-n);
  const gaps = top.map((t, i) => Math.log(t) - Math.log(crowd[i]!));
  const current = gaps[n - 1]!;
  const past = gaps.slice(0, -1);
  const mean = past.reduce((a, b) => a + b, 0) / past.length;
  const sd = Math.sqrt(past.reduce((a, b) => a + (b - mean) ** 2, 0) / past.length);
  const z = sd > 1e-6 ? (current - mean) / sd : 0;
  const score = z >= 2 ? 2 : z >= 1 ? 1 : z <= -2 ? -2 : z <= -1 ? -1 : 0;
  const reading =
    score > 0
      ? "Top traders unusually long relative to the crowd"
      : score < 0
        ? "Top traders unusually short relative to the crowd"
        : "Top traders vs crowd: usual gap";
  return {
    ...base,
    score,
    available: true,
    reading: `${reading} · z ${z >= 0 ? "+" : ""}${z.toFixed(1)}`,
    detail: {
      "Top traders L/S": top[n - 1]!.toFixed(2),
      "All accounts L/S": crowd[n - 1]!.toFixed(2),
      "Gap vs its own average": `${z >= 0 ? "+" : ""}${z.toFixed(2)} σ over ${n} periods`,
    },
  };
}

export function futuresTakerFactor(d: DerivativesInput): Factor {
  const base = { id: "ftaker", group: "derivatives" as const, label: "Futures taker ratio", weight: 1 };
  if (d.takerRatios.length === 0) return { ...base, score: 0, available: false, reading: "No taker data" };
  const avg = d.takerRatios.reduce((a, b) => a + b, 0) / d.takerRatios.length;
  const score = avg >= 1.2 ? 2 : avg >= 1.08 ? 1 : avg <= 0.8 ? -2 : avg <= 0.92 ? -1 : 0;
  const reading =
    score > 0
      ? "Futures market buying aggressively"
      : score < 0
        ? "Futures market selling aggressively"
        : "Futures buying and selling balanced";
  return {
    ...base,
    score,
    available: true,
    reading: `${reading} · ${avg.toFixed(2)}`,
    detail: { "Buy/sell ratio": avg.toFixed(3) },
  };
}

export function derivativesFactors(
  d: DerivativesInput | null,
  reason = "No futures contract for this asset",
): Factor[] {
  if (!d) {
    return [
      { id: "funding", group: "derivatives", label: "Funding rate", weight: 1.5 },
      { id: "oi", group: "derivatives", label: "Open interest vs price", weight: 1.5 },
      { id: "toptraders", group: "derivatives", label: "Top traders vs crowd", weight: 1 },
      { id: "ftaker", group: "derivatives", label: "Futures taker ratio", weight: 1 },
    ].map((f) => ({ ...f, group: "derivatives" as const, score: 0, available: false, reading: reason }));
  }
  return [fundingFactor(d), openInterestFactor(d), topVsCrowdFactor(d), futuresTakerFactor(d)];
}

/* --------------------------- order book & sentiment ---------------------- */

/** Share of resting size on the bid side within ±1% of mid. */
export function orderBookFactor(bids: [number, number][], asks: [number, number][]): Factor {
  const base = { id: "book", group: "flow" as const, label: "Order book (±1%)", weight: 1 };
  const bestBid = bids[0]?.[0];
  const bestAsk = asks[0]?.[0];
  if (!bestBid || !bestAsk) return { ...base, score: 0, available: false, reading: "No order book data" };
  const mid = (bestBid + bestAsk) / 2;
  const bidQ = bids.filter(([p]) => p >= mid * 0.99).reduce((a, [p, q]) => a + p * q, 0);
  const askQ = asks.filter(([p]) => p <= mid * 1.01).reduce((a, [p, q]) => a + p * q, 0);
  if (bidQ + askQ <= 0) return { ...base, score: 0, available: false, reading: "Order book too thin" };
  const share = bidQ / (bidQ + askQ);
  const score = share >= 0.7 ? 2 : share >= 0.6 ? 1 : share <= 0.3 ? -2 : share <= 0.4 ? -1 : 0;
  const reading =
    score > 0
      ? "More resting bids than asks near price"
      : score < 0
        ? "More resting asks than bids near price"
        : "Balanced book near price";
  return {
    ...base,
    score,
    available: true,
    reading: `${reading} · ${(share * 100).toFixed(0)}% bids`,
    detail: { "Bid share": `${(share * 100).toFixed(1)}%` },
  };
}

/** Crypto Fear & Greed (0–100), contrarian at extremes. */
export function fearGreedFactor(value: number | null, label: string | null): Factor {
  const base = { id: "fng", group: "sentiment" as const, label: "Fear & Greed (crypto)", weight: 0.75 };
  if (value === null) return { ...base, score: 0, available: false, reading: "Sentiment unavailable" };
  const score = value <= 20 ? 1 : value >= 80 ? -1 : 0;
  const reading =
    score > 0
      ? "Extreme fear: historically a contrarian buy zone"
      : score < 0
        ? "Extreme greed: historically a contrarian caution zone"
        : "Sentiment not at an extreme";
  return { ...base, score, available: true, reading: `${reading} · ${value} (${label ?? ""})` };
}
