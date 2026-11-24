"use client";

import { useCallback, useMemo, useState } from "react";
import { LazyChartArea } from "@/features/chart/lazy";
import { SymbolDetailsPanel } from "@/features/symbol/symbol-details-panel";
import { ListHost } from "@/features/watchlist/list-host";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { cn } from "@/lib/utils/cn";
import { Sheet } from "@/ui/sheet";
import { ConnectionBanner } from "./connection-banner";
import { DrawingToolbar } from "./drawing-toolbar";
import { SHORTCUTS, ShellContext, type ShellControls } from "./shell-context";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";

/** Tablet: the chart takes the full width; watchlist + details slide over from the right. */
export function TabletShell() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const toggleSidebar = useCallback(() => setSheetOpen((v) => !v), []);
  const toggleDetails = useCallback(() => setDetailsCollapsed((v) => !v), []);

  useHotkeys({ [SHORTCUTS.toggleSidebar]: toggleSidebar, [SHORTCUTS.toggleDetails]: toggleDetails });

  const controls = useMemo<ShellControls>(
    () => ({ sidebarCollapsed: !sheetOpen, detailsCollapsed, toggleSidebar, toggleDetails }),
    [sheetOpen, detailsCollapsed, toggleSidebar, toggleDetails],
  );

  return (
    <ShellContext value={controls}>
      <div className="flex h-dvh flex-col bg-app">
        <TopBar />
        <ConnectionBanner />
        <div className="flex min-h-0 flex-1 gap-px">
          <DrawingToolbar />
          <main className="min-w-0 flex-1">
            <LazyChartArea />
          </main>
        </div>
        <StatusBar />
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Watchlist">
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <ListHost onSymbolSelected={() => setSheetOpen(false)} />
          </div>
          <div className={cn("shrink-0 border-t border-line", detailsCollapsed ? "h-9" : "h-[42%]")}>
            <SymbolDetailsPanel />
          </div>
        </div>
      </Sheet>
    </ShellContext>
  );
}
