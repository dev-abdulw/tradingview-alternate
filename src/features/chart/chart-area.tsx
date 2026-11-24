"use client";

import { cn } from "@/lib/utils/cn";
import { ChartOverlays } from "./chart-overlays";
import { PANE_COUNT, useChart } from "./chart-store";
import { ChartView } from "./chart-view";

const GRID: Record<string, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2h": "grid-cols-2 grid-rows-1",
  "2x2": "grid-cols-2 grid-rows-2",
};

/** 1, 2 (side by side) or 2×2 charts. The active pane receives symbol/timeframe changes. */
export function ChartArea() {
  const layoutMode = useChart((s) => s.layoutMode);
  const panes = useChart((s) => s.panes);
  const active = useChart((s) => s.activePane);
  const setActive = useChart((s) => s.setActivePane);
  const multi = layoutMode !== "1";

  return (
    <section aria-label="Charts" className={cn("grid h-full gap-px bg-app", GRID[layoutMode])}>
      {panes.slice(0, PANE_COUNT[layoutMode]).map((p, i) => (
        <div
          key={p.id}
          onPointerDownCapture={() => i !== active && setActive(i)}
          className={cn(
            "relative min-h-0 min-w-0 bg-panel",
            multi &&
              i === active &&
              "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:ring-1 after:ring-accent after:ring-inset",
          )}
        >
          <ChartView paneIndex={i} symbol={p.symbol} timeframe={p.timeframe}>
            {(controller) => <ChartOverlays controller={controller} paneIndex={i} symbol={p.symbol} />}
          </ChartView>
        </div>
      ))}
    </section>
  );
}
