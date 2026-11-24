import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "./color";
import { checkContrast } from "./contrast";
import { buildTokensCss } from "./css";
import { blueOrange, themes } from "./tokens";

describe("color math", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio(parseColor("#000"), parseColor("#fff"))).toBeCloseTo(21, 1);
    expect(contrastRatio(parseColor("#777777"), parseColor("#ffffff"))).toBeCloseTo(4.48, 2);
  });

  it("parses rgba", () => {
    expect(parseColor("rgba(46, 189, 133, 0.14)")).toEqual({ r: 46, g: 189, b: 133, a: 0.14 });
  });
});

describe("design tokens", () => {
  it("every declared text/background pair meets WCAG AA", () => {
    const failures = checkContrast().filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });

  it("both themes define the same token set", () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
    expect(Object.keys(blueOrange.light).sort()).toEqual(Object.keys(blueOrange.dark).sort());
  });

  it("generated tokens.css is up to date (run `pnpm tokens`)", () => {
    const onDisk = readFileSync(resolve(__dirname, "../../app/tokens.css"), "utf8");
    expect(onDisk).toBe(buildTokensCss());
  });
});
