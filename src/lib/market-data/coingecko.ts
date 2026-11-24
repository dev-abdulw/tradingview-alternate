/**
 * Market caps from CoinGecko's free, keyless API (CORS-enabled). Used only to
 * rank coins within a sector — prices and change still come live from Binance.
 * Cached for 6h in the KeyValueStore so a reload doesn't refetch.
 */
import { z } from "zod";
import { getKeyValueStore, storageKey } from "@/lib/persistence/kv";
import { getJson, WeightLimiter } from "./http";

const markets = z.array(z.looseObject({ symbol: z.string(), market_cap: z.number().nullable() }));
const limiter = new WeightLimiter(10); // keyless tier: keep calls rare
const KEY = storageKey("market-caps");
const TTL = 6 * 3_600_000;
const PAGES = 4; // top 1000 coins by market cap

/** Uppercase ticker → market cap (USD). On ticker collisions the larger coin wins. */
export async function fetchMarketCaps(signal?: AbortSignal): Promise<Map<string, number>> {
  const kv = getKeyValueStore();
  let stale: Map<string, number> | null = null;
  const cached = kv.get(KEY);
  if (cached) {
    try {
      const doc = JSON.parse(cached) as { at: number; caps: [string, number][] };
      if (Array.isArray(doc.caps)) {
        if (Date.now() - doc.at < TTL) return new Map(doc.caps);
        stale = new Map(doc.caps); // rankings barely move; better than nothing if the refresh fails
      }
    } catch {
      /* refetch */
    }
  }
  try {
    return await fetchFresh(kv, signal);
  } catch (e) {
    if (stale && !signal?.aborted) return stale;
    throw e;
  }
}

async function fetchFresh(
  kv: ReturnType<typeof getKeyValueStore>,
  signal: AbortSignal | undefined,
): Promise<Map<string, number>> {
  const caps = new Map<string, number>();
  for (let page = 1; page <= PAGES; page++) {
    const rows = await getJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
      markets,
      { weight: 1, limiter, retries: 1, ...(signal ? { signal } : {}) },
    );
    for (const r of rows) {
      const sym = r.symbol.toUpperCase();
      if (r.market_cap && r.market_cap > (caps.get(sym) ?? 0)) caps.set(sym, r.market_cap);
    }
  }
  kv.set(KEY, JSON.stringify({ at: Date.now(), caps: [...caps] }));
  return caps;
}
