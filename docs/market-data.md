# Market data: what Binance actually serves

Findings from probing the live APIs on **2026-11-24**. Re-check them if Binance changes its API.

## Hosts

| Use          | Host                                      | Notes                                                                     |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| Spot REST    | `https://data-api.binance.vision`         | Market-data-only host. CORS `*`, no key.                                  |
| Spot WS      | `wss://data-stream.binance.vision/stream` | Same ~2s to first data as `stream.binance.com` in 3 measured rounds.      |
| Futures REST | `https://fapi.binance.com`                | CORS `*`.                                                                 |
| Futures WS   | `wss://fstream.binance.com/market/stream` | **The legacy `/stream` path acks SUBSCRIBE but delivers no market data.** |

- `exchangeInfo` (spot) is several MB by default and downloads slowly. `?showPermissionSets=false&symbolStatus=TRADING` with gzip brings it to **55KB on the wire** and about 1s.
- Binance acks `SUBSCRIBE` with `{"result":null}` **even for invalid stream names**. An ack never proves a stream exists.
- `@ticker` pushes only on change. Thin markets (most bStocks) can go seconds without a push, so prices are seeded from a batched REST snapshot.
- Browsers can't read `x-mbx-used-weight` on every host, so request weight is budgeted client-side (at half the published limits).

## Asset classes

### Crypto

Everything on spot that isn't a bStock. That's 1,376 TRADING pairs, 526 of them quoted in USDT.

### Metals: futures `TRADIFI_PERPETUAL`

`underlyingType: "COMMODITY"` covers 8 contracts:

| Metal (exposed in v1)      | Energy (not exposed in v1) |
| -------------------------- | -------------------------- |
| XAUUSDT Gold (tick 0.01)   | CLUSDT (WTI)               |
| XAGUSDT Silver (tick 0.01) | BZUSDT (Brent)             |
| XPTUSDT Platinum           | NATGASUSDT                 |
| XPDUSDT Palladium          |                            |
| COPPERUSDT                 |                            |

Mark price, index and funding come from `@markPrice@1s` and `/fapi/v1/premiumIndex`. TradFi perps also carry an `st` (session status) field on tickers.

### Stocks: spot bStocks

The spot `exchangeInfo` has **no type flag**: every boolean and permission field is identical across all pairs. bStocks are identified by two signals together:

1. **Naming.** The base asset is `<TICKER>B`, quoted in USDT (`AAPLB/USDT`, `NVDAB/USDT`, `SPYB/USDT`).
2. **Risk band.** `PERCENT_PRICE_BY_SIDE` uses the low-volatility band: bid `1.1/0.8`, ask `1.2/0.9`. Crypto uses `1.2/0.5`, `2/0.8`.

Neither signal works alone:

- Naming alone also matches crypto: BNB, ARB, SHIB, BB, CKB, DGB, TRB and YB.
- The band alone also matches fiat pairs, PAXG, XAUT and the stablecoins.

Together they match **113 bStocks**, all USDT-quoted with tick 0.01. 109 of them have a futures `EQUITY` perpetual on the same ticker. The other four (BBB, QNTB, STXB, USDEB) were price-checked against their crypto namesakes and are clearly stocks: STXB trades at $514 (Seagate) while STX the crypto trades at $0.26.

> Never strip the `B` to match symbols. `STX` is a crypto token and `STXB` is Seagate stock.

The full snapshot list is in `src/lib/market-data/binance/__fixtures__/bstocks-snapshot.json`.

### Also on futures, not exposed in v1

- 209 US `EQUITY` perpetuals.
- HK/KR/CN equity perps.
- Pre-market perps (OPENAI, MOONSHOT).
- Index perps (BTCDOM).
