"use client";

import { useEffect } from "react";
import { z } from "zod";
import { create } from "zustand";
import { notify } from "@/features/alerts/notify";
import { useChart } from "@/features/chart/chart-store";
import {
  fetchPerpCatalog,
  fetchPositioning,
  perpFor,
  type PerpCatalog,
} from "@/lib/market-data/binance/analytics";
import { getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey, toSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { LocalCollection, type CollectionRepository } from "@/lib/persistence/collection";
import { newId, nowIso } from "@/lib/persistence/schema";
import { buildScorecard, lastClosedIndex, verdictWithHysteresis } from "@/lib/signals/engine";
import { HORIZON_CONFIG, type Horizon, type Verdict } from "@/lib/signals/types";
import { toast } from "@/ui/toast";
import { fetchHistory } from "./use-signals";

/** "Tell me when the Intraday/Swing verdict flips" — one row per symbol × horizon. */
export const signalWatchRow = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  market: z.string().min(1),
  symbol: z.string().min(1),
  horizon: z.enum(["intraday", "swing"]),
  active: z.boolean(),
  last_verdict: z.enum(["bullish", "neutral", "bearish"]).nullable(),
  last_score: z.number().nullable(),
  /** Open time of the last candle we evaluated (one check per candle close). */
  checked_bar: z.number().nullable(),
  created_at: z.string(),
});
export type SignalWatch = z.infer<typeof signalWatchRow>;

let repo: CollectionRepository<SignalWatch> = new LocalCollection("signal-watches", signalWatchRow);
export function setSignalWatchRepository(r: CollectionRepository<SignalWatch>) {
  repo = r;
}

type State = {
  rows: Record<string, SignalWatch>;
  ready: boolean;
  init(): Promise<void>;
  toggle(key: SymbolKey, horizon: Horizon): void;
  remove(id: string): void;
  record(id: string, patch: Pick<SignalWatch, "last_verdict" | "last_score" | "checked_bar">): void;
};

const fail = (err: unknown) => toast.error("Couldn’t save signal alert", { description: String(err) });

export const useSignalWatches = create<State>()((set, get) => ({
  rows: {},
  ready: false,
  async init() {
    if (get().ready) return;
    const rows = await repo.load();
    set({ rows: Object.fromEntries(rows.map((r) => [r.id, r])), ready: true });
  },
  toggle(key, horizon) {
    const existing = Object.values(get().rows).find((r) => toSymbolKey(r) === key && r.horizon === horizon);
    if (existing) return get().remove(existing.id);
    const { provider, market, symbol } = parseSymbolKey(key);
    const row: SignalWatch = {
      id: newId(),
      provider,
      market,
      symbol,
      horizon,
      active: true,
      last_verdict: null,
      last_score: null,
      checked_bar: null,
      created_at: nowIso(),
    };
    set((s) => ({ rows: { ...s.rows, [row.id]: row } }));
    repo.upsert([row]).catch(fail);
  },
  remove(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.rows;
      return { rows: rest };
    });
    repo.remove([id]).catch(fail);
  },
  record(id, patch) {
    const r = get().rows[id];
    if (!r) return;
    const row = { ...r, ...patch };
    set((s) => ({ rows: { ...s.rows, [id]: row } }));
    repo.upsert([row]).catch(fail);
  },
}));

export function watchFor(rows: Record<string, SignalWatch>, key: SymbolKey, horizon: Horizon) {
  return Object.values(rows).find((r) => toSymbolKey(r) === key && r.horizon === horizon);
}

/* --------------------------------- engine -------------------------------- */

let catalogCache: { at: number; p: Promise<PerpCatalog> } | null = null;
function catalog(): Promise<PerpCatalog> {
  if (!catalogCache || Date.now() - catalogCache.at > 6 * 3_600_000) {
    catalogCache = { at: Date.now(), p: fetchPerpCatalog() };
    catalogCache.p.catch(() => (catalogCache = null));
  }
  return catalogCache.p;
}

async function evaluate(w: SignalWatch): Promise<void> {
  const key = toSymbolKey(w);
  const cfg = HORIZON_CONFIG[w.horizon];
  const bars = await fetchHistory(key, cfg.primary, 300);
  const i = lastClosedIndex(bars);
  const bar = bars[i];
  if (!bar || bar.time === w.checked_bar) return;

  const instruments = await getProvider(parseSymbolKey(key)).getExchangeInfo();
  const inst = instruments.find((x) => x.symbol === w.symbol);
  const cat = await catalog().catch(() => null);
  const perp = inst && cat ? perpFor(inst, cat) : null;
  const pos = perp
    ? await fetchPositioning(
        perp,
        w.horizon === "intraday" ? "1h" : "4h",
        w.horizon === "intraday" ? 7 : 19,
      ).catch(() => null)
    : null;
  const start = pos?.openInterest[0] ? bars.find((b) => b.time >= pos.openInterest[0]!.t) : undefined;
  const sc = buildScorecard({
    horizon: w.horizon,
    bars,
    isCrypto: inst?.assetClass === "crypto",
    derivatives:
      perp && pos && cat
        ? {
            perp,
            fundingRates: pos.fundingRates,
            fundingIntervalHours: cat.fundingHours.get(perp) ?? 8,
            openInterest: pos.openInterest.map((o) => o.v),
            priceChangePct: start ? (bar.close / start.close - 1) * 100 : 0,
            topTraderRatios: pos.topTraderRatios,
            crowdRatios: pos.crowdRatios,
            takerRatios: pos.takerRatios,
          }
        : null,
  });
  const verdict: Verdict = verdictWithHysteresis(sc.score, w.last_verdict);
  if (w.last_verdict !== null && verdict !== w.last_verdict) {
    const name = inst?.displayName ?? w.symbol;
    notify({
      title: `${name} ${cfg.label.toLowerCase()} turned ${verdict}`,
      body: `Score ${sc.score > 0 ? "+" : ""}${sc.score} (was ${w.last_verdict}). Rule-based reading, not financial advice.`,
      tag: `signal-${w.id}`,
      actionLabel: "Open chart",
      onAction: () => useChart.getState().setSymbol(key),
    });
  }
  useSignalWatches
    .getState()
    .record(w.id, { last_verdict: verdict, last_score: sc.score, checked_bar: bar.time });
}

/**
 * Checks each watched symbol once per closed candle (1h for intraday, 1D for
 * swing). Uses the same scorecard and a ±35/±25 hysteresis so a score hovering
 * around a threshold doesn't flap.
 */
export function SignalWatchEngine() {
  useEffect(() => {
    void useSignalWatches.getState().init();
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const now = Date.now();
        for (const w of Object.values(useSignalWatches.getState().rows)) {
          if (!w.active) continue;
          const period = HORIZON_CONFIG[w.horizon].primaryMs;
          // Wait ~30s after a candle closes so Binance has finalised it.
          const latestClosedOpen = Math.floor((now - 30_000) / period) * period - period;
          if (w.checked_bar !== null && w.checked_bar >= latestClosedOpen) continue;
          await evaluate(w).catch(() => {
            /* transient network error — try again next minute */
          });
        }
      } finally {
        running = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 60_000);
    const unsub = useSignalWatches.subscribe((s, prev) => {
      if (Object.keys(s.rows).length > Object.keys(prev.rows).length) void tick();
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);
  return null;
}
