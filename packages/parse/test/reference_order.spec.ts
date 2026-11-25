import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { undefined_references } from '../src/buf_utils';
import { take_reference } from '../src/utils';
import { every_path } from './stream_shape';

describe('a reference is one by its syntax, wherever its definition is', () => {
	test('a definition below fills a full and a collapsed reference', () => {
		const tree = every_path('[x][a] and [a][]\n\n[a]: /u "t"\n');
		expect(tree).toContain('link href="/u" title="t"\n      text "x"');
		expect(tree).toContain('link href="/u" title="t"\n      text "a"');
	});

	test('a definition below fills an image', () => {
		expect(every_path('![alt][a]\n\n[a]: /i.png\n')).toContain(
			'image src="/i.png"'
		);
	});

	test('a definition in a later container fills it', () => {
		expect(every_path('[x][a]\n\n> [a]: /u\n')).toContain('link href="/u"');
	});

	test('the label matches as it does for a definition above', () => {
		expect(every_path('[x][Foo  Bar]\n\n[foo bar]: /u\n')).toContain(
			'link href="/u"'
		);
	});

	test('the first definition is the one taken, above or below', () => {
		expect(every_path('[x][a]\n\n[a]: /one\n[a]: /two\n')).toContain(
			'link href="/one"'
		);
		expect(every_path('[a]: /one\n\n[x][a]\n\n[a]: /two\n')).toContain(
			'link href="/one"'
		);
	});

	test('a reference with no definition is a link with no url', () => {
		const tree = every_path('[x][a] and ![y][b]\n');
		expect(tree).toContain('link\n      text "x"');
		expect(tree).toContain('image\n      text "y"');
		expect(tree).not.toContain('href');
	});

	test('a caret label is a footnote reference after text in brackets', () => {
		const tree = every_path('[x][^1]\n\n[^1]: note\n');
		expect(tree).toContain('footnote_reference');
		expect(tree).not.toContain('link');
	});

	test('a reference comes before a destination in parentheses', () => {
		const tree = every_path('[x][a](/v)\n\n[a]: /u\n');
		expect(tree).toContain('link href="/u"');
		expect(tree).toContain('text "(/v)"');
	});

	test('an escaped bracket is text', () => {
		expect(every_path('\\[x][a]\n')).not.toContain('link');
		expect(every_path('m[0]\\[1]\n')).not.toContain('link');
	});
});

describe('undefined_references', () => {
	test('lists each reference no definition filled, with its label', () => {
		take_reference();
		const source = '[x][a] [b][] ![y][c] [z][d]\n\n[d]: /u\n';
		const { nodes } = parse_markdown_svelte(source);
		expect(take_reference()).toBe(true);
		const found = undefined_references(nodes, source);
		expect(found.map((r) => [r.label, r.image])).toEqual([
			['a', false],
			['b', false],
			['c', true],
		]);
		expect(source.slice(nodes.start_at(found[2].node))).toMatch(/^!\[y\]/);
	});

	test('a document whose references all resolve leaves no note', () => {
		take_reference();
		parse_markdown_svelte('[x][a] [y](/v)\n\n[a]: /u\n');
		expect(take_reference()).toBe(false);
	});
});
