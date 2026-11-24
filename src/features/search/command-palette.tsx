"use client";

import { Check, Clock, Plus, Search, TrendingUp } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { useUi } from "@/features/shell/ui-store";
import { SymbolIcon } from "@/features/watchlist/symbol-icon";
import { useActiveList } from "@/features/watchlist/watchlist-panel";
import { itemKey, sortedItems, useWatchlists } from "@/features/watchlist/watchlist-store";
import { useInstrumentMap, useInstrumentsReady, useMarketSnapshot } from "@/lib/market-data/hooks";
import { formatPercent, formatPrice } from "@/lib/market-data/precision";
import { rankInstruments } from "@/lib/market-data/search";
import type { AssetClass, Instrument, SymbolKey, Ticker } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { AssetClassChip } from "@/ui/chip";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Kbd } from "@/ui/kbd";
import { Select } from "@/ui/select";
import { Skeleton } from "@/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { toast } from "@/ui/toast";
import { useRecents } from "./recents-store";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "metal", label: "Metals" },
  { value: "stock", label: "Stocks" },
] as const;
type Category = (typeof CATEGORIES)[number]["value"];

/** Stablecoin/fiat bases: top by volume but meaningless as "most active" (still searchable). */
const STABLE_BASES = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "USDP",
  "DAI",
  "USD1",
  "USDE",
  "RLUSD",
  "XUSD",
  "U",
  "EUR",
  "EURI",
]);

type Result = { instrument: Instrument; group?: "recent" | "popular" };

