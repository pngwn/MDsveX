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

test("an image alone with a title is a figure with a caption", async ({
	page,
}) => {
	await page.goto("/kit");
	const figure = page.getByRole("figure", { name: "The mdsvex penguin" });
	await expect(figure.getByRole("img", { name: "A penguin" })).toBeVisible();
	await expect(figure.locator("figcaption")).toHaveText("The mdsvex penguin");
	await expect(page.locator("p > img[title='Inline']")).toHaveCount(1);
});

test("a code block copies its code and says so", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto("/kit");
	const block = page.locator(".code-block", { hasText: "Install" });
	await expect(block.locator(".code-block-title")).toHaveText("Install");
	await expect(block.locator(".code-block-caption")).toHaveText(
		"Then restart the dev server.",
	);
	await block.getByRole("button", { name: "Copy code of Install" }).click();
	await expect(block.getByRole("status")).toHaveText("Copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		"pnpm add @mdsvex/plugin-C",
	);
	await expect(
		page.locator(".code-block", { hasText: "ls" }).getByRole("button"),
	).toHaveCount(0);
});

test("a mermaid fence becomes a diagram with its source beside it", async ({
	page,
}) => {
	await page.goto("/kit");
	const figure = page.locator("figure.mermaid").first();
	await expect(figure.locator(".mermaid-title")).toHaveText(
		"How a page is built",
	);
	await expect(figure.locator(".mermaid-diagram svg")).toBeVisible();
	await expect(figure.locator("details.mermaid-source pre")).toContainText(
		"graph LR",
	);
	await expect(figure.locator(".mermaid-caption")).toHaveText(
		"Each step runs once per file.",
	);
});

test("a diagram that does not parse shows its source", async ({ page }) => {
	await page.goto("/kit");
	const broken = page.locator("figure.mermaid").nth(1);
	await expect(broken.locator(".mermaid-error")).toBeVisible();
	await expect(broken.locator("pre")).toContainText("graph TD");
});
