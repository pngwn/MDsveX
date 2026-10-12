import { expect, test } from "@playwright/test";

test("a svelte block marked run renders as a component beside its code", async ({
	page,
}) => {
	await page.goto("/run");
	const counter = page.locator("figure.code .demo button.counter");
	await expect(counter).toHaveText("clicked 0");
	await counter.click();
	await expect(counter).toHaveText("clicked 1");
	// the code is still shown
	await expect(page.locator("figure.code pre").first()).toContainText(
		"let count = $state(0);",
	);
});

test("a script block is a module, with imports that resolve from the document", async ({
	page,
}) => {
	await page.goto("/run");
	const outputs = page.locator("figure.code output.demo");
	await expect(outputs.nth(0)).toHaveText("twice the answer is 84");
	await expect(outputs.nth(1)).toHaveText("evaluated 1 time(s)");
});

test("a block marked run=client is imported when it is asked for", async ({
	page,
}) => {
	await page.goto("/run");
	await expect(page.locator("figure.code output.demo")).toHaveCount(2);
	await page.locator("figure.code button.demo").click();
	await expect(page.locator("figure.code output.demo").nth(2)).toHaveText(
		"the window is object",
	);
});

test("a block with src= runs the file it shows", async ({ page }) => {
	await page.goto("/run");
	const figure = page.locator(
		'figure.code[data-src="../../lib/templates/demo/Greeting.svelte"]',
	);
	await expect(figure.locator(".demo p.greeting")).toHaveText(
		"hello from a file",
	);
	await expect(figure.locator("pre")).toContainText('<p class="greeting">');
});

test("a block without the flag is only shown", async ({ page }) => {
	await page.goto("/run");
	const last = page.locator("figure.code").last();
	await expect(last.locator("pre")).toContainText("never called");
	await expect(last.locator(".demo")).toHaveCount(0);
});
