import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type Timeframe } from "@/features/settings/settings-store";
import { isSymbolKey } from "@/lib/market-data/symbol-key";
import { TIMEFRAMES } from "@/lib/market-data/timeframes";
import type { SymbolKey } from "@/lib/market-data/types";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";
import { newId } from "@/lib/persistence/schema";
import {
  INDICATOR_META,
  sanitizeParams,
  type IndicatorConfig,
  type IndicatorKind,
  type IndicatorParams,
} from "./indicator-config";

export type { SymbolKey };
export { parseSymbolKey } from "@/lib/market-data/symbol-key";

export const CHART_TYPES = ["candles", "hollow", "bars", "line", "area", "heikin-ashi"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const LAYOUT_MODES = ["1", "2h", "2x2"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];
export const PANE_COUNT: Record<LayoutMode, number> = { "1": 1, "2h": 2, "2x2": 4 };

export const SCALE_MODES = ["linear", "log", "percent"] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];

export type DrawingTool = "cursor" | "hline" | "trend" | "ray" | "rect" | "fib";

export type ChartPane = { id: string; symbol: SymbolKey; timeframe: Timeframe };

type ChartState = {
  panes: ChartPane[];
  activePane: number;
  layoutMode: LayoutMode;
  syncSymbol: boolean;
  syncCrosshair: boolean;
  chartType: ChartType;
  scaleMode: ScaleMode;
  autoScale: boolean;
  indicators: IndicatorConfig[];
  tool: DrawingTool;
  magnet: boolean;
  drawingsHidden: boolean;
  /** Mirrors of the active pane, for components that only care about "the chart". */
  symbol: SymbolKey;
  timeframe: Timeframe;

  setSymbol: (s: SymbolKey, pane?: number) => void;
  setTimeframe: (tf: Timeframe, pane?: number) => void;
  setActivePane: (i: number) => void;
  setLayoutMode: (m: LayoutMode) => void;
  setSync: (patch: Partial<Pick<ChartState, "syncSymbol" | "syncCrosshair">>) => void;
  setChartType: (t: ChartType) => void;
  setScaleMode: (m: ScaleMode) => void;
  toggleAutoScale: () => void;
  addIndicator: (kind: IndicatorKind) => string;
  updateIndicator: (id: string, patch: Partial<Omit<IndicatorConfig, "id" | "kind">>) => void;
  removeIndicator: (id: string) => void;
  setTool: (t: DrawingTool) => void;
  toggleMagnet: () => void;
  toggleDrawingsHidden: () => void;
};

const DEFAULT_SYMBOLS: SymbolKey[] = [
  "binance:spot:BTCUSDT",
  "binance:spot:ETHUSDT",
  "binance:spot:PAXGUSDT",
  "binance:spot:SOLUSDT",
];

const defaultPanes = (tf: Timeframe): ChartPane[] =>
  DEFAULT_SYMBOLS.map((symbol, i) => ({ id: `pane-${i}`, symbol, timeframe: tf }));

/** Keeps `symbol`/`timeframe` mirrors in sync with the active pane. */
function withMirrors<T extends { panes: ChartPane[]; activePane: number }>(s: T) {
  const p = s.panes[s.activePane] ?? s.panes[0]!;
  return { ...s, symbol: p.symbol, timeframe: p.timeframe };
}

export const useChart = create<ChartState>()(
  persist(
    (set, get) => {
      const patchPanes = (fn: (p: ChartPane, i: number) => ChartPane) =>
        set((s) => withMirrors({ ...s, panes: s.panes.map(fn) }));

      return {
        ...withMirrors({ panes: defaultPanes(DEFAULT_SETTINGS.defaultTimeframe), activePane: 0 }),
        layoutMode: "1",
        syncSymbol: false,
        syncCrosshair: true,
        chartType: "candles",
        scaleMode: "linear",
        autoScale: true,
        indicators: [],
        tool: "cursor",
        magnet: false,
        drawingsHidden: false,

        setSymbol: (symbol, pane) => {
          const target = pane ?? get().activePane;
          const all = get().syncSymbol && get().layoutMode !== "1";
          patchPanes((p, i) => (all || i === target ? { ...p, symbol } : p));
        },
        setTimeframe: (timeframe, pane) => {
          const target = pane ?? get().activePane;
          patchPanes((p, i) => (i === target ? { ...p, timeframe } : p));
        },
        setActivePane: (i) =>
          set((s) =>
            withMirrors({ ...s, activePane: Math.max(0, Math.min(i, PANE_COUNT[s.layoutMode] - 1)) }),
          ),
        setLayoutMode: (layoutMode) =>
          set((s) =>
            withMirrors({ ...s, layoutMode, activePane: Math.min(s.activePane, PANE_COUNT[layoutMode] - 1) }),
          ),
        setSync: (patch) => set(patch),
        setChartType: (chartType) => set({ chartType }),
        setScaleMode: (scaleMode) => set({ scaleMode }),
        toggleAutoScale: () => set((s) => ({ autoScale: !s.autoScale })),
        addIndicator: (kind) => {
          const id = newId();
          const meta = INDICATOR_META[kind];
          set((s) => ({
            indicators: [
              ...s.indicators,
              { id, kind, visible: true, color: meta.color, params: { ...meta.defaults } },
            ],
          }));
          return id;
        },
        updateIndicator: (id, patch) =>
          set((s) => ({
            indicators: s.indicators.map((c) =>
              c.id === id
                ? {
                    ...c,
                    ...patch,
                    params: patch.params
                      ? sanitizeParams(c.kind, { ...c.params, ...patch.params })
                      : c.params,
                  }
                : c,
            ),
          })),
        removeIndicator: (id) => set((s) => ({ indicators: s.indicators.filter((c) => c.id !== id) })),
        setTool: (tool) => set({ tool }),
        toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
        toggleDrawingsHidden: () => set((s) => ({ drawingsHidden: !s.drawingsHidden })),
      };
    },
    {
      name: storageKey("chart"),
      version: 2,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({
        panes: s.panes,
        activePane: s.activePane,
        layoutMode: s.layoutMode,
        syncSymbol: s.syncSymbol,
        syncCrosshair: s.syncCrosshair,
        chartType: s.chartType,
        scaleMode: s.scaleMode,
        autoScale: s.autoScale,
        indicators: s.indicators,
        magnet: s.magnet,
        drawingsHidden: s.drawingsHidden,
      }),
      // v1 stored a single symbol/timeframe: lift it into pane 0.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const tf = (TIMEFRAMES as readonly string[]).includes(p.timeframe as string)
            ? (p.timeframe as Timeframe)
            : DEFAULT_SETTINGS.defaultTimeframe;
          const panes = defaultPanes(tf);
          if (typeof p.symbol === "string" && isSymbolKey(p.symbol))
            panes[0] = { ...panes[0]!, symbol: p.symbol };
          return { ...p, panes, activePane: 0 };
        }
        return p;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChartState>;
        const panes =
          Array.isArray(p.panes) && p.panes.length === 4 && p.panes.every((x) => isSymbolKey(x.symbol))
            ? p.panes
            : current.panes;
        const indicators = Array.isArray(p.indicators)
          ? p.indicators
              .filter((c) => c && c.kind in INDICATOR_META)
              .map((c) => ({ ...c, params: sanitizeParams(c.kind, c.params as IndicatorParams) }))
          : current.indicators;
        return withMirrors({
          ...current,
          ...p,
          panes,
          indicators,
          tool: "cursor" as DrawingTool,
          activePane: p.activePane ?? 0,
        });
      },
    },
  ),
);
