import { expect, test } from "@playwright/test";

test("headings have the ids heading_ids makes", async ({ page }) => {
	await page.goto("/preprocess");
	const h2 = page.locator("h2#second-heading");
	await expect(h2).toBeVisible();
	await expect(h2).toHaveAttribute("id", "second-heading");
});

test("the anchors plugin wraps the heading content in a link to its id", async ({
	page,
}) => {
	await page.goto("/preprocess");
	const link = page.locator('h2#second-heading > a[href="#second-heading"]');
	await expect(link).toBeVisible();
	await expect(link).toHaveText("Second heading");
});

test("a heading with no text of its own gets no id and no link", async ({
	page,
}) => {
	await page.goto("/preprocess");
	// the h1 is an expression, the two h2s are text
	await expect(page.locator("h1[id], h2[id]")).toHaveCount(2);
	await expect(page.locator("h1 > a")).toHaveCount(0);
});

test("heading anchor href matches heading id", async ({ page }) => {
	await page.goto("/preprocess");
	const h2 = page.locator("h2#second-heading");
	const anchor = h2.locator("a");
	await expect(anchor).toHaveAttribute("href", "#second-heading");
});
