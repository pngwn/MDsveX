import { expect, test } from "@playwright/test";

test("each heading in a tabs container is a tab with a panel", async ({
	page,
}) => {
	await page.goto("/tabs");
	const tabs = page.locator(".tabs").first();
	const list = tabs.getByRole("tablist");
	await expect(list.getByRole("tab")).toHaveText(["npm", "pnpm", "yarn v2"]);
	await expect(list.getByRole("tab", { selected: true })).toHaveText("npm");
	await expect(tabs.locator("> .tab-panel")).toHaveCount(3);
	await expect(tabs.locator("> .tab-panel:not([hidden])")).toHaveCount(1);
	await expect(tabs.getByRole("tabpanel")).toContainText("npm install mdsvex");
});

test("a label is no heading", async ({ page }) => {
	await page.goto("/tabs");
	await expect(page.locator("main :is(h2, h3)")).toHaveCount(0);
});

test("the label of the container names the tab list", async ({ page }) => {
	await page.goto("/tabs");
	await expect(page.getByRole("tablist", { name: "Install it" })).toBeVisible();
});

test("a tab controls its panel and the panel is labelled by its tab", async ({
	page,
}) => {
	await page.goto("/tabs");
	const tab = page.getByRole("tab", { name: "yarn v2" });
	const panel = page.locator(`#${await tab.getAttribute("aria-controls")}`);
	await expect(panel).toHaveAttribute("role", "tabpanel");
	await expect(panel).toHaveAttribute(
		"aria-labelledby",
		(await tab.getAttribute("id"))!,
	);
	await expect(panel).toBeHidden();
	await tab.click();
	await expect(panel).toBeVisible();
	await expect(tab).toHaveAttribute("aria-selected", "true");
});

test("arrow keys, home and end move through the tabs and wrap", async ({
	page,
}) => {
	await page.goto("/tabs");
	const tabs = page.locator(".tabs").first().getByRole("tab");
	await tabs.nth(0).click();
	for (const [key, index] of [
		["ArrowRight", 1],
		["ArrowRight", 2],
		["ArrowRight", 0],
		["ArrowLeft", 2],
		["Home", 0],
		["End", 2],
	] as const) {
		await page.keyboard.press(key);
		await expect(tabs.nth(index)).toBeFocused();
		await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
		await expect(tabs.nth(index)).toHaveAttribute("tabindex", "0");
		await expect(tabs.nth((index + 1) % 3)).toHaveAttribute("tabindex", "-1");
	}
	await page.keyboard.press("Tab");
	await expect(
		page.locator(".tabs").first().getByRole("tabpanel"),
	).toBeFocused();
});

test("a code group has a tab for each fence", async ({ page }) => {
	await page.goto("/tabs");
	const group = page.locator(".tabs.tabs-code").first();
	await expect(group.getByRole("tab")).toHaveText(["npm", "pnpm", "js"]);
	await expect(group.getByRole("tabpanel")).toContainText("npm run dev");
	await group.getByRole("tab", { name: "pnpm" }).click();
	await expect(group.getByRole("tabpanel")).toContainText("pnpm dev");
	await expect(group.getByRole("tabpanel")).toContainText(
		"A note under the pnpm command.",
	);
});

test("tab sets of one group switch together and remember the choice", async ({
	page,
}) => {
	await page.goto("/tabs");
	const first = page.locator(".tabs").nth(0);
	const second = page.locator(".tabs").nth(1);
	await first.getByRole("tab", { name: "pnpm" }).click();
	await expect(second.getByRole("tab", { selected: true })).toHaveText("pnpm");
	await first.getByRole("tab", { name: "yarn v2" }).click();
	await expect(second.getByRole("tab", { selected: true })).toHaveText("pnpm");
	await second.getByRole("tab", { name: "npm" }).click();
	await expect(first.getByRole("tab", { selected: true })).toHaveText("npm");

	await second.getByRole("tab", { name: "pnpm" }).click();
	await page.reload();
	await expect(first.getByRole("tab", { selected: true })).toHaveText("pnpm");
	await expect(second.getByRole("tab", { selected: true })).toHaveText("pnpm");
});

test("the server always renders the first tab open", async ({ page }) => {
	await page.goto("/tabs");
	await page
		.locator(".tabs")
		.first()
		.getByRole("tab", { name: "pnpm" })
		.click();
	const html = await (await page.request.get("/tabs")).text();
	expect(html).toMatch(
		/aria-selected="true" tabindex="0"[^>]*>(<!--[^>]*-->)*npm/,
	);
	expect(html).not.toContain("mdsvex-tabs:");
});

test("nested tabs switch on their own", async ({ page }) => {
	await page.goto("/tabs");
	const outer = page.locator(".tabs").nth(2);
	const inner = outer.locator(".tabs");
	await inner.getByRole("tab", { name: "Inner two" }).click();
	await expect(inner.getByRole("tabpanel")).toHaveText(/Second inner panel/);
	await expect(
		outer.locator("> .tabs-list").getByRole("tab", { selected: true }),
	).toHaveText("Outer");
	await outer
		.locator("> .tabs-list")
		.getByRole("tab", { name: "Other" })
		.click();
	await expect(inner).toBeHidden();
	await expect(outer.locator("> .tab-panel:not([hidden])")).toHaveText(
		/The other outer panel/,
	);
});

test.describe("without scripting", () => {
	test.use({ javaScriptEnabled: false });

	test("every panel shows under its label and the tab list is gone", async ({
		page,
	}) => {
		await page.goto("/tabs");
		const tabs = page.locator(".tabs").first();
		await expect(tabs.locator("> .tabs-list")).toBeHidden();
		const panels = tabs.locator("> .tab-panel");
		await expect(panels).toHaveCount(3);
		for (const [index, label, text] of [
			[0, "npm", "npm install mdsvex"],
			[1, "pnpm", "pnpm add mdsvex"],
			[2, "yarn v2", "yarn add mdsvex"],
		] as const) {
			await expect(panels.nth(index)).toBeVisible();
			await expect(
				panels.nth(index).locator("> .tab-panel-label"),
			).toBeVisible();
			await expect(panels.nth(index).locator("> .tab-panel-label")).toHaveText(
				label,
			);
			await expect(panels.nth(index)).toContainText(text);
		}
	});
});
