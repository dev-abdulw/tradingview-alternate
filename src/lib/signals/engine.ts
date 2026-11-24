/**
 * Composes factors into a scorecard and backtests the technical part of it.
 * Everything here is pure; network fetching lives in the feature layer.
 */
import { derivativesFactors, fearGreedFactor, orderBookFactor, type DerivativesInput } from "./derivatives";
import {
  contextIndex,
  macdFactor,
  maTrend,
  prepare,
  relativeStrength,
  resample,
  rsiFactor,
  structure,
  takerFlow,
  volatility,
  volumeFactor,
  type Prepared,
  type SBar,
} from "./technical";
import {
  HORIZON_CONFIG,
  STRONG_THRESHOLD,
  VERDICT_THRESHOLD,
  type Backtest,
  type BacktestBucket,
  type Factor,
  type Horizon,
  type Scorecard,
  type Verdict,
  type Volatility,
} from "./types";

export function aggregate(
  factors: Factor[],
  vol: Volatility,
): Pick<Scorecard, "score" | "verdict" | "strong" | "confidence"> {
  const live = factors.filter((f) => f.available);
  const max = live.reduce((a, f) => a + f.weight * 2, 0);
  const raw = live.reduce((a, f) => a + f.weight * f.score, 0);
  const score = max > 0 ? Math.round((raw / max) * 100) : 0;
  const verdict: Verdict =
    score >= VERDICT_THRESHOLD ? "bullish" : score <= -VERDICT_THRESHOLD ? "bearish" : "neutral";
  const directional = live.filter((f) => f.score !== 0);
  const dirWeight = directional.reduce((a, f) => a + f.weight, 0);
  const sign = Math.sign(score);
  const agree = directional.filter((f) => Math.sign(f.score) === sign).reduce((a, f) => a + f.weight, 0);
  let confidence = dirWeight > 0 && sign !== 0 ? (agree / dirWeight) * 100 : 0;
  // A squeeze means a big move is likely but its direction isn't settled; expansion confirms the move.
  if (vol.state === "squeeze") confidence -= 10;
  if (vol.state === "expanding" && verdict !== "neutral") confidence += 5;
  return {
    score,
    verdict,
    strong: Math.abs(score) >= STRONG_THRESHOLD,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
  };
}

/** Technical factors at bar i (used by both the live scorecard and the backtest). */
function technicalFactors(
  p: Prepared,
  ctx: Prepared,
  i: number,
  horizon: Horizon,
  bench: Prepared | null,
  benchName: string | null,
): Factor[] {
  const cfg = HORIZON_CONFIG[horizon];
  const ci = contextIndex(ctx, cfg.contextMs, p.bars[i]!.closeTime);
  const ctxFactor =
    ci >= 0
      ? { ...maTrend(ctx, ci, "context", `${cfg.context} trend`), weight: 2 }
      : {
          id: "context",
          group: "trend" as const,
          label: `${cfg.context} trend`,
          score: 0,
          weight: 2,
          available: false,
          reading: "Not enough history yet",
        };
  return [
    maTrend(p, i),
    structure(p, i),
    ctxFactor,
    rsiFactor(p, i),
    macdFactor(p, i),
    volumeFactor(p, i),
    takerFlow(p, i, cfg.window),
    relativeStrength(p, i, bench, benchName, cfg.window, cfg.rsThresholds),
  ];
}

/** The last bar whose candle has closed (REST includes the still-forming candle). */
export function lastClosedIndex(bars: readonly SBar[], now = Date.now()): number {
  const last = bars.length - 1;
  return last >= 0 && bars[last]!.closeTime > now ? last - 1 : last;
}

export type ScorecardInput = {
  horizon: Horizon;
  bars: readonly SBar[];
  benchmark?: { name: string; bars: readonly SBar[] } | null;
  derivatives?: DerivativesInput | null;
  derivativesReason?: string;
  orderBook?: { bids: [number, number][]; asks: [number, number][] } | null;
  fearGreed?: { value: number; label: string } | null;
  /** Crypto only gets the Fear & Greed factor. */
  isCrypto: boolean;
  now?: number;
};

export function buildScorecard(input: ScorecardInput): Scorecard {
  const cfg = HORIZON_CONFIG[input.horizon];
  const p = prepare(input.bars);
  const ctx = prepare(resample(input.bars, cfg.contextMs));
  const bench = input.benchmark ? prepare(input.benchmark.bars) : null;
  const i = lastClosedIndex(input.bars, input.now);
  if (i < 30) {
    return {
      horizon: input.horizon,
      score: 0,
      verdict: "neutral",
      strong: false,
      confidence: 0,
      factors: [],
      volatility: { bandwidthPct: null, atrPct: null, state: "unknown" },
      asOf: null,
    };
  }
  const factors = [
    ...technicalFactors(p, ctx, i, input.horizon, bench, input.benchmark?.name ?? null),
    ...(input.horizon === "intraday"
      ? [
          input.orderBook
            ? orderBookFactor(input.orderBook.bids, input.orderBook.asks)
            : orderBookFactor([], []),
        ]
      : []),
    ...derivativesFactors(input.derivatives ?? null, input.derivativesReason),
    ...(input.isCrypto && input.horizon === "swing"
      ? [fearGreedFactor(input.fearGreed?.value ?? null, input.fearGreed?.label ?? null)]
      : []),
  ];
  const vol = volatility(p, i);
  return {
    horizon: input.horizon,
    ...aggregate(factors, vol),
    factors,
    volatility: vol,
    asOf: input.bars[i]!.time,
  };
}

