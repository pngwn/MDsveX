import { expect, test } from 'vitest';

import type { ParsePlugin } from '../src/plugin_types';
import { expect_parity_logged } from './plugin_harness';

/** the text_content each node of a kind has when it closes, on the batch builder and over the wire */
function texts(source: string, ...kinds: string[]): string[] {
	return expect_parity_logged(source, (log) => {
		const plugin: ParsePlugin = {};
		for (const kind of kinds) {
			(plugin as Record<string, unknown>)[kind] = {
				parse: (node: { text_content: string }) => () =>
					void log.push(`${kind} ${JSON.stringify(node.text_content)}`),
			};
		}
		return { plugins: [plugin] };
	}).log;
}

test('the lines of a paragraph are joined with a space', () => {
	expect(texts('one\ntwo\\\nthree\n', 'paragraph')).toEqual([
		'paragraph "one two three"',
	]);
});

test('a break inside a link is a space too', () => {
	expect(texts('a *b\nc* [d\ne](/f)\n', 'paragraph', 'link')).toEqual([
		'link "d e"',
		'paragraph "a b c d e"',
	]);
});

test('the text of a comment is in no text but its own', () => {
	expect(
		texts(
			'## A <!-- hidden --> b\n\nc <!-- d\ne --> f\n',
			'heading',
			'paragraph',
			'html_comment'
		)
	).toEqual([
		'html_comment " hidden "',
		'heading "A  b"',
		'html_comment " d\\ne "',
		'paragraph "c  f"',
	]);
});

test('a block comment in a container is left out of its text', () => {
	expect(texts('> a\n>\n> <!-- b -->\n>\n> c\n', 'block_quote')).toEqual([
		'block_quote "ac"',
	]);
});

test('code is kept as written', () => {
	expect(
		texts('a `b  c` d\n\n```\ne\nf\n```\n', 'paragraph', 'code_fence')
	).toEqual(['paragraph "a b  c d"', 'code_fence "e\\nf"']);
});
