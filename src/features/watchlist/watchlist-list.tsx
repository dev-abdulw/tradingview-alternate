"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { useCoarsePointer } from "@/lib/hooks/use-media";
import { useRetainTickers } from "@/lib/market-data/hooks";
import { tickerFeed } from "@/lib/market-data/live/feeds";
import type { Instrument, SymbolKey } from "@/lib/market-data/types";
import type {
  WatchlistItemRow,
  WatchlistRow,
  WatchlistSectionRow,
  WatchlistSymbolRow,
} from "@/lib/persistence/schema";
import { toast } from "@/ui/toast";
import { gridTemplate as toGridTemplate, useWatchlistPrefs, type Sort } from "./watchlist-prefs";
import { SectionRow, SymbolRow } from "./watchlist-rows";
import { itemKey, useWatchlists } from "./watchlist-store";

export const SECTION_HEIGHT = 30;
/** Touch rows are 44px (≥40px targets); otherwise 32px, or 28px compact. */
export const rowHeightFor = (density: string, touch = false) =>
  touch ? 44 : density === "compact" ? 28 : 32;

type ViewRow =
  | { kind: "section"; item: WatchlistSectionRow; count: number }
  | { kind: "symbol"; item: WatchlistSymbolRow; key: SymbolKey };

/** Rows in display order. Sorting reorders symbols within their section; sections stay put. */
export function buildView(
  items: readonly WatchlistItemRow[],
  sort: Sort,
  instruments: ReadonlyMap<string, Instrument>,
): ViewRow[] {
  const groups: { section: WatchlistSectionRow | null; symbols: WatchlistSymbolRow[] }[] = [
    { section: null, symbols: [] },
  ];
  for (const it of items) {
    if (it.type === "section") groups.push({ section: it, symbols: [] });
    else groups[groups.length - 1]!.symbols.push(it);
  }
  const out: ViewRow[] = [];
  for (const g of groups) {
    const symbols = sort ? [...g.symbols].sort(comparator(sort, instruments)) : g.symbols;
    if (g.section) out.push({ kind: "section", item: g.section, count: g.symbols.length });
    for (const s of symbols) out.push({ kind: "symbol", item: s, key: itemKey(s) });
  }
  return out;
}

function comparator(sort: NonNullable<Sort>, instruments: ReadonlyMap<string, Instrument>) {
  const sign = sort.dir === "asc" ? 1 : -1;
  const value = (s: WatchlistSymbolRow): number | string | undefined => {
    const key = itemKey(s);
    if (sort.column === "symbol") return (instruments.get(key)?.displayName ?? s.symbol).toUpperCase();
    if (sort.column === "signal") return undefined; // not sortable (header toggles the horizon)
    const t = tickerFeed.store.get(key);
    if (!t) return undefined;
    return { last: t.last, change: t.change, changePct: t.changePct, volume: t.quoteVolume }[sort.column];
  };
  return (a: WatchlistSymbolRow, b: WatchlistSymbolRow) => {
    const va = value(a);
    const vb = value(b);
    if (va === undefined) return vb === undefined ? 0 : 1; // missing values always last
    if (vb === undefined) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  };
}

