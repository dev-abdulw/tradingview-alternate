import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, setKeyValueStore } from "@/lib/persistence/kv";
import { StreamManager, type SocketLike } from "../ws/stream-manager";
import futuresInfo from "./__fixtures__/futures-exchange-info.json";
import spotInfo from "./__fixtures__/spot-exchange-info.json";
import { classifySpot, isBStock } from "./classify";
import { BinanceFuturesProvider, BinanceSpotProvider } from "./provider";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([path]) => url.includes(path));
    if (!hit) return jsonResponse({ msg: "not found" }, 404);
    return jsonResponse(hit[1]);
  }) as unknown as typeof fetch;
}

class Sock implements SocketLike {
  static last: Sock;
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(public url: string) {
    Sock.last = this;
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  emit(stream: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ stream, data }) } as MessageEvent);
  }
}

beforeEach(() => setKeyValueStore(createMemoryStore()));

describe("bStock classification (real exchangeInfo sample, 2026-11-24)", () => {
  const bySymbol = new Map(spotInfo.symbols.map((s) => [s.symbol, s]));
  const cls = (sym: string) => classifySpot(bySymbol.get(sym)!);

  it.each(["AAPLBUSDT", "NVDABUSDT", "TSLABUSDT", "SPYBUSDT", "QQQBUSDT", "BRKBBUSDT"])(
    "%s is a stock",
    (s) => {
      expect(cls(s).assetClass).toBe("stock");
    },
  );

  it("uses the ticker without the B suffix as the display name", () => {
    expect(cls("AAPLBUSDT").displayName).toBe("AAPL");
    expect(cls("BRKBBUSDT").displayName).toBe("BRKB");
  });

  it.each(["BNBUSDT", "ARBUSDT", "SHIBUSDT", "BBUSDT", "CKBUSDT", "DGBUSDT", "TRBUSDT", "YBUSDT"])(
    "%s ends in B but is crypto (crypto price band)",
    (s) => expect(cls(s).assetClass).toBe("crypto"),
  );

  it.each(["EURUSDT", "USDTTRY", "USDCUSDT"])(
    "%s shares the low-volatility band but is not a stock",
    (s) => expect(cls(s).assetClass).toBe("crypto"),
  );

  it.each([
    ["PAXGUSDT", "PAXG"],
    ["XAUTUSDT", "XAUT"],
  ])("%s (tokenized gold, stock-like band) is a spot metal, not a stock", (s, name) => {
    expect(cls(s)).toMatchObject({ assetClass: "metal", displayName: name });
    expect(cls(s).description).toMatch(/^Gold/);
  });

  it("separates same-ticker crypto and stock (STX crypto vs STXB Seagate)", () => {
    expect(cls("STXUSDT").assetClass).toBe("crypto");
    expect(cls("STXBUSDT").assetClass).toBe("stock");
    expect(cls("BBUSDT").assetClass).toBe("crypto");
    expect(cls("BBBUSDT").assetClass).toBe("stock");
  });

  it("requires a USDT quote", () => {
    const aapl = bySymbol.get("AAPLBUSDT")!;
    expect(isBStock({ ...aapl, quoteAsset: "TRY" })).toBe(false);
  });
});

