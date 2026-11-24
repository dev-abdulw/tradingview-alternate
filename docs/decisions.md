# Design & engineering decisions

Decisions the brief left open, with the reasoning behind each choice. Newest last.

## Phase 1 — Foundation

### D1. Tokens live in TypeScript; CSS is generated from them

`src/ui/tokens/tokens.ts` is the single source of truth. `pnpm tokens` writes `src/app/tokens.css`. `pnpm contrast` checks the same object. A unit test fails if the generated CSS drifts from the source.
**Why:** The contrast check and the shipped CSS can never disagree. Charts (Phase 4) can also read typed token names instead of scraping CSS.

### D2. Token refinements to pass WCAG AA (all 148 pairs pass)

- `text-tertiary` (dark) `#5F6878` → `#8791A3`. The original measured 3.4:1 on panels, and 11px uppercase meta labels need 4.5:1.
- `accent` (dark) `#3B82F6` → `#5B97F7` for text and focus. White text on `#3B82F6` is only 3.7:1, so filled buttons use a separate `accent-solid` (`#2F6FE4`, 5.0:1 with white). The roles stay the same; filled buttons get their own token.
- `down` (dark) `#F6465D` → `#FF5B6E`. The original failed on `bg-active`, which is exactly where a selected row shows its red change %.
- `warning` was split into `warning` (text, darker amber in light: `#8F6500`) and `warning-solid` (fill `#F0B90B` with dark text). One amber cannot be both readable text on white and a fill that carries text.
- Light up/down: `#077A55` / `#C8243E`. Colorblind light: `#1A62D0` / `#B04A00`.
- **Exempt by design:** 1px borders are decorative. Inputs are identified by their fill plus placeholder text, not by the border, so `border-*` is not held to the 3:1 non-text rule. The focus ring (`accent`) is checked at ≥3:1.

### D3. Theme is scoped by `data-theme`, not `prefers-color-scheme` media queries

The attribute is set on `<html>` by an inline boot script before first paint, which follows the Next 16 "preventing flash" guide. Because it is an attribute, any subtree can render in the other theme (the `/design` page shows both side by side). The colorblind scheme is a second attribute (`data-updown`) that composes with either theme. I wrote this myself instead of using `next-themes`, because that package only manages one attribute.

### D4. The workspace renders only in the browser (`use(browser())` + shaped skeleton)

Panel sizes, theme and chart preferences all live in client storage. A server render would guess them wrong and shift on hydration. Instead, the server sends `ShellSkeleton` with the same chrome geometry, and React 19.3's `use(browser())` defers the real workspace to the client. Metadata and SEO content stay server-rendered.

### D5. Persistence seam: `KeyValueStore`

Preference-sized state (settings, panel sizes, chart prefs) goes through `lib/persistence/kv.ts`. It degrades to memory if storage is blocked. Phase 3/5 add a separate domain `Repository` (watchlists, alerts, drawings) with Local and Supabase implementations; this seam is only for small preference blobs that will sync via `profiles.settings`.

### D6. Persisted settings are validated field by field

A corrupt or old value for one field falls back to its default without wiping the user's other choices.

### D7. Indicator panes will be native Lightweight Charts panes

LWC v5 supports multiple panes with their own resizable separators and a shared time scale. So RSI/MACD will live inside the chart rather than in a separate outer panel. That keeps crosshair and scroll in sync for free. The outer layout therefore only splits chart | sidebar and watchlist | details.

### D8. Sidebar keeps its pixel width when the window resizes

`groupResizeBehavior="preserve-pixel-size"` on the sidebar and details panels: widening the window gives the extra space to the chart, as in TradingView. The details panel collapses to its 36px header (not to zero), so it stays discoverable.

### D9. Shortcuts chosen to avoid browser conflicts

`⌘K`/`Ctrl+K` and `/` open search. `⌥W` toggles the watchlist and `⌥I` toggles details. Matching uses physical key codes, because Option+W types "∑" on macOS. `⌘,`/`Ctrl+,` opens settings. I avoided `Alt+D`, which focuses the address bar on Windows. Plain-key shortcuts are ignored while typing in fields.

