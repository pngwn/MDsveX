import { describe, expect, test } from 'vitest';

import { run_batch, run_wire, shape } from './plugin_harness';
import { checked_tree, lines } from './stream_shape';

/** the tree with neighbouring text joined, the same from both builders, whole and fed */
function joined(source: string): unknown {
	const whole = run_batch(source);
	const expected = shape(whole.nodes, whole.source, 0, { merge_text: true });
	for (const chunk of [1, 2, 3]) {
		const fed = run_batch(source, undefined, chunk);
		expect(
			shape(fed.nodes, fed.source, 0, { merge_text: true }),
			`fed ${chunk}`
		).toEqual(expected);
	}
	for (const chunk of [0, 1, 3]) {
		const wire = run_wire(source, undefined, chunk);
		expect(
			shape(wire.nodes, wire.source, 0, { merge_text: true }),
			`wire ${chunk}`
		).toEqual(expected);
	}
	return expected;
}

function paragraph(...children: unknown[]): unknown {
	return ['root', ['paragraph', ...children]];
}

function body_cell(...children: unknown[]): unknown {
	return [
		'root',
		[
			'table',
			['table_header', ['table_cell', 'text:h']],
			['table_row', ['table_cell', ...children]],
		],
	];
}

function header_cell(...children: unknown[]): unknown {
	return [
		'root',
		[
			'table',
			['table_header', ['table_cell', ...children]],
			['table_row', ['table_cell', 'text:b']],
		],
	];
}

// the repair works out where these end, the parser sends no text with their revoke
const DERIVED = ['[', '![', '_', '*', '~~', '^', '~', ':x['];
// a code span and a tag are revoked with their text
const ALL = [...DERIVED, '`', '``', '<span>'];
// a pipe straight after one of these is the intraword marker and prints nothing
const MARKS = ['_', '*', '~~', '~'];

describe('the first thing after a delimiter that never closes', () => {
	describe.each(ALL)('%s in a paragraph', (delimiter) => {
		test('an escape loses its backslash', () => {
			expect(joined(`x ${delimiter}\\*a\n`)).toEqual(
				paragraph(`text:x ${delimiter}*a`)
			);
		});

		test('an escaped backslash leaves one', () => {
			expect(joined(`x ${delimiter}\\\\a\n`)).toEqual(
				paragraph(`text:x ${delimiter}\\a`)
			);
		});

		test('an entity stays as written', () => {
			expect(joined(`x ${delimiter}&amp;a\n`)).toEqual(
				paragraph(`text:x ${delimiter}&amp;a`)
			);
		});

		test('a hard break follows the delimiter', () => {
			expect(joined(`x ${delimiter}\\\nb\n`)).toEqual(
				paragraph(`text:x ${delimiter}`, 'hard_break', 'text:b')
			);
		});

		test('an escape before more inline content', () => {
			expect(joined(`x ${delimiter}\\*a *b* c\n`)).toEqual(
				paragraph(
					`text:x ${delimiter}*a `,
					['strong_emphasis', 'text:b'],
					'text: c'
				)
			);
		});
	});

	describe.each(DERIVED)('%s at the start of a paragraph', (delimiter) => {
		test('an escape loses its backslash', () => {
			expect(joined(`${delimiter}\\*a\n`)).toEqual(
				paragraph(`text:${delimiter}*a`)
			);
		});

		test('a hard break follows the delimiter', () => {
			expect(joined(`${delimiter}\\\nb\n`)).toEqual(
				paragraph(`text:${delimiter}`, 'hard_break', 'text:b')
			);
		});
	});

	describe.each(DERIVED)('%s in a table cell', (delimiter) => {
		test.each([
			['body', body_cell, (cell: string) => `| h |\n|-|\n| ${cell} |\n`],
			['header', header_cell, (cell: string) => `| ${cell} |\n|-|\n| b |\n`],
		])('%s cell', (_, cell, table) => {
			expect(joined(table(`${delimiter}\\*a`)), 'an escape').toEqual(
				cell(`text:${delimiter}*a`)
			);
			expect(joined(table(`${delimiter}\\|a`)), 'an escaped pipe').toEqual(
				cell(`text:${delimiter}|a`)
			);
			expect(joined(table(`${delimiter}&amp;a`)), 'an entity').toEqual(
				cell(`text:${delimiter}&amp;a`)
			);
			expect(
				joined(table(`${delimiter}\\*a *b* c`)),
				'an escape before more inline content'
			).toEqual(
				cell(`text:${delimiter}*a `, ['strong_emphasis', 'text:b'], 'text: c')
			);
		});
	});

	test.each(DERIVED)('%s before a pipe outside a table', (delimiter) => {
		const pipe = MARKS.includes(delimiter) ? '' : '|';
		expect(joined(`x ${delimiter}|a\n`)).toEqual(
			paragraph(`text:x ${delimiter}${pipe}a`)
		);
	});

	describe.each(DERIVED)('%s with nothing after it', (delimiter) => {
		test('keeps its whole text', () => {
			expect(joined(`x ${delimiter}\n`)).toEqual(
				paragraph(`text:x ${delimiter}`)
			);
			expect(joined(`| h |\n|-|\n|${delimiter}|\n`)).toEqual(
				body_cell(`text:${delimiter}`)
			);
			expect(joined(`|${delimiter}|\n|-|\n| b |\n`)).toEqual(
				header_cell(`text:${delimiter}`)
			);
		});

		test('ends before a pipe that prints nothing, or keeps one that is text', () => {
			const pipe = MARKS.includes(delimiter) ? '' : '|';
			expect(joined(`x ${delimiter}|\n`)).toEqual(
				paragraph(`text:x ${delimiter}${pipe}`)
			);
		});
	});

	test('an escaped & starts its own node, which keeps a reference as written', () => {
		expect(checked_tree('[\\&amp;a')).toBe(
			lines('root', '  paragraph', '    text "["', '    text "&amp;a"')
		);
	});

	test('the escaped text is a node of its own, as after other text', () => {
		expect(checked_tree('[\\*a')).toBe(
			lines('root', '  paragraph', '    text "["', '    text "*a"')
		);
		expect(checked_tree('x \\*a')).toBe(
			lines('root', '  paragraph', '    text "x "', '    text "*a"')
		);
	});

	test('text straight after the delimiter still joins it', () => {
		expect(checked_tree('[a')).toBe(
			lines('root', '  paragraph', '    text "[a"')
		);
		expect(checked_tree('~~a')).toBe(
			lines('root', '  paragraph', '    text "~~a"')
		);
		expect(checked_tree('| h |\n|-|\n| ![a |\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "h"',
				'    table_row',
				'      table_cell',
				'        text "![a"'
			)
		);
	});
});
