/**
 * Keyed latest-value store with frame-batched, per-key throttled notifications.
 *
 * Writes are cheap (a Map set). Listeners for a key are notified at most once
 * per animation frame and no more than once per `minIntervalMs` (default
 * 100ms → ≤10 updates/s per row), always with the latest value. This keeps a
 * 200-row watchlist rendering smoothly when hundreds of ticks arrive per second.
 */
type Listener = () => void;

export type FrameScheduler = {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
};

const defaultScheduler: FrameScheduler =
  typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
    ? { request: (cb) => window.requestAnimationFrame(cb), cancel: (id) => window.cancelAnimationFrame(id) }
    : {
        request: (cb) => setTimeout(cb, 16) as unknown as number,
        cancel: (id) => clearTimeout(id),
      };

export class LiveStore<T> {
  private readonly values = new Map<string, T>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly dirty = new Set<string>();
  private readonly lastNotified = new Map<string, number>();
  private frame: number | null = null;

  constructor(
    private readonly minIntervalMs = 100,
    private readonly scheduler: FrameScheduler = defaultScheduler,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get(key: string): T | undefined {
    return this.values.get(key);
  }

  set(key: string, value: T): void {
    this.values.set(key, value);
    if (!this.listeners.has(key)) return;
    this.dirty.add(key);
    this.schedule();
  }

  delete(key: string): void {
    this.values.delete(key);
    this.dirty.delete(key);
    this.lastNotified.delete(key);
  }

  subscribe(key: string, listener: Listener): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(key);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(key);
    };
  }

  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = this.scheduler.request(() => this.flush());
  }

  private flush(): void {
    this.frame = null;
    const t = this.now();
    let pending = false;
    for (const key of [...this.dirty]) {
      const last = this.lastNotified.get(key) ?? -Infinity;
      if (t - last < this.minIntervalMs) {
        pending = true; // throttled — keep dirty, retry next frame
        continue;
      }
      this.dirty.delete(key);
      this.lastNotified.set(key, t);
      const ls = this.listeners.get(key);
      if (ls) for (const l of [...ls]) l();
    }
    if (pending) this.schedule();
  }
}

/**
 * Ref-counted feed: the first `retain(key)` opens the upstream subscription,
 * the last release closes it. Values land in a LiveStore.
 */
export class LiveFeed<T> {
  readonly store: LiveStore<T>;
  private readonly refs = new Map<string, { count: number; close: () => void }>();

  constructor(
    private readonly open: (key: string, push: (value: T) => void) => () => void,
    store?: LiveStore<T>,
  ) {
    this.store = store ?? new LiveStore<T>();
  }

  retain(key: string): () => void {
    const existing = this.refs.get(key);
    if (existing) existing.count += 1;
    else this.refs.set(key, { count: 1, close: this.open(key, (v) => this.store.set(key, v)) });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const r = this.refs.get(key);
      if (!r) return;
      r.count -= 1;
      if (r.count === 0) {
        r.close();
        this.refs.delete(key);
      }
    };
  }

  refCount(key: string): number {
    return this.refs.get(key)?.count ?? 0;
  }
}
