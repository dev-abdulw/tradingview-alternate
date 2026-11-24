import { expect, test } from "@playwright/test";
import { chartCanvas, openApp, rowOrder, symbolRows } from "./helpers";

test("loads with live prices, a seeded list, and a live tab title", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[role="grid"] .meta-label')).toContainText(["Majors", "Metals", "Stocks"]);
  await expect(page).toHaveTitle(/^BTCUSDT [\d,]+\.\d+ [▲▼]/);
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
});

test("search with ⌘K: fuzzy match, add to watchlist with ⇧↵", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("ControlOrMeta+KeyK");
  const input = page.getByRole("combobox", { name: "Search symbols" });
  await input.fill("btc/usdt");
  await expect(page.getByRole("option").first()).toContainText("BTC");
  await input.fill("gold");
  await expect(page.getByRole("option").first()).toContainText("PAXG");
  await input.fill("msft");
  await expect(page.getByRole("option").first()).toContainText("MSFT");
  await input.press("Shift+Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="row"][data-symbol="binance:spot:MSFTBUSDT"]')).toBeVisible();
});

test("drag reorder survives a reload", async ({ page }) => {
  await openApp(page);
  const before = await rowOrder(page);
  const first = await symbolRows(page).nth(0).boundingBox();
  const third = await symbolRows(page).nth(2).boundingBox();
  await page.mouse.move(first!.x + 60, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + 60, first!.y + 20, { steps: 4 });
  await page.mouse.move(first!.x + 60, third!.y + third!.height * 0.8, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => rowOrder(page)).not.toEqual(before);
  const after = await rowOrder(page);
  await page.reload();
  await expect(symbolRows(page).first()).toBeVisible();
  await expect.poll(() => rowOrder(page)).toEqual(after);
});

test("remove a symbol and undo from the toast", async ({ page }) => {
  await openApp(page);
  const row = page.locator('[role="row"][data-symbol="binance:spot:SOLUSDT"]');
  await row.hover();
  await row.getByRole("button", { name: "Remove SOL" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toHaveCount(1);
});

test("prices never shift columns horizontally while ticking", async ({ page }) => {
  await openApp(page);
  const boxes = () =>
    symbolRows(page)
      .first()
      .locator('[role="gridcell"]')
      .evaluateAll((cells) =>
        cells.map((c) => `${c.getBoundingClientRect().left}:${c.getBoundingClientRect().width}`),
      );
  const initial = await boxes();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(400);
    expect(await boxes()).toEqual(initial);
  }
  await expect(chartCanvas(page)).toBeVisible();
});
