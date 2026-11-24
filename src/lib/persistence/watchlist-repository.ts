/**
 * Watchlist persistence behind an interface. UI and stores speak in row-level
 * mutations (upsert/delete one row), which map 1:1 onto Supabase calls in
 * Phase 5 and onto a JSON document locally today.
 */
import { getKeyValueStore, storageKey, type KeyValueStore } from "./kv";
import {
  watchlistItemRow,
  watchlistRow,
  type WatchlistItemRow,
  type WatchlistRow,
  type WatchlistSnapshot,
} from "./schema";

export type WatchlistMutation =
  | { kind: "upsertList"; row: WatchlistRow }
  | { kind: "deleteList"; id: string }
  | { kind: "upsertItem"; row: WatchlistItemRow }
  | { kind: "deleteItem"; id: string };

export interface WatchlistRepository {
  load(): Promise<WatchlistSnapshot>;
  apply(mutations: readonly WatchlistMutation[]): Promise<void>;
  /** Changes made elsewhere (another tab, another device). Returns unsubscribe. */
  subscribe?(onExternalChange: () => void): () => void;
}

/** Normalized in-memory form used by stores. */
export type WatchlistState = {
  lists: Record<string, WatchlistRow>;
  items: Record<string, WatchlistItemRow>;
};

export function toState(s: WatchlistSnapshot): WatchlistState {
  return {
    lists: Object.fromEntries(s.lists.map((l) => [l.id, l])),
    items: Object.fromEntries(s.items.map((i) => [i.id, i])),
  };
}

export function toSnapshot(s: WatchlistState): WatchlistSnapshot {
  return { lists: Object.values(s.lists), items: Object.values(s.items) };
}

/** Pure reducer shared by the store (optimistic) and the local repository (durable). */
export function applyMutations(
  state: WatchlistState,
  mutations: readonly WatchlistMutation[],
): WatchlistState {
  const lists = { ...state.lists };
  const items = { ...state.items };
  for (const m of mutations) {
    switch (m.kind) {
      case "upsertList":
        lists[m.row.id] = m.row;
        break;
      case "deleteList":
        delete lists[m.id];
        // ON DELETE CASCADE
        for (const [id, it] of Object.entries(items)) if (it.watchlist_id === m.id) delete items[id];
        break;
      case "upsertItem":
        items[m.row.id] = m.row;
        break;
      case "deleteItem":
        delete items[m.id];
        break;
    }
  }
  return { lists, items };
}

/** Parses a stored snapshot row by row: one corrupt row is dropped, not the whole list. */
export function parseSnapshot(raw: unknown): WatchlistSnapshot {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as { lists?: unknown; items?: unknown };
  const lists = (Array.isArray(obj.lists) ? obj.lists : []).flatMap((r) => {
    const p = watchlistRow.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const listIds = new Set(lists.map((l) => l.id));
  const items = (Array.isArray(obj.items) ? obj.items : []).flatMap((r) => {
    const p = watchlistItemRow.safeParse(r);
    return p.success && listIds.has(p.data.watchlist_id) ? [p.data] : [];
  });
  return { lists, items };
}

const KEY = storageKey("watchlists");
const VERSION = 1;

/** Guest-mode repository: one JSON document in the KeyValueStore (localStorage). */
export class LocalWatchlistRepository implements WatchlistRepository {
  constructor(private readonly kv: () => KeyValueStore = getKeyValueStore) {}

  private read(): WatchlistState {
    const raw = this.kv().get(KEY);
    if (!raw) return { lists: {}, items: {} };
    try {
      const doc = JSON.parse(raw) as { v?: number; data?: unknown };
      return toState(parseSnapshot(doc.data));
    } catch {
      return { lists: {}, items: {} };
    }
  }

  async load(): Promise<WatchlistSnapshot> {
    return toSnapshot(this.read());
  }

  async apply(mutations: readonly WatchlistMutation[]): Promise<void> {
    const next = applyMutations(this.read(), mutations);
    this.kv().set(KEY, JSON.stringify({ v: VERSION, data: toSnapshot(next) }));
  }

  subscribe(onExternalChange: () => void): () => void {
    return this.kv().subscribe?.(KEY, () => onExternalChange()) ?? (() => {});
  }
}
