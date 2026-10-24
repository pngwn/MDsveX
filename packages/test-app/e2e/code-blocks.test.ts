import { expect, test } from "@playwright/test";

test("a code block copies its code and says so", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto("/code-blocks");
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
