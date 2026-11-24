/**
 * Row types mirroring the Postgres tables (Phase 5). Validated with zod when
 * read from any store, so corrupt or old local data never reaches the UI.
 *
 * `position` columns hold fractional-index keys (see order.ts): reordering
 * rewrites exactly one row. Compare them by code unit (`a < b`), never with
 * localeCompare — and use COLLATE "C" for these columns in Postgres.
 */
import { z } from "zod";

export const FLAG_COLORS = ["red", "orange", "green", "blue", "violet"] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];

export const watchlistRow = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  position: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WatchlistRow = z.infer<typeof watchlistRow>;

const itemBase = {
  id: z.string().min(1),
  watchlist_id: z.string().min(1),
  position: z.string().min(1),
};

export const watchlistSymbolRow = z.object({
  ...itemBase,
  type: z.literal("symbol"),
  provider: z.string().min(1),
  market: z.string().min(1),
  symbol: z.string().min(1),
  label: z.null(),
  flag_color: z.enum(FLAG_COLORS).nullable(),
});

export const watchlistSectionRow = z.object({
  ...itemBase,
  type: z.literal("section"),
  provider: z.null(),
  market: z.null(),
  symbol: z.null(),
  label: z.string().min(1).max(60),
  flag_color: z.null(),
});

export const watchlistItemRow = z.discriminatedUnion("type", [watchlistSymbolRow, watchlistSectionRow]);
export type WatchlistItemRow = z.infer<typeof watchlistItemRow>;
export type WatchlistSymbolRow = z.infer<typeof watchlistSymbolRow>;
export type WatchlistSectionRow = z.infer<typeof watchlistSectionRow>;

export const watchlistSnapshot = z.object({
  lists: z.array(watchlistRow),
  items: z.array(watchlistItemRow),
});
export type WatchlistSnapshot = z.infer<typeof watchlistSnapshot>;

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
