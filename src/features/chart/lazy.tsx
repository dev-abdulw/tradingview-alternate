"use client";

import { lazy, Suspense } from "react";

/**
 * The chart engine (Lightweight Charts + indicators + drawings) is the largest
 * part of the bundle. Loading it lazily keeps it off the critical path: on a
 * phone the app opens on the watchlist and the chart code arrives in parallel.
 */
const ChartAreaImpl = lazy(() => import("./chart-area").then((m) => ({ default: m.ChartArea })));
const MobileChartImpl = lazy(() =>
  import("@/features/shell/mobile-chart").then((m) => ({ default: m.MobileChart })),
);

function ChartFallback() {
  return <div className="h-full w-full bg-panel" aria-busy="true" aria-label="Loading chart" />;
}

export function LazyChartArea() {
  return (
    <Suspense fallback={<ChartFallback />}>
      <ChartAreaImpl />
    </Suspense>
  );
}

export function LazyMobileChart() {
  return (
    <Suspense fallback={<ChartFallback />}>
      <MobileChartImpl />
    </Suspense>
  );
}
