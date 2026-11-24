"use client";

import { useMemo } from "react";
import { useSettings } from "@/features/settings/settings-store";
import { useResolvedTheme } from "@/features/settings/use-appearance";
import { blueOrange, themes, type ColorTokens, type ThemeName, type UpDownScheme } from "@/ui/tokens/tokens";
import type { IndicatorColor } from "./indicator-config";

export type ChartColors = {
  background: string;
  text: string;
  textStrong: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabel: string;
  up: string;
  down: string;
  upMuted: string;
  downMuted: string;
  accent: string;
  warning: string;
  /** For drawings & selection. */
  selection: string;
  token: (name: IndicatorColor) => string;
};

/** Chart colors come from the same token source as the CSS — the chart can't drift from the app theme. */
export function chartColors(theme: ThemeName, scheme: UpDownScheme): ChartColors {
  const t: ColorTokens =
    scheme === "blue-orange" ? { ...themes[theme], ...blueOrange[theme] } : themes[theme];
  const map: Record<IndicatorColor, keyof ColorTokens> = {
    accent: "accent",
    warning: "warning",
    "flag-violet": "flag-violet",
    "flag-orange": "flag-orange",
    "flag-green": "flag-green",
    "flag-red": "flag-red",
    "chip-crypto": "chip-crypto",
    "text-secondary": "text-secondary",
  };
  return {
    background: t["bg-panel"],
    text: t["text-secondary"],
    textStrong: t["text-primary"],
    grid: t["chart-grid"],
    border: t["border-subtle"],
    crosshair: t["chart-crosshair"],
    crosshairLabel: t["bg-active"],
    up: t.up,
    down: t.down,
    upMuted: withAlpha(t.up, 0.45),
    downMuted: withAlpha(t.down, 0.45),
    accent: t.accent,
    warning: t.warning,
    selection: t.accent,
    token: (name) => t[map[name]],
  };
}

export function useChartColors(): ChartColors {
  const theme = useResolvedTheme();
  const scheme = useSettings((s) => s.upDown);
  return useMemo(() => chartColors(theme, scheme), [theme, scheme]);
}

/** "#RRGGBB" → "rgba(r,g,b,a)"; passes other formats through. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m?.[1]) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
