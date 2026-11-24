/**
 * Design tokens — the single source of truth for every color in the app.
 *
 * `pnpm tokens` generates `src/app/tokens.css` from this file, and
 * `pnpm contrast` checks every text/background pair below against WCAG AA.
 * Components never reference hex values; they use the Tailwind utilities
 * mapped from these variables (see `src/app/globals.css`).
 */

export type ThemeName = "dark" | "light";
export type UpDownScheme = "green-red" | "blue-orange";

export type ColorTokens = {
  /* Surfaces — separated by small luminance steps, not borders */
  "bg-app": string;
  "bg-panel": string;
  "bg-elevated": string;
  "bg-hover": string;
  "bg-active": string;
  "bg-input": string;
  /* Lines */
  "border-subtle": string;
  "border-strong": string;
  /* Text */
  "text-primary": string;
  "text-secondary": string;
  "text-tertiary": string;
  "text-disabled": string;
  /* Interactive accent */
  accent: string; // focus rings, selection, accent text
  "accent-solid": string; // filled primary buttons
  "accent-solid-hover": string;
  "on-accent": string; // text on accent-solid
  "accent-muted": string; // selection backgrounds
  /* Direction */
  up: string;
  down: string;
  "up-muted": string;
  "down-muted": string;
  /* Alerts & warnings */
  warning: string; // alert text & icons
  "warning-solid": string; // alert fills (badges, markers)
  "warning-muted": string;
  "on-warning": string;
  danger: string; // destructive actions (shares hue with `down`, but never swaps)
  "danger-muted": string;
  /* Asset-class chips */
  "chip-crypto": string;
  "chip-crypto-bg": string;
  "chip-metal": string;
  "chip-metal-bg": string;
  "chip-stock": string;
  "chip-stock-bg": string;
  /* Watchlist flags (non-text marks) */
  "flag-red": string;
  "flag-orange": string;
  "flag-green": string;
  "flag-blue": string;
  "flag-violet": string;
  /* Chart */
  "chart-grid": string;
  "chart-crosshair": string;
  /* Overlays */
  scrim: string;
  "shadow-color": string;
};

export type UpDownTokens = Pick<ColorTokens, "up" | "down" | "up-muted" | "down-muted">;

export const themes: Record<ThemeName, ColorTokens> = {
  dark: {
    "bg-app": "#0B0E14",
    "bg-panel": "#11151C",
    "bg-elevated": "#161B24",
    "bg-hover": "#1C2230",
    "bg-active": "#222A3A",
    "bg-input": "#0E1218",

    "border-subtle": "#1E2430",
    "border-strong": "#2A3242",

    "text-primary": "#E6E9EF",
    "text-secondary": "#9AA3B2",
    "text-tertiary": "#8791A3",
    "text-disabled": "#4A5262",

    accent: "#5B97F7",
    "accent-solid": "#2F6FE4",
    "accent-solid-hover": "#2862D0",
    "on-accent": "#FFFFFF",
    "accent-muted": "rgba(91, 151, 247, 0.16)",

    up: "#2EBD85",
    down: "#FF5B6E",
    "up-muted": "rgba(46, 189, 133, 0.14)",
    "down-muted": "rgba(255, 91, 110, 0.13)",

    warning: "#F0B90B",
    "warning-solid": "#F0B90B",
    "warning-muted": "rgba(240, 185, 11, 0.14)",
    "on-warning": "#14110A",
    danger: "#FF5B6E",
    "danger-muted": "rgba(255, 91, 110, 0.13)",

    "chip-crypto": "#8DB4F8",
    "chip-crypto-bg": "rgba(76, 141, 246, 0.12)",
    "chip-metal": "#D9B75A",
    "chip-metal-bg": "rgba(212, 167, 44, 0.12)",
    "chip-stock": "#B9A4F2",
    "chip-stock-bg": "rgba(150, 120, 230, 0.13)",

    "flag-red": "#F25C6E",
    "flag-orange": "#F08C3A",
    "flag-green": "#3FBF7F",
    "flag-blue": "#4C8DF6",
    "flag-violet": "#A77BF3",

    "chart-grid": "rgba(255, 255, 255, 0.045)",
    "chart-crosshair": "rgba(154, 163, 178, 0.55)",

    scrim: "rgba(3, 5, 9, 0.62)",
    "shadow-color": "rgba(0, 0, 0, 0.45)",
  },
  light: {
    "bg-app": "#F7F8FA",
    "bg-panel": "#FFFFFF",
    "bg-elevated": "#FFFFFF",
    "bg-hover": "#F0F2F5",
    "bg-active": "#E9EEF8",
    "bg-input": "#F4F5F8",

    "border-subtle": "#E6E9EE",
    "border-strong": "#D3D8E0",

    "text-primary": "#0F1419",
    "text-secondary": "#4A5363",
    "text-tertiary": "#5F6878",
    "text-disabled": "#A9B0BC",

    accent: "#1F63D6",
    "accent-solid": "#1F63D6",
    "accent-solid-hover": "#1956C0",
    "on-accent": "#FFFFFF",
    "accent-muted": "rgba(31, 99, 214, 0.10)",

    up: "#077A55",
    down: "#C8243E",
    "up-muted": "rgba(7, 122, 85, 0.10)",
    "down-muted": "rgba(200, 36, 62, 0.09)",

    warning: "#8F6500",
    "warning-solid": "#F0B90B",
    "warning-muted": "rgba(240, 185, 11, 0.16)",
    "on-warning": "#14110A",
    danger: "#C8243E",
    "danger-muted": "rgba(200, 36, 62, 0.09)",

    "chip-crypto": "#1F5BC4",
    "chip-crypto-bg": "rgba(31, 99, 214, 0.08)",
    "chip-metal": "#7D5D00",
    "chip-metal-bg": "rgba(212, 167, 44, 0.14)",
    "chip-stock": "#6440C9",
    "chip-stock-bg": "rgba(120, 80, 220, 0.08)",

    "flag-red": "#D62F48",
    "flag-orange": "#D9690F",
    "flag-green": "#178A51",
    "flag-blue": "#2766D9",
    "flag-violet": "#7C4FD6",

    "chart-grid": "rgba(15, 20, 25, 0.05)",
    "chart-crosshair": "rgba(74, 83, 99, 0.5)",

    scrim: "rgba(15, 20, 25, 0.32)",
    "shadow-color": "rgba(15, 20, 25, 0.10)",
  },
};

