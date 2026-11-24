import { create } from "zustand";

/** Ephemeral UI state (not persisted): which overlays are open. */
type UiState = {
  searchOpen: boolean;
  settingsOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  searchOpen: false,
  settingsOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