/**
 * Replays the technical scorecard over history (no lookahead) and measures
 * what happened `forwardBars` later. Derivatives/order book/sentiment are
 * excluded: Binance only keeps ~30 days of positioning history.
 */
export function backtest(
  horizon: Horizon,
  bars: readonly SBar[],
  benchmark: { name: string; bars: readonly SBar[] } | null = null,
  now = Date.now(),
): Backtest {
  const cfg = HORIZON_CONFIG[horizon];
  const p = prepare(bars);
  const ctx = prepare(resample(bars, cfg.contextMs));
  const bench = benchmark ? prepare(benchmark.bars) : null;
  const lastClosed = lastClosedIndex(bars, now);
  const f = cfg.forwardBars;
  const warm = 60;

  const bull: number[] = [];
  const bear: number[] = [];
  let up = 0;
  let down = 0;
  let tested = 0;
  for (let i = warm; i + f <= lastClosed; i++) {
    const factors = technicalFactors(p, ctx, i, horizon, bench, benchmark?.name ?? null);
    const { score } = aggregate(factors, { bandwidthPct: null, atrPct: null, state: "unknown" });
    const r = (p.close[i + f]! / p.close[i]! - 1) * 100;
    tested += 1;
    if (r > 0) up += 1;
    else if (r < 0) down += 1;
    if (score >= VERDICT_THRESHOLD) bull.push(r);
    else if (score <= -VERDICT_THRESHOLD) bear.push(r);
  }
  const bucket = (rs: number[], dir: 1 | -1): BacktestBucket => ({
    n: rs.length,
    hitRate: rs.length ? (rs.filter((r) => Math.sign(r) === dir).length / rs.length) * 100 : 0,
    avgReturnPct: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
  });

  let currentTechnicalScore: number | null = null;
  if (lastClosed >= warm) {
    const factors = technicalFactors(p, ctx, lastClosed, horizon, bench, benchmark?.name ?? null);
    currentTechnicalScore = aggregate(factors, { bandwidthPct: null, atrPct: null, state: "unknown" }).score;
  }

  return {
    horizon,
    bars: tested,
    from: bars[warm]?.time ?? null,
    to: bars[lastClosed - f]?.time ?? null,
    bullish: bucket(bull, 1),
    bearish: bucket(bear, -1),
    baselineUp: tested ? (up / tested) * 100 : 0,
    baselineDown: tested ? (down / tested) * 100 : 0,
    currentTechnicalScore,
  };
}

/** Verdict with hysteresis for flip alerts: enter at ±35, leave only after crossing back past ±25. */
export function verdictWithHysteresis(score: number, previous: Verdict | null): Verdict {
  if (previous === "bullish" && score > 25) return "bullish";
  if (previous === "bearish" && score < -25) return "bearish";
  return score >= VERDICT_THRESHOLD ? "bullish" : score <= -VERDICT_THRESHOLD ? "bearish" : "neutral";
}

/** Technical score at bar i — exported for the no-lookahead test and the watchlist column. */
export function technicalScoreAt(
  horizon: Horizon,
  bars: readonly SBar[],
  i: number,
): { score: number; factors: Factor[] } {
  const cfg = HORIZON_CONFIG[horizon];
  const p = prepare(bars);
  const ctx = prepare(resample(bars, cfg.contextMs));
  const factors = technicalFactors(p, ctx, i, horizon, null, null);
  return { score: aggregate(factors, { bandwidthPct: null, atrPct: null, state: "unknown" }).score, factors };
}

export type BacktestAssessment = {
  kind: "edge" | "no-edge" | "worse" | "insufficient";
  /** Hit rate minus the baseline, in percentage points. */
  edge: number | null;
  bucket: BacktestBucket | null;
  baseline: number | null;
  summary: string;
};

/**
 * Plain-language verdict on whether the current call has historically beaten
 * chance for this symbol. Under 30 cases is "insufficient"; within ±3 points of
 * the baseline is "no measurable edge".
 */
export function assessBacktest(bt: Backtest, verdict: Verdict): BacktestAssessment {
  const cfg = HORIZON_CONFIG[bt.horizon];
  if (verdict === "neutral") {
    return {
      kind: "insufficient",
      edge: null,
      bucket: null,
      baseline: null,
      summary: `Neutral calls aren't scored. Price rose over ${cfg.forwardLabel} ${bt.baselineUp.toFixed(0)}% of the time.`,
    };
  }
  const bucket = verdict === "bullish" ? bt.bullish : bt.bearish;
  const baseline = verdict === "bullish" ? bt.baselineUp : bt.baselineDown;
  const dir = verdict === "bullish" ? "higher" : "lower";
  if (bucket.n < 30) {
    return {
      kind: "insufficient",
      edge: null,
      bucket,
      baseline,
      summary: `Only ${bucket.n} past ${verdict} calls — not enough history to judge.`,
    };
  }
  const edge = bucket.hitRate - baseline;
  const kind = edge >= 3 ? "edge" : edge <= -3 ? "worse" : "no-edge";
  const lead = `Past ${verdict} calls: price ${dir} ${cfg.forwardLabel} later ${bucket.hitRate.toFixed(0)}% of the time (${bucket.n} cases) vs ${baseline.toFixed(0)}% baseline`;
  const tail =
    kind === "edge"
      ? ` — a ${edge.toFixed(1)}-point historical edge.`
      : kind === "worse"
        ? ` — historically worse than chance.`
        : ` — no measurable edge.`;
  return { kind, edge, bucket, baseline, summary: lead + tail };
}