/** Colorblind-safe direction colors (deuteranopia/protanopia friendly). */
export const blueOrange: Record<ThemeName, UpDownTokens> = {
  dark: {
    up: "#4C93F8",
    down: "#F0883E",
    "up-muted": "rgba(76, 147, 248, 0.15)",
    "down-muted": "rgba(240, 136, 62, 0.15)",
  },
  light: {
    up: "#1A62D0",
    down: "#B04A00",
    "up-muted": "rgba(26, 98, 208, 0.10)",
    "down-muted": "rgba(176, 74, 0, 0.10)",
  },
};

/** Text/background pairs that must meet a minimum contrast ratio. */
export type ContrastRule = {
  fg: keyof ColorTokens;
  bg: (keyof ColorTokens)[];
  min: number;
  /** Why this threshold applies; printed by the checker. */
  note: string;
};

const SURFACES: (keyof ColorTokens)[] = [
  "bg-app",
  "bg-panel",
  "bg-elevated",
  "bg-hover",
  "bg-active",
  "bg-input",
];

export const contrastRules: ContrastRule[] = [
  { fg: "text-primary", bg: SURFACES, min: 4.5, note: "body text" },
  { fg: "text-secondary", bg: SURFACES, min: 4.5, note: "secondary text" },
  { fg: "text-tertiary", bg: SURFACES, min: 4.5, note: "11px meta labels" },
  { fg: "accent", bg: SURFACES, min: 4.5, note: "accent text & links" },
  { fg: "accent", bg: ["bg-app", "bg-panel", "bg-elevated"], min: 3, note: "focus ring (non-text)" },
  { fg: "on-accent", bg: ["accent-solid", "accent-solid-hover"], min: 4.5, note: "primary button" },
  { fg: "accent", bg: ["accent-muted"], min: 4.5, note: "selected item text" },
  { fg: "text-primary", bg: ["accent-muted"], min: 4.5, note: "text on selection" },
  { fg: "up", bg: SURFACES, min: 4.5, note: "positive change" },
  { fg: "down", bg: SURFACES, min: 4.5, note: "negative change" },
  { fg: "up", bg: ["up-muted"], min: 4.5, note: "tick flash (up)" },
  { fg: "down", bg: ["down-muted"], min: 4.5, note: "tick flash (down)" },
  { fg: "text-primary", bg: ["up-muted", "down-muted"], min: 4.5, note: "price during flash" },
  { fg: "warning", bg: ["bg-app", "bg-panel", "bg-elevated", "warning-muted"], min: 4.5, note: "alert text" },
  { fg: "on-warning", bg: ["warning-solid"], min: 4.5, note: "text on warning fill" },
  { fg: "danger", bg: ["bg-panel", "bg-elevated", "danger-muted"], min: 4.5, note: "destructive text" },
  { fg: "chip-crypto", bg: ["chip-crypto-bg"], min: 4.5, note: "asset chip" },
  { fg: "chip-metal", bg: ["chip-metal-bg"], min: 4.5, note: "asset chip" },
  { fg: "chip-stock", bg: ["chip-stock-bg"], min: 4.5, note: "asset chip" },
  ...(["flag-red", "flag-orange", "flag-green", "flag-blue", "flag-violet"] as const).map(
    (fg): ContrastRule => ({
      fg,
      bg: ["bg-panel", "bg-hover", "bg-active"],
      min: 3,
      note: "flag mark (non-text)",
    }),
  ),
];

/**
 * Background each translucent token is composited over when measuring contrast.
 * (A muted color only has a contrast ratio once it sits on a real surface.)
 */
export const compositeBase: Partial<Record<keyof ColorTokens, keyof ColorTokens>> = {
  "accent-muted": "bg-panel",
  "up-muted": "bg-panel",
  "down-muted": "bg-panel",
  "warning-muted": "bg-elevated",
  "danger-muted": "bg-elevated",
  "chip-crypto-bg": "bg-panel",
  "chip-metal-bg": "bg-panel",
  "chip-stock-bg": "bg-panel",
};

/** Non-color tokens. */
export const radii = { control: "6px", popover: "8px", dialog: "12px" } as const;
export const motion = {
  fast: "120ms",
  base: "160ms",
  slow: "200ms",
  flash: "400ms",
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