### D10. A status bar holds the disclaimer and clock

The bottom 24px bar shows the Binance / may be delayed / not financial advice disclaimer and a live clock in the chosen time zone, with its UTC offset. Pro terminals put this kind of persistent, low-priority information there, and it keeps the top bar for actions.

### D11. Lint enforces "no hex colors in components"

An ESLint `no-restricted-syntax` rule rejects hex literals in `src/**` outside `src/ui/tokens/`. The viewport `themeColor` reads from the token object.

### D12. Toolchain pins

- **TypeScript 5.9**, not 7.0: `create-next-app` for Next 16.4 scaffolds 5.x, and the native TS 7 compiler isn't yet the Next default.
- **jsdom 28**: jsdom 31 requires Node ≥ 22.22, and this machine has 22.14. `engines.node` is set to `>=22.12`. Once Node is upgraded, jsdom can be bumped.
- **ESLint 9**: `eslint-config-next` 16.4 targets the v9 flat config.

## Phase 2: Market data layer

Probe results are in `docs/market-data.md`.

### D13. bStocks are detected by naming plus the risk band, never by a symbol list

The `<TICKER>B` + USDT naming and the low-volatility `PERCENT_PRICE_BY_SIDE` band must both match. The detection is isolated in `binance/classify.ts`, with tests built on real `exchangeInfo` samples, so a future Binance change breaks one tested function rather than the UI. The display name drops the `B` (`AAPLB` → "AAPL"), while the wire symbol is kept verbatim.

### D14. Futures exposes metals only in v1

The brief asks for Crypto / Metal / Stock. Futures also lists energy commodities and 209 stock perpetuals. Showing stock perps next to bStocks would create two "AAPL" entries with different prices, and crypto perps would duplicate spot symbols. Widening this later is a one-line change in `classifyFutures`.

### D15. One adapter class, configured per market

Spot and futures differ in hosts, request weights, kline page size (1000 / 1500), schemas and classification, not in behavior. A single `BinanceProvider` takes a market config. Futures adds mark price and funding.

### D16. Stream manager design

- **One socket per market.** Streams are ref-counted.
- **Diff-based control messages.** A 16ms coalescing window turns a list mount into one SUBSCRIBE; subscribe-then-unsubscribe within a frame sends nothing.
- **Throttled under the limit.** Batches of 100 params; spot allows 5 control msgs/s and futures 10, and the manager stays one below each.
- **Reconnect.** Equal-jitter exponential backoff from 0.5s up to 30s, then everything is resubscribed.
- **24h limit.** A planned reconnect happens at 23.5h, before Binance's forced disconnect.
- **Liveness.** A 30s watchdog catches half-open sockets.
- **Fast failure.** Forced drops don't wait for the close handshake; the futures server can take seconds to answer it.
- **Host failover** after two failed opens.
- **Offline and hidden tabs.** Offline pauses retries until the `online` event. Hidden tabs unsubscribe foreground streams, and `background: true` streams (alerts, later) stay.

### D17. UI updates are frame-batched and capped at 10/s per symbol

`LiveStore` notifies at most once per animation frame per key, and no more than once per 100ms, always with the latest value. Rows read it through `useSyncExternalStore`. Raw ticks never re-render React directly.

### D18. REST snapshot seeding

A newly watched symbol triggers a batched `ticker/24hr` (spot: up to 100 symbols per request at weight 40) so a price shows immediately. A snapshot never overwrites a newer streamed value.

### D19. Instruments cached for 6h, stale-on-error

The compact `Instrument[]` (~200KB, not the raw MB) is persisted through the KeyValueStore. If a refresh fails, the cached list is served instead.

### D20. Spot only: metals are PAXG + XAUT (user decision, 2026-11-24)

The user trades spot only, which supersedes the brief's XAUUSDT/XAGUSDT futures metals (and D14).

