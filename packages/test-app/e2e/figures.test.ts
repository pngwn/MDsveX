import { expect, test } from "@playwright/test";

test("a figure directive holds its image with the caption", async ({
	page,
}) => {
	await page.goto("/figures");
	const figure = page.locator("figure#fig\\:penguin");
	await expect(figure.getByRole("img", { name: "A penguin" })).toBeVisible();
	await expect(figure.locator("figcaption")).toHaveText("The mdsvex penguin");
	await expect(page.locator("figure img[alt='A lone penguin']")).toHaveCount(0);
});

test("anything can be a figure", async ({ page }) => {
	await page.goto("/figures");
	const figure = page.getByRole("figure", { name: "A code block as a figure" });
	await expect(figure.locator("pre")).toContainText("in a figure");
});
