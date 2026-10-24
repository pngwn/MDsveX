import { expect, test } from "@playwright/test";

test("embeds are frames named by their label", async ({ page }) => {
	await page.goto("/embeds");
	await expect(
		page.locator('iframe[title="A conference talk"]'),
	).toHaveAttribute(
		"src",
		/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?start=30/,
	);
	await expect(page.locator('iframe[title="A short film"]')).toHaveAttribute(
		"loading",
		"lazy",
	);
});
