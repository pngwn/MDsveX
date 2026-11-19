import { expect, test } from "@playwright/test";

test("a link to another host gets rel and target", async ({ page }) => {
	await page.goto("/external-links");
	const link = page.locator('a[href="https://example.com/spec"]');
	await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	await expect(link).toHaveAttribute("target", "_blank");
	await expect(link).toHaveAttribute("title", "The spec");
});

test("an autolink is external too", async ({ page }) => {
	await page.goto("/external-links");
	await expect(page.locator('a[href="https://example.org"]')).toHaveAttribute(
		"target",
		"_blank",
	);
});

test("an external link ends with an icon named for a screen reader", async ({
	page,
}) => {
	await page.goto("/external-links");
	const icon = page.locator(
		'a[href="https://example.com/spec"] > span.external-link-icon',
	);
	await expect(icon).toHaveAttribute("role", "img");
	await expect(icon).toHaveAttribute("aria-label", "opens in a new tab");
	await expect(
		page.getByRole("img", { name: "opens in a new tab" }),
	).toHaveCount(3);
});

test("links that stay on the site are left alone", async ({ page }) => {
	await page.goto("/external-links");
	for (const href of [
		"https://mdsvex.pngwn.io/docs",
		"/steps",
		"#external-links",
		"mailto:hello@example.com",
	]) {
		const link = page.locator(`main li a[href="${href}"]`);
		await expect(link).toHaveCount(1);
		await expect(link).not.toHaveAttribute("rel");
		await expect(link).not.toHaveAttribute("target");
		await expect(link.locator("span")).toHaveCount(0);
	}
});

test("an expression after the host keeps the link external", async ({
	page,
}) => {
	await page.goto("/external-links");
	await expect(
		page.locator('a[href="https://example.com/guide"]'),
	).toHaveAttribute("target", "_blank");
});

test("a url that is an expression and a typed anchor are not touched", async ({
	page,
}) => {
	await page.goto("/external-links");
	for (const href of [
		"https://example.com/dynamic",
		"https://example.com/typed",
	]) {
		const link = page.locator(`a[href="${href}"]`);
		await expect(link).not.toHaveAttribute("rel");
		await expect(link).not.toHaveAttribute("target");
	}
});
