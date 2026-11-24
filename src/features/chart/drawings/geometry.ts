/**
 * Pure geometry for chart drawings: time ↔ logical-index mapping (works past
 * the last bar, where the chart has no timestamps) and hit testing.
 */

export type DrawingType = "hline" | "trend" | "ray" | "rect" | "fib";
/** A drawing anchor: time in seconds (UTC), price in quote units. */
export type Anchor = { t: number; p: number };

export const POINTS_NEEDED: Record<DrawingType, 1 | 2> = { hline: 1, trend: 2, ray: 2, rect: 2, fib: 2 };
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/**
 * Logical (fractional bar index) for a time. Inside the data it interpolates
 * between bars; beyond either end it extrapolates with the bar interval.
 * `times` are bar open times in seconds, ascending.
 */
export function timeToLogical(times: readonly number[], intervalSec: number, t: number): number | null {
  const n = times.length;
  if (n === 0 || intervalSec <= 0) return null;
  const first = times[0]!;
  const last = times[n - 1]!;
  if (t >= last) return n - 1 + (t - last) / intervalSec;
  if (t <= first) return (t - first) / intervalSec;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const a = times[lo]!;
  const b = times[hi]!;
  return lo + (b === a ? 0 : (t - a) / (b - a));
}

export function logicalToTime(times: readonly number[], intervalSec: number, logical: number): number | null {
  const n = times.length;
  if (n === 0 || intervalSec <= 0) return null;
  if (logical >= n - 1) return Math.round(times[n - 1]! + (logical - (n - 1)) * intervalSec);
  if (logical <= 0) return Math.round(times[0]! + logical * intervalSec);
  const i = Math.floor(logical);
  const a = times[i]!;
  const b = times[i + 1]!;
  return Math.round(a + (logical - i) * (b - a));
}

export type Pt = { x: number; y: number };

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/** Ray from a through b, clipped to a box of width `w` (extends to the right/left edge). */
export function rayEnd(a: Pt, b: Pt, w: number, h: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  const ts = [
    dx > 0 ? (w - a.x) / dx : dx < 0 ? -a.x / dx : Infinity,
    dy > 0 ? (h - a.y) / dy : dy < 0 ? -a.y / dy : Infinity,
  ].filter((t) => t > 0);
  const t = Math.max(1, Math.min(...ts, 1e6));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function fibPrices(a: Anchor, b: Anchor): { level: number; price: number }[] {
  // TradingView convention: level 0 at the second point, 1 at the first.
  return FIB_LEVELS.map((level) => ({ level, price: b.p + (a.p - b.p) * level }));
}

export type HitShape =
  | { type: "hline"; y: number }
  | { type: "segment"; a: Pt; b: Pt }
  | { type: "rect"; a: Pt; b: Pt }
  | { type: "fib"; a: Pt; b: Pt; ys: number[] };

/** Hit test in pixels. Returns "handle-<i>" when near an anchor, "body" when on the shape, or null. */
export function hitTest(
  shape: HitShape,
  anchors: Pt[],
  p: Pt,
  tol = 6,
): { part: "body" } | { part: "handle"; index: number } | null {
  for (let i = 0; i < anchors.length; i++) {
    if (Math.hypot(p.x - anchors[i]!.x, p.y - anchors[i]!.y) <= tol + 2) return { part: "handle", index: i };
  }
  switch (shape.type) {
    case "hline":
      return Math.abs(p.y - shape.y) <= tol ? { part: "body" } : null;
    case "segment":
      return distToSegment(p, shape.a, shape.b) <= tol ? { part: "body" } : null;
    case "rect": {
      const x0 = Math.min(shape.a.x, shape.b.x);
      const x1 = Math.max(shape.a.x, shape.b.x);
      const y0 = Math.min(shape.a.y, shape.b.y);
      const y1 = Math.max(shape.a.y, shape.b.y);
      const inside = p.x >= x0 - tol && p.x <= x1 + tol && p.y >= y0 - tol && p.y <= y1 + tol;
      return inside ? { part: "body" } : null;
    }
    case "fib": {
      const x0 = Math.min(shape.a.x, shape.b.x) - tol;
      const x1 = Math.max(shape.a.x, shape.b.x) + tol;
      if (p.x < x0 || p.x > x1) return null;
      return shape.ys.some((y) => Math.abs(p.y - y) <= tol) ? { part: "body" } : null;
    }
  }
}