- **Metals** are tokenized gold on spot: PAXGUSDT and XAUTUSDT. Binance spot has **no silver**.
- **Futures** stays in the code (`BinanceFuturesProvider`, tests, mark price and funding) for later market-prediction work. It is excluded from `ENABLED_MARKETS`, so no futures socket or request runs in the app.
- **Energy commodities** are skipped for now.
- **Stock perpetuals** are excluded; stocks come from spot bStocks only.
- **Debug page:** the Phase 2 acceptance moved from XAU/XAG futures to PAXG/XAUT spot.
- **Cache:** the instrument cache version is bumped whenever classification changes, so cached lists are rebuilt.

## Phase 3: Watchlists and search

### D21. Watchlists persist as row-level mutations

Every edit becomes `upsertList | deleteList | upsertItem | deleteItem`. A pure reducer (`applyMutations`) applies them optimistically in the store and durably in `LocalWatchlistRepository` (one JSON document in the KeyValueStore). Phase 5's `SupabaseRepository` maps the same mutations onto single-row upserts and deletes, and the UI doesn't change. A failed save rolls back and shows a toast. Stored data is validated row by row, so one corrupt row is dropped rather than losing the whole list.

### D22. Fractional positions

`position` holds a fractional-indexing key, so a reorder writes exactly one row. Keys are compared by code unit, never `localeCompare`. **Phase 5: declare these columns `COLLATE "C"` in Postgres.**

### D23. Flags mark a symbol, not a row

Flagging BTC flags it in every list, and adding BTC to another list later inherits the flag. That matches "mark symbols across lists" in the brief. The flag is still stored on each `watchlist_items` row (the schema's `flag_color`), so no new table is needed.

### D24. Sorting is a view, scoped to sections, refreshed slowly

Clicking a header cycles the sort (numbers: high→low → low→high → off). Symbols sort within their section and sections stay put. Live-value sorts re-sort every 10s rather than on every tick, because rows jumping while you read them is worse than a slightly stale order. Drag is disabled while sorted; the stored order is untouched.

### D25. A list owns its subscriptions; rows only read

The list retains live tickers for all of its symbols (≤1024 per socket). Virtualized rows only read the frame-batched store. The first version subscribed per mounted row, and scrolling then caused 56 REST snapshot requests and subscribe churn. With the list owning them, scrolling costs nothing on the network and is a steady 60 fps.

### D26. Default columns: Last, Chg%, Vol (Chg optional)

Percentage change compares across assets and absolute change doesn't. Widths are fixed (84/68/62/56px) and numbers use tabular figures, so the grid never moves; a test measured 0 cell-box movements across 21 price changes.

### D27. Monogram icons, no logo CDN

Rows show a letter mark tinted by asset class (crypto, metal, stock). This means no third-party requests or tracking and no broken images for new listings, and color still only encodes meaning.

### D28. Keyboard model

- **Watchlist grid:** one tab stop, using `aria-activedescendant`. ↑/↓/Home/End select a row and switch the chart. ⌥↑/⌥↓ reorder. ⌫/Delete removes with undo. Row quick actions are deliberately out of the tab order (200 rows × 3 buttons would be 600 tab stops); they're mouse affordances with keyboard equivalents.
- **Command palette:** ARIA combobox and listbox. ↵ opens the chart; in add mode (the panel's "+") ↵ adds. ⇧↵ always adds to the "Add to" list. Tab/⇧Tab cycles categories.
- **Empty query:** recents first, then "Most active" by 24h volume. Stablecoin and fiat bases are excluded from that group but stay searchable.

### D29. Search ranking

Exact match, then name prefix, then symbol prefix, then description word, then substring, then fuzzy subsequence. Ties break by preferred quote (USDT first), then 24h volume (one `type=MINI` market snapshot, weight 80, cached 60s), then symbol. Separators are ignored, so "btc/usdt" finds BTCUSDT.

### D30. There is always at least one list

Deleting the last list is disabled. Every delete (list, item or section) shows an Undo toast.

### D31. The details panel was filled in early

The live ticker already carries 24h high/low/open and volumes, so the details panel and its range bar shipped in Phase 3. Phase 4 doesn't need to revisit it.
