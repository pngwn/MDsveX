import { expect, test } from "@playwright/test";

test("the template wraps the page with its frontmatter as props", async ({
	page,
}) => {
	await page.goto("/template");
	const article = page.locator("article.article");
	await expect(article.locator("header h1")).toHaveText(
		"Written with a template"
	);
	await expect(article.locator(".byline")).toHaveText("by mdsvex");
	await expect(article.locator("p").nth(1)).toContainText(
		"The article template wraps this page"
	);
});

test("the template replaces elements with its exports", async ({ page }) => {
	await page.goto("/template");
	const heading = page.locator("article h2.section");
	await expect(heading).toHaveText("Replaced heading");
	await expect(heading).toHaveAttribute("data-level", "2");
	// the autolink id reaches the replacement as a prop
	await expect(heading).toHaveAttribute("id", "replaced-heading");
	await expect(page.locator("article aside.callout")).toContainText(
		"renders as the template's callout"
	);
});

test("svelte:head is hoisted out of the template", async ({ page }) => {
	await page.goto("/template");
	await expect(page).toHaveTitle("Written with a template");
});
