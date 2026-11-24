/**
 * Imperative owner of one Lightweight Charts instance. React passes it data and
 * settings; it never re-renders the chart. Panes: 0 = price (+ overlays),
 * 1 = volume, 2… = indicators with their own pane (RSI, MACD).
 */
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
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
} from "@/lib/indicators/indicators";
import { formatPrice } from "@/lib/market-data/precision";
import type { Kline } from "@/lib/market-data/types";
import type { ChartColors } from "./chart-colors";
import type { ChartType, ScaleMode } from "./chart-store";
import { INDICATOR_META, type IndicatorConfig } from "./indicator-config";

export const toTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

type IndicatorState = { config: IndicatorConfig; series: ISeriesApi<SeriesType>[]; values: Series[] };

export type ControllerOptions = { colors: ChartColors; timezone: string; locale: string };

export type AlertLine = { id: string; price: number; label: string };

export class ChartController {
  readonly chart: IChartApi;
  private mainSeries: ISeriesApi<SeriesType>;
  private volume: ISeriesApi<"Histogram">;
  private type: ChartType = "candles";
  private colors: ChartColors;
  private bars: readonly Kline[] = [];
  private display: readonly Bar[] = [];
  private decimals = 2;
  private tick = 0.01;
  private locale = "en-US";
  /** Ignore "load older" right after a fresh load (the reset briefly reports a left-edge range). */
  private olderAllowedAt = 0;
  private overlays = new Map<string, IndicatorState>();
  private panes: IndicatorState[] = [];
  private alertLines: IPriceLine[] = [];
  private alerts: AlertLine[] = [];
  private crosshairListeners = new Set<(index: number | null, time: number | null) => void>();
  private needOlder: (() => void) | null = null;
  private syncing = false;
  private frame: number | null = null;
  private pendingCrosshair: { index: number | null; time: number | null } | null = null;
  private mainListeners = new Set<() => void>();

