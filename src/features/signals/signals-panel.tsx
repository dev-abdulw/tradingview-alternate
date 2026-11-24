"use client";

import { Bell, BellRing, ChevronDown } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { requestNotificationPermission } from "@/features/alerts/notify";
import type { SymbolKey } from "@/lib/market-data/types";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";
import type { BacktestAssessment } from "@/lib/signals/engine";
import type { Factor, FactorGroup, Horizon, Scorecard } from "@/lib/signals/types";
import { cn } from "@/lib/utils/cn";
import { Chip } from "@/ui/chip";
import { Skeleton } from "@/ui/skeleton";
import { SegmentedControl } from "@/ui/tabs";
import { Tooltip } from "@/ui/tooltip";
import { useSignalWatches, watchFor } from "./signal-watch";
import { contextLabel, HORIZON_CONFIG, useSignals, type HorizonSignals } from "./use-signals";

export const useSignalsPrefs = create<{ horizon: Horizon; setHorizon: (h: Horizon) => void }>()(
  persist((set) => ({ horizon: "swing", setHorizon: (horizon) => set({ horizon }) }), {
    name: storageKey("signals-prefs"),
    storage: createJSONStorage(() => zustandStorage),
  }),
);

const GROUPS: { id: FactorGroup; label: string }[] = [
  { id: "trend", label: "Trend" },
  { id: "momentum", label: "Momentum" },
  { id: "flow", label: "Order flow" },
  { id: "derivatives", label: "Futures positioning" },
  { id: "relative", label: "Relative strength" },
  { id: "sentiment", label: "Sentiment" },
];

/** Signed integer with a true minus sign, matching the rest of the app's numbers. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : "0");

const VERDICT_TEXT = { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" } as const;
const verdictClass = (v: Scorecard["verdict"]) =>
  v === "bullish" ? "text-up" : v === "bearish" ? "text-down" : "text-fg-muted";

export function SignalsPanel({ symbol }: { symbol: SymbolKey }) {
  const horizon = useSignalsPrefs((s) => s.horizon);
  const setHorizon = useSignalsPrefs((s) => s.setHorizon);
  const intraday = useSignals(symbol, "intraday");
  const swing = useSignals(symbol, "swing");
  const selected = horizon === "intraday" ? intraday : swing;

  return (
    <div className="space-y-3 pb-3" aria-label="Signals">
      <div className="grid grid-cols-2 gap-2">
        <VerdictCard
          symbol={symbol}
          horizon="intraday"
          s={intraday}
          selected={horizon === "intraday"}
          onSelect={setHorizon}
        />
        <VerdictCard
          symbol={symbol}
          horizon="swing"
          s={swing}
          selected={horizon === "swing"}
          onSelect={setHorizon}
        />
      </div>

      <div className="flex items-center justify-between">
        <SegmentedControl<Horizon>
          aria-label="Signal horizon"
          size="xs"
          value={horizon}
          onValueChange={setHorizon}
          options={[
            { value: "intraday", label: "Intraday" },
            { value: "swing", label: "Swing" },
          ]}
        />
        <span className="text-meta text-fg-subtle">{contextLabel(horizon)}</span>
      </div>

      {selected.assessment && <AssessmentNote a={selected.assessment} />}
      {selected.scorecard && <VolatilityNote sc={selected.scorecard} />}

      {selected.error ? (
        <p className="text-cell text-danger">Couldn’t load data: {selected.error}</p>
      ) : !selected.scorecard ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      ) : (
        <FactorList factors={selected.scorecard.factors} />
      )}

      <p className="border-t border-line pt-2 text-meta leading-relaxed text-fg-subtle">
        A rule-based reading of public market data, scored on the last closed{" "}
        {HORIZON_CONFIG[horizon].primary} candle. Not a forecast and not financial advice. The backtest covers
        trend, momentum and volume factors (futures positioning has only ~30 days of history).
      </p>
    </div>
  );
}

function VerdictCard({
  symbol,
  horizon,
  s,
  selected,
  onSelect,
}: {
  symbol: SymbolKey;
  horizon: Horizon;
  s: HorizonSignals;
  selected: boolean;
  onSelect: (h: Horizon) => void;
}) {
  const sc = s.scorecard;
  const cfg = HORIZON_CONFIG[horizon];
  const watches = useSignalWatches((st) => st.rows);
  const watching = !!watchFor(watches, symbol, horizon);
  return (
    <div
      className={cn("relative rounded-popover bg-elevated p-2.5 ring-1 ring-line", selected && "ring-accent")}
    >
      <button
        type="button"
        onClick={() => onSelect(horizon)}
        aria-pressed={selected}
        aria-label={`${cfg.label} signal${sc ? `: ${VERDICT_TEXT[sc.verdict]}, score ${sc.score}` : ""}`}
        className="absolute inset-0 rounded-popover"
      />
      <div className="pointer-events-none relative flex items-center justify-between">
        <span className="meta-label">{cfg.label}</span>
        <Tooltip
          content={
            watching
              ? "Stop alerting on verdict changes"
              : `Alert me when the ${cfg.label.toLowerCase()} verdict changes`
          }
        >
          <button
            type="button"
            aria-pressed={watching}
            aria-label={
              watching ? `Stop ${cfg.label} verdict alerts` : `Alert on ${cfg.label} verdict change`
            }
            onClick={() => {
              requestNotificationPermission();
              useSignalWatches.getState().toggle(symbol, horizon);
            }}
            className={cn(
              "pointer-events-auto -mr-1 inline-flex size-6 items-center justify-center rounded-[5px] hover:bg-hover [&_svg]:size-3.5",
              watching ? "text-warning" : "text-fg-subtle",
            )}
          >
            {watching ? <BellRing /> : <Bell />}
          </button>
        </Tooltip>
      </div>
      {sc ? (
        <div className="pointer-events-none relative">
          <div className={cn("mt-0.5 text-title font-semibold", verdictClass(sc.verdict))}>
            {sc.strong && sc.verdict !== "neutral" ? "Strongly " : ""}
            {VERDICT_TEXT[sc.verdict]}
          </div>
          <Gauge score={sc.score} />
          <div className="mt-1.5 flex items-center justify-between text-meta">
            <span className="num text-fg-muted">{signed(sc.score)}</span>
            <span className="text-fg-subtle">Agreement {sc.confidence}%</span>
          </div>
          {s.assessment && <EdgeChip a={s.assessment} />}
        </div>
      ) : (
        <div className="space-y-1.5 pt-1" aria-busy="true">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}
    </div>
  );
}

/** −100 … +100 bar with a center line and a marker. */
function Gauge({ score }: { score: number }) {
  const pos = (score + 100) / 2;
  return (
    <div
      className="relative mt-1.5 h-1.5 rounded-full bg-hover"
      role="meter"
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-label="Signal score"
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div
        className={cn("absolute inset-y-0 rounded-full", score >= 0 ? "bg-up" : "bg-down")}
        style={
          score >= 0 ? { left: "50%", width: `${pos - 50}%` } : { left: `${pos}%`, width: `${50 - pos}%` }
        }
      />
    </div>
  );
}

