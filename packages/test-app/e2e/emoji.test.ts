import { expect, test } from "@playwright/test";

test("a shortcode becomes an emoji with a label", async ({ page }) => {
	await page.goto("/emoji");
	const party = page.getByRole("img", { name: "party popper" });
	await expect(party).toHaveCount(3);
	await expect(party.first()).toHaveText("\u{1f389}");
	await expect(page.getByRole("img", { name: "thumbs up" })).toHaveText(
		"\u{1f44d}",
	);
});

test("the heading id comes from the shortcode as written", async ({ page }) => {
	await page.goto("/emoji");
	await expect(page.locator("h1")).toHaveAttribute("id", "emoji-tada");
});

test("times, unknown names, escapes and code are left alone", async ({
	page,
}) => {
	await page.goto("/emoji");
	const items = page.locator("main li");
	await expect(items.nth(0)).toHaveText(
		"a time, 10:30:00, and a ratio, 1:100:1, are not shortcodes",
	);
	await expect(items.nth(1)).toContainText(":not_an_emoji:");
	await expect(items.nth(2)).toContainText(":rocket:");
	await expect(items.nth(3).locator("code")).toHaveText(":rocket:");
	await expect(items.locator('[role="img"]')).toHaveCount(1);
});

test("the text of a link is replaced, the url of an autolink is not", async ({
	page,
}) => {
	await page.goto("/emoji");
	await expect(
		page.locator('a[href="/steps"]').getByRole("img", { name: "rocket" }),
	).toHaveCount(1);
	const autolink = page.locator('a[href="https://example.com/:rocket:"]');
	await expect(autolink).toContainText("https://example.com/:rocket:");
});
