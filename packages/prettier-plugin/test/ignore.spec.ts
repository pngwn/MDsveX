import { format } from 'prettier';
import type { Options } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';

function svx(source: string, options: Options = {}): Promise<string> {
	return format(source, { parser: 'mdsvex', plugins: [plugin], ...options });
}

describe('prettier-ignore', () => {
	test('keeps the next block as written', async () => {
		expect(await svx('<!-- prettier-ignore -->\n<script>\nlet a=1\n</script>\n')).toBe(
			'<!-- prettier-ignore -->\n<script>\nlet a=1\n</script>\n'
		);
	});

	test('keeps the spaces at the ends of its lines, but its last', async () => {
		expect(await svx('<!-- prettier-ignore -->\na  \nb  \n\nc  \n')).toBe(
			'<!-- prettier-ignore -->\na  \nb\n\nc\n'
		);
	});

	test('start and end in the paragraph of the text they hold', async () => {
		expect(
			await svx('<!-- prettier-ignore-start -->\n{c+d}\n<!-- prettier-ignore-end -->\n\n{e+f}\n')
		).toBe('<!-- prettier-ignore-start -->\n{c+d}\n<!-- prettier-ignore-end -->\n\n{e + f}\n');
	});

	test('only the next block, the one after is formatted', async () => {
		expect(await svx('<!-- prettier-ignore -->\n{a+b}\n\n{c+d}\n')).toBe(
			'<!-- prettier-ignore -->\n{a+b}\n\n{c + d}\n'
		);
	});

	test('across a blank line', async () => {
		expect(await svx('<!-- prettier-ignore -->\n\n\n{a+b}\n')).toBe(
			'<!-- prettier-ignore -->\n\n{a+b}\n'
		);
	});

	test('inline, keeps the next node in a paragraph or list item', async () => {
		expect(await svx('text <!-- prettier-ignore --> {c+d} {e+f}\n')).toBe(
			'text <!-- prettier-ignore --> {c+d} {e + f}\n'
		);
		expect(await svx('- x\n  <!-- prettier-ignore -->\n  {a+b}\n')).toBe(
			'- x\n  <!-- prettier-ignore -->\n  {a+b}\n'
		);
	});

	test('another comment does nothing', async () => {
		expect(await svx('<!-- note -->\n{a+b}\n')).toBe('<!-- note -->\n{a + b}\n');
	});
});

describe('prettier-ignore-start and end', () => {
	test('keep everything between them as written', async () => {
		const source =
			'{a+b}\n\n<!-- prettier-ignore-start -->\n{c+d}\n\n\n\nx  \n<!-- prettier-ignore-end -->\n\n{e+f}\n';
		expect(await svx(source)).toBe(
			'{a + b}\n\n<!-- prettier-ignore-start -->\n{c+d}\n\n\n\nx  \n<!-- prettier-ignore-end -->\n\n{e + f}\n'
		);
	});

	test('a start without an end ignores nothing', async () => {
		expect(await svx('<!-- prettier-ignore-start -->\n\n{a+b}\n')).toBe(
			'<!-- prettier-ignore-start -->\n\n{a + b}\n'
		);
	});
});

describe('pragma', () => {
	test('requirePragma formats only a document that has one', async () => {
		const options = { requirePragma: true };
		expect(await svx('{a+b}\n', options)).toBe('{a+b}\n');
		expect(await svx('<!-- @format -->\n\n{a+b}\n', options)).toBe(
			'<!-- @format -->\n\n{a + b}\n'
		);
		expect(await svx('---\nt: 1\n---\n\n<!-- @prettier -->\n\n{a+b}\n', options)).toBe(
			'---\nt: 1\n---\n\n<!-- @prettier -->\n\n{a + b}\n'
		);
	});

	test('insertPragma puts one after the frontmatter', async () => {
		const options = { insertPragma: true };
		expect(await svx('# a\n', options)).toBe('<!-- @format -->\n\n# a\n');
		expect(await svx('---\nt: 1\n---\n\n# a\n', options)).toBe(
			'---\nt: 1\n---\n\n<!-- @format -->\n\n# a\n'
		);
		expect(await svx('<!-- @format -->\n\n# a\n', options)).toBe('<!-- @format -->\n\n# a\n');
	});

	test('checkIgnorePragma leaves a document with @noformat alone', async () => {
		const options = { checkIgnorePragma: true } as Options;
		const source = '<!-- @noformat -->\n\n{a+b}\n';
		expect(await svx(source, options)).toBe(source);
	});
});
