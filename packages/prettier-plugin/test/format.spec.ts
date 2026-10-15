import { format } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';

function svx(source: string): Promise<string> {
	return format(source, { parser: 'mdsvex', plugins: [plugin] });
}

describe('blank lines', () => {
	test('a run of blank lines between blocks folds to one', async () => {
		expect(await svx('# a\n\n\n\nb\n')).toBe('# a\n\nb\n');
	});

	test('a block on the next line stays on the next line', async () => {
		expect(await svx('# a\nb\n')).toBe('# a\nb\n');
	});

	test('blank lines at the start and the end go', async () => {
		expect(await svx('\n\n# a\n\n\n')).toBe('# a\n');
	});

	test('a document ends with one line end', async () => {
		expect(await svx('a')).toBe('a\n');
	});

	test('an empty document stays empty', async () => {
		expect(await svx('')).toBe('');
		expect(await svx('\n\n')).toBe('');
	});

	test('a thematic break is not moved to the first line, where it opens frontmatter', async () => {
		expect(await svx('\n\n---\na: b\n---\n')).toBe('\n---\na: b\n---\n');
	});
});

describe('spaces at line ends', () => {
	test('go from prose', async () => {
		expect(await svx('a  \nb \n\n- c  \n')).toBe('a\nb\n\n- c\n');
	});

	test('stay in a fence', async () => {
		expect(await svx('```js\nlet a = 1;  \n```\n')).toBe('```js\nlet a = 1;  \n```\n');
	});

	test('stay in a template string and pre', async () => {
		const sources = ['<script>\n  let a = `b  \nc`;\n</script>\n', '<pre>\na  \n</pre>\n'];
		for (const source of sources) expect(await svx(source)).toBe(source);
	});

	test('stay in an expression and an attribute value', async () => {
		expect(await svx('{`a  \nb`}\n')).toBe('{`a  \nb`}\n');
		expect(await svx('<div title="a  \nb">\n\nc\n\n</div>\n')).toBe(
			'<div title="a  \nb">\n\nc\n\n</div>\n'
		);
	});

	test('stay after a backslash, which would become a hard break', async () => {
		expect(await svx('a\\ \nb\n')).toBe('a\\ \nb\n');
	});
});

describe('source no node covers', () => {
	test('a link definition is kept as written', async () => {
		expect(await svx('[ref]:   https://x.com  "T"\n\n\n[a][ref]\n')).toBe(
			'[ref]:   https://x.com  "T"\n\n[a][ref]\n'
		);
	});
});

describe('indentation', () => {
	test('the indent of a first line stays with its block', async () => {
		expect(await svx('\t- foo\n\t- bar\n')).toBe('\t- foo\n\t- bar\n');
	});
});

describe('language', () => {
	test('.svx and .pfm files use the plugin', async () => {
		for (const filepath of ['page.svx', 'note.pfm']) {
			expect(await format('# a  \n', { filepath, plugins: [plugin] })).toBe('# a\n');
		}
	});
});
