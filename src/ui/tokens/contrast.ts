import { composite, contrastRatio, parseColor, type RGBA } from "./color";
import {
  blueOrange,
  compositeBase,
  contrastRules,
  themes,
  type ColorTokens,
  type ThemeName,
  type UpDownScheme,
} from "./tokens";

export type ContrastResult = {
  theme: ThemeName;
  scheme: UpDownScheme;
  fg: keyof ColorTokens;
  bg: keyof ColorTokens;
  ratio: number;
  min: number;
  pass: boolean;
  note: string;
};

function resolve(tokens: ColorTokens, key: keyof ColorTokens): RGBA {
  const color = parseColor(tokens[key]);
  if (color.a >= 1) return color;
  const baseKey = compositeBase[key] ?? "bg-panel";
  return composite(color, resolve(tokens, baseKey));
}

export function checkContrast(): ContrastResult[] {
  const results: ContrastResult[] = [];
  const schemes: UpDownScheme[] = ["green-red", "blue-orange"];
  for (const theme of Object.keys(themes) as ThemeName[]) {
    for (const scheme of schemes) {
      const tokens: ColorTokens =
        scheme === "green-red" ? themes[theme] : { ...themes[theme], ...blueOrange[theme] };
      for (const rule of contrastRules) {
        // Scheme only changes direction colors; skip re-checking unrelated pairs.
        const isDirection = /^(up|down)/.test(rule.fg) || rule.bg.some((b) => /^(up|down)/.test(b));
        if (scheme === "blue-orange" && !isDirection) continue;
        for (const bg of rule.bg) {
          const fg = resolve(tokens, rule.fg);
          const ratio = contrastRatio(fg, resolve(tokens, bg));
          results.push({
            theme,
            scheme,
            fg: rule.fg,
            bg,
            ratio,
            min: rule.min,
            pass: ratio >= rule.min,
            note: rule.note,
          });
        }
      }
    }
  }
  return results;
}
