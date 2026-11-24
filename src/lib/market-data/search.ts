/**
 * Instrument ranking shared by providers. Phase 3's command palette builds
 * fuzzy matching and recents on top; this keeps provider search useful alone.
 */
import type { AssetClass, Instrument } from "./types";

const QUOTE_RANK: Record<string, number> = { USDT: 0, USDC: 1, FDUSD: 2, USD1: 3, BTC: 4, ETH: 5 };

export function rankInstruments(
  all: readonly Instrument[],
  rawQuery: string,
  { assetClass, limit = 50 }: { assetClass?: AssetClass; limit?: number } = {},
): Instrument[] {
  const q = rawQuery
    .trim()
    .toUpperCase()
    .replace(/[\s/:-]/g, "");
  const scored: { i: Instrument; s: number }[] = [];
  for (const i of all) {
    if (assetClass && i.assetClass !== assetClass) continue;
    const s = score(i, q);
    if (s > 0) scored.push({ i, s });
  }
  scored.sort(
    (a, b) =>
      b.s - a.s ||
      (QUOTE_RANK[a.i.quote] ?? 9) - (QUOTE_RANK[b.i.quote] ?? 9) ||
      a.i.symbol.length - b.i.symbol.length ||
      a.i.symbol.localeCompare(b.i.symbol),
  );
  return scored.slice(0, limit).map((x) => x.i);
}

function score(i: Instrument, q: string): number {
  if (!q) return 1;
  const sym = i.symbol.toUpperCase();
  const name = i.displayName.toUpperCase();
  const desc = (i.description ?? "").toUpperCase();
  if (sym === q || name === q) return 100;
  if (name.startsWith(q)) return 85;
  if (sym.startsWith(q)) return 80;
  if (desc.startsWith(q)) return 70;
  if (sym.includes(q)) return 40;
  if (desc.includes(q)) return 30;
  return 0;
}
