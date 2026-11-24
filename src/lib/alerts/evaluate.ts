/**
 * Alert evaluation — pure and dependency-free so the same function can run in
 * the browser today and in a server-side worker later.
 */
export type AlertCondition = "above" | "below" | "cross";

/**
 * - above: the price is at or above the level
 * - below: the price is at or below the level
 * - cross: the price moved from one side of the level to the other (or touched it)
 * `prev` is the previous observed price (null for the first observation).
 */
export function shouldTrigger(
  condition: AlertCondition,
  level: number,
  prev: number | null,
  last: number,
): boolean {
  switch (condition) {
    case "above":
      return last >= level;
    case "below":
      return last <= level;
    case "cross":
      if (prev === null) return last === level;
      return (prev < level && last >= level) || (prev > level && last <= level);
  }
}

/** The natural condition for a level relative to the current price (used when creating from the chart). */
export function defaultCondition(level: number, current: number | null): AlertCondition {
  if (current === null) return "cross";
  return level >= current ? "above" : "below";
}

export function describeCondition(condition: AlertCondition): string {
  return condition === "above" ? "rises to" : condition === "below" ? "falls to" : "crosses";
}
