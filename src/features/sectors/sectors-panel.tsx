"use client";

import { useQuery } from "@tanstack/react-query";
import { ListPlus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useChart } from "@/features/chart/chart-store";
import { useSettings } from "@/features/settings/settings-store";
import { SymbolIcon } from "@/features/watchlist/symbol-icon";
import { useActiveList } from "@/features/watchlist/watchlist-panel";
import { COLUMN_META, COLUMNS, gridTemplate, useWatchlistPrefs } from "@/features/watchlist/watchlist-prefs";
import { LiveCells } from "@/features/watchlist/watchlist-rows";
import { useWatchlists } from "@/features/watchlist/watchlist-store";
import { useCoarsePointer } from "@/lib/hooks/use-media";
import { fetchPerpCatalog } from "@/lib/market-data/binance/analytics";
import { fetchMarketCaps } from "@/lib/market-data/coingecko";
import {
  useInstrumentMap,
  useInstrumentsReady,
  useMarketSnapshot,
  useRetainTickers,
} from "@/lib/market-data/hooks";
import { formatVolume } from "@/lib/market-data/precision";
import { buildSectorGroups, MAX_PER_GROUP, type SectorGroup } from "@/lib/market-data/sectors";
import type { SymbolKey } from "@/lib/market-data/types";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { IconButton } from "@/ui/icon-button";
import { Skeleton } from "@/ui/skeleton";
import { toast } from "@/ui/toast";

const HOUR = 3_600_000;
const CAPS_WAIT_MS = 8_000;

/** Sector groups: Binance's sector tags, top 10 by market cap, plus US stocks and gold. */
export function useSectorGroups() {
  const instruments = useInstrumentMap();
  const { ready } = useInstrumentsReady();
  const snapshot = useMarketSnapshot(true);
  const catalog = useQuery({
    queryKey: ["signals", "perps"],
    queryFn: ({ signal }) => fetchPerpCatalog(signal),
    staleTime: 6 * HOUR,
    gcTime: Infinity,
  });
  const caps = useQuery({
    queryKey: ["market-caps"],
    queryFn: ({ signal }) => fetchMarketCaps(signal),
    staleTime: 6 * HOUR,
    gcTime: Infinity,
    retry: 1,
  });
  // Don't hold the view hostage to CoinGecko (rate limits, slow mobile networks):
  // after a short wait, rank by 24h volume and re-rank once caps arrive.
  const [capsTimedOut, setCapsTimedOut] = useState(false);
  useEffect(() => {
    if (!caps.isPending) return;
    const t = setTimeout(() => setCapsTimedOut(true), CAPS_WAIT_MS);
    return () => clearTimeout(t);
  }, [caps.isPending]);

  const groups = useMemo<SectorGroup[] | null>(() => {
    if (!ready || !catalog.data) return null;
    if (caps.isPending && !capsTimedOut) return null;
    const volumes = new Map<string, number>();
    for (const [k, t] of snapshot) volumes.set(k, t.quoteVolume);
    return buildSectorGroups({
      perpTags: catalog.data.sectorTags,
      spot: [...instruments.values()],
      marketCaps: caps.data ?? null,
      volumes,
    });
  }, [ready, catalog.data, caps.isPending, capsTimedOut, caps.data, snapshot, instruments]);

  return {
    groups,
    error: catalog.error ? (catalog.error as Error).message : null,
    capsUnavailable: caps.isError || (caps.isPending && capsTimedOut),
    capsLoading: caps.isPending && capsTimedOut,
    retry: () => {
      void catalog.refetch();
      void caps.refetch();
    },
  };
}

export function SectorsPanel({ onSymbolSelected }: { onSymbolSelected?: (key: SymbolKey) => void }) {
  const { groups, error, capsUnavailable, capsLoading, retry } = useSectorGroups();
  const columns = useWatchlistPrefs((s) => s.columns);
  const keys = useMemo(() => (groups ?? []).flatMap((g) => g.items.map((i) => i.key)), [groups]);
  useRetainTickers(keys); // one live subscription per symbol, shared across groups

  const template = gridTemplate(columns);
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div>
          <p className="text-ui font-medium text-fg">Couldn’t load sectors</p>
          <p className="mt-1 text-cell text-fg-muted">{error}</p>
        </div>
        <Button size="sm" onClick={retry}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="grid h-7 shrink-0 items-center gap-2 border-y border-line px-3"
        style={{ gridTemplateColumns: template }}
      >
        <span className="meta-label">Symbol</span>
        {COLUMNS.filter((c) => columns[c]).map((c) => (
          <span key={c} className="meta-label text-right">
            {c === "signal" ? "Sig" : COLUMN_META[c].short}
          </span>
        ))}
      </div>
      {capsUnavailable && (
        <p className="shrink-0 bg-warning-muted px-3 py-1.5 text-cell text-warning">
          {capsLoading
            ? "Market caps still loading — ranked by 24h volume for now."
            : "Market caps unavailable right now — ranked by 24h volume."}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="list" aria-label="Sectors">
        {!groups
          ? Array.from({ length: 3 }, (_, g) => (
              <div key={g} aria-busy="true">
                <div className="px-3 pt-3 pb-1">
                  <Skeleton className="h-3 w-24" />
                </div>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="grid h-8 grid-cols-[1fr_84px_62px] items-center gap-2 px-3">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="ml-auto h-2.5 w-14" />
                    <Skeleton className="ml-auto h-2.5 w-10" />
                  </div>
                ))}
              </div>
            ))
          : groups.map((g) => (
              <SectorSection key={g.id} group={g} template={template} onSymbolSelected={onSymbolSelected} />
            ))}
      </div>
    </div>
  );
}

