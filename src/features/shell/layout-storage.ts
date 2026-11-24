import type { LayoutStorage } from "react-resizable-panels";
import { getKeyValueStore, storageKey } from "@/lib/persistence/kv";

/**
 * Panel sizes persist through the KeyValueStore seam, so they follow the user
 * once settings sync lands (Phase 5) without touching layout code.
 */
export const layoutStorage: LayoutStorage = {
  getItem: (key) => getKeyValueStore().get(storageKey(`layout:${key}`)),
  setItem: (key, value) => getKeyValueStore().set(storageKey(`layout:${key}`), value),
};
