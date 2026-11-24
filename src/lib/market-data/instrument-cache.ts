/**
 * Caches parsed instruments per market (memory + KeyValueStore, 6h TTL).
 * Raw exchangeInfo is megabytes; the compact Instrument list is ~200KB and
 * makes search instant on reload. Stale data is served if a refresh fails.
 */
import { getKeyValueStore, storageKey } from "@/lib/persistence/kv";
import type { Instrument } from "./types";

/** Bump whenever classification or the Instrument shape changes, so cached lists are rebuilt. */
const VERSION = 2;
export const INSTRUMENT_TTL_MS = 6 * 60 * 60 * 1000;

type Entry = { v: number; fetchedAt: number; items: Instrument[] };

export class InstrumentCache {
  private memory: Entry | null = null;
  private inflight: Promise<Instrument[]> | null = null;

  constructor(
    private readonly id: string,
    private readonly load: (signal?: AbortSignal) => Promise<Instrument[]>,
    private readonly now: () => number = Date.now,
  ) {}

  private get key() {
    return storageKey(`instruments:${this.id}`);
  }

  private read(): Entry | null {
    if (this.memory) return this.memory;
    const raw = getKeyValueStore().get(this.key);
    if (!raw) return null;
    try {
      const e = JSON.parse(raw) as Entry;
      if (e.v !== VERSION || !Array.isArray(e.items)) return null;
      this.memory = e;
      return e;
    } catch {
      return null;
    }
  }

  async get({ signal, force = false }: { signal?: AbortSignal; force?: boolean } = {}): Promise<
    Instrument[]
  > {
    const cached = this.read();
    if (!force && cached && this.now() - cached.fetchedAt < INSTRUMENT_TTL_MS) return cached.items;
    this.inflight ??= this.load(signal)
      .then((items) => {
        const entry: Entry = { v: VERSION, fetchedAt: this.now(), items };
        this.memory = entry;
        getKeyValueStore().set(this.key, JSON.stringify(entry));
        return items;
      })
      .catch((err: unknown) => {
        if (cached) return cached.items; // serve stale rather than fail
        throw err;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Synchronous peek (for render paths that can show nothing until loaded). */
  peek(): Instrument[] | null {
    return this.read()?.items ?? null;
  }

  fetchedAt(): number | null {
    return this.read()?.fetchedAt ?? null;
  }
}
