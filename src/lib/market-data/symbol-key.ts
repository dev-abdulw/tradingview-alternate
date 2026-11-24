import type { SymbolKey, SymbolRef } from "./types";

export function toSymbolKey({ provider, market, symbol }: SymbolRef): SymbolKey {
  return `${provider}:${market}:${symbol}`;
}

export function parseSymbolKey(key: string): SymbolRef {
  const [provider = "", market = "", symbol = ""] = key.split(":");
  if (!provider || !market || !symbol) throw new Error(`Invalid symbol key: ${key}`);
  return { provider, market, symbol };
}

export function isSymbolKey(value: string): value is SymbolKey {
  return /^[a-z0-9-]+:[a-z0-9-]+:[^:\s]+$/i.test(value);
}

/** Provider+market id used to look up a MarketDataProvider ("binance:spot"). */
export const marketId = (ref: Pick<SymbolRef, "provider" | "market">) => `${ref.provider}:${ref.market}`;
