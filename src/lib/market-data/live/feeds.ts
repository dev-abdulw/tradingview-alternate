/** App-wide live feeds (one per data kind), keyed by SymbolKey. */
import { marketId, parseSymbolKey } from "../symbol-key";
import { getProvider, providerForKey } from "../registry";
import type { MarkPrice, Ticker } from "../types";
import { LiveFeed } from "./live-store";

/**
 * Coalesces newly watched symbols per market for a short window, then fetches
 * one batched REST snapshot. Prices appear immediately instead of waiting for
 * the first stream push (which can take seconds, or longer for thin markets
 * whose @ticker only pushes on change).
 */
class SnapshotSeeder {
  private pending = new Map<string, Set<string>>(); // marketId → symbols
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly push: (t: Ticker) => void,
    private readonly pushDayOpen: (key: string, open: number) => void,
    private readonly delayMs = 30,
  ) {}

  request(key: string): void {
    const ref = parseSymbolKey(key);
    const id = marketId(ref);
    let set = this.pending.get(id);
    if (!set) {
      set = new Set();
      this.pending.set(id, set);
    }
    set.add(ref.symbol);
    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }

  private flush(): void {
    this.timer = null;
    const batches = this.pending;
    this.pending = new Map();
    for (const [id, symbols] of batches) {
      const provider = getProvider(id);
      provider
        .getTickers([...symbols])
        .then((ts) => ts.forEach(this.push))
        .catch(() => {
          /* the stream will fill in; a failed snapshot isn't worth surfacing */
        });
      provider
        .getDayOpens?.([...symbols])
        .then((opens) => opens.forEach((open, symbol) => this.pushDayOpen(`${id}:${symbol}`, open)))
        .catch(() => {
          /* the 1D kline stream fills it in */
        });
    }
  }
}

/**
 * Daily opens (00:00 UTC) per symbol — TradingView's change reference. Seeded by
 * the snapshot, then kept current by the 1D kline stream, which also rolls it
 * over automatically when a new day starts.
 */
const dayOpens = new Map<string, number>();

function setDayOpen(key: string, open: number) {
  if (dayOpens.get(key) === open) return;
  dayOpens.set(key, open);
  const current = tickerFeed.store.get(key);
  if (current && tickerFeed.refCount(key) > 0) tickerFeed.store.set(key, { ...current, dayOpen: open });
}

export const tickerFeed: LiveFeed<Ticker> = new LiveFeed<Ticker>((key, push) => {
  const { provider, symbol } = providerForKey(key);
  seeder.request(key);
  const offTicker = provider.subscribeTicker(symbol, (t) => push({ ...t, dayOpen: dayOpens.get(key) }));
  const offDay = provider.subscribeKlines(symbol, "1D", (k) => setDayOpen(key, k.open));
  return () => {
    offTicker();
    offDay();
  };
});

const seeder = new SnapshotSeeder((t) => {
  // Never let a (slower) snapshot overwrite a newer streamed value, and only seed watched keys.
  if (tickerFeed.refCount(t.key) === 0) return;
  const current = tickerFeed.store.get(t.key);
  if (!current || current.eventTime < t.eventTime)
    tickerFeed.store.set(t.key, { ...t, dayOpen: dayOpens.get(t.key) });
}, setDayOpen);

export const markPriceFeed: LiveFeed<MarkPrice> = new LiveFeed<MarkPrice>((key, push) => {
  const { provider, symbol } = providerForKey(key);
  if (!provider.subscribeMarkPrice) return () => {};
  // Seed from REST so funding shows immediately rather than after the first 1s tick.
  const ctrl = new AbortController();
  provider
    .getMarkPrice?.(symbol, { signal: ctrl.signal })
    .then((m) => {
      const current = markPriceFeed.store.get(key);
      if (!current || current.eventTime < m.eventTime) push(m);
    })
    .catch(() => {});
  const off = provider.subscribeMarkPrice(symbol, push);
  return () => {
    ctrl.abort();
    off();
  };
});
