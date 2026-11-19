import { expect, test } from "@playwright/test";

test("::toc lists the headings of its page as nested links", async ({
	page,
}) => {
	await page.goto("/toc");
	const toc = page.locator("nav.toc").first();
	await expect(toc.locator(".toc-label")).toHaveText("On this page");
	await expect(toc.locator("> ul > li > a")).toHaveText([
		"Install",
		"Set up",
		"Pick a system",
		"Only the top level",
	]);
	await expect(toc.locator("> ul > li").first().locator("ul a")).toHaveText([
		"With pnpm",
		"With npm",
	]);
	await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
});

test("every entry links to a heading of the page", async ({ page }) => {
	await page.goto("/toc");
	const hrefs = await page
		.locator("nav.toc")
		.first()
		.locator("a")
		.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
	expect(hrefs.length).toBe(8);
	for (const href of hrefs) {
		await expect(page.locator(`[id="${href!.slice(1)}"]`)).toHaveCount(1);
	}
});

test("the headings of steps are listed, tab labels and a no-toc heading are not", async ({
	page,
}) => {
	await page.goto("/toc");
	const toc = page.locator("nav.toc").first();
	await expect(toc.locator('a[href="#add-the-plugin"]')).toHaveText(
		"Add the plugin",
	);
	await expect(toc.locator("a", { hasText: "macOS" })).toHaveCount(0);
	await expect(toc.locator("a", { hasText: "Changelog" })).toHaveCount(0);
	await expect(page.locator("h2#changelog")).toBeVisible();
});

test("a depth arg narrows one list and its other args are attributes", async ({
	page,
}) => {
	await page.goto("/toc");
	const short = page.locator("nav.toc.short");
	await expect(short.locator("a")).toHaveText([
		"Install",
		"Set up",
		"Pick a system",
		"Only the top level",
	]);
	await expect(short.locator("ul ul")).toHaveCount(0);
});
