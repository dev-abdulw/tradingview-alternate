"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bell, Flag, ListPlus, Pencil, Trash2, X } from "lucide-react";
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useUi } from "@/features/shell/ui-store";
import { useTickFlash } from "@/lib/hooks/use-tick-flash";
import { tickerFeed } from "@/lib/market-data/live/feeds";
import { useTicker } from "@/lib/market-data/hooks";
import { formatChange, formatPercent, formatPrice, formatVolume } from "@/lib/market-data/precision";
import type { Instrument, SymbolKey } from "@/lib/market-data/types";
import type { WatchlistRow, WatchlistSectionRow, WatchlistSymbolRow } from "@/lib/persistence/schema";
import { cn } from "@/lib/utils/cn";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/ui/menu";
import { Skeleton } from "@/ui/skeleton";
import { FlagDot, FlagMenuItems } from "./flags";
import { SymbolIcon } from "./symbol-icon";
import { COLUMNS, type Column } from "./watchlist-prefs";

/* --------------------------------- cells ---------------------------------- */

const LiveCells = memo(function LiveCells({
  symbolKey,
  decimals,
  columns,
  locale,
}: {
  symbolKey: SymbolKey;
  decimals: number | undefined;
  columns: Record<Column, boolean>;
  locale: string;
}) {
  const t = useTicker(symbolKey);
  const flash = useTickFlash(t?.last);

  const cells: Record<Column, React.ReactNode> = {
    last: null,
    change: null,
    changePct: null,
    volume: null,
  };
  if (!t || decimals === undefined) {
    for (const c of COLUMNS)
      cells[c] = <Skeleton className={cn("ml-auto h-2.5", c === "last" ? "w-14" : "w-9")} />;
  } else {
    const dir = t.change > 0 ? "text-up" : t.change < 0 ? "text-down" : "text-fg-muted";
    cells.last = (
      <span
        key={flash.seq}
        className={cn(
          "-mr-1 rounded-[3px] px-1 text-fg",
          flash.dir === "up" && "animate-flash-up",
          flash.dir === "down" && "animate-flash-down",
        )}
      >
        {formatPrice(t.last, decimals, locale)}
      </span>
    );
    cells.change = <span className={dir}>{formatChange(t.change, decimals, locale)}</span>;
    cells.changePct = (
      <span
        className={cn(dir, "font-medium")}
        aria-label={`${t.change >= 0 ? "up" : "down"} ${Math.abs(t.changePct).toFixed(2)} percent`}
      >
        {formatPercent(t.changePct, locale)}
      </span>
    );
    cells.volume = <span className="text-fg-muted">{formatVolume(t.quoteVolume, locale)}</span>;
  }

  return (
    <>
      {COLUMNS.filter((c) => columns[c]).map((c) => (
        <span key={c} role="gridcell" className="num truncate text-right text-cell">
          {cells[c]}
        </span>
      ))}
    </>
  );
});

/* ------------------------------- symbol row ------------------------------- */

export type SymbolRowProps = {
  item: WatchlistSymbolRow;
  symbolKey: SymbolKey;
  instrument: Instrument | undefined;
  selected: boolean;
  rowId: string;
  columns: Record<Column, boolean>;
  gridTemplate: string;
  height: number;
  locale: string;
  dragDisabled: boolean;
  otherLists: WatchlistRow[];
  onSelect: (key: SymbolKey) => void;
  onRemove: (item: WatchlistSymbolRow) => void;
  onFlag: (key: SymbolKey, color: WatchlistSymbolRow["flag_color"]) => void;
  onAddToList: (listId: string, key: SymbolKey) => void;
};

