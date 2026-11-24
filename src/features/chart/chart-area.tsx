"use client";

import { parseSymbolKey, useChart } from "./chart-store";
import { CHART_TYPE_META } from "./chart-meta";

/**
 * Chart surface placeholder. Phase 4 mounts Lightweight Charts here
 * (with indicator panes as native LWC panes below the price pane).
 */
export function ChartArea() {
  const { symbol } = parseSymbolKey(useChart((s) => s.symbol));
  const timeframe = useChart((s) => s.timeframe);
  const chartType = useChart((s) => s.chartType);

  return (
    <section aria-label="Chart" className="relative flex h-full flex-col bg-panel">
      {/* Grid echoes the chart's own gridlines so the placeholder reads as a chart surface. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(var(--chart-grid)_1px,transparent_1px),linear-gradient(90deg,var(--chart-grid)_1px,transparent_1px)] [background-size:80px_64px]"
      />
      <div className="relative flex items-center gap-2 px-3 pt-2.5 text-cell text-fg-muted">
        <span className="font-medium text-fg">{symbol}</span>
        <span>·</span>
        <span className="num">{timeframe}</span>
        <span>·</span>
        <span>Binance</span>
        <span className="ml-1 inline-flex items-center text-fg-subtle [&_svg]:size-3.5">
          {CHART_TYPE_META[chartType].icon}
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        <div className="max-w-xs text-center">
          <p className="text-ui font-medium text-fg">Chart engine connects in Phase 4</p>
          <p className="mt-1 text-cell text-fg-muted">
            The layout, toolbar and settings are live. Resize the panels, collapse the sidebar with{" "}
            <span className="whitespace-nowrap">⌥W</span>, and try both themes.
          </p>
        </div>
      </div>
    </section>
  );
}
