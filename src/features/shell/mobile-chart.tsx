"use client";

import { Bell } from "lucide-react";
import { ChartOverlays } from "@/features/chart/chart-overlays";
import { useChart } from "@/features/chart/chart-store";
import { ChartView } from "@/features/chart/chart-view";
import { IndicatorsMenu } from "@/features/chart/indicators-menu";
import { TimeframePicker } from "@/features/chart/timeframe-picker";
import { IconButton } from "@/ui/icon-button";
import { ChartTypeMenu } from "./top-bar";
import { useUi } from "./ui-store";

/** Full-screen chart for the phone layout (loaded lazily with the chart engine). */
export function MobileChart() {
  const pane = useChart((s) => s.activePane);
  const symbol = useChart((s) => s.symbol);
  const timeframe = useChart((s) => s.timeframe);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2">
        <TimeframePicker />
        <ChartTypeMenu />
        <IndicatorsMenu />
        <IconButton
          label="Create alert"
          icon={<Bell />}
          size="md"
          tooltip={false}
          onClick={() => useUi.getState().openAlert({ symbol, price: null })}
        />
      </div>
      <div className="min-h-0 flex-1 bg-panel">
        <ChartView paneIndex={pane} symbol={symbol} timeframe={timeframe}>
          {(controller) => <ChartOverlays controller={controller} paneIndex={pane} symbol={symbol} />}
        </ChartView>
      </div>
    </div>
  );
}
