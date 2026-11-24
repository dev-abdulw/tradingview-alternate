/**
 * Key/value persistence seam for client state (settings, layout sizes, …).
 *
 * UI code and stores depend on `KeyValueStore`, never on `localStorage`
 * directly. Phase 5 adds a synced implementation (local cache + Supabase)
 * behind the same interface. Domain data (watchlists, alerts, drawings) gets
 * its own repository interface; this seam is for small preference blobs.
 */
import type { StateStorage } from "zustand/middleware";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Called when another tab (or a sync source) changes `key`. Returns an unsubscribe fn. */
  subscribe?(key: string, onChange: (value: string | null) => void): () => void;
}

export const NAMESPACE = "markets";
export const storageKey = (name: string) => `${NAMESPACE}:${name}`;

/** In-memory store: used on the server and in tests. */
export function createMemoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(seed));
  return {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

/** Browser localStorage; degrades to memory when storage is blocked (private mode, quotas). */
export function createLocalStore(): KeyValueStore {
  if (typeof window === "undefined") return createMemoryStore();
  let storage: Storage;
  try {
    storage = window.localStorage;
    const probe = storageKey("__probe");
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } catch {
    return createMemoryStore();
  }
  return {
    get: (k) => storage.getItem(k),
    set: (k, v) => {
      try {
        storage.setItem(k, v);
      } catch {
        /* quota exceeded — state stays in memory for this session */
      }
    },
    remove: (k) => storage.removeItem(k),
    subscribe: (key, onChange) => {
      const handler = (e: StorageEvent) => {
        if (e.storageArea === storage && e.key === key) onChange(e.newValue);
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}

let active: KeyValueStore | null = null;

/** The app-wide store. Swappable so tests and the sync layer can inject their own. */
export function getKeyValueStore(): KeyValueStore {
  active ??= createLocalStore();
  return active;
}

export function setKeyValueStore(store: KeyValueStore): void {
  active = store;
}

/** Adapter for zustand's `persist` middleware. */
export const zustandStorage: StateStorage = {
  getItem: (name) => getKeyValueStore().get(name),
  setItem: (name, value) => getKeyValueStore().set(name, value),
  removeItem: (name) => getKeyValueStore().remove(name),
};
