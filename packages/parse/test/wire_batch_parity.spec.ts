import { describe, expect, it, vi } from 'vitest';

import { expect_parity, run_batch, run_wire, shape } from './plugin_harness';
import { pick, random } from './stream_shape';

function tree(source: string): unknown {
	return expect_parity(source, () => []);
}

describe('an image left open', () => {
	it('keeps both characters of its opener', () => {
		expect(tree('![')).toEqual(['root', ['paragraph', 'text:![']]);
		expect(tree('a![')).toEqual(['root', ['paragraph', 'text:a![']]);
	});

	it('keeps them before the text that follows', () => {
		expect(tree('x ![] more\n')).toEqual([
			'root',
			['paragraph', 'text:x ![] more'],
		]);
	});

	it('keeps them at the end of a line', () => {
		expect(tree('a ![\nb\n')).toEqual([
			'root',
			['paragraph', 'text:a ![', 'soft_break', 'text:b'],
		]);
	});

	it('keeps them in a table cell', () => {
		expect(tree('| ![ | b |\n|-|-|\n')).toEqual([
			'root',
			[
				'table',
				['table_header', ['table_cell', 'text:!['], ['table_cell', 'text:b']],
			],
		]);
	});
});

describe('a pipe outside a table after a delimiter left open', () => {
	it('is not text when the line ends at it', () => {
		expect(tree('*|\n')).toEqual(['root', ['paragraph', 'text:*']]);
		expect(tree('x ~~|\n')).toEqual(['root', ['paragraph', 'text:x ~~']]);
		expect(tree('_|')).toEqual(['root', ['paragraph', 'text:_']]);
	});

	it('is not text before a line end inside the delimiter', () => {
		expect(tree('x [|\nb')).toEqual([
			'root',
			['paragraph', 'text:x [', 'soft_break', 'text:b'],
		]);
		expect(tree('x *|\nb')).toEqual([
			'root',
			['paragraph', 'text:x *', 'soft_break', 'text:b'],
		]);
	});

	it('is not text before a node inside the delimiter', () => {
		expect(tree('[|*a* b')).toEqual([
			'root',
			['paragraph', 'text:[', ['strong_emphasis', 'text:a'], 'text: b'],
		]);
	});
});

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

const INLINE = [
	'*',
	'**',
	'_',
	'~~',
	'[',
	']',
	'](u)',
	'![',
	'`',
	':y[',
	'{x}',
	'\\',
	'a',
	'b c',
	' ',
	' ',
];

const TAGS = ['<span>', '</span>'];

const DOC_PIECES = [...INLINE, ...TAGS, '|', '\\|', '# ', '\n', '\n\n'];

// a tag in a cell is revoked without its text and the wire keeps only <
const CELL_PIECES = [...INLINE, '\\|', '|', '|'];

const DELIMITER_ROWS = ['---', '|-|', '|-|-|', '-|-'];

/**
 * a tag never starts a line, its paragraph is revoked before a delimiter
 * left open in it and the builders repair that differently
 */
function line(rand: () => number, pieces: string[], most: number): string {
	let source = '';
	const length = Math.floor(rand() * most);
	for (let k = 0; k < length; k++) {
		const piece = pick(rand, pieces);
		if (TAGS.includes(piece) && /(^|\n)[ |]*$/.test(source)) source += 'a';
		source += piece;
	}
	return source;
}

/** no space ends a cell, the batch builder gets an empty text node for one */
function row(rand: () => number): string {
	return line(rand, CELL_PIECES, 7).replace(/ +(\||$)/g, '$1');
}

function table(rand: () => number): string {
	let source = `${row(rand)}\n${pick(rand, DELIMITER_ROWS)}\n`;
	const rows = Math.floor(rand() * 3);
	for (let r = 0; r < rows; r++) source += `${row(rand)}\n`;
	// a backslash ending a row keeps the table open past a blank line
	if (rand() < 0.3) source += `\n${row(rand).replace(/\|/g, '').trimEnd()}\n`;
	return rand() < 0.3 ? source.slice(0, -1) : source;
}

const JOINED = { merge_text: true };

/** an expect per input is too slow, so this returns what differs */
function mismatch(source: string): string | null {
	const batch = run_batch(source);
	const want = JSON.stringify(shape(batch.nodes, batch.source, 0, JOINED));
	for (const chunk of [0, 1, 3]) {
		const wire = run_wire(source, undefined, chunk);
		const got = JSON.stringify(shape(wire.nodes, wire.source, 0, JOINED));
		if (got !== want) {
			return `${JSON.stringify(source)} over the wire fed ${chunk}: ${got}, batch ${want}`;
		}
	}
	return null;
}

function first_mismatch(make: () => string, runs: number): string | null {
	// the parser reports a state loop it had to break out of
	const loops = vi.spyOn(console, 'error').mockImplementation(() => {});
	let found: string | null = null;
	for (let i = 0; i < runs && found === null; i++) found = mismatch(make());
	loops.mockRestore();
	return found;
}

describe('random input builds one tree on both builders', () => {
	it('for documents', () => {
		const rand = random(1);
		const make = () => line(rand, DOC_PIECES, 13);
		expect(first_mismatch(make, 1500)).toBe(null);
	});

	it('for tables', () => {
		const rand = random(2);
		expect(first_mismatch(() => table(rand), 1500)).toBe(null);
	});
});