function SectorSection({
  group,
  template,
  onSymbolSelected,
}: {
  group: SectorGroup;
  template: string;
  onSymbolSelected: ((key: SymbolKey) => void) | undefined;
}) {
  const touch = useCoarsePointer();
  const copy = () => {
    const store = useWatchlists.getState();
    const id = store.createList(group.label);
    group.items.forEach((i) => store.addSymbol(id, i.key));
    useWatchlistPrefs.getState().setActiveList(id);
    useWatchlistPrefs.getState().setPanelView("watchlist");
    toast.success(`Created watchlist “${group.label}”`, { description: `${group.items.length} symbols` });
  };
  return (
    <section role="listitem" aria-label={group.label}>
      <div
        className={cn(
          "sticky top-0 z-[1] flex items-end gap-2 bg-panel px-3 pb-1",
          touch ? "h-12 items-center pb-0" : "h-8",
        )}
      >
        <span className="meta-label">{group.label}</span>
        <span className="text-meta text-fg-disabled">
          top {Math.min(group.items.length, MAX_PER_GROUP)} by {group.rankedBy}
        </span>
        <IconButton
          size={touch ? "lg" : "xs"}
          className="ml-auto"
          label={`Copy ${group.label} to a new watchlist`}
          icon={<ListPlus />}
          onClick={copy}
        />
      </div>
      <ul>
        {group.items.map((item) => (
          <SectorRow
            key={item.key}
            symbolKey={item.key}
            name={item.instrument.displayName}
            assetClass={item.instrument.assetClass}
            decimals={item.instrument.priceDecimals}
            marketCap={item.marketCap}
            template={template}
            onSymbolSelected={onSymbolSelected}
          />
        ))}
      </ul>
    </section>
  );
}

function SectorRow({
  symbolKey,
  name,
  assetClass,
  decimals,
  marketCap,
  template,
  onSymbolSelected,
}: {
  symbolKey: SymbolKey;
  name: string;
  assetClass: "crypto" | "metal" | "stock";
  decimals: number;
  marketCap: number | null;
  template: string;
  onSymbolSelected: ((key: SymbolKey) => void) | undefined;
}) {
  const columns = useWatchlistPrefs((s) => s.columns);
  const locale = useSettings((s) => s.numberFormat);
  const selected = useChart((s) => s.symbol === symbolKey);
  const touch = useCoarsePointer();
  const { active } = useActiveList();
  const [added, setAdded] = useState(false);
  return (
    <li
      className={cn(
        "group/row relative grid cursor-default items-center gap-2 px-3 select-none",
        touch ? "h-11 active:bg-hover" : "h-8 hover:bg-hover",
        selected && "bg-active hover:bg-active",
      )}
      style={{ gridTemplateColumns: template }}
      onClick={() => {
        useChart.getState().setSymbol(symbolKey);
        onSymbolSelected?.(symbolKey);
      }}
      title={marketCap ? `Market cap $${formatVolume(marketCap, locale)}` : undefined}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <span className="flex min-w-0 items-center gap-2">
        <SymbolIcon name={name} assetClass={assetClass} />
        <span className="truncate text-cell font-medium text-fg">{name}</span>
      </span>
      <LiveCells symbolKey={symbolKey} decimals={decimals} columns={columns} locale={locale} />
      {!touch && active && (
        <button
          type="button"
          aria-label={added ? `${name} added to ${active.name}` : `Add ${name} to ${active.name}`}
          title={`Add to ${active.name}`}
          onClick={(e) => {
            e.stopPropagation();
            const res = useWatchlists.getState().addSymbol(active.id, symbolKey);
            setAdded(true);
            toast(
              res === "added" ? `Added ${name} to ${active.name}` : `${name} is already in ${active.name}`,
            );
          }}
          className="absolute top-1/2 right-1.5 hidden size-6 -translate-y-1/2 items-center justify-center rounded-[5px] bg-hover text-fg-muted group-hover/row:flex hover:bg-active hover:text-fg [&_svg]:size-3.5"
        >
          <Plus />
        </button>
      )}
    </li>
  );
}
