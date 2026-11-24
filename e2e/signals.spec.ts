import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("signals scorecard: two verdicts, honest backtest, factor breakdown, flip alert", async ({ page }) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Signals" }).click();

  const meters = page.getByRole("meter", { name: "Signal score" });
  await expect(meters).toHaveCount(2, { timeout: 60_000 });
  for (const h of ["Intraday", "Swing"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${h} signal: (Bullish|Neutral|Bearish), score -?\\d+`) }),
    ).toBeVisible();
  }

  // The backtest always states its baseline (or that there isn't enough history).
  await expect(page.getByText(/^Backtest:/).locator("..")).toContainText(
    /baseline|Neutral calls aren't scored|not enough history/,
  );

  // Factor rows carry a lean and a plain-language reading; futures positioning is included for BTC.
  await expect(page.getByRole("region", { name: "Trend" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Futures positioning" })).toContainText("Funding rate");

  await page.getByRole("button", { name: /Alert on Swing verdict change/ }).click();
  await expect(page.getByRole("button", { name: /Stop Swing verdict alerts/ })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Signals" }).click();
  await expect(page.getByRole("button", { name: /Stop Swing verdict alerts/ })).toBeVisible({
    timeout: 60_000,
  });
});
