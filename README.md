# Markets

Fast, keyboard-first charts and watchlists for **crypto**, **tokenized gold** (PAXG, XAUT) and **tokenized US stocks** (Binance bStocks), with live Binance market data. It runs on desktop, tablet and phone.

> **Status:** Phases 1–4 and 6 are complete. Accounts and sync (Phase 5) are deferred by choice; data lives in your browser, with JSON export/import.
> Design decisions: [`docs/decisions.md`](docs/decisions.md) · Binance findings: [`docs/market-data.md`](docs/market-data.md) · Deploying: [`docs/deployment.md`](docs/deployment.md)

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Requires **Node ≥ 22.12** and **pnpm 11**. No API keys: market data comes from Binance's public endpoints, called directly from the browser.

| Page      | What it is                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `/`       | The app                                                                    |
| `/design` | Design system: tokens, contrast results and every component in both themes |
| `/debug`  | Live market-data internals: sockets, ref counts and bStock discovery       |

### Environment variables

| Name                   | Required      | Default                 | Purpose                                                         |
| ---------------------- | ------------- | ----------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | In production | `http://localhost:3000` | Absolute URLs for Open Graph images, the sitemap and robots.txt |

## Scripts

| Script                         | What it does                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start` | Dev server / production build / serve the build                                         |
| `pnpm check`                   | Typecheck + lint + contrast + unit tests (run before every commit)                      |
| `pnpm test`                    | Vitest unit tests                                                                       |
| `pnpm e2e`                     | Playwright end-to-end tests against a production build (desktop + phone; needs network) |
| `pnpm typecheck`               | Generates route types, then strict `tsc`                                                |
| `pnpm lint`                    | ESLint (bans `any` and hex colors in components)                                        |
| `pnpm tokens`                  | Regenerates `src/app/tokens.css` from `src/ui/tokens/tokens.ts`                         |
| `pnpm contrast`                | Checks every token text/background pair against WCAG AA                                 |
| `pnpm format`                  | Prettier, with Tailwind class sorting                                                   |

## Features

- **Markets:** every Binance spot pair. Tokenized stocks and gold are detected at runtime from `exchangeInfo` and labelled **Crypto / Metal / Stock**.
- **Watchlists:**
  - Multiple lists with sections and flags that mark a symbol across lists.
  - Drag to reorder; sortable, optional columns.
  - Live tick flashes; virtualized (200 rows scroll at 60 fps).
  - Undo for every delete.
- **Sectors:** Binance's sector tags (Layer 1, DeFi, AI, Meme, …), top 10 coins each by market cap (CoinGecko) with live daily change, plus US stocks and gold; copy any sector into a watchlist.
- **Search:** ⌘K / `/`. Fuzzy, volume-aware ranking, category tabs, recents and an "Add to list" picker.
- **Chart:** Lightweight Charts v5.
  - Six chart types, a volume pane, and timezone- and locale-aware axes.
  - Older history loads as you scroll left.
  - Linear, log and % scales.
  - Indicators: SMA, EMA, Bollinger Bands, VWAP, RSI, MACD.
  - Drawings: horizontal line, trend line, ray, rectangle, Fibonacci.
  - 1 / 2 / 2×2 layouts with symbol and crosshair sync.
- **Signals:** a per-symbol scorecard for Intraday (1h/4h) and Swing (1D/1W): trend, momentum, order flow, futures positioning (funding, open interest, long/short), relative strength and sentiment, each with a reason; a −100…+100 verdict; a backtest per symbol with its baseline; alerts when the verdict flips. A rule-based reading, not financial advice.
- **Alerts:** above / below / crossing. Toast, browser notification and an optional sound. Works in a background tab.
- **Phone and tablet:** bottom tab bar, swipe to remove or flag, long-press to drag, slide-over watchlist on tablets.
- **Settings:** change % basis (since the daily open like TradingView, or rolling 24h like Binance), theme (dark / light / system), colorblind-safe up/down colors, density, time zone (default Asia/Karachi), number format, default timeframe and backup.

### Keyboard

Press `?` in the app for the full sheet.

| Where                      | Keys                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anywhere                   | `⌘K` / `Ctrl+K` or `/` search · `⌥W` toggle watchlist · `⌥I` toggle details · `⌘,` settings · `?` shortcuts                                            |
| Watchlist (focus the list) | `↑` `↓` `Home` `End` select and chart · `⌥↑` `⌥↓` reorder · `⌫` remove (with undo)                                                                     |
| Search                     | `↑` `↓` move · `↵` open chart (or add, from the list's +) · `⇧↵` add to list · `Tab` category                                                          |
| Chart                      | `T` trend line · `R` ray · `H` horizontal line · `B` rectangle · `F` Fibonacci · `Esc` cancel / deselect · `⌫` delete drawing · right-click for alerts |

## Architecture

```
src/
  app/                  routes, root layout, generated tokens.css, OG image, icons, manifest, robots, sitemap
  ui/                   presentational design-system components (Radix + tokens). No business logic.
    tokens/             token source → CSS generator → WCAG contrast checker
  features/
    shell/              desktop / tablet / phone shells, top bar, banners, shortcut sheet
    watchlist/          store (optimistic + undo), virtualized drag-sortable list, list management
    search/             ⌘K command palette, recents
    chart/              ChartController (imperative Lightweight Charts owner), legend, indicators UI,
                        drawings (geometry · pane primitive · store), multi-chart grid
    alerts/             store, client-side engine, dialog and list, shared notify()
    signals/            Signals panel, data hooks, watchlist signal column, verdict-flip alerts
    symbol/             live symbol header, details panel
    settings/           settings store, theme boot script, settings form
  lib/
    market-data/        provider interface + registry, Binance adapters, WebSocket StreamManager,
                        candle cache, frame-batched live store, precision, search ranking, React hooks
    indicators/         pure, tested indicator math (Pine-compatible)
    signals/            scorecard engine: factors, aggregation, no-lookahead backtest, edge assessment
    alerts/             pure alert evaluation (shared with a future server worker)
    persistence/        KeyValueStore, WatchlistRepository, CollectionRepository, fractional ordering, backup
    hooks/              hotkeys, media queries, tick flash
