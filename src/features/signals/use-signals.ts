"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchFearGreed,
  fetchOrderBook,
  fetchPerpCatalog,
  fetchPositioning,
  perpFor,
} from "@/lib/market-data/binance/analytics";
import { useInstrument, useInstrumentMap } from "@/lib/market-data/hooks";
import { getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import type { Timeframe } from "@/lib/market-data/timeframes";
import type { Instrument, Kline, SymbolKey } from "@/lib/market-data/types";
import type { DerivativesInput } from "@/lib/signals/derivatives";
import {
  assessBacktest,
  backtest,
  buildScorecard,
  lastClosedIndex,
  type BacktestAssessment,
} from "@/lib/signals/engine";
import { HORIZON_CONFIG, type Backtest, type Horizon, type Scorecard } from "@/lib/signals/types";

const MIN = 60_000;

/** Pages klines back with endTime until `total` bars (or the start of history). */
export async function fetchHistory(
  key: SymbolKey,
  tf: Timeframe,
  total: number,
  signal?: AbortSignal,
): Promise<Kline[]> {
  const ref = parseSymbolKey(key);
  const p = getProvider(ref);
  const page = Math.min(total, p.maxKlinesPerRequest);
  let bars = await p.getKlines(ref.symbol, tf, { limit: page, ...(signal ? { signal } : {}) });
  while (bars.length < total && bars.length > 0) {
    const older = await p.getKlines(ref.symbol, tf, {
      endTime: bars[0]!.time - 1,
      limit: Math.min(page, total - bars.length),
      ...(signal ? { signal } : {}),
    });
    if (older.length === 0) break;
    bars = [...older, ...bars];
  }
  return bars;
}

/** Benchmark for relative strength: BTC for crypto, SPY for stocks, none for metals. */
export function benchmarkFor(i: Instrument | undefined, instruments: ReadonlyMap<string, Instrument>) {
  if (!i) return null;
  if (i.assetClass === "crypto") {
    return i.base === "BTC" ? null : { key: "binance:spot:BTCUSDT" as SymbolKey, name: "BTC" };
  }
  if (i.assetClass === "stock") {
    const spy = [...instruments.values()].find((x) => x.assetClass === "stock" && x.displayName === "SPY");
    return spy && spy.key !== i.key ? { key: spy.key as SymbolKey, name: "SPY" } : null;
  }
  return null;
}

function useHistory(key: SymbolKey | null, horizon: Horizon) {
  const cfg = HORIZON_CONFIG[horizon];
  return useQuery({
    queryKey: ["signals", "history", key, cfg.primary],
    queryFn: ({ signal }) => fetchHistory(key!, cfg.primary, cfg.historyBars, signal),
    enabled: key !== null,
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
  });
}

export type HorizonSignals = {
  scorecard: Scorecard | null;
  backtest: Backtest | null;
  assessment: BacktestAssessment | null;
  loading: boolean;
  error: string | null;
};

export function useSignals(
  key: SymbolKey | null,
  horizon: Horizon,
  opts: { live?: boolean } = {},
): HorizonSignals {
  const instrument = useInstrument(key);
  const instruments = useInstrumentMap();
  const bench = useMemo(() => benchmarkFor(instrument, instruments), [instrument, instruments]);

  const history = useHistory(key, horizon);
  const benchHistory = useHistory(bench?.key ?? null, horizon);

  const catalog = useQuery({
    queryKey: ["signals", "perps"],
    queryFn: ({ signal }) => fetchPerpCatalog(signal),
    staleTime: 6 * 60 * MIN,
    gcTime: Infinity,
  });
  const perp = instrument && catalog.data ? perpFor(instrument, catalog.data) : null;
  const period = horizon === "intraday" ? "1h" : "4h";
  const positioning = useQuery({
    queryKey: ["signals", "positioning", perp, period],
    queryFn: ({ signal }) => fetchPositioning(perp!, period, horizon === "intraday" ? 7 : 19, signal),
    enabled: perp !== null,
    staleTime: 5 * MIN,
    refetchInterval: 5 * MIN,
    retry: 1,
  });
  const book = useQuery({
    queryKey: ["signals", "book", key],
    queryFn: ({ signal }) => fetchOrderBook(parseSymbolKey(key!).symbol, signal),
    enabled: key !== null && horizon === "intraday" && opts.live !== false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const isCrypto = instrument?.assetClass === "crypto";
  const fng = useQuery({
    queryKey: ["signals", "fng"],
    queryFn: ({ signal }) => fetchFearGreed(signal),
    enabled: isCrypto && horizon === "swing",
    staleTime: 60 * MIN,
    retry: 1,
  });

  const benchmark = useMemo(
    () => (bench && benchHistory.data ? { name: bench.name, bars: benchHistory.data } : null),
    [bench, benchHistory.data],
  );

  const derivatives = useMemo<DerivativesInput | null>(() => {
    const bars = history.data;
    const pos = positioning.data;
    if (!perp || !pos || !bars || !catalog.data) return null;
    const i = lastClosedIndex(bars);
    const last = bars[i];
    const startT = pos.openInterest[0]?.t;
    const start = startT === undefined ? undefined : bars.find((b) => b.time >= startT);
    return {
      perp,
      fundingRates: pos.fundingRates,
      fundingIntervalHours: catalog.data.fundingHours.get(perp) ?? 8,
      openInterest: pos.openInterest.map((o) => o.v),
      priceChangePct: last && start ? (last.close / start.close - 1) * 100 : 0,
      topTraderRatios: pos.topTraderRatios,
      crowdRatios: pos.crowdRatios,
      takerRatios: pos.takerRatios,
    };
  }, [perp, positioning.data, history.data, catalog.data]);

  const scorecard = useMemo(() => {
    if (!history.data || !instrument) return null;
    return buildScorecard({
      horizon,
      bars: history.data,
      benchmark,
      derivatives,
      derivativesReason: !catalog.data
        ? "Loading futures data…"
        : perp
          ? positioning.isError
            ? "Futures data unavailable right now"
            : "Loading futures data…"
          : "No futures contract for this asset",
      orderBook: book.data ?? null,
      fearGreed: fng.data ?? null,
      isCrypto,
    });
  }, [
    history.data,
    instrument,
    horizon,
    benchmark,
    derivatives,
    catalog.data,
    perp,
    positioning.isError,
    book.data,
    fng.data,
    isCrypto,
  ]);

  // The backtest depends only on candles — not on the order book or positioning refreshes.
  const bt = useMemo(
    () => (history.data ? backtest(horizon, history.data, benchmark) : null),
    [history.data, horizon, benchmark],
  );

  return {
    scorecard,
    backtest: bt,
    assessment: scorecard && bt ? assessBacktest(bt, scorecard.verdict) : null,
    loading: history.isLoading || (!scorecard && !history.isError),
    error: history.error ? (history.error as Error).message : null,
  };
}

export { HORIZON_CONFIG, type Horizon };
export const contextLabel = (h: Horizon) =>
  `${HORIZON_CONFIG[h].primary} · ${HORIZON_CONFIG[h].context} context`;
