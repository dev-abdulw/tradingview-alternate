"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/features/settings/settings-store";
import { candleCache, type CandleStatus } from "@/lib/market-data/candles";
import { useInstrument } from "@/lib/market-data/hooks";
import { formatPercent, formatPrice, formatVolume } from "@/lib/market-data/precision";
import { parseSymbolKey } from "@/lib/market-data/symbol-key";
import type { Timeframe } from "@/lib/market-data/timeframes";
import type { Instrument, Kline, SymbolKey } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { useChartColors, type ChartColors } from "./chart-colors";
import { ChartController } from "./chart-controller";
import { useChart } from "./chart-store";
import { crosshairBus } from "./crosshair-bus";
import { IndicatorControls } from "./indicator-settings";
import { INDICATOR_META, indicatorLabel, type IndicatorConfig } from "./indicator-config";

export type ChartViewProps = {
  paneIndex: number;
  symbol: SymbolKey;
  timeframe: Timeframe;
  /** Rendered over the chart (drawings toolbar state, alerts, context menu wrap). */
  children?: (controller: ChartController) => ReactNode;
};

export function ChartView({ paneIndex, symbol, timeframe, children }: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<ChartController | null>(null);
  const colors = useChartColors();
  const timezone = useSettings((s) => s.timezone);
  const locale = useSettings((s) => s.numberFormat);
  const chartType = useChart((s) => s.chartType);
  const scaleMode = useChart((s) => s.scaleMode);
  const autoScale = useChart((s) => s.autoScale);
  const indicators = useChart((s) => s.indicators);
  const syncCrosshair = useChart((s) => s.syncCrosshair);
  const multi = useChart((s) => s.layoutMode !== "1");
  const instrument = useInstrument(symbol);
  const [status, setStatus] = useState<{ s: CandleStatus; error: string | null }>({ s: "idle", error: null });
  const [dataVersion, setDataVersion] = useState(0);

  // Create the chart once per mount.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = new ChartController(el, { colors, timezone, locale });
    setController(c);
    return () => {
      c.destroy();
      setController(null);
    };
    // Options are applied by the effects below; creating once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => controller?.setColors(colors), [controller, colors]);
  useEffect(() => controller?.setTimezone(timezone, locale), [controller, timezone, locale]);
  useEffect(() => controller?.setChartType(chartType), [controller, chartType]);
  useEffect(() => controller?.setScale(scaleMode, autoScale), [controller, scaleMode, autoScale]);
  useEffect(() => controller?.setIndicators(indicators), [controller, indicators]);
  useEffect(() => {
    if (controller && instrument)
      controller.setPrecision(instrument.priceDecimals, Number(instrument.tickSize));
  }, [controller, instrument]);

  // Data: cache → controller. Cache hits render synchronously (instant symbol/timeframe switches).
  useEffect(() => {
    if (!controller) return;
    let fresh = true;
    const el = containerRef.current;
    const apply = (reason: "reset" | "status") => {
      const snap = candleCache.get(symbol, timeframe);
      setStatus({ s: snap.status, error: snap.error });
      if (snap.status === "ready" && reason === "reset") {
        controller.setData(snap.bars, fresh);
        fresh = false;
        if (el) el.dataset.series = `${symbol}|${timeframe}`;
        mark();
        setDataVersion((v) => v + 1);
      }
    };
    // Test hooks (e2e): bar count + last candle time, updated on every data change.
    const mark = () => {
      const bars = candleCache.get(symbol, timeframe).bars;
      if (!el) return;
      el.dataset.bars = String(bars.length);
      el.dataset.last = String(bars[bars.length - 1]?.time ?? "");
    };
    const off = candleCache.subscribe(symbol, timeframe, (e) => {
      const snap = candleCache.get(symbol, timeframe);
      queueMicrotask(mark);
      if (e.type === "update") {
        controller.updateLast(snap.bars);
        setDataVersion((v) => v + 1);
      } else if (e.type === "prepend") controller.prepend(snap.bars, e.count);
      else apply(e.type);
    });
    const release = candleCache.retain(symbol, timeframe);
    if (candleCache.get(symbol, timeframe).status === "ready") apply("reset");
    else apply("status");
    controller.onNeedOlder(() => void candleCache.loadOlder(symbol, timeframe));
    return () => {
      off();
      release();
      if (el) delete el.dataset.series;
    };
  }, [controller, symbol, timeframe]);

  // Multi-chart crosshair sync.
  useEffect(() => {
    if (!controller || !multi || !syncCrosshair) return;
    const offLocal = controller.onCrosshairIndex((_, time) => crosshairBus.publish(paneIndex, time));
    const offBus = crosshairBus.subscribe((from, time) => {
      if (from !== paneIndex) controller.showCrosshairAt(time);
    });
    return () => {
      offLocal();
      offBus();
    };
  }, [controller, multi, syncCrosshair, paneIndex]);

  return (
    <div className="relative h-full w-full overflow-hidden" aria-label={`${symbol} ${timeframe} chart`}>
      <div ref={containerRef} className="absolute inset-0" data-testid="chart-canvas" />
      {controller && (
        <>
          <Legend
            controller={controller}
            symbol={symbol}
            timeframe={timeframe}
            instrument={instrument}
            indicators={indicators}
            colors={colors}
            locale={locale}
            dataVersion={dataVersion}
          />
          <ScaleControls />
          {children?.(controller)}
        </>
      )}
      {status.s === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-shimmer text-cell text-fg-subtle">
            Loading {parseSymbolKey(symbol).symbol}…
          </span>
        </div>
      )}
      {status.s === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/80 text-center">
          <div>
            <p className="text-ui font-medium text-fg">Couldn’t load chart history</p>
            <p className="mt-1 max-w-xs text-cell text-fg-muted">
              {status.error ?? "Binance didn’t respond."}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const release = candleCache.retain(symbol, timeframe);
              setTimeout(release, 0);
            }}
          >
            <RefreshCw /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- legend --------------------------------- */

