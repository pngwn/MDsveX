import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte, PFMParser } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';

function fence_codes(nodes: NodeBuffer, source: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < nodes.size; i++) {
		const node = nodes.get_node(i);
		if (node.kind !== 'code_fence') continue;
		const [vs, ve] = node.value;
		out.push(nodes._strings[i] ?? (ve > vs ? source.slice(vs, ve) : ''));
	}
	return out;
}

function fed(source: string, size: number): NodeBuffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += size)
		parser.feed(source.slice(i, i + size));
	parser.finish();
	return tree.get_buffer();
}

// lines that would be blocks outside a fence
const BODIES = [
	['let x = 1;', '  x++;'],
	['# heading', '', '> quote', '- item *x*', '    four'],
	['', 'after a blank', ''],
	['<div>', '{#if x}', ':::box', '</div>'],
];

const SITES: [string, (rows: string[], pad: string) => string[]][] = [
	['root', (rows, pad) => rows.map((r) => (r === '' ? r : pad + r))],
	[
		'element',
		(rows, pad) => [
			'<div>',
			...rows.map((r) => (r === '' ? r : pad + r)),
			'</div>',
		],
	],
	[
		'branch',
		(rows, pad) => [
			'{#if a}',
			...rows.map((r) => (r === '' ? r : pad + r)),
			'{/if}',
		],
	],
	[
		'directive',
		(rows, pad) => [
			':::note[]',
			...rows.map((r) => (r === '' ? r : pad + r)),
			':::',
		],
	],
	[
		'list item',
		(rows, pad) => [
			'- a',
			'',
			...rows.map((r) => (r === '' ? r : '  ' + pad + r)),
		],
	],
	['block quote', (rows, pad) => rows.map((r) => '> ' + pad + r)],
];

describe('an indented fence holds the code of the same fence unindented', () => {
	for (const [site, place] of SITES) {
		for (const pad of ['  ', '    ', '\t', ' \t']) {
			for (const body of BODIES) {
				const rows = ['```js', ...body, '```'];
				const plain = place(rows, '').join('\n') + '\n';
				const indented = place(rows, pad).join('\n') + '\n';
				test(`${site} ${JSON.stringify(pad)} ${JSON.stringify(body[0])}`, () => {
					const want = fence_codes(parse_markdown_svelte(plain).nodes, plain);
					expect(want).toEqual([body.join('\n')]);
					expect(
						fence_codes(parse_markdown_svelte(indented).nodes, indented)
					).toEqual(want);
					for (const size of [1, 3, 16]) {
						expect(fence_codes(fed(indented, size), indented)).toEqual(want);
					}
				});
			}
		}
	}

	test('a line indented less than the fence loses what it has', () => {
		const source = '    ```\n  two\nnone\n      six\n    ```\n';
		expect(fence_codes(parse_markdown_svelte(source).nodes, source)).toEqual([
			'two\nnone\n  six',
		]);
	});

	test('a tab past the indent leaves its columns past it as spaces', () => {
		const source = ' ```\n\tx\n ```\n';
		expect(fence_codes(parse_markdown_svelte(source).nodes, source)).toEqual([
			' x',
		]);
	});

	test('a fence after a tag on its line has no indent of its own', () => {
		for (const source of [
			'<div>  ```js\n  x\n  ```\n</div>\n',
			'> <div>  ```js\n>   x\n> ```\n> </div>\n',
			'{#if a}  ```js\n  x\n  ```\n{/if}\n',
		]) {
			expect(fence_codes(parse_markdown_svelte(source).nodes, source)).toEqual([
				'  x',
			]);
			expect(fence_codes(fed(source, 1), source)).toEqual(['  x']);
		}
	});

	test('a tab counts as the tab size', () => {
		const source = '\t```\n    x\n\t```\n';
		const tree = new TreeBuilder(source.length);
		new PFMParser(tree, 4).parse(source);
		expect(fence_codes(tree.get_buffer(), source)).toEqual(['x']);
	});

	test('an unindented fence holds no string', () => {
		const source = '```\n  x\n```\n';
		const { nodes } = parse_markdown_svelte(source);
		expect(nodes._strings[1]).toBeUndefined();
	});

	test('an indented fence whose lines have nothing to take off holds no string', () => {
		const source = '  ```\nx\ny\n  ```\n';
		const { nodes } = parse_markdown_svelte(source);
		expect(nodes._strings[1]).toBeUndefined();
		expect(fence_codes(nodes, source)).toEqual(['x\ny']);
	});
});
