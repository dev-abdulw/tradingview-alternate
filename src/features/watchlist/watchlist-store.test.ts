import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SymbolKey } from "@/lib/market-data/types";
import type { WatchlistMutation, WatchlistRepository } from "@/lib/persistence/watchlist-repository";
import { buildView } from "./watchlist-list";
import { itemKey, setWatchlistRepository, sortedItems, sortedLists, useWatchlists } from "./watchlist-store";

const BTC = "binance:spot:BTCUSDT" as SymbolKey;
const ETH = "binance:spot:ETHUSDT" as SymbolKey;
const SOL = "binance:spot:SOLUSDT" as SymbolKey;

let applied: WatchlistMutation[][] = [];

function freshStore(fail = false) {
  applied = [];
  const repo: WatchlistRepository = {
    load: async () => ({ lists: [], items: [] }),
    apply: async (m) => {
      applied.push([...m]);
      if (fail) throw new Error("disk full");
    },
  };
  setWatchlistRepository(repo);
  useWatchlists.setState({ lists: {}, items: {}, status: "ready", error: null });
}

const symbols = (listId: string) =>
  sortedItems(useWatchlists.getState().items, listId).flatMap((i) =>
    i.type === "symbol" ? [itemKey(i)] : [],
  );

beforeEach(() => freshStore());

describe("watchlist store", () => {
  it("adds symbols once per list and keeps insertion order", () => {
    const s = useWatchlists.getState();
    const id = s.createList("Majors");
    expect(s.addSymbol(id, BTC)).toBe("added");
    expect(s.addSymbol(id, ETH)).toBe("added");
    expect(s.addSymbol(id, BTC)).toBe("exists");
    expect(symbols(id)).toEqual([BTC, ETH]);
  });

  it("reorders by rewriting exactly one item row", () => {
    const s = useWatchlists.getState();
    const id = s.createList();
    [BTC, ETH, SOL].forEach((k) => s.addSymbol(id, k));
    applied = [];
    const sol = sortedItems(useWatchlists.getState().items, id)[2]!;
    s.moveItem(sol.id, 0);
    expect(symbols(id)).toEqual([SOL, BTC, ETH]);
    const itemWrites = applied.flat().filter((m) => m.kind === "upsertItem");
    expect(itemWrites).toHaveLength(1);
  });

  it("flags a symbol across every list", () => {
    const s = useWatchlists.getState();
    const a = s.createList("A");
    const b = s.createList("B");
    s.addSymbol(a, BTC);
    s.addSymbol(b, BTC);
    s.addSymbol(b, ETH);
    s.setFlag(BTC, "red");
    const flags = Object.values(useWatchlists.getState().items).flatMap((i) =>
      i.type === "symbol" ? [[itemKey(i), i.flag_color]] : [],
    );
    expect(flags.filter(([k]) => k === BTC).every(([, c]) => c === "red")).toBe(true);
    expect(flags.find(([k]) => k === ETH)?.[1]).toBeNull();
    // A symbol added later to another list inherits its flag.
    const c = s.createList("C");
    s.addSymbol(c, BTC);
    expect(
      Object.values(useWatchlists.getState().items).filter((i) => i.watchlist_id === c)[0],
    ).toMatchObject({
      flag_color: "red",
    });
  });

  it("undoes item removal and list deletion exactly", () => {
    const s = useWatchlists.getState();
    const id = s.createList("Keep");
    const other = s.createList("Other");
    [BTC, ETH].forEach((k) => s.addSymbol(id, k));
    s.addSection(id, "Metals");
    const before = structuredClone(useWatchlists.getState().items);

    const eth = sortedItems(useWatchlists.getState().items, id).find(
      (i) => i.type === "symbol" && i.symbol === "ETHUSDT",
    )!;
    const undoItem = s.removeItem(eth.id);
    expect(symbols(id)).toEqual([BTC]);
    undoItem();
    expect(useWatchlists.getState().items).toEqual(before);

    const undoList = s.deleteList(id);
    expect(sortedLists(useWatchlists.getState().lists).map((l) => l.id)).toEqual([other]);
    expect(sortedItems(useWatchlists.getState().items, id)).toEqual([]);
    undoList();
    expect(useWatchlists.getState().items).toEqual(before);
  });

  it("duplicates a list with all its items under new ids", () => {
    const s = useWatchlists.getState();
    const id = s.createList("Src");
    s.addSection(id, "S");
    [BTC, ETH].forEach((k) => s.addSymbol(id, k));
    const copy = s.duplicateList(id);
    expect(useWatchlists.getState().lists[copy]?.name).toBe("Src copy");
    expect(symbols(copy)).toEqual(symbols(id));
    const ids = (l: string) => sortedItems(useWatchlists.getState().items, l).map((i) => i.id);
    expect(ids(copy).some((x) => ids(id).includes(x))).toBe(false);
    expect(sortedLists(useWatchlists.getState().lists).map((l) => l.id)).toEqual([id, copy]);
  });

  it("rolls back the optimistic change when persistence fails", async () => {
    freshStore(true);
    const s = useWatchlists.getState();
    const id = s.createList("X");
    await vi.waitFor(() => expect(useWatchlists.getState().lists[id]).toBeUndefined());
  });
});

describe("buildView", () => {
  it("sorts symbols within their section and keeps sections in place", () => {
    const s = useWatchlists.getState();
    const id = s.createList();
    s.addSymbol(id, SOL);
    s.addSection(id, "Later");
    s.addSymbol(id, ETH);
    s.addSymbol(id, BTC);
    const items = sortedItems(useWatchlists.getState().items, id);
    const view = buildView(items, { column: "symbol", dir: "asc" }, new Map());
    expect(view.map((r) => (r.kind === "section" ? `#${r.item.label}` : r.item.symbol))).toEqual([
      "SOLUSDT",
      "#Later",
      "BTCUSDT",
      "ETHUSDT",
    ]);
    expect(view[1]).toMatchObject({ kind: "section", count: 2 });
  });
});
