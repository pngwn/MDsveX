import { expect, test } from "@playwright/test";

test("each kind renders with its title", async ({ page }) => {
	await page.goto("/callouts");
	await expect(page.locator(".callout")).toHaveCount(7);
	await expect(page.locator(".callout[data-kind=note] .callout-title-text").first()).toHaveText("Note");
	await expect(page.locator(".callout[data-kind=caution] .callout-title-text")).toHaveText("Careful");
	await expect(page.locator(".callout[data-kind=warning] .callout-title-text")).toHaveText("Breaking change");
	await expect(page.locator(".callout[data-kind=warning] .callout-icon")).toHaveAttribute("aria-label", "Warning");
	await expect(page.locator(".callout[role=note]")).toHaveCount(7);
});

test("content inside a static callout stays live", async ({ page }) => {
	await page.goto("/callouts");
	const button = page.locator(".callout button");
	await expect(button).toHaveText("clicked 0");
	await button.click();
	await expect(button).toHaveText("clicked 1");
});
