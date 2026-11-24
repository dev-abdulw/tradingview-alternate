/**
 * Fractional-index ordering. Every ordered row carries a `position` string
 * key; moving a row means computing one new key between its new neighbours,
 * so a reorder writes a single row (cheap to sync, conflict-friendly).
 */
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** Code-unit comparison — the only correct order for fractional keys. */
export const comparePositions = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function byPosition<T extends { position: string; id: string }>(a: T, b: T): number {
  return comparePositions(a.position, b.position) || comparePositions(a.id, b.id);
}

export function keyAfter(last: string | null | undefined): string {
  return generateKeyBetween(last ?? null, null);
}

export function keysAfter(last: string | null | undefined, n: number): string[] {
  return generateNKeysBetween(last ?? null, null, n);
}

/**
 * Key for moving an item so it lands at `toIndex` in `sorted` (the full,
 * position-sorted sibling list that still contains the moving item).
 */
export function keyForMove<T extends { id: string; position: string }>(
  sorted: readonly T[],
  movingId: string,
  toIndex: number,
): string {
  const others = sorted.filter((x) => x.id !== movingId);
  const clamped = Math.max(0, Math.min(toIndex, others.length));
  const before = others[clamped - 1]?.position ?? null;
  const after = others[clamped]?.position ?? null;
  return generateKeyBetween(before, after);
}
