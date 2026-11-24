import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";

export const COLUMNS = ["last", "change", "changePct", "volume", "signal"] as const;
export type Column = (typeof COLUMNS)[number];
export type SortColumn = "symbol" | Column;
export type Sort = { column: SortColumn; dir: "asc" | "desc" } | null;

export const COLUMN_META: Record<Column, { label: string; short: string; width: number }> = {
  last: { label: "Last price", short: "Last", width: 84 },
  change: { label: "Change", short: "Chg", width: 68 },
  changePct: { label: "Change %", short: "Chg%", width: 62 },
  volume: { label: "Volume (24h)", short: "Vol", width: 56 },
  signal: { label: "Signal (technical)", short: "Sig", width: 40 },
};

type Prefs = {
  activeListId: string | null;
  columns: Record<Column, boolean>;
  sort: Sort;
  /** Which horizon the watchlist Signal column shows. */
  signalHorizon: "intraday" | "swing";
  /** List panel view: the user's watchlists or the auto-built sector groups. */
  panelView: "watchlist" | "sectors";
  setPanelView: (v: "watchlist" | "sectors") => void;
  toggleSignalHorizon: () => void;
  setActiveList: (id: string) => void;
  toggleColumn: (c: Column) => void;
  /** Header click cycles: descending → ascending → off (numbers); asc → desc → off (symbol). */
  cycleSort: (c: SortColumn) => void;
};

export const useWatchlistPrefs = create<Prefs>()(
  persist(
    (set) => ({
      activeListId: null,
      columns: { last: true, change: false, changePct: true, volume: true, signal: false },
      sort: null,
      signalHorizon: "swing",
      panelView: "watchlist",
      setPanelView: (panelView) => set({ panelView }),
      toggleSignalHorizon: () =>
        set((s) => ({ signalHorizon: s.signalHorizon === "swing" ? "intraday" : "swing" })),
      setActiveList: (activeListId) => set({ activeListId }),
      toggleColumn: (c) => set((s) => ({ columns: { ...s.columns, [c]: !s.columns[c] } })),
      cycleSort: (column) =>
        set((s) => {
          if (column === "signal") return {};
          const first = column === "symbol" ? "asc" : "desc";
          const second = first === "asc" ? "desc" : "asc";
          if (s.sort?.column !== column) return { sort: { column, dir: first } };
          if (s.sort.dir === first) return { sort: { column, dir: second } };
          return { sort: null };
        }),
    }),
    {
      name: storageKey("watchlist-prefs"),
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

/** CSS grid template for the visible columns (fixed widths → no horizontal jitter). */
export function gridTemplate(columns: Record<Column, boolean>): string {
  return ["minmax(0,1fr)", ...COLUMNS.filter((c) => columns[c]).map((c) => `${COLUMN_META[c].width}px`)].join(
    " ",
  );
}
