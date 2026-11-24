"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyAppearance, resolveTheme, type ResolvedTheme } from "./theme";
import { useSettings } from "./settings-store";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function subscribeSystem(cb: () => void) {
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Whether the OS prefers a light theme; false on the server. */
export function useSystemPrefersLight(): boolean {
  return useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false,
  );
}

export function useResolvedTheme(): ResolvedTheme {
  const pref = useSettings((s) => s.theme);
  return resolveTheme(pref, useSystemPrefersLight());
}

/** Keeps <html> data attributes in sync with settings (the boot script covers first paint). */
export function useAppearanceSync(): void {
  const theme = useResolvedTheme();
  const upDown = useSettings((s) => s.upDown);
  const density = useSettings((s) => s.density);

  useEffect(() => {
    applyAppearance(document.documentElement, { theme, upDown, density });
  }, [theme, upDown, density]);

  // Follow changes made in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === useSettings.persist.getOptions().name) void useSettings.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