export function WatchlistList({
  items,
  instruments,
  otherLists,
  editingSection,
  setEditingSection,
  onSymbolSelected,
}: {
  items: readonly WatchlistItemRow[];
  instruments: ReadonlyMap<string, Instrument>;
  otherLists: WatchlistRow[];
  /** Section in rename mode (lifted so "Add section" can open it in edit mode). */
  editingSection: string | null;
  setEditingSection: (id: string | null) => void;
  /** Called after a row tap/click selects a symbol (phone layout switches to the chart). */
  onSymbolSelected?: (key: SymbolKey) => void;
}) {
  const columns = useWatchlistPrefs((s) => s.columns);
  const sort = useWatchlistPrefs((s) => s.sort);
  const density = useSettings((s) => s.density);
  const locale = useSettings((s) => s.numberFormat);
  const selectedKey = useChart((s) => s.symbol);
  const setSymbol = useChart((s) => s.setSymbol);
  const touch = useCoarsePointer();
  const rowHeight = rowHeightFor(density, touch);
  const select = useCallback(
    (key: SymbolKey) => {
      setSymbol(key);
      onSymbolSelected?.(key);
    },
    [setSymbol, onSymbolSelected],
  );
  const template = useMemo(() => toGridTemplate(columns), [columns]);

  // Sorted views refresh on a slow cadence: rows never jump on every tick.
  const [sortEpoch, setSortEpoch] = useState(0);
  useEffect(() => {
    if (!sort || sort.column === "symbol") return;
    const id = setInterval(() => setSortEpoch((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [sort]);

  const view = useMemo(
    () => buildView(items, sort, instruments),
    // sortEpoch intentionally re-sorts with fresh live values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, sort, instruments, sortEpoch],
  );
  const ids = useMemo(() => view.map((r) => r.item.id), [view]);
  const symbolKeys = useMemo(() => view.flatMap((r) => (r.kind === "symbol" ? [r.key] : [])), [view]);
  // One retain for the whole list: rows mount/unmount freely while scrolling.
  useRetainTickers(symbolKeys);
  const selectedIndex = view.findIndex((r) => r.kind === "symbol" && r.key === selectedKey);
  const dragDisabled = sort !== null;

  /* ---------------------------- virtualization ---------------------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      if (activeDragIndex !== null && !base.includes(activeDragIndex)) {
        return [...base, activeDragIndex].sort((a, b) => a - b);
      }
      return base;
    },
    [activeDragIndex],
  );
  const virtualizer = useVirtualizer({
    count: view.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (view[i]?.kind === "section" ? SECTION_HEIGHT : rowHeight),
    getItemKey: (i) => view[i]?.item.id ?? i,
    overscan: 12,
    rangeExtractor,
  });
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  /* ------------------------------- actions -------------------------------- */
  const store = useWatchlists;

  const remove = useCallback(
    (item: WatchlistItemRow) => {
      const undo = store.getState().removeItem(item.id);
      const label =
        item.type === "section"
          ? `section “${item.label}”`
          : (instruments.get(itemKey(item))?.displayName ?? item.symbol);
      toast(`Removed ${label}`, { action: { label: "Undo", onClick: undo } });
    },
    [instruments, store],
  );
  const flag = useCallback(
    (key: SymbolKey, color: WatchlistSymbolRow["flag_color"]) => store.getState().setFlag(key, color),
    [store],
  );
  const addToList = useCallback(
    (targetId: string, key: SymbolKey) => {
      const res = store.getState().addSymbol(targetId, key);
      const name = store.getState().lists[targetId]?.name ?? "list";
      toast(res === "added" ? `Added to ${name}` : `Already in ${name}`);
    },
    [store],
  );

  /* -------------------------------- drag ---------------------------------- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const onDragStart = (e: DragStartEvent) => setActiveDragIndex(ids.indexOf(String(e.active.id)));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveDragIndex(null);
    if (!e.over || e.active.id === e.over.id) return;
    store.getState().moveItem(String(e.active.id), ids.indexOf(String(e.over.id)));
  };

  /* ------------------------------- keyboard ------------------------------- */
  const selectAt = (i: number) => {
    const row = view[i];
    if (row?.kind !== "symbol") return;
    setSymbol(row.key);
    virtualizer.scrollToIndex(i, { align: "auto" });
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < view.length; i += dir) if (view[i]?.kind === "symbol") return i;
    return -1;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const cur = selectedIndex;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (cur < 0 || dragDisabled) return;
      const to = Math.max(0, Math.min(view.length - 1, cur + (e.key === "ArrowUp" ? -1 : 1)));
      store.getState().moveItem(view[cur]!.item.id, to);
      requestAnimationFrame(() => virtualizer.scrollToIndex(to, { align: "auto" }));
      return;
    }
    let next = -1;
    if (e.key === "ArrowDown") next = step(cur, 1);
    else if (e.key === "ArrowUp") next = cur < 0 ? step(view.length, -1) : step(cur, -1);
    else if (e.key === "Home") next = step(-1, 1);
    else if (e.key === "End") next = step(view.length, -1);
    else if ((e.key === "Delete" || e.key === "Backspace") && cur >= 0) {
      e.preventDefault();
      const nextSel = step(cur, 1) >= 0 ? step(cur, 1) : step(cur, -1);
      const item = view[cur]!.item;
      if (nextSel >= 0) selectAt(nextSel);
      remove(item);
      return;
    } else return;
    e.preventDefault();
    if (next >= 0) selectAt(next);
  };

  const rowId = (id: string) => `wl-row-${id}`;
  const activeDescendant = selectedIndex >= 0 ? rowId(view[selectedIndex]!.item.id) : undefined;

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label="Watchlist symbols"
      aria-rowcount={view.length}
      aria-activedescendant={activeDescendant}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      style={{ contain: "strict" }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDragIndex(null)}
        // Keep dnd-kit's live region out of the grid (only rows may live there).
        accessibility={{ container: typeof document === "undefined" ? undefined : document.body }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = view[v.index];
              if (!row) return null;
              return (
                <div
                  key={v.key}
                  role="presentation"
                  style={{ position: "absolute", top: v.start, left: 0, right: 0 }}
                >
                  {row.kind === "section" ? (
                    <SectionRow
                      item={row.item}
                      rowId={rowId(row.item.id)}
                      height={SECTION_HEIGHT}
                      count={row.count}
                      editing={editingSection === row.item.id}
                      dragDisabled={dragDisabled}
                      onStartEdit={setEditingSection}
                      onEndEdit={() => setEditingSection(null)}
                      onRename={(id, label) => store.getState().renameSection(id, label)}
                      onRemove={remove}
                    />
                  ) : (
                    <SymbolRow
                      item={row.item}
                      symbolKey={row.key}
                      instrument={instruments.get(row.key)}
                      selected={row.key === selectedKey}
                      rowId={rowId(row.item.id)}
                      columns={columns}
                      gridTemplate={template}
                      height={rowHeight}
                      locale={locale}
                      dragDisabled={dragDisabled}
                      otherLists={otherLists}
                      onSelect={select}
                      touch={touch}
                      onRemove={remove}
                      onFlag={flag}
                      onAddToList={addToList}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export type { ViewRow };
