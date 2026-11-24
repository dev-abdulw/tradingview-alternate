/** Signal scorecard types. Pure data — no network, no UI. */

export type Horizon = "intraday" | "swing";

export type FactorGroup = "trend" | "momentum" | "flow" | "derivatives" | "relative" | "sentiment";

export type Factor = {
  id: string;
  group: FactorGroup;
  label: string;
  /** −2 … +2 (bearish … bullish); 0 = neutral. */
  score: number;
  weight: number;
  available: boolean;
  /** One-line plain-language reading, e.g. "Above 20/50/200 EMAs, all rising". */
  reading: string;
  /** Numbers behind the reading (shown on expand). */
  detail?: Record<string, string>;
};

export type Verdict = "bullish" | "neutral" | "bearish";

export type Volatility = {
  /** Bollinger bandwidth percentile over the lookback (0–100). */
  bandwidthPct: number | null;
  /** ATR as % of price. */
  atrPct: number | null;
  state: "squeeze" | "normal" | "expanding" | "unknown";
};

export type Scorecard = {
  horizon: Horizon;
  /** −100 … +100. */
  score: number;
  verdict: Verdict;
  strong: boolean;
  /** 0–100: weighted share of directional factors agreeing with the verdict, adjusted for volatility. */
  confidence: number;
  factors: Factor[];
  volatility: Volatility;
  /** Open time (ms) of the last closed candle the scorecard is based on. */
  asOf: number | null;
};

export type BacktestBucket = { n: number; hitRate: number; avgReturnPct: number };

export type Backtest = {
  horizon: Horizon;
  bars: number;
  from: number | null;
  to: number | null;
  bullish: BacktestBucket;
  bearish: BacktestBucket;
  /** Share of all tested bars where price rose / fell over the horizon (what a coin flip would get). */
  baselineUp: number;
  baselineDown: number;
  /** Technical-only score at the latest closed bar (what the backtest measures). */
  currentTechnicalScore: number | null;
};

export const HORIZON_CONFIG = {
  intraday: {
    label: "Intraday",
    primary: "1h" as const,
    context: "4h" as const,
    contextMs: 4 * 3_600_000,
    primaryMs: 3_600_000,
    forwardBars: 4,
    forwardLabel: "4 hours",
    /** Window (bars) for flow, relative strength and similar "recent" readings. */
    window: 24,
    rsThresholds: [1, 3] as const,
    historyBars: 3000,
  },
  swing: {
    label: "Swing",
    primary: "1D" as const,
    context: "1W" as const,
    contextMs: 7 * 86_400_000,
    primaryMs: 86_400_000,
    forwardBars: 3,
    forwardLabel: "3 days",
    window: 10,
    rsThresholds: [3, 8] as const,
    historyBars: 1000,
  },
} satisfies Record<Horizon, unknown>;

export const VERDICT_THRESHOLD = 35;
export const STRONG_THRESHOLD = 65;
