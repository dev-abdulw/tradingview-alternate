import { expect, test } from "@playwright/test";

test("phone: watchlist home, tap opens the full-screen chart, tabs navigate", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("button", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");

  const btc = page.locator('[role="row"][data-symbol="binance:spot:BTCUSDT"]');
  await expect(btc).toBeVisible({ timeout: 30_000 });
  expect((await btc.boundingBox())!.height).toBeGreaterThanOrEqual(40); // touch target

  await btc.tap();
  await expect(tabs.getByRole("button", { name: "Chart", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator('[data-testid="chart-canvas"]')).toHaveAttribute("data-series", /BTCUSDT/, {
    timeout: 30_000,
  });

  await tabs.getByRole("button", { name: "Alerts" }).tap();
  await expect(page.getByText("No alerts yet")).toBeVisible();
  await tabs.getByRole("button", { name: "Settings", exact: true }).tap();
  await expect(page.getByRole("button", { name: /Export backup/ })).toBeVisible();
});
