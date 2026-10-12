import { expect, test } from "@playwright/test";

test("a template renders the table of contents and reading time it gets as a prop", async ({
	page,
}) => {
	await page.goto("/plugin-data/first");
	const post = page.locator("article.post");
	await expect(post.locator("header h1")).toHaveText("The first post");
	await expect(post.locator(".reading-time")).toHaveText("1 min read");
	await expect(post.locator("a.edit")).toHaveAttribute(
		"href",
		"https://github.com/pngwn/MDsveX/edit/next/packages/test-app/src/routes/plugin-data/first/+page.svx",
	);
	const links = post.locator("nav.toc a");
	await expect(links).toHaveText([
		"Reading the export",
		"With code in a heading",
	]);
	await expect(links.first()).toHaveAttribute("href", "#reading-the-export");
	// every entry links to a heading of the page
	await expect(post.locator("h2#reading-the-export")).toBeVisible();
	await expect(post.locator("h2#with-code-in-a-heading")).toBeVisible();
});

test("a page reads its own plugin_data export", async ({ page }) => {
	await page.goto("/plugin-data/first");
	await expect(page.locator("article.post span.headings")).toHaveText("2");
	const words = await page.locator("article.post span.words").innerText();
	expect(Number(words)).toBeGreaterThan(50);
});

test("an index page lists the title, excerpt and reading time of each post", async ({
	page,
}) => {
	await page.goto("/plugin-data");
	const items = page.locator("ul.posts li");
	await expect(items).toHaveCount(3);
	await expect(items.nth(0).locator("a")).toHaveText("The first post");
	await expect(items.nth(0).locator("a")).toHaveAttribute(
		"href",
		"/plugin-data/first",
	);
	await expect(items.nth(0).locator(".excerpt")).toContainText(
		"The toc and page_data plugins of this app write to ctx.data.",
	);
	await expect(items.nth(0).locator(".sections")).toHaveText(
		"Reading the export, With code in a heading",
	);
	await expect(items.nth(1).locator("a")).toHaveText("The second post");
	await expect(items.nth(1).locator(".minutes")).toHaveText("1 min");
	await expect(items.nth(1).locator(".excerpt")).toHaveText("A shorter post.");
	await expect(items.nth(1).locator(".sections")).toHaveText("Only heading");
});

test("a post with no title in its frontmatter is listed by its first heading", async ({
	page,
}) => {
	await page.goto("/plugin-data");
	const item = page.locator("ul.posts li").nth(2);
	await expect(item.locator("a")).toHaveText(
		"A post with no title in its frontmatter",
	);
	await expect(item.locator(".excerpt")).toHaveText(
		"Its title in the list of posts is read from the heading above. The excerpt runs up to the comment below, so it holds this paragraph too.",
	);
	await expect(item.locator(".words")).toHaveText("49 words");
	await item.locator("a").click();
	await expect(page.locator("article.post header h1")).toHaveCount(0);
	await expect(page.locator("article.post h1")).toHaveText(
		"A post with no title in its frontmatter",
	);
});
