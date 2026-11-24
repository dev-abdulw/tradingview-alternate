"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { useUi } from "@/features/shell/ui-store";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Kbd } from "@/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "metal", label: "Metals" },
  { value: "stock", label: "Stocks" },
] as const;

/**
 * ⌘K palette shell. Phase 3 adds fuzzy search over exchangeInfo, recents,
 * keyboard navigation and "Add to watchlist".
 */
export function CommandPalette() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Search symbols" hideHeader className="max-w-xl overflow-hidden p-0">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search BTCUSDT, gold, Apple…"
            aria-label="Search symbols"
            className="h-full min-w-0 flex-1 bg-transparent text-title text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>
        <Tabs value={category} onValueChange={setCategory} className="px-4">
          <TabsList>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex h-56 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-ui font-medium text-fg">Symbol search connects in Phase 3</p>
          <p className="text-cell text-fg-muted">
            It will search every Binance spot pair, gold and silver perpetuals, and tokenized stocks.
          </p>
        </div>
        <div className="flex h-9 items-center gap-4 border-t border-line px-4 text-meta text-fg-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open chart
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd> add to watchlist
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
