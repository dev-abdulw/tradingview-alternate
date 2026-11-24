import { create } from "zustand";
import type { SymbolKey } from "@/lib/market-data/types";

/** "open" = pick a symbol to chart (⌘K); "add" = add to a watchlist (from the panel's +). */
export type SearchMode = "open" | "add";

/** Ephemeral UI state (not persisted): which overlays are open. */
type UiState = {
  searchOpen: boolean;
  searchMode: SearchMode;
  settingsOpen: boolean;
  manageListsOpen: boolean;
  /** Alert dialog: create (no id) or edit (id). */
  alertDraft: { symbol: SymbolKey; price: number | null; id?: string } | null;
  setSearchOpen: (open: boolean, mode?: SearchMode) => void;
  setSettingsOpen: (open: boolean) => void;
  setManageListsOpen: (open: boolean) => void;
  openAlert: (draft: { symbol: SymbolKey; price: number | null; id?: string } | null) => void;
};

export const useUi = create<UiState>()((set) => ({
  searchOpen: false,
  searchMode: "open",
  settingsOpen: false,
  manageListsOpen: false,
  alertDraft: null,
  // Opening without a mode means "open a chart"; closing keeps the mode so the exit animation doesn't flicker.
  setSearchOpen: (searchOpen, mode = "open") =>
    set(searchOpen ? { searchOpen, searchMode: mode } : { searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setManageListsOpen: (manageListsOpen) => set({ manageListsOpen }),
  openAlert: (alertDraft) => set({ alertDraft }),
}));
