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
