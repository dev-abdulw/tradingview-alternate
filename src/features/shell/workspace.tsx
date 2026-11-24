"use client";

import { use, useCallback, useMemo, useState } from "react";
import { browser } from "react-dom";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type PanelSize,
} from "react-resizable-panels";
import { AlertDialog } from "@/features/alerts/alert-dialog";
import { AlertEngine } from "@/features/alerts/alert-engine";
import { ChartArea } from "@/features/chart/chart-area";
import { CommandPalette } from "@/features/search/command-palette";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { SymbolDetailsPanel } from "@/features/symbol/symbol-details-panel";
import { WatchlistPanel } from "@/features/watchlist/watchlist-panel";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { DrawingToolbar } from "./drawing-toolbar";
import { layoutStorage } from "./layout-storage";
import { SHORTCUTS, ShellContext, type ShellControls } from "./shell-context";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";
import { useUi } from "./ui-store";

export const DETAILS_HEADER_PX = 36;
const SIDEBAR_DEFAULT_PX = 340;
const SIDEBAR_MIN_PX = 260;

/**
 * The trading workspace. Renders only in the browser: panel sizes and
 * preferences live in client storage, so the server sends <ShellSkeleton/>
 * (same geometry) instead of a guess that would shift on hydration.
 */
export function Workspace() {
  use(browser("Workspace layout is restored from client storage."));

  const sidebarRef = usePanelRef();
  const detailsRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  const outer = useDefaultLayout({ id: "workspace", storage: layoutStorage });
  const side = useDefaultLayout({ id: "sidebar-split", storage: layoutStorage });

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (!p.isCollapsed()) return p.collapse();
    p.expand();
    // After a reload the library has no pre-collapse size and expands to minSize; use the default instead.
    if (p.getSize().inPixels <= SIDEBAR_MIN_PX + 1) p.resize(SIDEBAR_DEFAULT_PX);
  }, [sidebarRef]);

  const toggleDetails = useCallback(() => {
    const p = detailsRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, [detailsRef]);

  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  useHotkeys({
    [SHORTCUTS.search]: () => setSearchOpen(true),
    [SHORTCUTS.searchAlt]: () => setSearchOpen(true),
    [SHORTCUTS.toggleSidebar]: toggleSidebar,
    [SHORTCUTS.toggleDetails]: toggleDetails,
    [SHORTCUTS.settings]: () => setSettingsOpen(true),
  });

  const controls = useMemo<ShellControls>(
    () => ({ sidebarCollapsed, detailsCollapsed, toggleSidebar, toggleDetails }),
    [sidebarCollapsed, detailsCollapsed, toggleSidebar, toggleDetails],
  );

  return (
    <ShellContext value={controls}>
      <div className="flex h-dvh flex-col bg-app">
        <TopBar />
        <div className="flex min-h-0 flex-1 gap-px">
          <DrawingToolbar />
          <Group
            id="workspace"
            orientation="horizontal"
            className="min-w-0 flex-1"
            defaultLayout={outer.defaultLayout}
            onLayoutChanged={outer.onLayoutChanged}
          >
            <Panel id="main" minSize={360}>
              <ChartArea />
            </Panel>
            <Separator aria-label="Resize sidebar" />
            <Panel
              id="sidebar"
              panelRef={sidebarRef}
              defaultSize={SIDEBAR_DEFAULT_PX}
              minSize={SIDEBAR_MIN_PX}
              maxSize="50%"
              collapsible
              collapsedSize={0}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(size: PanelSize) => setSidebarCollapsed(size.inPixels < 1)}
            >
              <Group
                id="sidebar-split"
                orientation="vertical"
                className="h-full"
                defaultLayout={side.defaultLayout}
                onLayoutChanged={side.onLayoutChanged}
              >
                <Panel id="watchlist" minSize={180}>
                  <WatchlistPanel />
                </Panel>
                <Separator aria-label="Resize symbol details" />
                <Panel
                  id="details"
                  panelRef={detailsRef}
                  defaultSize="38%"
                  minSize={180}
                  collapsible
                  collapsedSize={DETAILS_HEADER_PX}
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={(size: PanelSize) => setDetailsCollapsed(size.inPixels <= DETAILS_HEADER_PX + 1)}
                >
                  <SymbolDetailsPanel />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
      <SettingsDialog />
      <AlertDialog />
      <AlertEngine />
    </ShellContext>
  );
}
