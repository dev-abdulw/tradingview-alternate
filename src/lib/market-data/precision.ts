/** Precision & number formatting driven by each instrument's tick/step size — never a generic 2 decimals. */

/** "0.01000000" → 2, "1.00000000" → 0, "0.00000001" → 8, "1e-8" → 8. */
export function decimalsFromStep(step: string): number {
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 2;
  if (/e-/i.test(step)) return Number(step.split(/e-/i)[1]);
  const trimmed = step.includes(".") ? step.replace(/0+$/, "") : step;
  const dot = trimmed.indexOf(".");
  return dot === -1 ? 0 : trimmed.length - dot - 1;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = `${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(id);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(id, f);
  }
  return f;
}

/** Price at a fixed precision. Fixed precision is what keeps tabular columns from jittering. */
export function formatPrice(value: number, decimals: number, locale = "en-US"): string {
  return formatter(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    value,
  );
}

/** Signed percentage, e.g. "+1.23%" / "−0.87%" (true minus sign). */
export function formatPercent(value: number, locale = "en-US", decimals = 2): string {
  const abs = formatter(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    Math.abs(value),
  );
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

/** Signed change at instrument precision. */
export function formatChange(value: number, decimals: number, locale = "en-US"): string {
  const abs = formatPrice(Math.abs(value), decimals, locale);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

/** Compact volume: 1.23K, 45.6M, 7.89B. */
export function formatVolume(value: number, locale = "en-US"): string {
  return formatter(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

/** Funding rate fraction → "0.0111%" (4 decimals, as exchanges display it). */
export function formatFundingRate(rate: number, locale = "en-US"): string {
  return formatPercent(rate * 100, locale, 4);
}
