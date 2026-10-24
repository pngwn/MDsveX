import { expect, test } from "@playwright/test";

test("a mermaid fence is a diagram drawn at build time with its source beside it", async ({
	page,
}) => {
	await page.goto("/diagram");
	const figure = page.locator("figure.diagram").first();
	await expect(figure.locator(".diagram-title")).toHaveText(
		"How a page is built",
	);
	await expect(figure.locator(".diagram-svg svg.pele")).toBeVisible();
	await expect(figure.locator("details.diagram-source pre")).toContainText(
		"graph LR",
	);
	await expect(figure.locator(".diagram-caption")).toHaveText(
		"Each step runs once per file.",
	);
});

test("the server sends the svg", async ({ page }) => {
	const html = await (await page.request.get("/diagram")).text();
	expect(html).toContain('class="pele pele-flowchart"');
	expect(html).toContain('class="pele pele-sequence"');
});

test("a diagram that does not parse shows why and its source", async ({
	page,
}) => {
	await page.goto("/diagram");
	const broken = page.locator("figure.diagram").nth(2);
	await expect(broken.locator(".diagram-error")).toContainText(
		"The diagram could not be drawn",
	);
	await expect(broken.locator("pre")).toContainText("graph TD");
});
