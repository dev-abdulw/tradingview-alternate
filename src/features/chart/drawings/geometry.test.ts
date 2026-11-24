import { describe, expect, it } from "vitest";
import { distToSegment, fibPrices, hitTest, logicalToTime, rayEnd, timeToLogical } from "./geometry";

const H = 3600;
const times = [0, H, 2 * H, 3 * H];

describe("time ↔ logical", () => {
  it("maps bar times to indices and interpolates between bars", () => {
    expect(timeToLogical(times, H, 2 * H)).toBe(2);
    expect(timeToLogical(times, H, 1.5 * H)).toBe(1.5);
  });
  it("extrapolates into the future and the past", () => {
    expect(timeToLogical(times, H, 6 * H)).toBe(6);
    expect(timeToLogical(times, H, -2 * H)).toBe(-2);
  });
  it("round-trips", () => {
    for (const t of [0, 1800, 2 * H, 10 * H, -H]) {
      expect(logicalToTime(times, H, timeToLogical(times, H, t)!)).toBe(t);
    }
  });
  it("handles empty data", () => {
    expect(timeToLogical([], H, 0)).toBeNull();
    expect(logicalToTime([], H, 0)).toBeNull();
  });
});

describe("hit testing", () => {
  it("measures distance to a segment, clamped to its ends", () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
  it("prefers handles over the body", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    expect(hitTest({ type: "segment", a, b }, [a, b], { x: 2, y: 1 })).toEqual({ part: "handle", index: 0 });
    expect(hitTest({ type: "segment", a, b }, [a, b], { x: 50, y: 52 })).toEqual({ part: "body" });
    expect(hitTest({ type: "segment", a, b }, [a, b], { x: 50, y: 80 })).toBeNull();
  });
  it("hits horizontal lines anywhere along the width, and rectangles inside", () => {
    expect(hitTest({ type: "hline", y: 40 }, [], { x: 999, y: 44 })).toEqual({ part: "body" });
    expect(hitTest({ type: "rect", a: { x: 10, y: 10 }, b: { x: 50, y: 50 } }, [], { x: 30, y: 30 })).toEqual(
      { part: "body" },
    );
  });
});

describe("ray & fib", () => {
  it("extends a ray to the pane edge", () => {
    expect(rayEnd({ x: 0, y: 0 }, { x: 10, y: 5 }, 100, 1000)).toEqual({ x: 100, y: 50 });
  });
  it("computes Fibonacci retracement prices (0 at the second anchor)", () => {
    const levels = fibPrices({ t: 0, p: 100 }, { t: 1, p: 200 });
    expect(levels.find((l) => l.level === 0)?.price).toBe(200);
    expect(levels.find((l) => l.level === 1)?.price).toBe(100);
    expect(levels.find((l) => l.level === 0.618)?.price).toBeCloseTo(138.2, 6);
  });
});