describe("BinanceSpotProvider", () => {
  it("parses instruments with tick-size precision and asset classes", async () => {
    const fetchImpl = fakeFetch({ "/api/v3/exchangeInfo": spotInfo });
    const p = new BinanceSpotProvider({ fetchImpl });
    const all = await p.getExchangeInfo();
    const btc = all.find((i) => i.symbol === "BTCUSDT")!;
    expect(btc).toMatchObject({
      key: "binance:spot:BTCUSDT",
      assetClass: "crypto",
      base: "BTC",
      quote: "USDT",
      tickSize: "0.01000000",
      priceDecimals: 2,
      qtyDecimals: 5,
    });
    expect(all.find((i) => i.symbol === "PEPEUSDT")!.priceDecimals).toBeGreaterThan(6);
    expect(
      all
        .filter((i) => i.assetClass === "stock")
        .map((i) => i.displayName)
        .sort(),
    ).toEqual(["AAPL", "BB", "BRKB", "NVDA", "QNT", "QQQ", "SPY", "STX", "TSLA", "USDE"].sort());
    // Requested with the trimmed payload flags.
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toContain("showPermissionSets=false");
  });

  it("caches instruments: second call doesn't refetch, and survives a 'reload'", async () => {
    const store = createMemoryStore();
    setKeyValueStore(store);
    const fetchImpl = fakeFetch({ "/api/v3/exchangeInfo": spotInfo });
    const p = new BinanceSpotProvider({ fetchImpl });
    await p.getExchangeInfo();
    await p.getExchangeInfo();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const fetch2 = fakeFetch({});
    const reloaded = new BinanceSpotProvider({ fetchImpl: fetch2 });
    expect((await reloaded.getExchangeInfo()).length).toBe(spotInfo.symbols.length);
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("ranks search: exact display name first, then prefix; filters by asset class", async () => {
    const p = new BinanceSpotProvider({ fetchImpl: fakeFetch({ "/api/v3/exchangeInfo": spotInfo }) });
    expect((await p.searchSymbols("aapl"))[0]!.symbol).toBe("AAPLBUSDT");
    expect((await p.searchSymbols("btc"))[0]!.symbol).toBe("BTCUSDT"); // USDT quote beats TRY
    const stocks = await p.searchSymbols("", { assetClass: "stock" });
    expect(stocks.every((i) => i.assetClass === "stock")).toBe(true);
  });

  it("maps klines, timeframe intervals and endTime paging", async () => {
    const row = [
      1795503600000,
      "60476.24",
      "60576.92",
      "60279.91",
      "60436.01",
      "532.6688",
      1795507199999,
      "32201798.93",
      158515,
      "1",
      "2",
      "0",
    ];
    const fetchImpl = fakeFetch({ "/api/v3/klines": [row] });
    const p = new BinanceSpotProvider({ fetchImpl });
    const [k] = await p.getKlines("BTCUSDT", "1D", { endTime: 1795503600000, limit: 5000 });
    expect(k).toMatchObject({
      time: 1795503600000,
      open: 60476.24,
      close: 60436.01,
      trades: 158515,
      final: true,
    });
    const url = String(vi.mocked(fetchImpl).mock.calls[0]![0]);
    expect(url).toContain("interval=1d");
    expect(url).toContain("endTime=1795503600000");
    expect(url).toContain("limit=1000"); // clamped to the spot maximum
  });

  it("batches REST ticker snapshots (≤100 symbols per request, tiered weight)", async () => {
    const t = (symbol: string) => ({
      symbol,
      priceChange: "1",
      priceChangePercent: "0.5",
      lastPrice: "100",
      openPrice: "99",
      highPrice: "101",
      lowPrice: "98",
      volume: "10",
      quoteVolume: "1000",
      closeTime: 5,
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const symbols = JSON.parse(new URL(String(input)).searchParams.get("symbols")!) as string[];
      return jsonResponse(symbols.map(t));
    }) as unknown as typeof fetch;
    const p = new BinanceSpotProvider({ fetchImpl });
    const symbols = Array.from({ length: 150 }, (_, i) => `S${i}USDT`);
    const out = await p.getTickers(symbols);
    expect(out).toHaveLength(150);
    expect(out[0]).toMatchObject({
      key: "binance:spot:S0USDT",
      last: 100,
      changePct: 0.5,
      quoteVolume: 1000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 100 + 50
    expect(p.limiter.used()).toBe(80); // 40 + 40
    expect(await p.getTickers([])).toEqual([]);
  });

  it("rejects malformed responses at the boundary", async () => {
    const p = new BinanceSpotProvider({ fetchImpl: fakeFetch({ "/api/v3/klines": [["bad"]] }) });
    await expect(p.getKlines("BTCUSDT", "1h")).rejects.toThrow(/Unexpected response shape/);
  });

  it("streams validated tickers and klines over the shared socket", async () => {
    vi.useFakeTimers();
    const streams = new StreamManager({
      url: "wss://x/stream",
      createSocket: (u) => new Sock(u),
      online: true,
    });
    const p = new BinanceSpotProvider({ streams, fetchImpl: fakeFetch({}) });
    const onTicker = vi.fn();
    const onKline = vi.fn();
    p.subscribeTicker("AAPLBUSDT", onTicker);
    p.subscribeKlines("BTCUSDT", "1m", onKline);
    Sock.last.open();
    await vi.advanceTimersByTimeAsync(20);
    expect(JSON.parse(Sock.last.sent[0]!).params.sort()).toEqual(["aaplbusdt@ticker", "btcusdt@kline_1m"]);

    Sock.last.emit("aaplbusdt@ticker", {
      e: "24hrTicker",
      E: 1,
      s: "AAPLBUSDT",
      p: "2.94",
      P: "0.845",
      c: "350.69",
      o: "347.75",
      h: "352.81",
      l: "344.60",
      v: "3724.7",
      q: "1300024.6",
    });
    expect(onTicker).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "binance:spot:AAPLBUSDT",
        last: 350.69,
        changePct: 0.845,
        quoteVolume: 1300024.6,
      }),
    );
    Sock.last.emit("btcusdt@kline_1m", {
      e: "kline",
      E: 2,
      s: "BTCUSDT",
      k: { t: 60000, T: 119999, i: "1m", o: "1", c: "2", h: "3", l: "0.5", v: "10", q: "20", n: 5, x: false },
    });
    expect(onKline).toHaveBeenCalledWith(expect.objectContaining({ time: 60000, close: 2, final: false }));
    streams.destroy();
    vi.useRealTimers();
  });
});

describe("BinanceFuturesProvider", () => {
  it("exposes metals only (gold, silver, platinum, palladium, copper)", async () => {
    const p = new BinanceFuturesProvider({ fetchImpl: fakeFetch({ "/fapi/v1/exchangeInfo": futuresInfo }) });
    const all = await p.getExchangeInfo();
    expect(all.map((i) => i.symbol).sort()).toEqual([
      "COPPERUSDT",
      "XAGUSDT",
      "XAUUSDT",
      "XPDUSDT",
      "XPTUSDT",
    ]);
    const gold = all.find((i) => i.symbol === "XAUUSDT")!;
    expect(gold).toMatchObject({
      key: "binance:futures:XAUUSDT",
      assetClass: "metal",
      description: "Gold",
      contract: { type: "perpetual", marginAsset: "USDT" },
    });
    expect(gold.priceDecimals).toBe(
      Number(gold.tickSize) >= 1 ? 0 : String(Number(gold.tickSize)).split(".")[1]!.length,
    );
  });

  it("finds gold by name", async () => {
    const p = new BinanceFuturesProvider({ fetchImpl: fakeFetch({ "/fapi/v1/exchangeInfo": futuresInfo }) });
    expect((await p.searchSymbols("gold"))[0]!.symbol).toBe("XAUUSDT");
    expect((await p.searchSymbols("xag"))[0]!.symbol).toBe("XAGUSDT");
  });

  it("uses futures kline limits and weights", async () => {
    const fetchImpl = fakeFetch({ "/fapi/v1/klines": [] });
    const p = new BinanceFuturesProvider({ fetchImpl });
    await p.getKlines("XAUUSDT", "4h");
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toMatch(
      /fapi\.binance\.com\/fapi\/v1\/klines.*limit=1500/,
    );
    expect(p.limiter.used()).toBe(10);
  });

  it("maps mark price + funding from REST", async () => {
    const p = new BinanceFuturesProvider({
      fetchImpl: fakeFetch({
        "/fapi/v1/premiumIndex": {
          symbol: "XAUUSDT",
          markPrice: "3626.61",
          indexPrice: "3625.58",
          estimatedSettlePrice: "1",
          lastFundingRate: "0.00001109",
          interestRate: "0",
          nextFundingTime: 1795521600000,
          time: 1795507854685,
        },
      }),
    });
    expect(await p.getMarkPrice("XAUUSDT")).toEqual({
      key: "binance:futures:XAUUSDT",
      markPrice: 3626.61,
      indexPrice: 3625.58,
      fundingRate: 0.00001109,
      nextFundingTime: 1795521600000,
      eventTime: 1795507854685,
    });
  });
});
