"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  Copy,
  Ellipsis,
  FolderPlus,
  ListPlus,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUi } from "@/features/shell/ui-store";
import { useInstrumentMap } from "@/lib/market-data/hooks";
import type { SymbolKey } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { IconButton } from "@/ui/icon-button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/ui/menu";
import { Skeleton } from "@/ui/skeleton";
import { toast } from "@/ui/toast";
import { ManageListsDialog, RenameListDialog } from "./manage-lists";
import { WatchlistList } from "./watchlist-list";
import { COLUMN_META, COLUMNS, gridTemplate, useWatchlistPrefs, type SortColumn } from "./watchlist-prefs";
import { sortedItems, sortedLists, useWatchlists } from "./watchlist-store";

/** Resolves the active list, falling back to the first one if the saved id is gone. */
export function useActiveList() {
  const lists = useWatchlists((s) => s.lists);
  const activeId = useWatchlistPrefs((s) => s.activeListId);
  const ordered = useMemo(() => sortedLists(lists), [lists]);
  const active = (activeId && lists[activeId]) || ordered[0] || null;
  return { lists: ordered, active };
}

export function WatchlistPanel({ onSymbolSelected }: { onSymbolSelected?: (key: SymbolKey) => void } = {}) {
  const status = useWatchlists((s) => s.status);
  const error = useWatchlists((s) => s.error);
  const allItems = useWatchlists((s) => s.items);
  const { lists, active } = useActiveList();
  const instruments = useInstrumentMap();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    void useWatchlists.getState().init();
  }, []);

  const items = useMemo(() => sortedItems(allItems, active?.id ?? null), [allItems, active?.id]);
  const otherLists = useMemo(() => lists.filter((l) => l.id !== active?.id), [lists, active?.id]);

  const addSection = () => {
    if (!active) return;
    setEditingSection(useWatchlists.getState().addSection(active.id));
  };

  return (
    <section aria-label="Watchlist" className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <ListSwitcher activeId={active?.id ?? null} onRename={setRenaming} />
        <div className="flex-1" />
        <IconButton
          label="Add symbol"
          icon={<Plus />}
          disabled={!active}
          onClick={() => useUi.getState().setSearchOpen(true, "add")}
        />
        <ColumnsMenu />
        <Menu>
          <MenuTrigger asChild>
            <IconButton label="List actions" icon={<Ellipsis />} disabled={!active} />
          </MenuTrigger>
          <MenuContent align="end" className="w-52">
            <MenuItem icon={<FolderPlus />} onSelect={addSection}>
              Add section
            </MenuItem>
            <MenuItem icon={<Pencil />} onSelect={() => active && setRenaming(active.id)}>
              Rename list
            </MenuItem>
            <MenuItem
              icon={<Copy />}
              onSelect={() => {
                if (!active) return;
                useWatchlistPrefs.getState().setActiveList(useWatchlists.getState().duplicateList(active.id));
              }}
            >
              Duplicate list
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 />}
              destructive
              disabled={lists.length <= 1}
              onSelect={() => active && deleteListWithUndo(active.id)}
            >
              Delete list
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      <ColumnHeader />

      {status === "error" ? (
        <PanelMessage
          title="Couldn’t load your watchlists"
          body={error ?? "Something went wrong reading saved data."}
          action={
            <Button size="sm" onClick={() => void useWatchlists.getState().reload()}>
              <RefreshCw /> Retry
            </Button>
          }
        />
      ) : status !== "ready" || !active ? (
        <RowsSkeleton />
      ) : items.length === 0 ? (
        <PanelMessage
          title="This watchlist is empty"
          body="Add crypto, gold or tokenized stocks to follow live prices."
          action={
            <Button variant="primary" size="sm" onClick={() => useUi.getState().setSearchOpen(true, "add")}>
              <ListPlus /> Add symbol
            </Button>
          }
        />
      ) : (
        <WatchlistList
          key={active.id}
          items={items}
          instruments={instruments}
          otherLists={otherLists}
          editingSection={editingSection}
          setEditingSection={setEditingSection}
          onSymbolSelected={onSymbolSelected}
        />
      )}

      <RenameListDialog listId={renaming} onClose={() => setRenaming(null)} />
      <ManageListsDialog />
    </section>
  );
}

/** Deletes a list (never the last one) with an Undo toast. */
export function deleteListWithUndo(id: string) {
  const state = useWatchlists.getState();
  const name = state.lists[id]?.name ?? "list";
  const remaining = sortedLists(state.lists).filter((l) => l.id !== id);
  if (remaining.length === 0) return;
  const wasActive = useWatchlistPrefs.getState().activeListId;
  const undo = state.deleteList(id);
  if (wasActive === id || !wasActive) useWatchlistPrefs.getState().setActiveList(remaining[0]!.id);
  toast(`Deleted “${name}”`, {
    action: {
      label: "Undo",
      onClick: () => {
        undo();
        useWatchlistPrefs.getState().setActiveList(id);
      },
    },
  });
}

