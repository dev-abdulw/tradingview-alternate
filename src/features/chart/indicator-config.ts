import type { Source } from "@/lib/indicators/indicators";

export const INDICATOR_KINDS = ["sma", "ema", "bb", "vwap", "rsi", "macd"] as const;
export type IndicatorKind = (typeof INDICATOR_KINDS)[number];

/** Indicator colors are design-token names (resolved per theme), never raw hex. */
export const INDICATOR_COLORS = [
  "accent",
  "warning",
  "flag-violet",
  "flag-orange",
  "flag-green",
  "flag-red",
  "chip-crypto",
  "text-secondary",
] as const;
export type IndicatorColor = (typeof INDICATOR_COLORS)[number];

export type IndicatorParams = {
  length?: number;
  source?: Source;
  mult?: number;
  fast?: number;
  slow?: number;
  signal?: number;
};

export type IndicatorConfig = {
  id: string;
  kind: IndicatorKind;
  visible: boolean;
  color: IndicatorColor;
  params: IndicatorParams;
};

export const INDICATOR_META: Record<
  IndicatorKind,
  {
    name: string;
    short: string;
    pane: "overlay" | "own";
    defaults: IndicatorParams;
    color: IndicatorColor;
    fields: (keyof IndicatorParams)[];
  }
> = {
  sma: {
    name: "Simple moving average",
    short: "SMA",
    pane: "overlay",
    defaults: { length: 20, source: "close" },
    color: "flag-orange",
    fields: ["length", "source"],
  },
  ema: {
    name: "Exponential moving average",
    short: "EMA",
    pane: "overlay",
    defaults: { length: 21, source: "close" },
    color: "accent",
    fields: ["length", "source"],
  },
  bb: {
    name: "Bollinger Bands",
    short: "BB",
    pane: "overlay",
    defaults: { length: 20, source: "close", mult: 2 },
    color: "flag-violet",
    fields: ["length", "source", "mult"],
  },
  vwap: {
    name: "VWAP (session)",
    short: "VWAP",
    pane: "overlay",
    defaults: { source: "hlc3" },
    color: "warning",
    fields: ["source"],
  },
  rsi: {
    name: "Relative strength index",
    short: "RSI",
    pane: "own",
    defaults: { length: 14, source: "close" },
    color: "flag-violet",
    fields: ["length", "source"],
  },
  macd: {
    name: "MACD",
    short: "MACD",
    pane: "own",
    defaults: { fast: 12, slow: 26, signal: 9, source: "close" },
    color: "accent",
    fields: ["fast", "slow", "signal", "source"],
  },
};

export const PARAM_LABEL: Record<keyof IndicatorParams, string> = {
  length: "Length",
  source: "Source",
  mult: "Std dev",
  fast: "Fast",
  slow: "Slow",
  signal: "Signal",
};

/** "EMA 21 close" style label for legends. */
export function indicatorLabel(c: IndicatorConfig): string {
  const m = INDICATOR_META[c.kind];
  const p = c.params;
  const parts: (string | number | undefined)[] =
    c.kind === "macd"
      ? [p.fast, p.slow, p.signal, p.source]
      : c.kind === "bb"
        ? [p.length, p.mult, p.source]
        : [p.length, p.source];
  return [m.short, ...parts.filter((x) => x !== undefined)].join(" ");
}

/** Clamp user input to sane ranges so a typo can't freeze the chart. */
export function sanitizeParams(kind: IndicatorKind, p: IndicatorParams): IndicatorParams {
  const int = (v: number | undefined, min: number, max: number, d: number) =>
    v === undefined || !Number.isFinite(v) ? d : Math.min(max, Math.max(min, Math.round(v)));
  const d = INDICATOR_META[kind].defaults;
  const out: IndicatorParams = { ...d, ...p };
  if ("length" in d) out.length = int(p.length, 1, 500, d.length!);
  if ("fast" in d) out.fast = int(p.fast, 1, 200, d.fast!);
  if ("slow" in d) out.slow = int(p.slow, 2, 400, d.slow!);
  if ("signal" in d) out.signal = int(p.signal, 1, 200, d.signal!);
  if ("mult" in d) out.mult = Math.min(10, Math.max(0.1, Number.isFinite(p.mult) ? p.mult! : d.mult!));
  return out;
}
