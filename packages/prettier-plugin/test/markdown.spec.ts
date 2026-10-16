import { format } from 'prettier';
import type { Options } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';
import { shape } from './shape';

async function svx(source: string, options: Options = {}): Promise<string> {
	const all = { parser: 'mdsvex', plugins: [plugin], ...options };
	const out = await format(source, all);
	expect(shape(out)).toBe(shape(source));
	expect(await format(out, all)).toBe(out);
	return out;
}

describe('lists', () => {
	test('the spaces after a marker fold to one', async () => {
		expect(await svx('-   foo\n-   bar\n')).toBe('- foo\n- bar\n');
		expect(await svx('1.   a\n2.  b\n')).toBe('1. a\n2. b\n');
	});

	test('the lines of an item line up with its content', async () => {
		expect(await svx('-    one\n\n     two\n')).toBe('- one\n\n  two\n');
		expect(await svx('10. a\ncontinued\n')).toBe('10. a\n    continued\n');
	});

	test('a task box stays after its marker', async () => {
		expect(await svx('-   [ ] todo\n-   [x] done\n')).toBe(
			'- [ ] todo\n- [x] done\n'
		);
		expect(await svx('- \\[x] escaped\n')).toBe('- \\[x] escaped\n');
	});

	test('a list sits at the left edge of what holds it', async () => {
		expect(await svx('  - a\n  - b\n')).toBe('- a\n- b\n');
		expect(await svx('\t- foo\n\t- bar\n')).toBe('- foo\n- bar\n');
	});

	test('a nested list sits at the content column of its item', async () => {
		expect(await svx('- a\n      - b\n      - c\n')).toBe(
			'- a\n  - b\n  - c\n'
		);
		expect(await svx('1. a\n      - b\n')).toBe('1. a\n   - b\n');
		expect(await svx('- a\n\t- b\n')).toBe('- a\n  - b\n');
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

	test('a paragraph after a list stays out of it', async () => {
		expect(await svx('  - foo\n\n  bar\n')).toBe('- foo\n\nbar\n');
	});

	test('a template string in an item keeps its lines', async () => {
		expect(await svx('- a\n      - {`x\n         y`}\n')).toBe(
			'- a\n  - {`x\n         y`}\n'
		);
	});

	test('a line of prose that would start a block stays prose', async () => {
		expect(await svx('Foo\n    ***\n')).toBe('Foo\n    ***\n');
		expect(await svx('- foo\n-\n- bar\n')).toBe('- foo\n      -\n- bar\n');
	});
});

describe('list markers and numbers', () => {
	test('bullets are -, a list beside another alternates with *', async () => {
		expect(await svx('* a\n* b\n\n+ c\n')).toBe('- a\n- b\n\n* c\n');
	});

	test('ordered lists count up from their start', async () => {
		expect(await svx('3. a\n7. b\n9. c\n')).toBe('3. a\n4. b\n5. c\n');
		expect(await svx('1) a\n2) b\n')).toBe('1. a\n2. b\n');
	});

	test('a list of ones stays ones', async () => {
		expect(await svx('1. a\n1. b\n1. c\n')).toBe('1. a\n1. b\n1. c\n');
		expect(await svx('0. a\n1. b\n1. c\n')).toBe('0. a\n1. b\n1. c\n');
	});

	test('two ordered lists side by side keep apart', async () => {
		expect(await svx('1.   a\n2)  b\n')).toBe('1. a\n\n2) b\n');
	});

	test('a loose list has blank lines between its items and their blocks', async () => {
		expect(await svx('- a\n\n- b\n  more\n\n  para\n')).toBe(
			'- a\n\n- b\n  more\n\n  para\n'
		);
	});

	test('with a tab width of 4 the blocks after the first line up with it', async () => {
		expect(await svx('- a\n\n  para\n', { tabWidth: 4 })).toBe(
			'- a\n\n    para\n'
		);
	});
});

describe('blocks', () => {
	test('a heading is # and one space', async () => {
		expect(await svx('#   Title   \n')).toBe('# Title\n');
	});

	test('a thematic break is ---', async () => {
		expect(await svx('text\n\n___\n\n* * *\n')).toBe('text\n\n---\n\n---\n');
		expect(await svx('- a\n\n  * * *\n')).toBe('- a\n\n  ***\n');
	});

	test('a fence is backticks, longer than any in its code', async () => {
		expect(await svx('````js   title="x"\nlet a\n````\n')).toBe(
			'```js title="x"\nlet a\n```\n'
		);
		expect(await svx('`````\na ``` b\n`````\n')).toBe('````\na ``` b\n````\n');
	});

	test('an unclosed fence is closed', async () => {
		expect(await svx('```js\nlet a\n')).toBe('```js\nlet a\n```\n');
	});

	test('spaces in prose fold to one', async () => {
		expect(await svx('a   lot    of   spaces\n')).toBe('a lot of spaces\n');
	});

	test('definitions and imports stay together, markup stays on its lines', async () => {
		expect(await svx('[a]: /a\n[b]: /b\n\n[c]: /c\n')).toBe(
			'[a]: /a\n[b]: /b\n[c]: /c\n'
		);
		expect(await svx('import A from "a"\nimport B from "b"\n# x\n')).toBe(
			'import A from "a";\nimport B from "b";\n\n# x\n'
		);
		expect(await svx('text\n<Foo/>\n<Bar/>\n')).toBe(
			'text\n<Foo />\n<Bar />\n'
		);
	});
});

describe('block quotes', () => {
	test('every line has a > and a space', async () => {
		expect(await svx('>foo\n>bar\n')).toBe('> foo\n> bar\n');
		expect(await svx('>>x\n')).toBe('> > x\n');
	});

	test('an empty quote line is a bare >', async () => {
		expect(await svx('> a\n>\n> b\n')).toBe('> a\n>\n> b\n');
	});

	test('a list in a quote', async () => {
		expect(await svx('> -   a\n>     - b\n')).toBe('> - a\n>   - b\n');
	});

	test('a fence in a quote keeps its code', async () => {
		expect(await svx('>```js\n>let x\n>```\n')).toBe(
			'> ```js\n> let x\n> ```\n'
		);
	});
});

describe('indented blocks', () => {
	test('the markdown in an element is indented', async () => {
		expect(await svx('<div>\n\n# Head\n\n- a\n  - b\n\n</div>\n')).toBe(
			'<div>\n\n  # Head\n\n  - a\n    - b\n\n</div>\n'
		);
	});

	test('with tabs when the project uses them', async () => {
		expect(await svx('<div>\n\n# Head\n\n</div>\n', { useTabs: true })).toBe(
			'<div>\n\n\t# Head\n\n</div>\n'
		);
	});

	test('the markdown in a block is indented', async () => {
		expect(await svx('{#if a}\n\n- a\n\n{:else}\n\nb\n\n{/if}\n')).toBe(
			'{#if a}\n\n  - a\n\n{:else}\n\n  b\n\n{/if}\n'
		);
	});

	test('a fence in an element is indented with its code', async () => {
		expect(
			await svx('<div>\n\n```js\nif (a) {\n  b();\n}\n```\n\n</div>\n')
		).toBe('<div>\n\n  ```js\n  if (a) {\n    b();\n  }\n  ```\n\n</div>\n');
		expect(
			await svx('{#if a}\n\n```js\nx\n```\n\n{/if}\n', { useTabs: true })
		).toBe('{#if a}\n\n\t```js\n\tx\n\t```\n\n{/if}\n');
	});

	test('a pre keeps its lines', async () => {
		expect(await svx('<div>\n\n<pre>\n  x\n</pre>\n\n</div>\n')).toBe(
			'<div>\n\n  <pre>\n  x\n</pre>\n\n</div>\n'
		);
	});
});