function EdgeChip({ a }: { a: BacktestAssessment }) {
  const [tone, text] =
    a.kind === "edge"
      ? (["up", `Edge +${a.edge!.toFixed(0)} pts`] as const)
      : a.kind === "worse"
        ? (["down", "Worse than chance"] as const)
        : a.kind === "no-edge"
          ? (["neutral", "No measurable edge"] as const)
          : (["neutral", a.bucket ? "Too few cases" : "Not scored"] as const);
  return (
    <Chip tone={tone} className="mt-1.5">
      {text}
    </Chip>
  );
}

function AssessmentNote({ a }: { a: BacktestAssessment }) {
  return (
    <p
      className={cn(
        "rounded-control px-2.5 py-2 text-cell",
        a.kind === "edge"
          ? "bg-up-muted text-fg"
          : a.kind === "worse"
            ? "bg-down-muted text-fg"
            : "bg-hover text-fg-muted",
      )}
    >
      <span className="font-medium text-fg">Backtest: </span>
      {a.summary}
    </p>
  );
}

function VolatilityNote({ sc }: { sc: Scorecard }) {
  const v = sc.volatility;
  if (v.state === "unknown") return null;
  const text =
    v.state === "squeeze"
      ? "Volatility squeeze: ranges are unusually tight. A large move often follows, direction unknown."
      : v.state === "expanding"
        ? "Volatility expanding: moves are larger than usual."
        : "Volatility normal.";
  return (
    <p className="text-cell text-fg-muted">
      {text}
      {v.atrPct !== null && (
        <span className="num text-fg-subtle"> Typical candle range ≈ {v.atrPct.toFixed(2)}%.</span>
      )}
    </p>
  );
}

function FactorList({ factors }: { factors: Factor[] }) {
  return (
    <div className="space-y-2.5">
      {GROUPS.map((g) => {
        const fs = factors.filter((f) => f.group === g.id);
        if (fs.length === 0) return null;
        return (
          <section key={g.id} aria-label={g.label}>
            <h4 className="meta-label mb-0.5">{g.label}</h4>
            <ul className="divide-y divide-line">
              {fs.map((f) => (
                <FactorRow key={f.id} f={f} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Lean({ score, available }: { score: number; available: boolean }) {
  if (!available) return <span className="w-9 shrink-0 text-center text-cell text-fg-disabled">—</span>;
  const label = score >= 2 ? "▲▲" : score === 1 ? "▲" : score === 0 ? "•" : score === -1 ? "▼" : "▼▼";
  return (
    <span
      className={cn(
        "w-9 shrink-0 text-center text-cell font-medium",
        score > 0 ? "text-up" : score < 0 ? "text-down" : "text-fg-subtle",
      )}
      aria-label={score > 0 ? `bullish ${score}` : score < 0 ? `bearish ${-score}` : "neutral"}
    >
      {label}
    </span>
  );
}

function FactorRow({ f }: { f: Factor }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!f.detail && Object.keys(f.detail).length > 0;
  return (
    <li className={cn(!f.available && "opacity-60")}>
      <button
        type="button"
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1 py-1.5 text-left enabled:hover:bg-hover"
      >
        <Lean score={f.score} available={f.available} />
        <span className="min-w-0 flex-1">
          <span className="block text-cell font-medium text-fg">{f.label}</span>
          <span className="block text-cell text-fg-muted">{f.reading}</span>
        </span>
        {hasDetail && (
          <ChevronDown
            className={cn(
              "mt-0.5 size-3.5 shrink-0 text-fg-subtle transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open && f.detail && (
        <dl className="mb-2 ml-10 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-meta">
          {Object.entries(f.detail).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-subtle">{k}</dt>
              <dd className="num text-right text-fg">{v}</dd>
            </div>
          ))}
          <dt className="text-fg-subtle">Weight</dt>
          <dd className="num text-right text-fg">{f.weight}</dd>
        </dl>
      )}
    </li>
  );
}
