import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storageKey, zustandStorage } from "@/lib/persistence/kv";

export const THEME_PREFS = ["dark", "light", "system"] as const;
export const UPDOWN_SCHEMES = ["green-red", "blue-orange"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const NUMBER_FORMATS = ["en-US", "de-DE", "fr-FR", "en-IN"] as const;
export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"] as const;

export type ThemePref = (typeof THEME_PREFS)[number];
export type UpDownPref = (typeof UPDOWN_SCHEMES)[number];
export type Density = (typeof DENSITIES)[number];
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];

export const settingsSchema = z.object({
  theme: z.enum(THEME_PREFS),
  upDown: z.enum(UPDOWN_SCHEMES),
  density: z.enum(DENSITIES),
  timezone: z.string().min(1),
  numberFormat: z.enum(NUMBER_FORMATS),
  defaultTimeframe: z.enum(TIMEFRAMES),
  favoriteTimeframes: z.array(z.enum(TIMEFRAMES)),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  upDown: "green-red",
  density: "comfortable",
  timezone: "Asia/Karachi",
  numberFormat: "en-US",
  defaultTimeframe: "1h",
  favoriteTimeframes: ["5m", "15m", "1h", "4h", "1D"],
};

type SettingsActions = {
  update: (patch: Partial<Settings>) => void;
  toggleFavoriteTimeframe: (tf: Timeframe) => void;
  reset: () => void;
};

export const SETTINGS_STORAGE_KEY = storageKey("settings");

/**
 * Settings persist through the KeyValueStore seam. Persisted data is validated
 * field-by-field, so one corrupt value never resets the user's other choices.
 */
export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      toggleFavoriteTimeframe: (tf) =>
        set((s) => {
          const has = s.favoriteTimeframes.includes(tf);
          const next = has ? s.favoriteTimeframes.filter((t) => t !== tf) : [...s.favoriteTimeframes, tf];
          return { favoriteTimeframes: TIMEFRAMES.filter((t) => next.includes(t)) };
        }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s): Settings => settingsSchema.parse(pickSettings(s)),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);

function pickSettings(s: Settings): Settings {
  const out = {} as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) out[key] = s[key];
  return out as Settings;
}

export function sanitize(input: unknown): Partial<Settings> {
  if (typeof input !== "object" || input === null) return {};
  const out: Partial<Settings> = {};
  const shape = settingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const parsed = shape[key].safeParse((input as Record<string, unknown>)[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}
