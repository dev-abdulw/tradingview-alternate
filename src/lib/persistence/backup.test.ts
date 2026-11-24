import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { createMemoryStore } from "./kv";

describe("backup & restore", () => {
  it("exports user data only (no caches) and round-trips exactly", () => {
    const src = createMemoryStore({
      "markets:watchlists": '{"v":1}',
      "markets:settings": '{"state":{}}',
      "markets:instruments:binance:spot": "huge cache",
      "other-app:thing": "not ours",
    });
    const b = createBackup(src, new Date("2026-11-24T00:00:00Z"));
    expect(Object.keys(b.data)).toEqual(["markets:settings", "markets:watchlists"]);

    const dest = createMemoryStore({
      "markets:alerts": "old",
      "markets:instruments:x": "cache",
      "other-app:thing": "keep",
    });
    expect(restoreBackup(JSON.stringify(b), dest)).toEqual({ ok: true, keys: 2 });
    expect(dest.get("markets:watchlists")).toBe('{"v":1}');
    expect(dest.get("markets:alerts")).toBeNull(); // replaced, not merged
    expect(dest.get("markets:instruments:x")).toBe("cache"); // caches untouched
    expect(dest.get("other-app:thing")).toBe("keep"); // other apps untouched
  });

  it("rejects files that aren't Markets backups without touching data", () => {
    const kv = createMemoryStore({ "markets:settings": "keep" });
    expect(restoreBackup("nope", kv)).toMatchObject({ ok: false });
    expect(restoreBackup('{"app":"other"}', kv)).toMatchObject({ ok: false });
    expect(
      restoreBackup(JSON.stringify({ app: "markets", version: 1, exportedAt: "x", data: {} }), kv),
    ).toMatchObject({
      ok: false,
    });
    expect(kv.get("markets:settings")).toBe("keep");
  });
});
