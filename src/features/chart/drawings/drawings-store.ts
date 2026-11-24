import { z } from "zod";
import { create } from "zustand";
import { parseSymbolKey, toSymbolKey } from "@/lib/market-data/symbol-key";
import type { SymbolKey } from "@/lib/market-data/types";
import { LocalCollection, type CollectionRepository } from "@/lib/persistence/collection";
import { newId, nowIso } from "@/lib/persistence/schema";
import { toast } from "@/ui/toast";
import { INDICATOR_COLORS, type IndicatorColor } from "../indicator-config";
import type { Anchor, DrawingType } from "./geometry";

/** Mirrors the `drawings` table: geometry lives in the `data` jsonb column. */
export const drawingRow = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  market: z.string().min(1),
  symbol: z.string().min(1),
  data: z.object({
    type: z.enum(["hline", "trend", "ray", "rect", "fib"]),
    points: z
      .array(z.object({ t: z.number(), p: z.number() }))
      .min(1)
      .max(2),
    color: z.enum(INDICATOR_COLORS),
  }),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DrawingRow = z.infer<typeof drawingRow>;

let repo: CollectionRepository<DrawingRow> = new LocalCollection("drawings", drawingRow);
export function setDrawingRepository(r: CollectionRepository<DrawingRow>) {
  repo = r;
}

type State = {
  rows: Record<string, DrawingRow>;
  selectedId: string | null;
  ready: boolean;
  init(): Promise<void>;
  add(key: SymbolKey, type: DrawingType, points: Anchor[], color?: IndicatorColor): string;
  updatePoints(id: string, points: Anchor[]): void;
  remove(id: string): void;
  removeAll(key: SymbolKey): void;
  select(id: string | null): void;
};

const persistFail = (err: unknown) => toast.error("Couldn’t save drawing", { description: String(err) });

export const useDrawings = create<State>()((set, get) => ({
  rows: {},
  selectedId: null,
  ready: false,

  async init() {
    if (get().ready) return;
    const rows = await repo.load();
    set({ rows: Object.fromEntries(rows.map((r) => [r.id, r])), ready: true });
    repo.subscribe?.(
      () => void repo.load().then((rs) => set({ rows: Object.fromEntries(rs.map((r) => [r.id, r])) })),
    );
  },

  add(key, type, points, color = "accent") {
    const { provider, market, symbol } = parseSymbolKey(key);
    const t = nowIso();
    const row: DrawingRow = {
      id: newId(),
      provider,
      market,
      symbol,
      data: { type, points, color },
      created_at: t,
      updated_at: t,
    };
    set((s) => ({ rows: { ...s.rows, [row.id]: row }, selectedId: row.id }));
    repo.upsert([row]).catch(persistFail);
    return row.id;
  },

  updatePoints(id, points) {
    const r = get().rows[id];
    if (!r) return;
    const row = { ...r, data: { ...r.data, points }, updated_at: nowIso() };
    set((s) => ({ rows: { ...s.rows, [id]: row } }));
    repo.upsert([row]).catch(persistFail);
  },

  remove(id) {
    const r = get().rows[id];
    if (!r) return;
    set((s) => {
      const { [id]: _, ...rest } = s.rows;
      return { rows: rest, selectedId: s.selectedId === id ? null : s.selectedId };
    });
    repo.remove([id]).catch(persistFail);
    toast("Drawing removed", {
      action: {
        label: "Undo",
        onClick: () => {
          set((s) => ({ rows: { ...s.rows, [r.id]: r } }));
          repo.upsert([r]).catch(persistFail);
        },
      },
    });
  },

  removeAll(key) {
    const victims = Object.values(get().rows).filter((r) => toSymbolKey(r) === key);
    if (victims.length === 0) return;
    const ids = new Set(victims.map((r) => r.id));
    set((s) => ({
      rows: Object.fromEntries(Object.entries(s.rows).filter(([id]) => !ids.has(id))),
      selectedId: null,
    }));
    repo.remove([...ids]).catch(persistFail);
    toast(`Removed ${victims.length} drawing${victims.length === 1 ? "" : "s"}`, {
      action: {
        label: "Undo",
        onClick: () => {
          set((s) => ({ rows: { ...s.rows, ...Object.fromEntries(victims.map((r) => [r.id, r])) } }));
          repo.upsert(victims).catch(persistFail);
        },
      },
    });
  },

  select(id) {
    set({ selectedId: id });
  },
}));

export function drawingsFor(rows: Record<string, DrawingRow>, key: SymbolKey): DrawingRow[] {
  return Object.values(rows).filter((r) => toSymbolKey(r) === key);
}
