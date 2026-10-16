import { format } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';
import { shape } from './shape';

async function svx(source: string): Promise<string> {
	const out = await format(source, { parser: 'mdsvex', plugins: [plugin] });
	expect(shape(out)).toBe(shape(source));
	expect(await format(out, { parser: 'mdsvex', plugins: [plugin] })).toBe(out);
	return out;
}

describe('list markers', () => {
	test('the spaces after a marker fold to one', async () => {
		expect(await svx('-   foo\n-   bar\n')).toBe('- foo\n- bar\n');
		expect(await svx('1.   a\n2)  b\n')).toBe('1. a\n2) b\n');
	});

	test('the marker, its number and the tightness stay', async () => {
		const source = '* a\n\n* b\n\n3. c\n4. d\n';
		expect(await svx(source)).toBe(source);
	});

	test('the lines after a marker stay where they are', async () => {
		expect(await svx('-    one\n\n     two\n')).toBe('- one\n\n     two\n');
	});

	test('a task box stays after its marker', async () => {
		expect(await svx('-   [ ] todo\n-   [x] done\n')).toBe(
			'- [ ] todo\n- [x] done\n'
		);
	});
});

describe('list indent', () => {
	test('a list at the top moves to the left edge', async () => {
		expect(await svx('  - a\n  - b\n')).toBe('- a\n- b\n');
	});

	test('a nested list moves to the content column of its item', async () => {
		expect(await svx('- a\n      - b\n      - c\n')).toBe(
			'- a\n  - b\n  - c\n'
		);
		expect(await svx('1. a\n      - b\n')).toBe('1. a\n   - b\n');
	});

	test('what a nested item holds moves with it', async () => {
		expect(
			await svx(
				'- a\n      - b\n\n        ```js\n        let x = 1;\n        ```\n\n        more\n'
			)
		).toBe('- a\n  - b\n\n    ```js\n    let x = 1;\n    ```\n\n    more\n');
	});

	test('a list on the line of the marker of its item stays there', async () => {
		const source = '- - foo\n\n1. - 2. foo\n';
		expect(await svx(source)).toBe(source);
	});

	test('a list is kept where it is when a line after it would join it', async () => {
		const source = '  - foo\n\n  bar\n';
		expect(await svx(source)).toBe(source);
	});

	test('a list with tabs is kept', async () => {
		const sources = ['- a\n\t- b\n', '\t- a\n\t- b\n'];
		for (const source of sources) expect(await svx(source)).toBe(source);
	});

	test('a list in an element or a block keeps its indent', async () => {
		const sources = [
			'<div>\n\n  - a\n  - b\n\n</div>\n',
			'{#if a}\n\n  - a\n\n{/if}\n',
		];
		for (const source of sources) expect(await svx(source)).toBe(source);
	});

	test('a template string in an item keeps its lines', async () => {
		const source = '- a\n      - {`x\n         y`}\n';
		expect(await svx(source)).toBe('- a\n  - {`x\n         y`}\n');
	});
});

describe('block quotes', () => {
	test('a > followed by text gets a space', async () => {
		expect(await svx('>foo\n>bar\n')).toBe('> foo\n> bar\n');
		expect(await svx('>>x\n')).toBe('> > x\n');
	});

	test('an empty quote line stays a bare >', async () => {
		expect(await svx('> a\n>\n> b\n')).toBe('> a\n>\n> b\n');
	});

	test('a list in a quote', async () => {
		expect(await svx('> -   a\n>     - b\n')).toBe('> - a\n>   - b\n');
		expect(await svx('>- a\n>  - b\n')).toBe('> - a\n>  - b\n');
	});

	test('a fence in a quote keeps its code', async () => {
		expect(await svx('>```js\n>let x\n>```\n')).toBe(
			'> ```js\n> let x\n> ```\n'
		);
	});
});
