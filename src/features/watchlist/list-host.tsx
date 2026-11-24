"use client";

import type { SymbolKey } from "@/lib/market-data/types";
import { SegmentedControl } from "@/ui/tabs";
import { SectorsPanel } from "@/features/sectors/sectors-panel";
import { WatchlistPanel } from "./watchlist-panel";
import { useWatchlistPrefs } from "./watchlist-prefs";

/** List panel with a Watchlist | Sectors switch (desktop sidebar, tablet sheet, phone home). */
export function ListHost({ onSymbolSelected }: { onSymbolSelected?: (key: SymbolKey) => void } = {}) {
  const view = useWatchlistPrefs((s) => s.panelView);
  const setView = useWatchlistPrefs((s) => s.setPanelView);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center px-2 pt-1">
        <SegmentedControl<"watchlist" | "sectors">
          aria-label="List view"
          size="xs"
          value={view}
          onValueChange={setView}
          options={[
            { value: "watchlist", label: "Watchlist" },
            { value: "sectors", label: "Sectors" },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {view === "watchlist" ? (
          <WatchlistPanel {...(onSymbolSelected ? { onSymbolSelected } : {})} />
        ) : (
          <SectorsPanel onSymbolSelected={onSymbolSelected} />
        )}
      </div>
    </div>
  );
}
