import { z } from "zod";
import { create } from "zustand";
import type { AlertCondition } from "@/lib/alerts/evaluate";
import { parseSymbolKey, toSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { LocalCollection, type CollectionRepository } from "@/lib/persistence/collection";
import { newId, nowIso } from "@/lib/persistence/schema";
import { toast } from "@/ui/toast";

/** Mirrors the `alerts` table so a server-side worker can evaluate the same rows later. */
export const alertRow = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  market: z.string().min(1),
  symbol: z.string().min(1),
  condition: z.enum(["above", "below", "cross"]),
  price: z.number().positive(),
  active: z.boolean(),
  triggered_at: z.string().nullable(),
  note: z.string().max(140).nullable(),
  created_at: z.string(),
});
export type AlertRow = z.infer<typeof alertRow>;

let repo: CollectionRepository<AlertRow> = new LocalCollection("alerts", alertRow);
export function setAlertRepository(r: CollectionRepository<AlertRow>) {
  repo = r;
}

type State = {
  rows: Record<string, AlertRow>;
  ready: boolean;
  init(): Promise<void>;
  create(key: SymbolKey, condition: AlertCondition, price: number, note?: string): string;
  update(id: string, patch: Partial<Pick<AlertRow, "condition" | "price" | "note" | "active">>): void;
  remove(id: string): void;
  markTriggered(id: string): void;
};

const fail = (err: unknown) => toast.error("Couldn’t save alert", { description: String(err) });

export const useAlerts = create<State>()((set, get) => ({
  rows: {},
  ready: false,

  async init() {
    if (get().ready) return;
    const rows = await repo.load();
    set({ rows: Object.fromEntries(rows.map((r) => [r.id, r])), ready: true });
    repo.subscribe?.(
      () => void repo.load().then((rs) => set({ rows: Object.fromEntries(rs.map((r) => [r.id, r])) })),
    );
  },

  create(key, condition, price, note) {
    const { provider, market, symbol } = parseSymbolKey(key);
    const row: AlertRow = {
      id: newId(),
      provider,
      market,
      symbol,
      condition,
      price,
      active: true,
      triggered_at: null,
      note: note?.trim() ? note.trim().slice(0, 140) : null,
      created_at: nowIso(),
    };
    set((s) => ({ rows: { ...s.rows, [row.id]: row } }));
    repo.upsert([row]).catch(fail);
    return row.id;
  },

  update(id, patch) {
    const r = get().rows[id];
    if (!r) return;
    // Re-arming a triggered alert clears its trigger time.
    const row = { ...r, ...patch, triggered_at: patch.active ? null : r.triggered_at };
    set((s) => ({ rows: { ...s.rows, [id]: row } }));
    repo.upsert([row]).catch(fail);
  },

  remove(id) {
    const r = get().rows[id];
    if (!r) return;
    set((s) => {
      const { [id]: _, ...rest } = s.rows;
      return { rows: rest };
    });
    repo.remove([id]).catch(fail);
    toast("Alert deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          set((s) => ({ rows: { ...s.rows, [r.id]: r } }));
          repo.upsert([r]).catch(fail);
        },
      },
    });
  },

  markTriggered(id) {
    const r = get().rows[id];
    if (!r || !r.active) return;
    const row = { ...r, active: false, triggered_at: nowIso() };
    set((s) => ({ rows: { ...s.rows, [id]: row } }));
    repo.upsert([row]).catch(fail);
  },
}));

export const alertKey = (a: AlertRow): SymbolKey => toSymbolKey(a);
