import { create } from "zustand";
import { toast } from "@/ui/toast";
import { getProvider } from "@/lib/market-data/registry";
import { parseSymbolKey, toSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { byPosition, keyAfter, keyForMove, keysAfter } from "@/lib/persistence/order";
import {
  newId,
  nowIso,
  type FlagColor,
  type WatchlistItemRow,
  type WatchlistRow,
  type WatchlistSectionRow,
  type WatchlistSymbolRow,
} from "@/lib/persistence/schema";
import {
  applyMutations,
  LocalWatchlistRepository,
  toState,
  type WatchlistMutation,
  type WatchlistRepository,
  type WatchlistState,
} from "@/lib/persistence/watchlist-repository";

let repository: WatchlistRepository = new LocalWatchlistRepository();

/** Swap the backing store (Phase 5: Supabase when signed in). */
export function setWatchlistRepository(repo: WatchlistRepository): void {
  repository = repo;
}

export type Undo = () => void;

type Status = "idle" | "loading" | "ready" | "error";

type Actions = {
  init(): Promise<void>;
  reload(): Promise<void>;
  createList(name?: string): string;
  renameList(id: string, name: string): void;
  duplicateList(id: string): string;
  deleteList(id: string): Undo;
  moveList(id: string, toIndex: number): void;
  addSymbol(listId: string, key: SymbolKey): "added" | "exists";
  addSection(listId: string, label?: string): string;
  renameSection(id: string, label: string): void;
  removeItem(id: string): Undo;
  moveItem(id: string, toIndex: number): void;
  /** Flags mark a symbol across every list it appears in. */
  setFlag(key: SymbolKey, color: FlagColor | null): void;
};

export type WatchlistStore = WatchlistState & { status: Status; error: string | null } & Actions;

/* ------------------------------- selectors -------------------------------- */

export function sortedLists(lists: WatchlistState["lists"]): WatchlistRow[] {
  return Object.values(lists).sort(byPosition);
}

export function sortedItems(items: WatchlistState["items"], listId: string | null): WatchlistItemRow[] {
  if (!listId) return [];
  return Object.values(items)
    .filter((i) => i.watchlist_id === listId)
    .sort(byPosition);
}

export const itemKey = (i: WatchlistSymbolRow): SymbolKey =>
  toSymbolKey({ provider: i.provider, market: i.market, symbol: i.symbol });

/* --------------------------------- store ---------------------------------- */

export const useWatchlists = create<WatchlistStore>()((set, get) => {
  /** Optimistic: update memory now, persist async, roll back on failure. */
  function commit(mutations: WatchlistMutation[]): void {
    if (mutations.length === 0) return;
    const before = { lists: get().lists, items: get().items };
    set(applyMutations(before, mutations));
    repository.apply(mutations).catch((err: unknown) => {
      set(before);
      toast.error("Couldn’t save your change", { description: String(err) });
    });
  }

  const listRow = (name: string, position: string): WatchlistRow => {
    const t = nowIso();
    return { id: newId(), name, position, created_at: t, updated_at: t };
  };

  const symbolRow = (listId: string, key: SymbolKey, position: string): WatchlistSymbolRow => {
    const { provider, market, symbol } = parseSymbolKey(key);
    return {
      id: newId(),
      watchlist_id: listId,
      position,
      type: "symbol",
      provider,
      market,
      symbol,
      label: null,
      flag_color: currentFlag(key),
    };
  };

  const sectionRow = (listId: string, label: string, position: string): WatchlistSectionRow => ({
    id: newId(),
    watchlist_id: listId,
    position,
    type: "section",
    provider: null,
    market: null,
    symbol: null,
    label,
    flag_color: null,
  });

  function currentFlag(key: SymbolKey): FlagColor | null {
    for (const it of Object.values(get().items)) {
      if (it.type === "symbol" && itemKey(it) === key) return it.flag_color;
    }
    return null;
  }

  function touch(listId: string): WatchlistMutation[] {
    const l = get().lists[listId];
    return l ? [{ kind: "upsertList", row: { ...l, updated_at: nowIso() } }] : [];
  }

  return {
    lists: {},
    items: {},
    status: "idle",
    error: null,

    async init() {
      if (get().status !== "idle") return;
      set({ status: "loading" });
      try {
        const snap = await repository.load();
        set({ ...toState(snap), status: "ready" });
        if (snap.lists.length === 0) commit(await seedMutations());
        repository.subscribe?.(() => void get().reload());
      } catch (err) {
        set({ status: "error", error: String(err) });
      }
    },

    async reload() {
      const snap = await repository.load();
      set({ ...toState(snap), status: "ready", error: null });
    },

    createList(name = "New list") {
      const last = sortedLists(get().lists).at(-1);
      const row = listRow(name, keyAfter(last?.position));
      commit([{ kind: "upsertList", row }]);
      return row.id;
    },

    renameList(id, name) {
      const l = get().lists[id];
      const trimmed = name.trim();
      if (!l || !trimmed || trimmed === l.name) return;
      commit([{ kind: "upsertList", row: { ...l, name: trimmed.slice(0, 80), updated_at: nowIso() } }]);
    },

    duplicateList(id) {
      const src = get().lists[id];
      if (!src) return id;
      const lists = sortedLists(get().lists);
      const idx = lists.findIndex((l) => l.id === id);
      const copy = listRow(`${src.name} copy`.slice(0, 80), "a0");
      copy.position = keyForMove([...lists, copy], copy.id, idx + 1);
      const items = sortedItems(get().items, id);
      const positions = keysAfter(null, items.length);
      const muts: WatchlistMutation[] = [{ kind: "upsertList", row: copy }];
      items.forEach((it, i) =>
        muts.push({
          kind: "upsertItem",
          row: { ...it, id: newId(), watchlist_id: copy.id, position: positions[i]! },
        }),
      );
      commit(muts);
      return copy.id;
    },

    deleteList(id) {
      const l = get().lists[id];
      if (!l) return () => {};
      const items = sortedItems(get().items, id);
      commit([{ kind: "deleteList", id }]);
      return () =>
        commit([
          { kind: "upsertList", row: l },
          ...items.map((row): WatchlistMutation => ({ kind: "upsertItem", row })),
        ]);
    },

    moveList(id, toIndex) {
      const l = get().lists[id];
      if (!l) return;
      const position = keyForMove(sortedLists(get().lists), id, toIndex);
      if (position === l.position) return;
      commit([{ kind: "upsertList", row: { ...l, position, updated_at: nowIso() } }]);
    },

    addSymbol(listId, key) {
      const items = sortedItems(get().items, listId);
      if (items.some((i) => i.type === "symbol" && itemKey(i) === key)) return "exists";
      const row = symbolRow(listId, key, keyAfter(items.at(-1)?.position));
      commit([{ kind: "upsertItem", row }, ...touch(listId)]);
      return "added";
    },

    addSection(listId, label = "New section") {
      const items = sortedItems(get().items, listId);
      const row = sectionRow(listId, label, keyAfter(items.at(-1)?.position));
      commit([{ kind: "upsertItem", row }, ...touch(listId)]);
      return row.id;
    },

    renameSection(id, label) {
      const it = get().items[id];
      const trimmed = label.trim();
      if (!it || it.type !== "section" || !trimmed || trimmed === it.label) return;
      commit([{ kind: "upsertItem", row: { ...it, label: trimmed.slice(0, 60) } }]);
    },

    removeItem(id) {
      const it = get().items[id];
      if (!it) return () => {};
      commit([{ kind: "deleteItem", id }, ...touch(it.watchlist_id)]);
      return () => commit([{ kind: "upsertItem", row: it }]);
    },

    moveItem(id, toIndex) {
      const it = get().items[id];
      if (!it) return;
      const position = keyForMove(sortedItems(get().items, it.watchlist_id), id, toIndex);
      if (position === it.position) return;
      commit([{ kind: "upsertItem", row: { ...it, position } }, ...touch(it.watchlist_id)]);
    },

    setFlag(key, color) {
      const muts: WatchlistMutation[] = [];
      for (const it of Object.values(get().items)) {
        if (it.type === "symbol" && itemKey(it) === key && it.flag_color !== color) {
          muts.push({ kind: "upsertItem", row: { ...it, flag_color: color } });
        }
      }
      commit(muts);
    },
  };

  /**
   * First-run list. Stocks are resolved from runtime bStock discovery (by
   * display ticker), never from hardcoded exchange symbols.
   */
  async function seedMutations(): Promise<WatchlistMutation[]> {
    const spot = getProvider("binance:spot");
    let instruments: Awaited<ReturnType<typeof spot.getExchangeInfo>> = [];
    try {
      instruments = await spot.getExchangeInfo();
    } catch {
      /* offline on first run: seed what we can */
    }
    const pick = (cls: string, names: string[]) =>
      names.flatMap((n) => {
        const i = instruments.find((x) => x.assetClass === cls && x.displayName === n && x.quote === "USDT");
        return i ? [i.key] : [];
      });
    const sections: [string, SymbolKey[]][] = [
      [
        "Majors",
        instruments.length
          ? pick("crypto", ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"])
          : (["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((s) => `binance:spot:${s}`) as SymbolKey[]),
      ],
      ["Metals", pick("metal", ["PAXG", "XAUT"])],
      ["Stocks", pick("stock", ["AAPL", "NVDA", "TSLA", "SPY"])],
    ];

    const list = listRow("Watchlist", keyAfter(null));
    const rows: WatchlistItemRow[] = [];
    for (const [label, keys] of sections) {
      if (keys.length === 0) continue;
      rows.push(sectionRow(list.id, label, "a0"));
      for (const k of keys) rows.push(symbolRow(list.id, k, "a0"));
    }
    const positions = keysAfter(null, rows.length);
    rows.forEach((r, i) => (r.position = positions[i]!));
    return [
      { kind: "upsertList", row: list },
      ...rows.map((row): WatchlistMutation => ({ kind: "upsertItem", row })),
    ];
  }
});
