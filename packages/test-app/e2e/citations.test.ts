import { expect, test } from "@playwright/test";

test("each key of a citation links to its entry", async ({ page }) => {
	await page.goto("/citations");
	const links = page.locator("span.citation a[role=doc-biblioref]");
	await expect(links).toHaveText(["1", "2", "3", "1"]);
	await expect(links.nth(0)).toHaveAttribute("href", "#bib-lovelace1843");
	await expect(links.nth(2)).toHaveAttribute("href", "#bib-turing1936");
	await expect(page.locator("span.citation").nth(2)).toHaveText("[3, 1]");
});

test("an unknown key shows as written with no link", async ({ page }) => {
	await page.goto("/citations");
	const unknown = page.locator("li span.citation");
	await expect(unknown).toHaveText("[nope]");
	await expect(unknown.locator("a")).toHaveCount(0);
});

test("the list has each cited entry once, in the order of first citation", async ({
	page,
}) => {
	await page.goto("/citations");
	const list = page.locator("section[role=doc-bibliography]");
	await expect(list.locator(".bibliography-label")).toHaveText("References");
	const items = list.locator("ol > li");
	await expect(items).toHaveCount(3);
	await expect(items.nth(0)).toHaveAttribute("id", "bib-lovelace1843");
	await expect(items.nth(0)).toContainText(
		"Ada Lovelace. Notes on the Analytical Engine. Scientific Memoirs 3, 666-731. 1843.",
	);
	await expect(items.nth(1)).toContainText("Longman. 1864.");
	await expect(items.nth(2).locator("cite")).toHaveText(
		"On Computable Numbers, with an Application to the Entscheidungsproblem.",
	);
	await expect(
		items.nth(2).getByRole("link", { name: /doi\.org/ }),
	).toHaveAttribute("href", "https://doi.org/10.1112/plms/s2-42.1.230");
});

test("each entry links back to every citation of it", async ({ page }) => {
	await page.goto("/citations");
	const back = page.locator("#bib-lovelace1843 a[role=doc-backlink]");
	await expect(back).toHaveCount(2);
	await expect(back.nth(0)).toHaveAttribute("href", "#cite-1");
	await expect(back.nth(1)).toHaveAttribute("href", "#cite-4");
	await expect(back.nth(1)).toHaveAttribute("aria-label", "Back to citation 4");
	await back.nth(1).click();
	await expect(page).toHaveURL(/#cite-4$/);
	await expect(page.locator("#cite-4")).toHaveAttribute(
		"href",
		"#bib-lovelace1843",
	);
});
