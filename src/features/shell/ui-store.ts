import { create } from "zustand";

/** "open" = pick a symbol to chart (⌘K); "add" = add to a watchlist (from the panel's +). */
export type SearchMode = "open" | "add";

/** Ephemeral UI state (not persisted): which overlays are open. */
type UiState = {
  searchOpen: boolean;
  searchMode: SearchMode;
  settingsOpen: boolean;
  manageListsOpen: boolean;
  setSearchOpen: (open: boolean, mode?: SearchMode) => void;
  setSettingsOpen: (open: boolean) => void;
  setManageListsOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  searchOpen: false,
  searchMode: "open",
  settingsOpen: false,
  manageListsOpen: false,
  // Opening without a mode means "open a chart"; closing keeps the mode so the exit animation doesn't flicker.
  setSearchOpen: (searchOpen, mode = "open") =>
    set(searchOpen ? { searchOpen, searchMode: mode } : { searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setManageListsOpen: (manageListsOpen) => set({ manageListsOpen }),
}));
