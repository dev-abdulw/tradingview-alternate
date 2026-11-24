import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("sectors view: top coins per Binance sector with live change, copy to a watchlist", async ({ page }) => {
  await openApp(page);
  await page.getByRole("radio", { name: "Sectors" }).click();
  const sectors = page.getByRole("list", { name: "Sectors" });
  const layer1 = sectors.getByRole("listitem", { name: "Layer 1" });
  await expect(layer1).toBeVisible({ timeout: 60_000 });
  const rows = layer1.locator("li");
  expect(await rows.count()).toBeGreaterThan(0);
  expect(await rows.count()).toBeLessThanOrEqual(10);
  await expect(rows.first()).toContainText(/%/, { timeout: 20_000 });
  await expect(sectors.getByRole("listitem", { name: "US stocks" })).toBeVisible();

  await page.getByRole("button", { name: "Copy AI to a new watchlist" }).click();
  await expect(page.getByRole("radio", { name: "Watchlist" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /^Watchlist: AI\./ })).toBeVisible();
});
