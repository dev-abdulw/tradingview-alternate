import { SETTINGS_STORAGE_KEY, type Density, type ThemePref, type UpDownPref } from "./settings-store";

export type ResolvedTheme = "dark" | "light";

export function resolveTheme(pref: ThemePref, prefersLight: boolean): ResolvedTheme {
  if (pref === "system") return prefersLight ? "light" : "dark";
  return pref;
}

export function applyAppearance(
  root: HTMLElement,
  { theme, upDown, density }: { theme: ResolvedTheme; upDown: UpDownPref; density: Density },
): void {
  root.dataset.theme = theme;
  root.dataset.updown = upDown;
  root.dataset.density = density;
}

/**
 * Runs synchronously in <head> before first paint: reads persisted settings
 * and sets data-theme / data-updown / data-density on <html>. Keep it tiny
 * and dependency-free; it is inlined into every HTML response.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s={};var raw=localStorage.getItem(${JSON.stringify(
  SETTINGS_STORAGE_KEY,
)});if(raw){s=(JSON.parse(raw)||{}).state||{}}var t=s.theme;if(t!=="light"&&t!=="dark"){t=t==="system"&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.dataset.theme=t;if(s.upDown==="blue-orange")d.dataset.updown="blue-orange";if(s.density==="compact")d.dataset.density="compact"}catch(e){}})()`;
