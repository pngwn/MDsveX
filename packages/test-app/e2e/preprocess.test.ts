import { expect, test } from "@playwright/test";

test("preprocess page has expected h1", async ({ page }) => {
	await page.goto("/preprocess");
	await expect(page.locator("h1")).toBeVisible();
});
