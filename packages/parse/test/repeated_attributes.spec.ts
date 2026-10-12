import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { every_path } from './stream_shape';

function html(source: string, at = 0): Record<string, unknown> {
	const { nodes } = parse_markdown_svelte(source);
	let found = 0;
	for (let index = 0; index < nodes.size; index++) {
		const node = nodes.get_node(index);
		if (node.kind === 'html' && found++ === at) return node.metadata;
	}
	throw new Error('no html node');
}

describe('a repeated attribute on a tag', () => {
	test('keeps the first value as HTML does, and the later ones as written', () => {
		expect(html('<img alt=first alt="">\n')).toEqual({
			tag: 'img',
			attributes: { alt: 'first' },
			repeated: [['alt', '']],
			self_closing: true,
		});
	});

	test('keeps every later value in source order', () => {
		expect(html('<Chart a=1 b a="2" {a} a={x} b="y" c />\n')).toEqual({
			tag: 'Chart',
			attributes: { a: '1', b: true, c: true },
			repeated: [
				['a', '2'],
				['a', { type: 'expression', value: 'a' }],
				['a', { type: 'expression', value: 'x' }],
				['b', 'y'],
			],
			self_closing: true,
		});
	});

	test('a tag with no repeated attribute has no list', () => {
		expect(html('<a constructor=1 toString href="/u">x</a>\n')).toEqual({
			tag: 'a',
			attributes: { constructor: '1', toString: true, href: '/u' },
		});
	});

	test.each([
		['a <b id=x id=y>c</b> d\n', 0],
		['<div class="a" class="b">\n\nx\n\n</div>\n', 0],
		['<div class="a" class="b">x</div>\n', 0],
		['<script lang="ts" lang="js">let a;</script>\n', 0],
		['| a |\n|---|\n| <b id=x id=y>c</b> |\n', 0],
		['> <Box id=x id=y />\n', 0],
		['- <Box id=x id=y>\n\n  a\n\n  </Box>\n', 0],
	])('%j holds it wherever the tag is read', (source, at) => {
		expect(html(source, at).repeated).toHaveLength(1);
		every_path(source);
	});

	test('is the same tree whole, fed and over the wire', () => {
		expect(every_path('<img alt=first alt="">\n')).toContain(
			'html tag="img" alt="first" repeated=[["alt",""]] self_closing=true'
		);
	});
});
