import { expect, test, type Page } from "@playwright/test";
import { chartCanvas, openApp } from "./helpers";

async function selectSymbol(page: Page, symbol: string): Promise<number> {
  const t0 = Date.now();
  await page.locator(`[role="row"][data-symbol="binance:spot:${symbol}"]`).click();
  await expect(chartCanvas(page)).toHaveAttribute("data-series", new RegExp(`^binance:spot:${symbol}\\|`));
  return Date.now() - t0;
}

test("switching symbol and timeframe is under 300ms from cache", async ({ page }) => {
  await openApp(page);
  await selectSymbol(page, "ETHUSDT"); // warm the cache
  expect(await selectSymbol(page, "BTCUSDT")).toBeLessThan(300);
  expect(await selectSymbol(page, "ETHUSDT")).toBeLessThan(300);

  const tf = async (label: string, code: string) => {
    const t0 = Date.now();
    await page.getByRole("radio", { name: label, exact: true }).first().click();
    await expect(chartCanvas(page)).toHaveAttribute("data-series", new RegExp(`\\|${code}$`));
    return Date.now() - t0;
  };
  await tf("4 hours", "4h");
  expect(await tf("1 hour", "1h")).toBeLessThan(300);
  expect(await tf("4 hours", "4h")).toBeLessThan(300);
});

test("indicators add legends with live values and persist", async ({ page }) => {
  await openApp(page);
  for (const name of [/Exponential moving average/, /Relative strength index/, /MACD/]) {
    await page.getByRole("button", { name: "Indicators" }).click();
    await page.getByRole("menuitem", { name }).click();
  }
  const legends = page.locator(".group\\/ind");
  await expect(legends).toHaveCount(3);
  await expect(legends.first()).toContainText(/EMA 21 close [\d,]+\.\d+/);
  await page.reload();
  await expect(page.locator(".group\\/ind")).toHaveCount(3);
});

test("drawings are saved per symbol and survive a reload", async ({ page }) => {
  await openApp(page);
  const box = (await chartCanvas(page).boundingBox())!;
  await page.locator("body").press("t");
  await page.mouse.click(box.x + box.width * 0.35, box.y + 180);
  await page.mouse.click(box.x + box.width * 0.6, box.y + 120);
  await page.locator("body").press("h");
  await page.mouse.click(box.x + box.width * 0.5, box.y + 240);
  const saved = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("markets:drawings") ?? "{}").rows?.map(
        (r: { data: { type: string } }) => r.data.type,
      ),
    );
  await expect.poll(saved).toEqual(["trend", "hline"]);
  await page.reload();
  await expect(chartCanvas(page)).toHaveAttribute("data-series", /BTCUSDT/);
  await expect.poll(saved).toEqual(["trend", "hline"]);
});

test("alert from the chart's context menu triggers a toast", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await openApp(page);
  const box = (await chartCanvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 150, { button: "right" });
  await page.getByRole("menuitem", { name: /Add alert at/ }).click();
  const dialog = page.getByRole("dialog", { name: "Create alert" });
  const now = Number((await dialog.getByText(/^Now /).innerText()).replace(/[^\d.]/g, ""));
  await dialog.getByRole("radio", { name: "Below" }).click();
  await dialog.locator("#alert-price").fill(String(Math.round(now * 1.01))); // already below → fires on next tick
  await dialog.getByRole("button", { name: "Create alert" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "falls to" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveAccessibleName("Alerts");
});

test("multi-chart 2×2 loads four charts", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Chart layout" }).click();
  await page.getByRole("menuitemradio", { name: /2×2/ }).click();
  await expect(page.locator('[data-testid="chart-canvas"][data-series]')).toHaveCount(4, { timeout: 30_000 });
});
