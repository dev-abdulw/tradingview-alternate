/**
 * Provider registry: maps "provider:market" → MarketDataProvider.
 * Adding a data source (forex, PSX, …) = implement MarketDataProvider and
 * call registerProvider(); no UI code changes.
 */
import { BinanceFuturesProvider, BinanceSpotProvider } from "./binance/provider";
import { marketId, parseSymbolKey } from "./symbol-key";
import type { MarketDataProvider, SymbolRef } from "./types";

type Factory = () => MarketDataProvider;

const factories = new Map<string, Factory>([
  ["binance:spot", () => new BinanceSpotProvider()],
  ["binance:futures", () => new BinanceFuturesProvider()],
]);
const instances = new Map<string, MarketDataProvider>();
const createdListeners = new Set<(p: MarketDataProvider) => void>();

export function registerProvider(id: string, factory: Factory): void {
  factories.set(id, factory);
}

export function providerIds(): string[] {
  return [...factories.keys()];
}

/** Lazily instantiates the provider (sockets open only when something subscribes). */
export function getProvider(idOrRef: string | Pick<SymbolRef, "provider" | "market">): MarketDataProvider {
  const id = typeof idOrRef === "string" ? idOrRef : marketId(idOrRef);
  let p = instances.get(id);
  if (!p) {
    const f = factories.get(id);
    if (!f) throw new Error(`No market data provider registered for "${id}"`);
    p = f();
    instances.set(id, p);
    for (const cb of createdListeners) cb(p);
  }
  return p;
}

export function providerForKey(key: string): { provider: MarketDataProvider; symbol: string } {
  const ref = parseSymbolKey(key);
  return { provider: getProvider(ref), symbol: ref.symbol };
}

export function activeProviders(): MarketDataProvider[] {
  return [...instances.values()];
}

export function onProviderCreated(cb: (p: MarketDataProvider) => void): () => void {
  createdListeners.add(cb);
  return () => createdListeners.delete(cb);
}

/** Test hook. */
export function __resetRegistry(): void {
  instances.clear();
}
