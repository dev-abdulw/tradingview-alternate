import { describe, expect, it } from "vitest";
import { createMemoryStore, type KeyValueStore } from "./kv";
import { byPosition, comparePositions, keyAfter, keyForMove, keysAfter } from "./order";
import type { WatchlistItemRow, WatchlistRow } from "./schema";
import { applyMutations, LocalWatchlistRepository, parseSnapshot, toState } from "./watchlist-repository";

const list = (id: string, position: string): WatchlistRow => ({
  id,
  name: id,
  position,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});
const sym = (id: string, watchlist_id: string, position: string, symbol = "BTCUSDT"): WatchlistItemRow => ({
  id,
  watchlist_id,
  position,
  type: "symbol",
  provider: "binance",
  market: "spot",
  symbol,
  label: null,
  flag_color: null,
});

describe("fractional ordering", () => {
  it("generates increasing keys and moves with a single new key", () => {
    const keys = keysAfter(null, 5);
    expect([...keys].sort(comparePositions)).toEqual(keys);
    const rows = keys.map((position, i) => ({ id: `r${i}`, position }));
    // Move r4 to index 1 → key strictly between r0 and r1.
    const k = keyForMove(rows, "r4", 1);
    expect(k > rows[0]!.position && k < rows[1]!.position).toBe(true);
    // Move r0 to the end.
    expect(keyForMove(rows, "r0", 4) > rows[4]!.position).toBe(true);
    // Move to start.
    expect(keyForMove(rows, "r3", 0) < rows[0]!.position).toBe(true);
  });

  it("survives many inserts at the same spot (keys grow, order holds)", () => {
    let rows = [
      { id: "a", position: keyAfter(null) },
      { id: "z", position: keyAfter(keyAfter(null)) },
    ];
    for (let i = 0; i < 200; i++) {
      const position = keyForMove([...rows, { id: `n${i}`, position: "~" }].sort(byPosition), `n${i}`, 1);
      rows = [...rows, { id: `n${i}`, position }].sort(byPosition);
    }
    expect(rows[0]!.id).toBe("a");
    expect(rows[rows.length - 1]!.id).toBe("z");
    expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
  });
});

describe("applyMutations", () => {
  it("cascades list deletes to items", () => {
    const s = toState({
      lists: [list("L1", "a0"), list("L2", "a1")],
      items: [sym("i1", "L1", "a0"), sym("i2", "L2", "a0")],
    });
    const next = applyMutations(s, [{ kind: "deleteList", id: "L1" }]);
    expect(Object.keys(next.lists)).toEqual(["L2"]);
    expect(Object.keys(next.items)).toEqual(["i2"]);
    expect(Object.keys(s.items)).toHaveLength(2); // pure
  });
});

describe("parseSnapshot", () => {
  it("drops corrupt rows and orphans individually", () => {
    const parsed = parseSnapshot({
      lists: [list("L1", "a0"), { id: "bad" }],
      items: [sym("i1", "L1", "a0"), sym("orphan", "nope", "a0"), { type: "symbol" }],
    });
    expect(parsed.lists.map((l) => l.id)).toEqual(["L1"]);
    expect(parsed.items.map((i) => i.id)).toEqual(["i1"]);
    expect(parseSnapshot(null)).toEqual({ lists: [], items: [] });
  });
});

describe("LocalWatchlistRepository", () => {
  it("persists mutations and reloads them (survives a 'reload')", async () => {
    const store: KeyValueStore = createMemoryStore();
    const repo = new LocalWatchlistRepository(() => store);
    await repo.apply([
      { kind: "upsertList", row: list("L1", "a0") },
      { kind: "upsertItem", row: sym("i1", "L1", "a0") },
      { kind: "upsertItem", row: sym("i2", "L1", "a1", "ETHUSDT") },
    ]);
    // Reorder: move i2 before i1 by rewriting one row.
    await repo.apply([{ kind: "upsertItem", row: sym("i2", "L1", "Zz", "ETHUSDT") }]);

    const reloaded = await new LocalWatchlistRepository(() => store).load();
    expect(reloaded.items.sort(byPosition).map((i) => i.id)).toEqual(["i2", "i1"]);
  });
});
