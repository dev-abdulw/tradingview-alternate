"use client";

import { createContext, use } from "react";

export type ShellControls = {
  sidebarCollapsed: boolean;
  detailsCollapsed: boolean;
  toggleSidebar: () => void;
  toggleDetails: () => void;
};

export const ShellContext = createContext<ShellControls | null>(null);

export function useShell(): ShellControls {
  const ctx = use(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <Workspace>");
  return ctx;
}

export const SHORTCUTS = {
  search: "mod+k",
  searchAlt: "/",
  toggleSidebar: "alt+KeyW",
  toggleDetails: "alt+KeyI",
  settings: "mod+,",
  shortcuts: "?",
} as const;
