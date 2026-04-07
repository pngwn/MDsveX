import { expect, test } from "@playwright/test";

test("headings have id attributes from autolink plugin", async ({ page }) => {
	await page.goto("/preprocess");
	const h2 = page.locator("h2#second-heading");
	await expect(h2).toBeVisible();
	await expect(h2).toHaveAttribute("id", "second-heading");
});

test("headings contain anchor links from autolink plugin", async ({ page }) => {
	await page.goto("/preprocess");
	const link = page.locator('h2#second-heading > a[href="#second-heading"]');
	await expect(link).toBeVisible();
	await expect(link).toHaveText("Second heading");
});

test("multiple headings all get autolinked", async ({ page }) => {
	await page.goto("/preprocess");
	// the page has h1 and two h2s
	const headingsWithIds = page.locator("h1[id], h2[id]");
	await expect(headingsWithIds).toHaveCount(3);
});

test("heading anchor href matches heading id", async ({ page }) => {
	await page.goto("/preprocess");
	const h2 = page.locator("h2#second-heading");
	const anchor = h2.locator("a");
	await expect(anchor).toHaveAttribute("href", "#second-heading");
});
