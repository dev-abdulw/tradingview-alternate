/**
 * Sector groups for rotation scanning: Binance's own sector tags (from
 * USDⓈ-M perpetual metadata), top 10 coins per sector by market cap, plus
 * tokenized stocks (by volume) and gold. Pure: inputs in, groups out.
 */
import type { Instrument, SymbolKey } from "./types";

/** Binance sector tags shown as groups, in display order (generic tags like "Crypto"/"Alpha" are skipped). */
export const SECTORS = [
  { id: "Layer-1", label: "Layer 1" },
  { id: "Layer-2", label: "Layer 2" },
  { id: "DeFi", label: "DeFi" },
  { id: "AI", label: "AI" },
  { id: "Meme", label: "Meme" },
  { id: "Infrastructure", label: "Infrastructure" },
  { id: "Gaming", label: "Gaming" },
  { id: "RWA", label: "Real-world assets" },
  { id: "Payment", label: "Payments" },
  { id: "PoW", label: "Proof of work" },
  { id: "Storage", label: "Storage" },
  { id: "NFT", label: "NFT" },
  { id: "Metaverse", label: "Metaverse" },
  { id: "Chinese", label: "Chinese community" },
] as const;

export const MAX_PER_GROUP = 10;

export type SectorGroup = {
  id: string;
  label: string;
  /** How the members are ranked (shown to the user). */
  rankedBy: "market cap" | "24h volume";
  items: { key: SymbolKey; instrument: Instrument; marketCap: number | null }[];
};

/** "1000PEPE" / "1000000MOG" perps → spot base "PEPE" / "MOG". */
export function spotBaseOfPerp(base: string): string {
  return base.replace(/^(1000000|1000)(?=[A-Z])/, "");
}

export function buildSectorGroups(input: {
  /** Perp base asset → Binance sector tags. */
  perpTags: ReadonlyMap<string, readonly string[]>;
  spot: readonly Instrument[];
  /** Ticker → market cap (null when unavailable: fall back to volume). */
  marketCaps: ReadonlyMap<string, number> | null;
  /** Spot symbol key → 24h quote volume. */
  volumes: ReadonlyMap<string, number>;
}): SectorGroup[] {
  const { perpTags, spot, marketCaps, volumes } = input;
  // Spot USDT pairs, by base asset (crypto only).
  const spotByBase = new Map<string, Instrument>();
  for (const i of spot) if (i.assetClass === "crypto" && i.quote === "USDT") spotByBase.set(i.base, i);

  const tagsByBase = new Map<string, Set<string>>();
  for (const [perpBase, tags] of perpTags) {
    const base = spotBaseOfPerp(perpBase);
    if (!spotByBase.has(base)) continue;
    const set = tagsByBase.get(base) ?? new Set<string>();
    tags.forEach((t) => set.add(t));
    tagsByBase.set(base, set);
  }

  const vol = (i: Instrument) => volumes.get(i.key) ?? 0;
  const cap = (i: Instrument) => marketCaps?.get(i.base) ?? null;
  const rank = (a: Instrument, b: Instrument) => {
    const ca = cap(a);
    const cb = cap(b);
    if (ca !== null || cb !== null) return (cb ?? -1) - (ca ?? -1); // capped coins first, by cap
    return vol(b) - vol(a);
  };

  const groups: SectorGroup[] = [];
  for (const s of SECTORS) {
    const members = [...tagsByBase]
      .filter(([, tags]) => tags.has(s.id))
      .map(([base]) => spotByBase.get(base)!);
    if (members.length === 0) continue;
    const top = members.sort(rank).slice(0, MAX_PER_GROUP);
    groups.push({
      id: s.id,
      label: s.label,
      rankedBy: marketCaps ? "market cap" : "24h volume",
      items: top.map((i) => ({ key: i.key as SymbolKey, instrument: i, marketCap: cap(i) })),
    });
  }

  const stocks = spot
    .filter((i) => i.assetClass === "stock")
    .sort((a, b) => vol(b) - vol(a))
    .slice(0, MAX_PER_GROUP);
  if (stocks.length) {
    groups.push({
      id: "stocks",
      label: "US stocks",
      rankedBy: "24h volume",
      items: stocks.map((i) => ({ key: i.key as SymbolKey, instrument: i, marketCap: null })),
    });
  }
  const gold = spot
    .filter((i) => i.assetClass === "metal" && i.quote === "USDT")
    .sort((a, b) => (cap(b) ?? vol(b)) - (cap(a) ?? vol(a)))
    .slice(0, MAX_PER_GROUP);
  if (gold.length) {
    groups.push({
      id: "gold",
      label: "Gold",
      rankedBy: marketCaps ? "market cap" : "24h volume",
      items: gold.map((i) => ({ key: i.key as SymbolKey, instrument: i, marketCap: cap(i) })),
    });
  }
  return groups;
}
