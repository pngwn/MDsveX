import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte, token_kind } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/atx_headings');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

type HeadingSummary = { depth: number; text: string };

const collect_headings = (
	input: string,
	tokens: ReturnType<typeof parse_markdown_svelte>['tokens']
): HeadingSummary[] => {
	const headings: HeadingSummary[] = [];
	for (let index = 0; index < tokens.size; index += 1) {
		if (tokens.kind_at(index) === token_kind.heading) {
			headings.push({
				depth: tokens.extra_at(index),
				text: input.slice(
					tokens.value_start_at(index),
					tokens.value_end_at(index)
				),
			});
		}
	}
	return headings;
};

describe('ATX headings', () => {
	test('pfm example 62 recognises heading depths 1 through 6', () => {
		const input = load_fixture('62');
		const { tokens } = parse_markdown_svelte(input);

		expect(tokens.size).toBe(6);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
		expect(headings.map((heading) => heading.text)).toEqual([
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
		]);
	});

	test('pfm example 63 treats seven octothorpes as literal text', () => {
		const input = load_fixture('63');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
	});

	test('pfm example 64 requires space or tab after the marker', () => {
		const input = load_fixture('64');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
	});

	test('pfm example 65 ignores escaped markers', () => {
		const input = load_fixture('65');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
	});

	test('pfm example 66 allows inline formatting within the heading', () => {
		const input = load_fixture('66');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual([
			String.raw`foo *bar* \*baz\*`,
		]);
	});

	test('pfm example 67 trims trailing spaces after the heading content', () => {
		const input = load_fixture('67');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['foo']);
	});

	test('pfm example 68 tolerates up to three leading spaces', () => {
		const input = load_fixture('68');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([3, 2, 1]);
		expect(headings.map((heading) => heading.text)).toEqual([
			'foo',
			'foo',
			'foo',
		]);
	});

	test('pfm example 69 treats four or more leading spaces are also toleratedt', () => {
		const input = load_fixture('69');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.length).toBe(tokens.size);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['foo']);
	});

	test('pfm example 70 treats indented hashes following text as headings', () => {
		const input = load_fixture('70');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['bar']);
	});

	test('pfm example 71 keeps trailing number signs inside the heading text', () => {
		const input = load_fixture('71');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: 'foo ##' },
			{ depth: 3, text: 'bar    ###' },
		]);
	});

	test('pfm example 72 ignores trailing number signs in the content', () => {
		const input = load_fixture('72');
		const { tokens } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings).toEqual([
			{ depth: 1, text: 'foo ##################################' },
			{ depth: 5, text: 'foo ##' },
		]);
	});

	test('pfm example 73 allows trailing spaces after the optional closing sequence', () => {
		const input = load_fixture('73');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: 'foo ###' },
		]);
	});

	test('pfm example 74 requires the closing sequence to be followed only by spaces', () => {
		const input = load_fixture('74');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: 'foo ### b' },
		]);
	});

	test('pfm example 75 keeps adjacent number signs inside the heading text', () => {
		const input = load_fixture('75');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 1, text: 'foo#' },
		]);
	});

	test('pfm example 76 keeps escaped number signs in the content', () => {
		const input = load_fixture('76');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: String.raw`foo \###` },
			{ depth: 2, text: String.raw`foo #\##` },
			{ depth: 1, text: String.raw`foo \#` },
		]);
	});

	test('pfm example 77 recognises headings between thematic breaks', () => {
		const input = load_fixture('77');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: 'foo' },
		]);
	});

	test('pfm example 78 recognises headings between paragraphs', () => {
		const input = load_fixture('78');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 1, text: 'baz' },
		]);
	});

	test('pfm example 79 supports empty heading content', () => {
		const input = load_fixture('79');
		const { tokens } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: '' },
			{ depth: 1, text: '' },
			{ depth: 3, text: '###' },
		]);
	});
});