  constructor(
    readonly container: HTMLElement,
    opts: ControllerOptions,
  ) {
    this.colors = opts.colors;
    this.locale = opts.locale; // before setTimezone(): the main series doesn't exist yet
    this.chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: opts.colors.background },
        textColor: opts.colors.text,
        fontFamily: getComputedStyle(container).fontFamily,
        fontSize: 11,
        attributionLogo: true,
        panes: {
          separatorColor: opts.colors.border,
          separatorHoverColor: opts.colors.crosshairLabel,
          enableResize: true,
        },
      },
      grid: { vertLines: { color: opts.colors.grid }, horzLines: { color: opts.colors.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: opts.colors.crosshair,
          labelBackgroundColor: opts.colors.crosshairLabel,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: opts.colors.crosshair,
          labelBackgroundColor: opts.colors.crosshairLabel,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: { borderColor: opts.colors.border, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: {
        borderColor: opts.colors.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
    });
    this.setTimezone(opts.timezone, opts.locale);
    this.mainSeries = this.createMain("candles");
    this.volume = this.chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      1,
    );
    this.layoutPanes();

    this.chart.subscribeCrosshairMove(this.onCrosshair);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange);
  }

  /* ------------------------------ public API ------------------------------ */

  get main(): ISeriesApi<SeriesType> {
    return this.mainSeries;
  }
  get data(): readonly Kline[] {
    return this.bars;
  }
  /** Called when the main series is recreated (chart type change) so primitives can re-attach. */
  onMainChange(cb: () => void): () => void {
    this.mainListeners.add(cb);
    return () => this.mainListeners.delete(cb);
  }

  setColors(colors: ChartColors) {
    this.colors = colors;
    this.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        panes: { separatorColor: colors.border, separatorHoverColor: colors.crosshairLabel },
      },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    this.mainSeries.applyOptions(this.mainStyle(this.type));
    this.renderVolume();
    this.rebuildIndicators([...this.overlays.values(), ...this.panes].map((s) => s.config));
    this.renderAlertLines();
  }

  setTimezone(timeZone: string, locale: string) {
    if (locale !== this.locale) {
      this.locale = locale;
      this.setPrecision(this.decimals, this.tick);
    }
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...o });
    const full = f({
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const tick: Record<number, Intl.DateTimeFormat> = {
      [TickMarkType.Year]: f({ year: "numeric" }),
      [TickMarkType.Month]: f({ month: "short" }),
      [TickMarkType.DayOfMonth]: f({ day: "numeric" }),
      [TickMarkType.Time]: f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      [TickMarkType.TimeWithSeconds]: f({
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    };
    const date = (t: Time) => new Date((t as number) * 1000);
    this.chart.applyOptions({
      localization: { locale, timeFormatter: (t: Time) => full.format(date(t)) },
      timeScale: { tickMarkFormatter: (t: Time, type: TickMarkType) => tick[type]?.format(date(t)) ?? null },
    });
  }

  setPrecision(decimals: number, tickSize: number) {
    this.decimals = decimals;
    this.tick = tickSize;
    const priceFormat = this.priceFormat();
    this.mainSeries.applyOptions({ priceFormat });
    for (const s of this.overlays.values()) for (const x of s.series) x.applyOptions({ priceFormat });
  }

  /** Oscillator scales (RSI, MACD): fixed decimals in the user's number format. */
  private fixedFormat(decimals: number) {
    const locale = this.locale;
    return {
      type: "custom" as const,
      minMove: 1 / 10 ** decimals,
      formatter: (p: number) => formatPrice(p, decimals, locale),
    };
  }

  /** Tick-size precision + the user's number format (thousands separators) on axis and labels. */
  private priceFormat() {
    const d = this.decimals;
    const locale = this.locale;
    return {
      type: "custom" as const,
      minMove: this.tick,
      formatter: (p: number) => formatPrice(p, d, locale),
    };
  }

  setChartType(type: ChartType) {
    if (type === this.type) return;
    // Add the new series before removing the old one: Lightweight Charts deletes a pane
    // as soon as its last series is removed, which would shift every pane index.
    const old = this.mainSeries;
    this.mainSeries = this.createMain(type);
    this.chart.removeSeries(old);
    this.type = type;
    this.setPrecision(this.decimals, this.tick);
    this.renderMain();
    this.renderAlertLines();
    for (const cb of this.mainListeners) cb();
  }

  setScale(mode: ScaleMode, autoScale: boolean) {
    this.chart.priceScale("right", 0).applyOptions({
      mode:
        mode === "log"
          ? PriceScaleMode.Logarithmic
          : mode === "percent"
            ? PriceScaleMode.Percentage
            : PriceScaleMode.Normal,
      autoScale,
    });
  }

  /** Full data replace. `fresh` = new symbol/timeframe → jump to the latest bars. */
  setData(bars: readonly Kline[], fresh: boolean) {
    this.bars = bars;
    this.renderMain();
    this.renderVolume();
    this.recomputeIndicators(true);
    if (fresh) {
      this.olderAllowedAt = performance.now() + 800;
      this.chart.timeScale().resetTimeScale();
      this.chart.priceScale("right", 0).applyOptions({ autoScale: true });
    }
  }

  /** Older bars were prepended: keep the viewport where the user is looking. */
  prepend(bars: readonly Kline[], count: number) {
    const ts = this.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    this.setData(bars, false);
    if (range && count > 0) ts.setVisibleLogicalRange({ from: range.from + count, to: range.to + count });
  }

  /** Live tick: update (or append) the last bar without re-sending the whole series. */
  updateLast(bars: readonly Kline[]) {
    this.bars = bars;
    const last = bars[bars.length - 1];
    if (!last) return;
    const disp = this.transform(bars);
    this.display = disp;
    const d = disp[disp.length - 1]!;
    this.updateMainPoint(d);
    this.volume.update(this.volumePoint(last));
    this.recomputeIndicators(false);
  }

  setIndicators(configs: IndicatorConfig[]) {
    this.rebuildIndicators(configs);
  }

  setAlertLines(alerts: AlertLine[]) {
    this.alerts = alerts;
    this.renderAlertLines();
  }

  onCrosshairIndex(cb: (index: number | null, time: number | null) => void): () => void {
    this.crosshairListeners.add(cb);
    return () => this.crosshairListeners.delete(cb);
  }

  onNeedOlder(cb: () => void) {
    this.needOlder = cb;
  }

  /** Mirror another chart's crosshair (multi-chart sync). `time` in seconds. */
  showCrosshairAt(time: number | null) {
    this.syncing = true;
    try {
      if (time === null) return this.chart.clearCrosshairPosition();
      const i = this.indexAtOrBefore(time);
      const bar = i >= 0 ? this.bars[i] : undefined;
      if (!bar) return this.chart.clearCrosshairPosition();
      this.chart.setCrosshairPosition(bar.close, toTime(bar.time), this.mainSeries);
    } finally {
      this.syncing = false;
    }
  }

  priceAtY(y: number): number | null {
    const p = this.mainSeries.coordinateToPrice(y);
    return p === null ? null : Math.round(p / this.tick) * this.tick;
  }

  /** Values for the legend at a bar index (null = latest). */
  valuesAt(index: number | null) {
    const i = index === null ? this.bars.length - 1 : Math.max(0, Math.min(index, this.bars.length - 1));
    const all = [...this.overlays.values(), ...this.panes];
    return {
      bar: this.bars[i] ?? null,
      prev: this.bars[i - 1] ?? null,
      volume: this.bars[i]?.volume ?? null,
      indicators: Object.fromEntries(all.map((s) => [s.config.id, s.values.map((v) => v[i] ?? null)])),
    };
  }

  /** Top offset (px) and height of every pane, for positioning legends. */
  paneRects(): { top: number; height: number }[] {
    let top = 0;
    return this.chart.panes().map((p) => {
      const r = { top, height: p.getHeight() };
      top += r.height + 1; // 1px separator
      return r;
    });
  }

  /** Pane index of each pane indicator (for legends). */
  paneIndicatorOrder(): string[] {
    return this.panes.map((p) => p.config.id);
  }

  resetView() {
    this.chart.timeScale().resetTimeScale();
    this.chart.priceScale("right", 0).applyOptions({ autoScale: true });
  }

  destroy() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.chart.unsubscribeCrosshairMove(this.onCrosshair);
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.onRange);
    this.chart.remove();
  }

  /** Bar index at or before `time` (seconds); -1 if none. */
  indexAtOrBefore(time: number): number {
    let lo = 0;
    let hi = this.bars.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (toTime(this.bars[mid]!.time) <= time) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  /* ------------------------------- internals ------------------------------ */

  private onCrosshair = (p: MouseEventParams<Time>) => {
    if (this.syncing) return;
    const index = p.point && p.logical !== undefined ? Math.round(p.logical) : null;
    const time = p.time !== undefined ? (p.time as number) : null;
    // Coalesce to one legend update per frame.
    this.pendingCrosshair = { index, time };
    this.frame ??= requestAnimationFrame(() => {
      this.frame = null;
      const c = this.pendingCrosshair;
      if (!c) return;
      for (const cb of this.crosshairListeners) cb(c.index, c.time);
    });
  };

  private onRange = (r: LogicalRange | null) => {
    if (r && r.from < 40 && performance.now() >= this.olderAllowedAt) this.needOlder?.();
  };

  private createMain(type: ChartType): ISeriesApi<SeriesType> {
    const common = { priceLineVisible: true, lastValueVisible: true };
    switch (type) {
      case "bars":
        return this.chart.addSeries(BarSeries, { ...common, ...this.mainStyle(type) }, 0);
      case "line":
        return this.chart.addSeries(LineSeries, { ...common, ...this.mainStyle(type) }, 0);
      case "area":
        return this.chart.addSeries(AreaSeries, { ...common, ...this.mainStyle(type) }, 0);
      default:
        return this.chart.addSeries(CandlestickSeries, { ...common, ...this.mainStyle(type) }, 0);
    }
  }

  private mainStyle(type: ChartType) {
    const c = this.colors;
    switch (type) {
      case "hollow":
        return {
          upColor: "rgba(0,0,0,0)",
          downColor: c.down,
          borderVisible: true,
          borderUpColor: c.up,
          borderDownColor: c.down,
          wickUpColor: c.up,
          wickDownColor: c.down,
        };
      case "bars":
        return { upColor: c.up, downColor: c.down, thinBars: false };
      case "line":
        return { color: c.accent, lineWidth: 2 as const };
      case "area":
        return {
          lineColor: c.accent,
          topColor: withA(c.accent, 0.28),
          bottomColor: withA(c.accent, 0.02),
          lineWidth: 2 as const,
        };
      default:
        return {
          upColor: c.up,
          downColor: c.down,
          borderVisible: false,
          wickUpColor: c.up,
          wickDownColor: c.down,
        };
    }
  }

  private transform(bars: readonly Kline[]): readonly Bar[] {
    return this.type === "heikin-ashi" ? heikinAshi(bars) : bars;
  }

  private isValueType() {
    return this.type === "line" || this.type === "area";
  }

  private renderMain() {
    this.display = this.transform(this.bars);
    if (this.isValueType()) {
      (this.mainSeries as ISeriesApi<"Line">).setData(
        this.display.map((b) => ({ time: toTime(b.time), value: b.close })),
      );
    } else {
      (this.mainSeries as ISeriesApi<"Candlestick">).setData(
        this.display.map((b) => ({
          time: toTime(b.time),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
    }
  }

  private updateMainPoint(b: Bar) {
    if (this.isValueType())
      (this.mainSeries as ISeriesApi<"Line">).update({ time: toTime(b.time), value: b.close });
    else
      (this.mainSeries as ISeriesApi<"Candlestick">).update({
        time: toTime(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      });
  }

  private volumePoint(b: Kline) {
    return {
      time: toTime(b.time),
      value: b.volume,
      color: b.close >= b.open ? this.colors.upMuted : this.colors.downMuted,
    };
  }

  private renderVolume() {
    this.volume.setData(this.bars.map((b) => this.volumePoint(b)));
  }

  private layoutPanes() {
    const panes = this.chart.panes();
    panes[0]?.setStretchFactor(4);
    panes[1]?.setStretchFactor(0.9);
    for (let i = 2; i < panes.length; i++) panes[i]?.setStretchFactor(1.3);
  }

  /* ------------------------------ indicators ------------------------------ */

  private compute(c: IndicatorConfig): Series[] {
    const p = c.params;
    const src = source(this.bars, p.source ?? "close");
    switch (c.kind) {
      case "sma":
        return [sma(src, p.length ?? 20)];
      case "ema":
        return [ema(src, p.length ?? 21)];
      case "bb": {
        const b = bollinger(src, p.length ?? 20, p.mult ?? 2);
        return [b.basis, b.upper, b.lower];
      }
      case "vwap":
        return [vwap(this.bars, p.source ?? "hlc3")];
      case "rsi":
        return [rsi(src, p.length ?? 14)];
      case "macd": {
        const m = macd(src, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
        return [m.hist, m.macd, m.signal];
      }
    }
  }

  private seriesData(c: IndicatorConfig, values: Series[], i: number, idx?: number) {
    const v = values[i]!;
    const range = idx === undefined ? v.map((_, j) => j) : [idx];
    if (c.kind === "macd" && i === 0) {
      return range.map((j) => {
        const x = v[j];
        const t = toTime(this.bars[j]!.time);
        return x === null || x === undefined
          ? { time: t }
          : { time: t, value: x, color: x >= 0 ? this.colors.upMuted : this.colors.downMuted };
      });
    }
    return range.map((j) => {
      const x = v[j];
      const t = toTime(this.bars[j]!.time);
      return x === null || x === undefined ? { time: t } : { time: t, value: x };
    });
  }

  private recomputeIndicators(full: boolean) {
    const last = this.bars.length - 1;
    for (const s of [...this.overlays.values(), ...this.panes]) {
      s.values = this.compute(s.config);
      s.series.forEach((series, i) => {
        if (full) (series as ISeriesApi<"Line">).setData(this.seriesData(s.config, s.values, i));
        else if (last >= 0) {
          const pt = this.seriesData(s.config, s.values, i, last)[0];
          if (pt) (series as ISeriesApi<"Line">).update(pt);
        }
      });
    }
  }

  private rebuildIndicators(configs: IndicatorConfig[]) {
    for (const s of this.overlays.values()) s.series.forEach((x) => this.chart.removeSeries(x));
    for (const s of this.panes) s.series.forEach((x) => this.chart.removeSeries(x));
    this.overlays.clear();
    this.panes = [];
    while (this.chart.panes().length > 2) this.chart.removePane(this.chart.panes().length - 1);

    const visible = configs.filter((c) => c.visible);
    for (const c of visible.filter((x) => INDICATOR_META[x.kind].pane === "overlay")) {
      const color = this.colors.token(c.color);
      const priceFormat = this.priceFormat();
      const line = (alpha = 1, style: LineStyle = LineStyle.Solid) =>
        this.chart.addSeries(
          LineSeries,
          {
            color: withA(color, alpha),
            lineWidth: 1,
            lineStyle: style,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceFormat,
          },
          0,
        );
      const series = c.kind === "bb" ? [line(1), line(0.75), line(0.75)] : [line()];
      this.overlays.set(c.id, { config: c, series, values: [] });
    }
    visible
      .filter((x) => INDICATOR_META[x.kind].pane === "own")
      .forEach((c, k) => {
        const paneIndex = 2 + k;
        const color = this.colors.token(c.color);
        let series: ISeriesApi<SeriesType>[];
        if (c.kind === "rsi") {
          const s = this.chart.addSeries(
            LineSeries,
            {
              color,
              lineWidth: 1,
              priceLineVisible: false,
              priceFormat: this.fixedFormat(2),
            },
            paneIndex,
          );
          for (const level of [70, 30])
            s.createPriceLine({
              price: level,
              color: this.colors.crosshair,
              lineStyle: LineStyle.Dashed,
              lineWidth: 1,
              axisLabelVisible: false,
            });
          series = [s];
        } else {
          const fmt = this.fixedFormat(Math.max(2, this.decimals));
          const hist = this.chart.addSeries(
            HistogramSeries,
            { priceLineVisible: false, lastValueVisible: false, priceFormat: fmt },
            paneIndex,
          );
          // Attach the lines through the pane object so all three always share one pane.
          const pane = hist.getPane();
          series = [
            hist,
            pane.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, priceFormat: fmt }),
            pane.addSeries(LineSeries, {
              color: this.colors.warning,
              lineWidth: 1,
              priceLineVisible: false,
              priceFormat: fmt,
            }),
          ];
        }
        this.panes.push({ config: c, series, values: [] });
      });
    // Keep hidden indicators' configs around for legends (values only).
    for (const c of configs.filter((x) => !x.visible)) {
      const target = INDICATOR_META[c.kind].pane === "overlay" ? this.overlays : null;
      if (target) target.set(c.id, { config: c, series: [], values: [] });
    }
    this.layoutPanes();
    this.recomputeIndicators(true);
  }

  private renderAlertLines() {
    for (const l of this.alertLines) {
      try {
        this.mainSeries.removePriceLine(l);
      } catch {
        /* series was recreated */
      }
    }
    this.alertLines = this.alerts.map((a) =>
      this.mainSeries.createPriceLine({
        price: a.price,
        color: this.colors.warning,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: a.label,
      }),
    );
  }
}

function withA(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m?.[1]) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
