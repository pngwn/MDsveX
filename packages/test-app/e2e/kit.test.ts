import { expect, test } from "@playwright/test";

test("details toggle from their summary", async ({ page }) => {
	await page.goto("/kit");
	const details = page.locator("details.details").first();
	await expect(details).not.toHaveAttribute("open");
	await details.locator("summary").click();
	await expect(details).toHaveAttribute("open");
	await expect(page.locator("details.details").nth(1)).toHaveAttribute("open");
});

test("the summary is a control the keyboard reaches", async ({ page }) => {
	await page.goto("/kit");
	const summary = page.locator("details.details > summary").first();
	await summary.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator("details.details").first()).toHaveAttribute("open");
});

test("one item of a named accordion is open at a time", async ({ page }) => {
	await page.goto("/kit");
	const items = page.locator(".accordion > details");
	await expect(items).toHaveCount(3);
	await expect(page.locator(".accordion summary")).toHaveText([
		"Is it free?",
		"Does it work without JavaScript?",
		"Written out",
	]);
	await items.nth(0).locator("summary").click();
	await items.nth(1).locator("summary").click();
	await expect(items.nth(1)).toHaveAttribute("open");
	await expect(items.nth(0)).not.toHaveAttribute("open");
	await expect(page.locator(".accordion h2")).toHaveCount(0);
});

test("keys, ruby and badges", async ({ page }) => {
	await page.goto("/kit");
	await expect(page.locator("kbd.kbd")).toHaveText(["Ctrl", "C"]);
	await expect(page.locator("ruby.ruby rt")).toHaveText("かんじ");
	await expect(page.locator(".badge[data-tone]")).toHaveCount(4);
});

test("embeds are frames named by their label", async ({ page }) => {
	await page.goto("/kit");
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

test("a figure directive holds its image with the caption", async ({
	page,
}) => {
	await page.goto("/kit");
	const figure = page.locator("figure#fig\\:penguin");
	await expect(figure.getByRole("img", { name: "A penguin" })).toBeVisible();
	await expect(figure.locator("figcaption")).toHaveText("The mdsvex penguin");
	await expect(page.locator("figure img[alt='A lone penguin']")).toHaveCount(0);
});
