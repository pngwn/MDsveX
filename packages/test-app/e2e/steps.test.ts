import { expect, test } from "@playwright/test";

test("each heading in a steps container is a list item", async ({ page }) => {
	await page.goto("/steps");
	const steps = page.locator("ol.steps").first();
	await expect(steps.locator("> li.step")).toHaveCount(3);
	await expect(
		steps.locator("> li.step > .step-title > h2").nth(1),
	).toHaveText("Configure");
	await expect(
		steps.locator("> li.step").nth(1).locator(".step-body > h3"),
	).toHaveText("A deeper heading");
});

test("the label of the container is rendered ahead of the list", async ({
	page,
}) => {
	await page.goto("/steps");
	await expect(page.locator(".steps-label")).toHaveText("Set up a project");
});

test("the default stylesheet numbers the steps with a counter", async ({
	page,
}) => {
	await page.goto("/steps");
	const steps = page.locator("ol.steps").first();
	await expect(steps).toHaveCSS("list-style-type", "none");
	const content = await steps
		.locator("> li.step > .step-title")
		.first()
		.evaluate((el) => getComputedStyle(el, "::before").content);
	expect(content).toBe("counter(step)");
});

test("nested steps are a list inside a step", async ({ page }) => {
	await page.goto("/steps");
	const inner = page.locator("ol.steps ol.steps");
	await expect(inner.locator("> li.step")).toHaveCount(2);
	await expect(inner.locator("h4").first()).toHaveText("Open a container");
});

test("step headings keep their ids and anchors", async ({ page }) => {
	await page.goto("/steps");
	await expect(
		page.locator('.step-title > h2#install > a[href="#install"]'),
	).toHaveText("Install");
});
