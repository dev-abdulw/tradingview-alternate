"use client";

import { ChevronDown, Ellipsis, ListPlus, Plus } from "lucide-react";
import { useUi } from "@/features/shell/ui-store";
import { Button } from "@/ui/button";
import { IconButton } from "@/ui/icon-button";

/**
 * Watchlist panel shell. Phase 3 fills it with lists, sections, flags,
 * drag-reorder and virtualized live rows. The header and columns already
 * use their final geometry.
 */
export function WatchlistPanel() {
  const openSearch = () => useUi.getState().setSearchOpen(true);
  return (
    <section aria-label="Watchlist" className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <Button variant="ghost" size="sm" className="-ml-0.5 gap-1 px-1.5 font-semibold text-fg">
          Watchlist
          <ChevronDown className="size-3.5! text-fg-subtle" />
        </Button>
        <div className="flex-1" />
        <IconButton label="Add symbol" icon={<Plus />} onClick={openSearch} />
        <IconButton label="Watchlist options" icon={<Ellipsis />} />
      </header>
      <div className="meta-label grid h-7 shrink-0 grid-cols-[1fr_88px_72px] items-center gap-2 border-y border-line px-3">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg%</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div>
          <p className="text-ui font-medium text-fg">This watchlist is empty</p>
          <p className="mt-1 text-cell text-fg-muted">
            Add crypto, gold, silver or tokenized stocks to follow live prices.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openSearch}>
          <ListPlus />
          Add symbol
        </Button>
      </div>
    </section>
  );
}
