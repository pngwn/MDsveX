import { describe, expect, it } from 'vitest';

import { expect_parity } from './plugin_harness';

function tree(source: string): unknown {
	return expect_parity(source, () => []);
}

describe('trailing space trimmed after an earlier text run', () => {
	it('keeps the text before an escape in a heading', () => {
		expect(tree('# a\\*b \n')).toEqual(['root', ['heading', 'text:a*b']]);
	});

	it('keeps the text before a pipe in a heading', () => {
		expect(tree('# a|b ')).toEqual(['root', ['heading', 'text:ab']]);
	});

	it('keeps both tildes of a heading', () => {
		expect(tree('# ~~ ')).toEqual(['root', ['heading', 'text:~~']]);
	});

	it('keeps both tildes of a table cell', () => {
		expect(tree('|a\n|-|\n|~~ |\n')).toEqual([
			'root',
			[
				'table',
				['table_header', ['table_cell', 'text:a']],
				['table_row', ['table_cell', 'text:~~']],
			],
		]);
	});
});

describe('a space that ends a heading', () => {
	it('gets no text node after an inline node', () => {
		expect(tree('# *a* \n')).toEqual([
			'root',
			['heading', ['strong_emphasis', 'text:a']],
		]);
		expect(tree('# <span>b</span>\t')).toEqual([
			'root',
			['heading', ['html', 'text:b']],
		]);
	});

	it('gets no text node after a code span', () => {
		expect(tree('# `a` ')).toEqual(['root', ['heading', 'code_span']]);
		expect(tree('# ``a`` \n')).toEqual(['root', ['heading', 'code_span']]);
	});

	it('is kept before more text', () => {
		expect(tree('# *a* b \n')).toEqual([
			'root',
			['heading', ['strong_emphasis', 'text:a'], 'text: b'],
		]);
		expect(tree('# `a` b')).toEqual([
			'root',
			['heading', 'code_span', 'text: b'],
		]);
	});
});
