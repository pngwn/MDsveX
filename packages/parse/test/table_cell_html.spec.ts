import { describe, expect, test } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import type { Emitter } from '../src/opcodes';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind, kind_to_string } from '../src/utils';
import { print_ast } from './print';

const enum Seen {
	open,
	closed,
	revoked,
}

/** every node opened once and ended once, what a builder needs of the stream */
class Stream implements Emitter {
	private kinds: NodeKind[] = [];
	private seen: Seen[] = [];
	broken: string[] = [];

	private fail(what: string, id: number): void {
		const kind = id === undefined ? 'no' : kind_to_string(this.kinds[id]);
		this.broken.push(`${what}: ${kind} ${id}`);
	}

	private add(id: number, kind: NodeKind, parent: number, seen: Seen): void {
		if (this.seen[id] !== undefined) this.fail('opened twice', id);
		if (parent !== -1 && this.seen[parent] === undefined) {
			this.fail('opened under an unknown parent', id);
		}
		this.kinds[id] = kind;
		this.seen[id] = seen;
	}

	open(id: number, kind: NodeKind, _start: number, parent: number): void {
		this.add(id, kind, parent, Seen.open);
	}
	leaf(id: number, kind: NodeKind, _start: number, parent: number): void {
		this.add(id, kind, parent, Seen.closed);
	}
	close(id: number): void {
		if (this.seen[id] === undefined) this.fail('closed but never opened', id);
		else if (this.seen[id] === Seen.closed) this.fail('closed twice', id);
		else if (this.seen[id] === Seen.revoked)
			this.fail('closed after a revoke', id);
		this.seen[id] = Seen.closed;
	}
	revoke(id: number): void {
		if (this.seen[id] === undefined) this.fail('revoked but never opened', id);
		this.seen[id] = Seen.revoked;
	}
	commit(): void {}
	text(): void {}
	attr(): void {}
	set_value_start(): void {}
	set_value_end(): void {}
	cursor(): void {}

	finish(): string[] {
		for (let id = 0; id < this.seen.length; id++) {
			if (this.seen[id] === Seen.open) this.fail('never closed', id);
		}
		return this.broken;
	}
}

function broken(source: string, chunk: number): string[] {
	const stream = new Stream();
	const parser = new PFMParser(stream);
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
	return stream.finish();
}

function fed(source: string, chunk: number): string {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk) {
		parser.feed(source.slice(i, i + chunk));
	}
	parser.finish();
	return print_ast(tree.get_buffer(), source);
}

function checked_tree(source: string): string {
	for (const chunk of [0, 1, 3]) {
		expect(broken(source, chunk), `fed ${chunk}`).toEqual([]);
	}
	const whole = print_ast(parse_markdown_svelte(source).nodes, source);
	for (const chunk of [1, 3]) {
		expect(fed(source, chunk), `fed ${chunk}`).toBe(whole);
	}
	return whole;
}

function lines(...rows: string[]): string {
	return rows.join('\n');
}

function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick(rand: () => number, from: string[]): string {
	return from[Math.floor(rand() * from.length)];
}

describe('an html element left open in a table cell', () => {
	test('a close tag in a later row is text', () => {
		expect(checked_tree('| <span>- [ ] \n---\n~</span>---\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text tag="span" "<span>"',
				'        text "- "',
				'        text "[ "',
				'        text "]"',
				'    table_row',
				'      table_cell',
				'        text "~</span>---"'
			)
		);
	});

	test('opened in a body row', () => {
		expect(checked_tree('| ]\n---\n<span>:::\n*</span>~~')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "]"',
				'    table_row',
				'      table_cell',
				'        text tag="span" "<span>:::"',
				'    table_row',
				'      table_cell',
				'        text "*"',
				'        text "</span>"',
				'        text "~~"'
			)
		);
	});

	test('a block level tag name', () => {
		expect(checked_tree(' |<div>```\n---\n[</div>b c')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text tag="div" "<div>```"',
				'    table_row',
				'      table_cell',
				'        text "[</div>b c"'
			)
		);
	});

	test('a close tag in the next cell of the same row is text', () => {
		expect(checked_tree('| a <span>b | c</span> |\n|-|-|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text "a "',
				'        text tag="span" "<span>b"',
				'      table_cell',
				'        text "c"',
				'        text "</span>"'
			)
		);
	});

	test('a close tag after the table is text', () => {
		expect(checked_tree('| a <i>b |\n|-|\n\nc</i> d\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a "',
				'        text tag="i" "<i>b"',
				'  line_break',
				'  paragraph',
				'    text "c"',
				'    text "</i> d"',
				'  line_break'
			)
		);
	});

	test('an element around the table still closes from a row', () => {
		expect(checked_tree('<span> |---\n---\n<div>:::\n</span>&amp;')).toBe(
			lines(
				'root',
				'  html tag="span"',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "---"',
				'      table_row',
				'        table_cell',
				'          text tag="div" "<div>:::"',
				'      table_row',
				'        table_cell',
				'  paragraph',
				'    text "&amp;"'
			)
		);
	});

	test('an element closed in its own cell is kept', () => {
		expect(
			checked_tree('| <b>a</b> | <i>b |\n|-|-|\n| c</i> |<b>d</b>|\n')
		).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        html tag="b"',
				'          text "a"',
				'      table_cell',
				'        text tag="i" "<i>b"',
				'    table_row',
				'      table_cell',
				'        text "c"',
				'        text "</i>"',
				'      table_cell',
				'        html tag="b"',
				'          text "d"'
			)
		);
	});
});

// a bare delimiter run or an escaped pipe in a cell breaks the stream another way
const CELL_PIECES = [
	'<span>',
	'</span>',
	'<div>',
	'</div>',
	'<b>',
	'</b>',
	'<img src="i.png">',
	'a',
	'b c',
	' ',
	'[',
	']',
	'](u)',
	'`',
	':y[',
	'{x}',
	'- ',
	'&amp;',
	'---',
	'|',
	'|',
];

const DELIMITER_ROWS = ['---', '|-|', '|-|-|', '-|-'];

function cells(rand: () => number): string {
	let row = '';
	const length = Math.floor(rand() * 7);
	for (let k = 0; k < length; k++) row += pick(rand, CELL_PIECES);
	return row;
}

function table(rand: () => number): string {
	// a leading pipe, a tag before it would open an element around the table
	let source = `|${cells(rand)}\n${pick(rand, DELIMITER_ROWS)}\n`;
	const rows = Math.floor(rand() * 4);
	for (let r = 0; r < rows; r++) {
		source += `${rand() < 0.7 ? '|' : ''}${cells(rand)}\n`;
	}
	if (rand() < 0.5) source += `\n${cells(rand).replace(/\|/g, '')}\n`;
	return rand() < 0.3 ? source.slice(0, -1) : source;
}

describe('random tables with html in their cells', () => {
	test('every node is opened once and ended once', () => {
		const rand = random(1);
		for (let i = 0; i < 4000; i++) {
			const source = table(rand);
			for (const chunk of [0, 3]) {
				expect(
					broken(source, chunk),
					`${JSON.stringify(source)} fed ${chunk}`
				).toEqual([]);
			}
		}
	});
});
