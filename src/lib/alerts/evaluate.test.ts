import { describe, expect, it } from "vitest";
import { defaultCondition, shouldTrigger } from "./evaluate";

describe("shouldTrigger", () => {
  it("above / below trigger on reaching the level", () => {
    expect(shouldTrigger("above", 100, 99, 100)).toBe(true);
    expect(shouldTrigger("above", 100, 99, 99.99)).toBe(false);
    expect(shouldTrigger("below", 100, 101, 100)).toBe(true);
    expect(shouldTrigger("below", 100, 101, 100.01)).toBe(false);
  });

  it("cross triggers in either direction, only on an actual crossing", () => {
    expect(shouldTrigger("cross", 100, 99, 101)).toBe(true);
    expect(shouldTrigger("cross", 100, 101, 99)).toBe(true);
    expect(shouldTrigger("cross", 100, 101, 102)).toBe(false);
    expect(shouldTrigger("cross", 100, 98, 99)).toBe(false);
    expect(shouldTrigger("cross", 100, 99, 100)).toBe(true); // touching counts
  });

  it("cross needs a previous price unless it's exactly at the level", () => {
    expect(shouldTrigger("cross", 100, null, 101)).toBe(false);
    expect(shouldTrigger("cross", 100, null, 100)).toBe(true);
  });

  it("picks the natural condition from where the level sits", () => {
    expect(defaultCondition(110, 100)).toBe("above");
    expect(defaultCondition(90, 100)).toBe("below");
    expect(defaultCondition(90, null)).toBe("cross");
  });
});
