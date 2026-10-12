import { expect, test } from "@playwright/test";

test("a mention, an issue and a commit become links", async ({ page }) => {
	await page.goto("/references");
	await expect(page.getByRole("link", { name: "@ada" })).toHaveAttribute(
		"href",
		"https://github.com/ada",
	);
	await expect(page.getByRole("link", { name: "#123" })).toHaveAttribute(
		"href",
		"https://github.com/pngwn/MDsveX/issues/123",
	);
	await expect(
		page.getByRole("link", { name: "sveltejs/kit#45" }),
	).toHaveAttribute("href", "https://github.com/sveltejs/kit/issues/45");
	const commit = page.locator(
		'a[href="https://github.com/pngwn/MDsveX/commit/a1b2c3d"]',
	);
	await expect(commit.locator("code")).toHaveText("a1b2c3d");
	await expect(commit).toHaveClass("reference");
});

test("a bare url becomes a link, without the bracket after it", async ({
	page,
}) => {
	await page.goto("/references");
	await expect(
		page.getByRole("link", { name: "www.example.com/docs" }),
	).toHaveAttribute("href", "https://www.example.com/docs");
	await expect(
		page.getByRole("link", { name: "https://example.com/guide_one" }),
	).toHaveAttribute("href", "https://example.com/guide_one");
});

test("an address, an escape, code and the text of a link are left alone", async ({
	page,
}) => {
	await page.goto("/references");
	const items = page.locator("main li");
	await expect(items.nth(0)).toContainText("me@example.com");
	await expect(items.nth(1)).toContainText("@bob");
	await expect(items.nth(2).locator("code")).toHaveText("@ada #123");
	await expect(items.locator("a")).toHaveCount(1);
	await expect(items.nth(3).locator("a")).toHaveAttribute("href", "/steps");
});