export function CommandPalette() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogContent title="Search symbols" hideHeader className="top-[10vh] max-w-xl overflow-hidden p-0">
        {open && <PaletteBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const mode = useUi((s) => s.searchMode);
  const instrumentsMap = useInstrumentMap();
  const { ready, error } = useInstrumentsReady();
  const snapshot = useMarketSnapshot(true);
  const recents = useRecents((s) => s.keys);
  const { lists, active } = useActiveList();
  const allItems = useWatchlists((s) => s.items);
  const locale = useSettings((s) => s.numberFormat);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [index, setIndex] = useState(0);
  const [targetListId, setTargetListId] = useState<string | null>(active?.id ?? null);
  const target = targetListId ?? active?.id ?? null;

  const listboxId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const instruments = useMemo(() => [...instrumentsMap.values()], [instrumentsMap]);
  const popularity = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, t] of snapshot) m.set(k, t.quoteVolume);
    return m;
  }, [snapshot]);

  const inTarget = useMemo(() => {
    const s = new Set<string>();
    for (const it of sortedItems(allItems, target)) if (it.type === "symbol") s.add(itemKey(it));
    return s;
  }, [allItems, target]);

  const results: Result[] = useMemo(() => {
    const assetClass = category === "all" ? undefined : (category as AssetClass);
    if (query.trim()) {
      return rankInstruments(instruments, query, { assetClass, popularity, limit: 50 }).map((instrument) => ({
        instrument,
      }));
    }
    // Empty query: recents first, then the most active symbols (USDT pairs by 24h volume).
    const recent = recents
      .map((k) => instrumentsMap.get(k))
      .filter((i): i is Instrument => !!i && (!assetClass || i.assetClass === assetClass))
      .map((instrument): Result => ({ instrument, group: "recent" }));
    const seen = new Set(recent.map((r) => r.instrument.key));
    const popular = rankInstruments(
      instruments.filter((i) => i.quote === "USDT" && !STABLE_BASES.has(i.base) && !seen.has(i.key)),
      "",
      { assetClass, popularity, limit: 30 - recent.length },
    ).map((instrument): Result => ({ instrument, group: "popular" }));
    return [...recent, ...popular];
  }, [query, category, instruments, instrumentsMap, popularity, recents]);

  // Keep the highlighted row in range and visible.
  const current = Math.min(index, Math.max(0, results.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const add = (i: Instrument) => {
    if (!target) return;
    const res = useWatchlists.getState().addSymbol(target, i.key);
    useRecents.getState().push(i.key);
    const listName = useWatchlists.getState().lists[target]?.name ?? "watchlist";
    if (res === "exists") toast(`${i.displayName} is already in ${listName}`);
    else if (mode === "open") toast.success(`Added ${i.displayName} to ${listName}`);
  };
  const openChart = (i: Instrument) => {
    useChart.getState().setSymbol(i.key as SymbolKey);
    useRecents.getState().push(i.key);
    onClose();
  };
  const choose = (i: Instrument, forceAdd: boolean) => {
    if (mode === "add" || forceAdd) add(i);
    else openChart(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const r = results[current];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndex((current + 1) % Math.max(1, results.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndex((current - 1 + results.length) % Math.max(1, results.length));
        break;
      case "PageDown":
        e.preventDefault();
        setIndex(Math.min(results.length - 1, current + 8));
        break;
      case "PageUp":
        e.preventDefault();
        setIndex(Math.max(0, current - 8));
        break;
      case "Enter":
        e.preventDefault();
        if (r) choose(r.instrument, e.shiftKey);
        break;
      case "Tab": {
        e.preventDefault();
        const i = CATEGORIES.findIndex((c) => c.value === category);
        const next = CATEGORIES[(i + (e.shiftKey ? -1 : 1) + CATEGORIES.length) % CATEGORIES.length]!;
        setCategory(next.value);
        setIndex(0);
        break;
      }
    }
  };

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  return (
    <div className="flex max-h-[76vh] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-fg-subtle" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={results.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={mode === "add" ? "Add a symbol to your watchlist…" : "Search BTC, gold, AAPL…"}
          aria-label="Search symbols"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-title text-fg outline-none placeholder:text-fg-subtle"
        />
        {mode === "add" && <span className="text-cell text-fg-subtle">Adding to list</span>}
        <Kbd>Esc</Kbd>
      </div>

      <Tabs
        value={category}
        onValueChange={(v) => {
          setCategory(v as Category);
          setIndex(0);
        }}
        className="shrink-0 px-4"
      >
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value} tabIndex={-1}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Symbols"
        className="min-h-56 flex-1 overflow-y-auto overscroll-contain p-1.5"
      >
        {error && !ready ? (
          <li className="px-4 py-10 text-center text-cell text-fg-muted">
            Couldn’t reach Binance to load symbols. Check your connection and reopen search.
          </li>
        ) : !ready || (!query.trim() && snapshot.size === 0) ? (
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex h-11 items-center gap-3 px-2.5" aria-hidden="true">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ml-auto h-3 w-16" />
            </li>
          ))
        ) : results.length === 0 ? (
          <li className="px-4 py-10 text-center">
            <p className="text-ui font-medium text-fg">No symbols match “{query}”</p>
            <p className="mt-1 text-cell text-fg-muted">Try a ticker (BTC, AAPL) or switch to the All tab.</p>
          </li>
        ) : (
          results.map((r, i) => {
            const showHeader = r.group && results[i - 1]?.group !== r.group;
            return (
              <ResultRow
                key={r.instrument.key}
                id={optionId(i)}
                index={i}
                header={
                  showHeader
                    ? r.group === "recent"
                      ? { icon: <Clock />, label: "Recent" }
                      : { icon: <TrendingUp />, label: "Most active" }
                    : null
                }
                instrument={r.instrument}
                ticker={snapshot.get(r.instrument.key)}
                active={i === current}
                inList={inTarget.has(r.instrument.key)}
                mode={mode}
                locale={locale}
                onHover={() => setIndex(i)}
                onChoose={(force) => choose(r.instrument, force)}
              />
            );
          })
        )}
      </ul>

      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line px-4 text-meta whitespace-nowrap text-fg-subtle [&>span]:shrink-0">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> {mode === "add" ? "add" : "open chart"}
        </span>
        {mode === "open" && (
          <span className="flex items-center gap-1">
            <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd> add
          </span>
        )}
        <span className="hidden items-center gap-1 md:flex">
          <Kbd>Tab</Kbd> category
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span>Add to</span>
          <Select
            aria-label="Watchlist to add symbols to"
            className="h-7 w-32 text-cell"
            value={target ?? ""}
            onValueChange={(id) => setTargetListId(id)}
            options={lists.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  id,
  index,
  header,
  instrument: i,
  ticker,
  active,
  inList,
  mode,
  locale,
  onHover,
  onChoose,
}: {
  id: string;
  index: number;
  header: { icon: React.ReactNode; label: string } | null;
  instrument: Instrument;
  ticker: Ticker | undefined;
  active: boolean;
  inList: boolean;
  mode: "open" | "add";
  locale: string;
  onHover: () => void;
  onChoose: (forceAdd: boolean) => void;
}) {
  return (
    <>
      {header && (
        <li
          role="presentation"
          className="meta-label flex items-center gap-1.5 px-2.5 pt-2 pb-1 [&_svg]:size-3"
        >
          {header.icon}
          {header.label}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={active}
        data-index={index}
        onMouseMove={onHover}
        onClick={(e) => onChoose(e.shiftKey)}
        className={cn(
          "flex h-11 cursor-default items-center gap-3 rounded-control px-2.5",
          active && "bg-hover",
        )}
      >
        <SymbolIcon name={i.displayName} assetClass={i.assetClass} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-ui font-semibold text-fg">{i.displayName}</span>
            {i.quote !== "USDT" || i.displayName !== i.base ? (
              <span className="truncate text-cell text-fg-subtle">{i.symbol}</span>
            ) : (
              <span className="text-cell text-fg-subtle">/ {i.quote}</span>
            )}
          </div>
          {i.description && <div className="truncate text-cell text-fg-muted">{i.description}</div>}
        </div>
        <AssetClassChip assetClass={i.assetClass} />
        <div className="num w-24 shrink-0 text-right text-cell">
          {ticker ? (
            <>
              <div className="text-fg">{formatPrice(ticker.last, i.priceDecimals, locale)}</div>
              <div className={ticker.changePct >= 0 ? "text-up" : "text-down"}>
                {formatPercent(ticker.changePct, locale)}
              </div>
            </>
          ) : null}
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-label={inList ? `${i.displayName} is in the list` : `Add ${i.displayName} to list`}
          onClick={(e) => {
            e.stopPropagation();
            onChoose(true);
          }}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-control [&_svg]:size-4",
            inList ? "text-accent" : "text-fg-subtle hover:bg-active hover:text-fg",
            !active && !inList && mode === "open" && "opacity-0",
          )}
        >
          {inList ? <Check /> : <Plus />}
        </button>
      </li>
    </>
  );
}
