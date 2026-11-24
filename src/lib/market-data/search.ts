/**
 * Instrument search ranking: exact > prefix > word-prefix > substring > fuzzy
 * subsequence, then preferred quote (USDT first), then 24h volume, then
 * shorter symbol. Separators are ignored ("btc/usdt", "btc usdt" → BTCUSDT).
 */
import type { AssetClass, Instrument } from "./types";

const QUOTE_RANK: Record<string, number> = { USDT: 0, USDC: 1, FDUSD: 2, USD1: 3, BTC: 4, ETH: 5 };

export type RankOptions = {
  assetClass?: AssetClass;
  limit?: number;
  /** 24h quote volume by instrument key, used as a popularity tiebreak. */
  popularity?: ReadonlyMap<string, number>;
};

export const normalizeQuery = (q: string) =>
  q
    .trim()
    .toUpperCase()
    .replace(/[\s/:_-]/g, "");

export function rankInstruments(
  all: readonly Instrument[],
  rawQuery: string,
  { assetClass, limit = 50, popularity }: RankOptions = {},
): Instrument[] {
  const q = normalizeQuery(rawQuery);
  const scored: { i: Instrument; s: number; v: number }[] = [];
  for (const i of all) {
    if (assetClass && i.assetClass !== assetClass) continue;
    const s = scoreInstrument(i, q);
    if (s > 0) scored.push({ i, s, v: popularity?.get(i.key) ?? 0 });
  }
  scored.sort(
    (a, b) =>
      b.s - a.s ||
      (QUOTE_RANK[a.i.quote] ?? 9) - (QUOTE_RANK[b.i.quote] ?? 9) ||
      b.v - a.v ||
      a.i.symbol.length - b.i.symbol.length ||
      (a.i.symbol < b.i.symbol ? -1 : 1),
  );
  return scored.slice(0, limit).map((x) => x.i);
}

export function scoreInstrument(i: Instrument, q: string): number {
  if (!q) return 1;
  const sym = i.symbol.toUpperCase();
  const name = i.displayName.toUpperCase();
  const desc = (i.description ?? "").toUpperCase();
  if (sym === q || name === q) return 1000;
  if (name + i.quote === q) return 990; // "AAPLUSDT" → AAPLBUSDT
  // No length penalty on prefixes: ties fall to preferred quote, then 24h volume.
  if (name.startsWith(q)) return 900;
  if (sym.startsWith(q)) return 850;
  if (desc && desc.split(/[\s()]+/).some((w) => w.startsWith(q))) return 700;
  const at = sym.indexOf(q);
  if (at >= 0) return 500 - at;
  if (desc.includes(q)) return 400;
  return fuzzy(q, sym);
}

/** Subsequence match: every query char in order. Rewards runs, penalizes gaps. 0 = no match. */
export function fuzzy(q: string, target: string): number {
  if (q.length < 2) return 0;
  let ti = 0;
  let score = 0;
  let run = 0;
  for (const ch of q) {
    const found = target.indexOf(ch, ti);
    if (found < 0) return 0;
    if (found === ti) {
      run += 1;
      score += 2 * run;
    } else {
      run = 0;
      score -= found - ti;
    }
    ti = found + 1;
  }
  return Math.max(1, Math.min(300, 100 + score));
}
