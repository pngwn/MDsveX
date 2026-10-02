import { expect, test } from "@playwright/test";

test("the guide template renders its replacements and directives", async ({
	page,
}) => {
	await page.goto("/editor");
	const guide = page.locator("article.guide");
	await expect(guide.locator("header h1")).toHaveText("Editor tour");
	await expect(guide.locator("h2.section").first()).toHaveText(
		"Hover a replaced element"
	);
	await expect(guide.locator("figure figcaption")).toHaveText("A penguin");
	await expect(guide.locator("aside.note.info strong")).toHaveText(
		"Directives are components"
	);
	await expect(guide.locator("aside.note kbd")).toHaveText("F12");
});
