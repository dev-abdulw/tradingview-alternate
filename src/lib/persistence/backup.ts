/**
 * Backup & restore for guest mode: with no account, everything lives in this
 * browser, so the user can move it (or keep a copy) as a JSON file.
 * Only user data is exported — caches (instrument lists) are rebuilt anyway.
 */
import { z } from "zod";
import { getKeyValueStore, NAMESPACE, type KeyValueStore } from "./kv";

const CACHE_PREFIXES = [`${NAMESPACE}:instruments:`, `${NAMESPACE}:__probe`];

const isUserKey = (k: string) =>
  k.startsWith(`${NAMESPACE}:`) && !CACHE_PREFIXES.some((p) => k.startsWith(p));

export const backupSchema = z.object({
  app: z.literal("markets"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.record(z.string(), z.string()),
});
export type Backup = z.infer<typeof backupSchema>;

export function createBackup(kv: KeyValueStore = getKeyValueStore(), now = new Date()): Backup {
  const data: Record<string, string> = {};
  for (const k of kv.keys().filter(isUserKey).sort()) {
    const v = kv.get(k);
    if (v !== null) data[k] = v;
  }
  return { app: "markets", version: 1, exportedAt: now.toISOString(), data };
}

export type RestoreResult = { ok: true; keys: number } | { ok: false; error: string };

/**
 * Validates and restores a backup. Existing user data is replaced (not merged)
 * so the result is exactly what was exported. Each store re-validates its own
 * rows on load, so even a hand-edited file can't crash the app.
 */
export function restoreBackup(json: string, kv: KeyValueStore = getKeyValueStore()): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn’t valid JSON." };
  }
  const b = backupSchema.safeParse(parsed);
  if (!b.success) return { ok: false, error: "That file isn’t a Markets backup." };
  const entries = Object.entries(b.data.data).filter(([k]) => isUserKey(k));
  if (entries.length === 0) return { ok: false, error: "The backup is empty." };
  for (const k of kv.keys().filter(isUserKey)) kv.remove(k);
  for (const [k, v] of entries) kv.set(k, v);
  return { ok: true, keys: entries.length };
}

export function downloadBackup(): void {
  const backup = createBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `markets-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
