import { expect, test } from '@playwright/test';

test('preprocess page has expected h1', async ({ page }) => {
	await page.goto('/compile');
	await expect(page.locator('h1')).toBeVisible();
});

test('highlights default language', async ({ page }) => {
	await page.goto('/compile');
	await expect(page.locator('code.language-js')).toBeVisible();
	await expect(
		page.locator('code.language-js').locator('span').first()
	).toHaveClass('token keyword');
});

test('highlights non-default language', async ({ page }) => {
	await page.goto('/compile');
	await expect(page.locator('code.language-ocaml')).toBeVisible();
	await expect(
		page.locator('code.language-ocaml').locator('span')
	).not.toBeVisible();
});
