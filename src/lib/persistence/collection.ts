/**
 * Generic row collection behind an interface (drawings, alerts, …). Local
 * implementation stores a zod-validated array in the KeyValueStore; Phase 5
 * adds a Supabase implementation per table with the same methods.
 */
import type { z } from "zod";
import { getKeyValueStore, storageKey, type KeyValueStore } from "./kv";

export interface CollectionRepository<T extends { id: string }> {
  load(): Promise<T[]>;
  upsert(rows: readonly T[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  subscribe?(onExternalChange: () => void): () => void;
}

export class LocalCollection<T extends { id: string }> implements CollectionRepository<T> {
  private readonly key: string;

  constructor(
    name: string,
    private readonly schema: z.ZodType<T>,
    private readonly kv: () => KeyValueStore = getKeyValueStore,
  ) {
    this.key = storageKey(name);
  }

  private read(): T[] {
    const raw = this.kv().get(this.key);
    if (!raw) return [];
    try {
      const doc = JSON.parse(raw) as { rows?: unknown };
      const rows = Array.isArray(doc.rows) ? doc.rows : [];
      // Row-by-row validation: a corrupt row is dropped, the rest survive.
      return rows.flatMap((r) => {
        const p = this.schema.safeParse(r);
        return p.success ? [p.data] : [];
      });
    } catch {
      return [];
    }
  }

  private write(rows: T[]) {
    this.kv().set(this.key, JSON.stringify({ v: 1, rows }));
  }

  async load(): Promise<T[]> {
    return this.read();
  }

  async upsert(rows: readonly T[]): Promise<void> {
    const map = new Map(this.read().map((r) => [r.id, r]));
    for (const r of rows) map.set(r.id, r);
    this.write([...map.values()]);
  }

  async remove(ids: readonly string[]): Promise<void> {
    const drop = new Set(ids);
    this.write(this.read().filter((r) => !drop.has(r.id)));
  }

  subscribe(onExternalChange: () => void): () => void {
    return this.kv().subscribe?.(this.key, () => onExternalChange()) ?? (() => {});
  }
}
