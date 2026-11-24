import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";

const MAX = 8;

type Recents = { keys: SymbolKey[]; push: (k: SymbolKey) => void; clear: () => void };

export const useRecents = create<Recents>()(
  persist(
    (set) => ({
      keys: [],
      push: (k) => set((s) => ({ keys: [k, ...s.keys.filter((x) => x !== k)].slice(0, MAX) })),
      clear: () => set({ keys: [] }),
    }),
    {
      name: storageKey("search-recents"),
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      merge: (persisted, current) => {
        const keys = (persisted as { keys?: unknown })?.keys;
        return {
          ...current,
          keys: Array.isArray(keys)
            ? keys.filter((k): k is SymbolKey => typeof k === "string" && isSymbolKey(k)).slice(0, MAX)
            : [],
        };
      },
    },
  ),
);
