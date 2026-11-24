import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("no serious or critical accessibility violations", async ({ page }) => {
  await openApp(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    // Canvas charts are exposed through the legend and labelled container; axe can't inspect canvas pixels.
    .exclude('[data-testid="chart-canvas"]')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    ),
  ).toEqual([]);
});

test("keyboard shortcut sheet opens with ?", async ({ page }) => {
  await openApp(page);
  await page.locator("body").press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});
