"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { markPriceFeed, tickerFeed } from "./live/feeds";
import type { LiveFeed } from "./live/live-store";
import { activeProviders, getProvider, onProviderCreated } from "./registry";
import { marketId, parseSymbolKey } from "./symbol-key";
import type { ConnectionStatus, Instrument, MarkPrice, SymbolKey, Ticker } from "./types";

function useFeed<T>(feed: LiveFeed<T>, key: SymbolKey | null): T | undefined {
  useEffect(() => (key ? feed.retain(key) : undefined), [feed, key]);
  const subscribe = useCallback(
    (cb: () => void) => (key ? feed.store.subscribe(key, cb) : () => {}),
    [feed, key],
  );
  return useSyncExternalStore(
    subscribe,
    () => (key ? feed.store.get(key) : undefined),
    () => undefined,
  );
}

/** Live 24h ticker for a symbol (throttled to ≤10 updates/s). */
export function useTicker(key: SymbolKey | null): Ticker | undefined {
  return useFeed(tickerFeed, key);
}

/** Live mark price + funding (futures only; undefined for spot). */
export function useMarkPrice(key: SymbolKey | null): MarkPrice | undefined {
  const isDerivative = key ? parseSymbolKey(key).market === "futures" : false;
  return useFeed(markPriceFeed, isDerivative ? key : null);
}

/** All instruments for a provider market (cached 6h, persisted). */
export function useInstruments(id: string) {
  const provider = getProvider(id);
  return useQuery({
    queryKey: ["instruments", id],
    queryFn: ({ signal }) => provider.getExchangeInfo({ signal }),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: Infinity,
  });
}

export function useInstrument(key: SymbolKey | null): Instrument | undefined {
  const ref = key ? parseSymbolKey(key) : null;
  const { data } = useInstruments(ref ? marketId(ref) : "binance:spot");
  return ref ? data?.find((i) => i.symbol === ref.symbol) : undefined;
}

/* ----------------------------- connection status ---------------------------- */

const RANK: Record<ConnectionStatus, number> = {
  offline: 4,
  reconnecting: 3,
  connecting: 2,
  live: 1,
  idle: 0,
};

function aggregate(): ConnectionStatus {
  let worst: ConnectionStatus = "idle";
  let anyLive = false;
  for (const p of activeProviders()) {
    const s = p.connection.getStatus();
    if (s === "live") anyLive = true;
    if (RANK[s] > RANK[worst]) worst = s;
  }
  if (worst === "connecting" && anyLive) return "live";
  return worst;
}

function subscribeConnection(cb: () => void): () => void {
  const offs = new Map<string, () => void>();
  const watch = (p: ReturnType<typeof activeProviders>[number]) => {
    const id = marketId(p);
    if (!offs.has(id)) offs.set(id, p.connection.onStatus(cb));
  };
  activeProviders().forEach(watch);
  const offCreated = onProviderCreated((p) => {
    watch(p);
    cb();
  });
  return () => {
    offCreated();
    offs.forEach((off) => off());
  };
}

/** Worst status across markets that have been used (Live / Reconnecting / Offline / Idle). */
export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnection, aggregate, () => "idle");
}

/** Pause foreground streams while the page is hidden. Mount once at the app root. */
export function useVisibilityPause(): void {
  useEffect(() => {
    const apply = () => {
      for (const p of activeProviders()) p.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", apply);
    const offCreated = onProviderCreated((p) => p.setHidden(document.hidden));
    return () => {
      document.removeEventListener("visibilitychange", apply);
      offCreated();
    };
  }, []);
}