function Legend({
  controller,
  symbol,
  timeframe,
  instrument,
  indicators,
  colors,
  locale,
  dataVersion,
}: {
  controller: ChartController;
  symbol: SymbolKey;
  timeframe: Timeframe;
  instrument: Instrument | undefined;
  indicators: IndicatorConfig[];
  colors: ChartColors;
  locale: string;
  dataVersion: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [rects, setRects] = useState(() => controller.paneRects());

  useEffect(
    () =>
      controller.onCrosshairIndex((index) => {
        setHover(index);
        setRects(controller.paneRects());
      }),
    [controller],
  );
  useEffect(() => {
    const ro = new ResizeObserver(() => setRects(controller.paneRects()));
    ro.observe(controller.container);
    const id = requestAnimationFrame(() => setRects(controller.paneRects()));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, [controller, indicators]);

  // dataVersion makes the legend follow the live candle when not hovering.
  void dataVersion;
  const v = controller.valuesAt(hover);
  const d = instrument?.priceDecimals ?? 2;
  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : formatPrice(n, d, locale);
  const bar: Kline | null = v.bar;
  const dir = bar ? (bar.close >= bar.open ? "text-up" : "text-down") : "text-fg";
  const change = bar && v.prev ? ((bar.close - v.prev.close) / v.prev.close) * 100 : null;
  const name = instrument?.displayName ?? parseSymbolKey(symbol).symbol;

  const overlays = indicators.filter((c) => INDICATOR_META[c.kind].pane === "overlay");
  const paneOrder = controller.paneIndicatorOrder();

  return (
    <>
      <div className="pointer-events-none absolute top-2 left-3 z-10 flex max-w-[calc(100%-90px)] flex-col gap-0.5 text-cell">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-fg">{name}</span>
          <span className="text-fg-muted">{timeframe}</span>
          <span className="text-fg-subtle">Binance</span>
          {bar && (
            <span
              className={cn(
                "num flex gap-2 transition-opacity duration-[var(--motion-fast)]",
                hover === null && "opacity-90",
              )}
            >
              <span className="text-fg-subtle">
                O<span className={cn("ml-0.5", dir)}>{fmt(bar.open)}</span>
              </span>
              <span className="text-fg-subtle">
                H<span className={cn("ml-0.5", dir)}>{fmt(bar.high)}</span>
              </span>
              <span className="text-fg-subtle">
                L<span className={cn("ml-0.5", dir)}>{fmt(bar.low)}</span>
              </span>
              <span className="text-fg-subtle">
                C<span className={cn("ml-0.5", dir)}>{fmt(bar.close)}</span>
              </span>
              {change !== null && <span className={dir}>{formatPercent(change, locale)}</span>}
            </span>
          )}
        </div>
        {overlays.map((c) => (
          <IndicatorRow key={c.id} config={c} values={v.indicators[c.id]} colors={colors} fmt={fmt} />
        ))}
      </div>

      {rects[1] && (
        <div className="pointer-events-none absolute left-3 z-10 text-cell" style={{ top: rects[1].top + 4 }}>
          <span className="text-fg-subtle">Vol </span>
          <span className={cn("num", dir)}>{v.volume === null ? "—" : formatVolume(v.volume, locale)}</span>
        </div>
      )}

      {paneOrder.map((id, k) => {
        const c = indicators.find((x) => x.id === id);
        const r = rects[2 + k];
        if (!c || !r) return null;
        return (
          <div
            key={id}
            className="pointer-events-none absolute left-3 z-10 text-cell"
            style={{ top: r.top + 4 }}
          >
            <IndicatorRow
              config={c}
              values={v.indicators[c.id]}
              colors={colors}
              fmt={(n) => (n === null || n === undefined ? "—" : n.toFixed(2))}
            />
          </div>
        );
      })}
    </>
  );
}

function IndicatorRow({
  config,
  values,
  colors,
  fmt,
}: {
  config: IndicatorConfig;
  values: (number | null)[] | undefined;
  colors: ChartColors;
  fmt: (n: number | null | undefined) => string;
}) {
  const color = colors.token(config.color);
  // MACD values are [hist, macd, signal]; show macd, signal, hist.
  const shown = config.kind === "macd" && values ? [values[1], values[2], values[0]] : (values ?? []);
  return (
    <div
      className={cn(
        "group/ind pointer-events-auto flex h-5 items-center gap-2",
        !config.visible && "opacity-50",
      )}
    >
      <span className="text-fg-muted">{indicatorLabel(config)}</span>
      {config.visible && (
        <span className="num flex gap-2" style={{ color }}>
          {shown.map((x, i) => (
            <span key={i}>{fmt(x)}</span>
          ))}
        </span>
      )}
      <span className="opacity-0 transition-opacity group-hover/ind:opacity-100 focus-within:opacity-100">
        <IndicatorControls config={config} colors={colors} />
      </span>
    </div>
  );
}

/* ------------------------------ scale controls ---------------------------- */

function ScaleControls() {
  const scaleMode = useChart((s) => s.scaleMode);
  const autoScale = useChart((s) => s.autoScale);
  const setScaleMode = useChart((s) => s.setScaleMode);
  const toggleAuto = useChart((s) => s.toggleAutoScale);
  const b = (active: boolean) =>
    cn(
      "h-5 rounded-[4px] px-1.5 text-meta font-medium",
      active ? "bg-accent-muted text-accent" : "text-fg-subtle hover:bg-hover hover:text-fg",
    );
  return (
    <div
      className="absolute right-[72px] bottom-8 z-10 flex gap-0.5 rounded-control bg-panel/80 p-0.5 backdrop-blur"
      role="group"
      aria-label="Price scale"
    >
      <button
        type="button"
        className={b(scaleMode === "percent")}
        aria-pressed={scaleMode === "percent"}
        title="Percentage scale"
        onClick={() => setScaleMode(scaleMode === "percent" ? "linear" : "percent")}
      >
        %
      </button>
      <button
        type="button"
        className={b(scaleMode === "log")}
        aria-pressed={scaleMode === "log"}
        title="Logarithmic scale"
        onClick={() => setScaleMode(scaleMode === "log" ? "linear" : "log")}
      >
        log
      </button>
      <button
        type="button"
        className={b(autoScale)}
        aria-pressed={autoScale}
        title="Auto-scale"
        onClick={toggleAuto}
      >
        auto
      </button>
    </div>
  );
}
