import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { container_mismatch } from './invariance';
import type { Rule } from './invariance';
import { print_ast } from './print';
import { fed_mismatch } from './stream_shape';

// a tight item holds the content of a paragraph with no paragraph around it
const TIGHT: Rule[] = [
	{
		what: 'tight',
		expect: (kids, site) =>
			site === 'list_item'
				? kids.flatMap((kid) => (kid.kind === 'paragraph' ? kid.kids : [kid]))
				: kids,
	},
];

const quoted = (source: string): string =>
	source
		.split('\n')
		.map((row) => (row === '' ? '>' : `> ${row}`))
		.join('\n') + '\n';

const listed = (source: string): string =>
	source
		.split('\n')
		.map((row, i) => (i === 0 ? `- ${row}` : row === '' ? '' : `  ${row}`))
		.join('\n') + '\n';

const SOURCES: [string, string][] = [
	['an element that holds a paragraph', '<div>\na\n</div>'],
	['an element that holds a heading', '<div>\n# a\n</div>'],
	['an element in an element', '<section>\n<div>\na\n</div>\n</section>'],
	['a component that holds a list', '<Box>\n- a\n- b\n</Box>'],
	['a script', '<script>\nlet a = 1;\nlet b = a < 2;\n</script>'],
	['a style', '<style>\np > a {\n  color: red;\n}\n</style>'],
	['a comment over lines', '<!-- a\nb\n  c -->'],
	['a fence', '```js\na\n  b\n```'],
	['a fence with a fence line of two backticks in it', '```\n``\n```'],
	['an empty fence', '```\n```'],
];

describe('a block quote and a list item hold leaves that run over lines', () => {
	test.each(SOURCES)('%s in a block quote: %j', (_, source) => {
		expect(
			container_mismatch('block_quote', source.split('\n'), true, TIGHT)
		).toBe('');
		expect(fed_mismatch(quoted(source))).toBe('');
	});

	test.each(SOURCES)('%s in a list item: %j', (_, source) => {
		expect(
			container_mismatch('list_item', source.split('\n'), true, TIGHT)
		).toBe('');
		expect(fed_mismatch(listed(source))).toBe('');
	});

	test.each(SOURCES)('%s in a list item in a block quote: %j', (_, source) => {
		expect(fed_mismatch(quoted(listed(source).trimEnd()))).toBe('');
	});
});

describe('the text of a leaf leaves out what its containers put before its lines', () => {
	const values = (input: string, kind: string): string[] => {
		const { nodes } = parse_markdown_svelte(input);
		const out: string[] = [];
		for (let i = 0; i < nodes.size; i++) {
			const node = nodes.get_node(i);
			if (node.kind !== kind) continue;
			out.push(nodes._strings[i] ?? input.slice(node.value[0], node.value[1]));
		}
		return out;
	};

	test.each([
		[
			'a fence in a block quote',
			'> ```\n> a\n>   b\n>\n> c\n> ```\n',
			'code_fence',
			'a\n  b\n\nc',
		],
		[
			'a fence in a list item',
			'- ```\n  a\n    b\n\n  c\n  ```\n',
			'code_fence',
			'a\n  b\n\nc',
		],
		[
			'a fence in an item in a quote',
			'> - ```\n>   a\n>   ```\n',
			'code_fence',
			'a',
		],
		[
			'a fence in a quote in an item',
			'- > ```\n  > a\n  > ```\n',
			'code_fence',
			'a',
		],
		[
			'a comment in a block quote',
			'> <!-- a\n> b -->\n',
			'html_comment',
			' a\nb ',
		],
		[
			'a comment in a list item',
			'- <!-- a\n  b -->\n',
			'html_comment',
			' a\nb ',
		],
		[
			'a script in a block quote',
			'> <script>\n> let a;\n> </script>\n',
			'html',
			'\nlet a;\n',
		],
		[
			'a style in a list item',
			'- <style>\n  p {}\n  </style>\n',
			'html',
			'\np {}\n',
		],
	])('%s: %j', (_, input, kind, text) => {
		expect(values(input, kind)).toEqual([text]);
		expect(fed_mismatch(input)).toBe('');
	});

	test('the value range still covers the source as written', () => {
		const input = '> ```\n> a\n> b\n> ```\n';
		const { nodes } = parse_markdown_svelte(input);
		const fence = nodes.get_node(
			nodes.get_node(nodes.get_node().children[0]).children[0]
		);
		expect(input.slice(fence.value[0], fence.value[1])).toBe('> a\n> b');
	});
});

describe('a leaf or an element left open ends where its container ends', () => {
	const kinds = (input: string): string[] =>
		print_ast(parse_markdown_svelte(input).nodes, input)
			.split('\n')
			.map((line) => line.trim().split(' ')[0])
			.filter((kind) => kind !== 'line_break' && kind !== 'text');

	test.each([
		[
			'a fence in a block quote',
			'> ```\n> a\nb\n',
			['root', 'block_quote', 'code_fence', 'paragraph'],
		],
		[
			'a fence in a list item',
			'- ```\n  a\nb\n',
			['root', 'list', 'list_item', 'code_fence', 'paragraph'],
		],
		[
			'a script in a block quote',
			'> <script>\n> let a;\nb\n',
			['root', 'block_quote', 'html', 'paragraph'],
		],
		[
			'an element in a block quote, which is then text',
			'> <div>\n> a\nb\n',
			['root', 'block_quote', 'paragraph', 'paragraph', 'paragraph'],
		],
		[
			'an element in a list item, which is then text',
			'- <div>\n  a\n\nb\n',
			['root', 'list', 'list_item', 'paragraph'],
		],
	])('%s: %j', (_, input, expected) => {
		expect(kinds(input)).toEqual(expected);
		expect(fed_mismatch(input)).toBe('');
	});

	test('a comment whose lines leave the quote is text', () => {
		const input = '> <!-- a\nb -->\n';
		expect(kinds(input)).not.toContain('html_comment');
		expect(fed_mismatch(input)).toBe('');
	});
});
