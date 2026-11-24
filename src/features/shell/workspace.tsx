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
import { LazyChartArea } from "@/features/chart/lazy";
import { CommandPalette } from "@/features/search/command-palette";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { SymbolDetailsPanel } from "@/features/symbol/symbol-details-panel";
import { WatchlistPanel } from "@/features/watchlist/watchlist-panel";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { useFormFactor } from "@/lib/hooks/use-media";
import { ConnectionBanner } from "./connection-banner";
import { MobileShell } from "./mobile-shell";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TabletShell } from "./tablet-shell";
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
 * Desktop ≥1100px, tablet (watchlist in a slide-over) and phone (tab bar).
 */
export function Workspace() {
  use(browser("Workspace layout is restored from client storage."));
  const form = useFormFactor();
  const ui = useUi.getState;

  useHotkeys({
    [SHORTCUTS.search]: () => ui().setSearchOpen(true),
    [SHORTCUTS.searchAlt]: () => ui().setSearchOpen(true),
    [SHORTCUTS.settings]: () => ui().setSettingsOpen(true),
    [SHORTCUTS.shortcuts]: () => ui().setShortcutsOpen(true),
  });

  return (
    <>
      {form === "desktop" ? <DesktopShell /> : form === "tablet" ? <TabletShell /> : <MobileShell />}
      <CommandPalette />
      <SettingsDialog />
      <AlertDialog />
      <ShortcutsDialog />
      <AlertEngine />
    </>
  );
}

function DesktopShell() {
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

  useHotkeys({
    [SHORTCUTS.toggleSidebar]: toggleSidebar,
    [SHORTCUTS.toggleDetails]: toggleDetails,
  });

  const controls = useMemo<ShellControls>(
    () => ({ sidebarCollapsed, detailsCollapsed, toggleSidebar, toggleDetails }),
    [sidebarCollapsed, detailsCollapsed, toggleSidebar, toggleDetails],
  );

  return (
    <ShellContext value={controls}>
      <div className="flex h-dvh flex-col bg-app">
        <TopBar />
        <ConnectionBanner />
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
              <main className="h-full min-w-0">
                <LazyChartArea />
              </main>
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
    </ShellContext>
  );
}
