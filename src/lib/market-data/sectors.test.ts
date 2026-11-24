import { describe, expect, it } from "vitest";
import { buildSectorGroups, MAX_PER_GROUP, spotBaseOfPerp } from "./sectors";
import type { AssetClass, Instrument } from "./types";

const inst = (base: string, assetClass: AssetClass = "crypto", quote = "USDT"): Instrument => ({
  provider: "binance",
  market: "spot",
  symbol: `${base}${quote}`,
  key: `binance:spot:${base}${quote}`,
  base,
  quote,
  assetClass,
  displayName: assetClass === "stock" ? base.slice(0, -1) : base,
  tickSize: "0.01",
  stepSize: "0.01",
  priceDecimals: 2,
  qtyDecimals: 2,
});

describe("sector groups", () => {
  it("maps 1000x perps to their spot base", () => {
    expect(spotBaseOfPerp("1000PEPE")).toBe("PEPE");
    expect(spotBaseOfPerp("1000000MOG")).toBe("MOG");
    expect(spotBaseOfPerp("1INCH")).toBe("1INCH");
  });

  it("ranks each sector by market cap, keeps at most 10, and skips coins without a spot USDT pair", () => {
    const l1 = Array.from({ length: 14 }, (_, i) => `L${i}`);
    const spot = [...l1.map((b) => inst(b)), inst("PEPE"), inst("ETH", "crypto", "BTC")];
    const perpTags = new Map<string, string[]>([
      ...l1.map((b): [string, string[]] => [b, ["Layer-1", "Crypto"]]),
      ["1000PEPE", ["Meme"]],
      ["NOSPOT", ["Meme"]],
      ["ETH", ["Layer-1"]], // spot pair is ETHBTC only → excluded
    ]);
    const caps = new Map(l1.map((b, i) => [b, (i + 1) * 1e9]));
    const groups = buildSectorGroups({ perpTags, spot, marketCaps: caps, volumes: new Map() });

    const layer1 = groups.find((g) => g.id === "Layer-1")!;
    expect(layer1.items).toHaveLength(MAX_PER_GROUP);
    expect(layer1.items[0]!.instrument.base).toBe("L13"); // largest cap first
    expect(layer1.rankedBy).toBe("market cap");
    expect(groups.find((g) => g.id === "Meme")!.items.map((i) => i.instrument.base)).toEqual(["PEPE"]);
    expect(groups.some((g) => g.id === "Crypto")).toBe(false); // generic tag is not a group
  });

  it("falls back to 24h volume when market caps are unavailable", () => {
    const spot = [inst("AAA"), inst("BBB")];
    const perpTags = new Map([
      ["AAA", ["AI"]],
      ["BBB", ["AI"]],
    ]);
    const volumes = new Map([
      ["binance:spot:AAAUSDT", 1],
      ["binance:spot:BBBUSDT", 9],
    ]);
    const ai = buildSectorGroups({ perpTags, spot, marketCaps: null, volumes }).find((g) => g.id === "AI")!;
    expect(ai.items.map((i) => i.instrument.base)).toEqual(["BBB", "AAA"]);
    expect(ai.rankedBy).toBe("24h volume");
  });

  it("adds US stocks (by volume) and gold groups", () => {
    const spot = [
      inst("AAPLB", "stock"),
      inst("NVDAB", "stock"),
      inst("PAXG", "metal"),
      inst("XAUT", "metal"),
    ];
    const volumes = new Map([
      ["binance:spot:AAPLBUSDT", 1],
      ["binance:spot:NVDABUSDT", 50],
    ]);
    const groups = buildSectorGroups({ perpTags: new Map(), spot, marketCaps: null, volumes });
    expect(groups.find((g) => g.id === "stocks")!.items.map((i) => i.instrument.displayName)).toEqual([
      "NVDA",
      "AAPL",
    ]);
    expect(groups.find((g) => g.id === "gold")!.items).toHaveLength(2);
  });
});