function ListSwitcher({ activeId, onRename }: { activeId: string | null; onRename: (id: string) => void }) {
  const { lists, active } = useActiveList();
  const items = useWatchlists((s) => s.items);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of Object.values(items))
      if (it.type === "symbol") c.set(it.watchlist_id, (c.get(it.watchlist_id) ?? 0) + 1);
    return c;
  }, [items]);

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-0.5 max-w-52 gap-1 px-1.5 font-semibold text-fg"
          aria-label={`Watchlist: ${active?.name ?? "loading"}. Switch list`}
        >
          <span className="truncate">{active?.name ?? "Watchlist"}</span>
          <ChevronDown className="size-3.5! text-fg-subtle" />
        </Button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel>Watchlists</MenuLabel>
        <MenuRadioGroup
          value={activeId ?? ""}
          onValueChange={(id) => useWatchlistPrefs.getState().setActiveList(id)}
        >
          {lists.map((l) => (
            <MenuRadioItem key={l.id} value={l.id} shortcut={String(counts.get(l.id) ?? 0)}>
              {l.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          icon={<ListPlus />}
          onSelect={() => {
            const id = useWatchlists.getState().createList();
            useWatchlistPrefs.getState().setActiveList(id);
            onRename(id);
          }}
        >
          New list
        </MenuItem>
        <MenuItem icon={<ListTree />} onSelect={() => useUi.getState().setManageListsOpen(true)}>
          Manage lists…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function ColumnsMenu() {
  const columns = useWatchlistPrefs((s) => s.columns);
  const toggle = useWatchlistPrefs((s) => s.toggleColumn);
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label="Columns" icon={<Columns3 />} />
      </MenuTrigger>
      <MenuContent align="end" className="w-48">
        <MenuLabel>Visible columns</MenuLabel>
        <MenuCheckboxItem checked disabled>
          Symbol
        </MenuCheckboxItem>
        {COLUMNS.map((c) => (
          <MenuCheckboxItem
            key={c}
            checked={columns[c]}
            onCheckedChange={() => toggle(c)}
            onSelect={(e) => e.preventDefault()}
          >
            {COLUMN_META[c].label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function ColumnHeader() {
  const columns = useWatchlistPrefs((s) => s.columns);
  const signalHorizon = useWatchlistPrefs((s) => s.signalHorizon);
  const toggleSignalHorizon = useWatchlistPrefs((s) => s.toggleSignalHorizon);
  const sort = useWatchlistPrefs((s) => s.sort);
  const cycle = useWatchlistPrefs((s) => s.cycleSort);

  const head = (col: SortColumn, label: string, align: "left" | "right") => {
    const isActive = sort?.column === col;
    return (
      <button
        key={col}
        type="button"
        aria-label={`Sort by ${label}${isActive ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
        aria-pressed={isActive}
        title={`Sort by ${label}`}
        onClick={() => cycle(col)}
        className={cn(
          "meta-label flex h-full min-w-0 items-center gap-0.5 hover:text-fg-muted",
          align === "right" && "justify-end",
          isActive && "text-fg-muted",
        )}
      >
        {align === "right" &&
          isActive &&
          (sort.dir === "asc" ? (
            <ArrowUp className="size-3 shrink-0" />
          ) : (
            <ArrowDown className="size-3 shrink-0" />
          ))}
        <span className="truncate">{label}</span>
        {align === "left" &&
          isActive &&
          (sort.dir === "asc" ? (
            <ArrowUp className="size-3 shrink-0" />
          ) : (
            <ArrowDown className="size-3 shrink-0" />
          ))}
      </button>
    );
  };

  return (
    <div
      className="grid h-7 shrink-0 items-center gap-2 border-y border-line px-3"
      style={{ gridTemplateColumns: gridTemplate(columns) }}
    >
      {head("symbol", "Symbol", "left")}
      {COLUMNS.filter((c) => columns[c]).map((c) =>
        c === "signal" ? (
          <button
            key={c}
            type="button"
            onClick={toggleSignalHorizon}
            title="Technical signal — click to switch Swing / Intraday"
            aria-label={`Signal column shows ${signalHorizon}. Switch to ${signalHorizon === "swing" ? "intraday" : "swing"}`}
            className="meta-label flex h-full items-center justify-end hover:text-fg-muted"
          >
            {signalHorizon === "swing" ? "Sig·S" : "Sig·I"}
          </button>
        ) : (
          head(c, COLUMN_META[c].short, "right")
        ),
      )}
    </div>
  );
}

function PanelMessage({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div>
        <p className="text-ui font-medium text-fg">{title}</p>
        <p className="mt-1 text-cell text-fg-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex-1 overflow-hidden" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="grid h-8 grid-cols-[1fr_84px_62px] items-center gap-2 px-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-[18px] rounded-full" />
            <Skeleton className="h-2.5" style={{ width: 36 + ((i * 13) % 30) }} />
          </div>
          <Skeleton className="ml-auto h-2.5 w-14" />
          <Skeleton className="ml-auto h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}
