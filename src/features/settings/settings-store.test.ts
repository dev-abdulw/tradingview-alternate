import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";
import { DEFAULT_SETTINGS, sanitize, useSettings } from "./settings-store";

describe("settings", () => {
  it("keeps valid fields and drops corrupt ones individually", () => {
    expect(
      sanitize({ theme: "light", upDown: "purple", timezone: "UTC", favoriteTimeframes: ["1h", "9y"] }),
    ).toEqual({
      theme: "light",
      timezone: "UTC",
    });
    expect(sanitize(null)).toEqual({});
    expect(sanitize("garbage")).toEqual({});
  });

  it("defaults to dark theme and Asia/Karachi", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("dark");
    expect(DEFAULT_SETTINGS.timezone).toBe("Asia/Karachi");
  });

  it("keeps favorite timeframes in canonical order", () => {
    useSettings.getState().reset();
    useSettings.getState().toggleFavoriteTimeframe("1m");
    useSettings.getState().toggleFavoriteTimeframe("1W");
    expect(useSettings.getState().favoriteTimeframes).toEqual(["1m", "5m", "15m", "1h", "4h", "1D", "1W"]);
    useSettings.getState().toggleFavoriteTimeframe("5m");
    expect(useSettings.getState().favoriteTimeframes).not.toContain("5m");
  });

  it("resolves the system theme", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
});
