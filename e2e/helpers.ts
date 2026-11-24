import { expect, type Page } from "@playwright/test";

export const chartCanvas = (page: Page) => page.locator('[data-testid="chart-canvas"]').first();
export const symbolRows = (page: Page) => page.locator('[role="grid"] [role="row"][data-symbol]');

/** Open the app and wait until the seeded watchlist shows live prices and the chart has data. */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(symbolRows(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(chartCanvas(page)).toHaveAttribute("data-series", /binance:spot:/, { timeout: 30_000 });
  // A live price has rendered in the first row (digits with a decimal separator).
  await expect(symbolRows(page).first().locator('[role="gridcell"]').nth(1)).toHaveText(/\d[.,]\d/, {
    timeout: 20_000,
  });
}

export async function rowOrder(page: Page): Promise<string[]> {
  return symbolRows(page).evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.symbol!.split(":")[2]!),
  );
}