e2e/                    Playwright tests (desktop + phone, axe accessibility scan)
scripts/                build-tokens.ts, check-contrast.ts
docs/                   decisions, market-data findings, deployment
```

### Data flow

1. **REST.** Adapters call Binance from the browser and validate every response with zod at the boundary.
2. **WebSocket.** One `StreamManager` per market handles:
   - ref-counted, batched SUBSCRIBE/UNSUBSCRIBE within Binance's rate limits;
   - jittered reconnect and resubscribe, and a planned reconnect before the 24h limit;
   - liveness checks, host failover, and pausing streams while the tab is hidden.
3. **Live store.** Ticks land in a `LiveStore` that notifies each symbol at most once per frame and ≤10×/s. React rows read it through `useSyncExternalStore`, so a burst of ticks never re-renders the whole list.
4. **Candles.** `CandleCache` serves cache hits instantly, merges live klines at candle boundaries, refetches gaps after reconnects and pages older history.

### Persistence

UI code never touches `localStorage`. Stores talk to interfaces:

- `KeyValueStore`: preferences and layout sizes.
- `WatchlistRepository`: row-level mutations with fractional positions, so a reorder writes one row.
- `CollectionRepository<T>`: drawings and alerts.

Each has a local implementation today. Row shapes mirror the planned Postgres tables, so a Supabase implementation can be dropped in later without UI changes.

## Adding a data provider

1. Implement `MarketDataProvider` (`src/lib/market-data/types.ts`) in `src/lib/market-data/<provider>/`. Validate responses with zod at the boundary.
2. Reuse `StreamManager` if the source speaks a subscribe/unsubscribe WebSocket protocol, and `WeightLimiter` / `getJson` for REST budgets and retries.
3. Register it in `src/lib/market-data/registry.ts` with `registerProvider("<provider>:<market>", () => new MyProvider())` and add it to `ENABLED_MARKETS`.

Symbols are addressed everywhere as `provider:market:symbol`, so the watchlist, search, chart and alerts pick up the new provider with no UI changes.

## Testing

- **Unit (Vitest, 133 tests):**
  - stream manager: ref counts, batching, rate limits, reconnect/resubscribe, 24h limit, liveness, failover, offline, hidden tab;
  - Binance adapters on real `exchangeInfo` samples;
  - indicators vs an independent Python implementation and StockCharts' published RSI;
  - candle boundaries and paging;
  - watchlist store, fractional ordering, drawing geometry, alert rules, backup, settings.
- **End-to-end (Playwright, 13 tests):**
  - load and live prices, search and add, reorder after reload, undo;
  - no price jitter, cached switches under 300ms;
  - indicators, drawings after reload, alert triggering, 2×2 layout;
  - the phone flow and an axe accessibility scan.

---

Market data comes from Binance public APIs, may be delayed, and is not financial advice. Charts by [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (Apache-2.0).