export const SymbolRow = memo(function SymbolRow(p: SymbolRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.item.id,
    disabled: p.dragDisabled,
  });
  const style: CSSProperties = {
    gridTemplateColumns: p.gridTemplate,
    height: p.height,
    transform: CSS.Translate.toString(transform),
    transition,
  };
  const name = p.instrument?.displayName ?? p.item.symbol;
  const quote = p.instrument?.quote;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          id={p.rowId}
          role="row"
          aria-selected={p.selected}
          data-symbol={p.symbolKey}
          style={style}
          tabIndex={-1}
          onClick={() => p.onSelect(p.symbolKey)}
          className={cn(
            "group/row relative grid cursor-default items-center gap-2 pr-3 pl-3 select-none",
            "hover:bg-hover",
            p.selected && "bg-active hover:bg-active",
            isDragging && "z-10 bg-elevated shadow-popover",
          )}
        >
          {p.selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
          <span role="gridcell" className="flex min-w-0 items-center gap-2">
            <SymbolIcon name={name} assetClass={p.instrument?.assetClass} />
            <span className="truncate text-cell font-medium text-fg">{name}</span>
            {quote && quote !== "USDT" && <span className="text-meta text-fg-subtle">{quote}</span>}
            {p.item.flag_color && <FlagDot color={p.item.flag_color} />}
          </span>
          <LiveCells
            symbolKey={p.symbolKey}
            decimals={p.instrument?.priceDecimals}
            columns={p.columns}
            locale={p.locale}
          />

          {/* Quick actions overlay the right edge on hover — no layout shift. */}
          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5 pl-8 opacity-0",
              "bg-linear-to-r from-transparent via-hover via-30% to-hover transition-opacity duration-[var(--motion-fast)]",
              "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
              p.selected && "via-active to-active",
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Menu>
              <MenuTrigger asChild>
                <RowAction label="Flag" tabIndex={-1}>
                  <Flag />
                </RowAction>
              </MenuTrigger>
              <MenuContent align="end" className="w-40">
                <FlagMenuItems
                  current={p.item.flag_color}
                  onChange={(c) => p.onFlag(p.symbolKey, c)}
                  Item={MenuItem}
                />
              </MenuContent>
            </Menu>
            <RowAction
              label="Create alert"
              tabIndex={-1}
              onClick={() =>
                useUi
                  .getState()
                  .openAlert({ symbol: p.symbolKey, price: tickerFeed.store.get(p.symbolKey)?.last ?? null })
              }
            >
              <Bell />
            </RowAction>
            <RowAction label={`Remove ${name}`} tabIndex={-1} onClick={() => p.onRemove(p.item)}>
              <X />
            </RowAction>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>{name}</ContextMenuLabel>
        <FlagMenuItems
          current={p.item.flag_color}
          onChange={(c) => p.onFlag(p.symbolKey, c)}
          Item={ContextMenuItem}
        />
        {p.otherLists.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel>Add to list</ContextMenuLabel>
            {p.otherLists.map((l) => (
              <ContextMenuItem
                key={l.id}
                icon={<ListPlus />}
                onSelect={() => p.onAddToList(l.id, p.symbolKey)}
              >
                {l.name}
              </ContextMenuItem>
            ))}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} destructive shortcut="⌫" onSelect={() => p.onRemove(p.item)}>
          Remove from list
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

function RowAction({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-[5px] text-fg-muted hover:bg-active hover:text-fg [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------- section row ------------------------------ */

export type SectionRowProps = {
  item: WatchlistSectionRow;
  rowId: string;
  height: number;
  count: number;
  editing: boolean;
  dragDisabled: boolean;
  onStartEdit: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onEndEdit: () => void;
  onRemove: (item: WatchlistSectionRow) => void;
};

export const SectionRow = memo(function SectionRow(p: SectionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.item.id,
    disabled: p.dragDisabled || p.editing,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      id={p.rowId}
      role="row"
      style={{ height: p.height, transform: CSS.Translate.toString(transform), transition }}
      tabIndex={-1}
      onDoubleClick={() => p.onStartEdit(p.item.id)}
      className={cn(
        "group/row relative flex items-end gap-2 px-3 pb-1 select-none",
        isDragging && "z-10 bg-elevated shadow-popover",
      )}
    >
      <span role="gridcell" className="flex min-w-0 flex-1 items-center gap-2">
        {p.editing ? (
          <SectionNameInput
            initial={p.item.label}
            onDone={(label) => {
              if (label !== null) p.onRename(p.item.id, label);
              p.onEndEdit();
            }}
          />
        ) : (
          <>
            <span className="meta-label truncate">{p.item.label}</span>
            <span className="num text-meta text-fg-disabled">{p.count}</span>
          </>
        )}
      </span>
      {!p.editing && (
        <span
          className="pointer-events-none flex gap-0.5 opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <RowAction label="Rename section" tabIndex={-1} onClick={() => p.onStartEdit(p.item.id)}>
            <Pencil />
          </RowAction>
          <RowAction label="Remove section" tabIndex={-1} onClick={() => p.onRemove(p.item)}>
            <X />
          </RowAction>
        </span>
      )}
    </div>
  );
});

/** Mounts when editing starts, so the draft is seeded from the label exactly once. */
function SectionNameInput({ initial, onDone }: { initial: string; onDone: (label: string | null) => void }) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => input.current?.select());
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <input
      ref={input}
      value={draft}
      maxLength={60}
      aria-label="Section name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(draft);
        if (e.key === "Escape") onDone(null);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-5 min-w-0 flex-1 rounded-[4px] bg-input px-1 text-meta font-semibold tracking-[0.06em] text-fg uppercase ring-1 ring-accent outline-none"
    />
  );
}
