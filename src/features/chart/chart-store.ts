import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type Timeframe } from "@/features/settings/settings-store";
import type { SymbolKey } from "@/lib/market-data/types";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";

export type { SymbolKey };
export { parseSymbolKey } from "@/lib/market-data/symbol-key";

export const CHART_TYPES = ["candles", "hollow", "bars", "line", "area", "heikin-ashi"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const LAYOUT_MODES = ["1", "2h", "2x2"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

type ChartState = {
  symbol: SymbolKey;
  timeframe: Timeframe;
  chartType: ChartType;
  layoutMode: LayoutMode;
  setSymbol: (s: SymbolKey) => void;
  setTimeframe: (tf: Timeframe) => void;
  setChartType: (t: ChartType) => void;
  setLayoutMode: (m: LayoutMode) => void;
};

/**
 * Active chart preferences. Phase 4 grows this into per-pane state
 * (one entry per chart in a multi-chart layout).
 */
export const useChart = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "binance:spot:BTCUSDT",
      timeframe: DEFAULT_SETTINGS.defaultTimeframe,
      chartType: "candles",
      layoutMode: "1",
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setChartType: (chartType) => set({ chartType }),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
    }),
    {
      name: storageKey("chart"),
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ symbol, timeframe, chartType, layoutMode }) => ({
        symbol,
        timeframe,
        chartType,
        layoutMode,
      }),
    },
  ),
);
