import { describe, it, expect } from 'vitest';
import { PFMParser } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind } from '../src/utils';
import { print_ast } from './print';

function parse_with(parser: PFMParser, builder: TreeBuilder, source: string) {
	builder.reset();
	parser.parse(source);
	return print_ast(builder.get_buffer(), source);
}

function parse_fresh(source: string) {
	const builder = new TreeBuilder(64);
	return parse_with(new PFMParser(builder), builder, source);
}

// documents that end with parser flags still set
const LEAKY = ['# ` ', '> # ` ', '- # ` '];

const FOLLOWERS = [
	'a\n~~~\nb',
	'Foo\n<b>\nbaz',
	'_a_ and *b*\nnext line',
	'# heading\n\ntext\nmore',
];

class Stopped extends Error {}

/** a builder that throws at the first text it is given, which leaves the parser part way through a block */
class Stopping extends TreeBuilder {
	stop = false;

	text(parent: number, start: number, end: number, kind?: number): void {
		if (this.stop) throw new Stopped();
		super.text(parent, start, end, kind);
	}

	leaf(
		id: number,
		kind: number,
		start: number,
		parent: number,
		value_start: number,
		value_end: number,
		end: number
	): void {
		if (this.stop && kind === NodeKind.text) throw new Stopped();
		super.leaf(id, kind, start, parent, value_start, value_end, end);
	}

	open(
		id: number,
		kind: number,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		if (this.stop && kind === NodeKind.text) throw new Stopped();
		super.open(id, kind, start, parent, extra, pending);
	}
}

// documents a parse is thrown out of with parser flags still set
const THROWN = ['# a', '## x y', '> # a', '| a |\n|-|\n| b |', '<div>\n\na'];

describe('a reused parser', () => {
	for (const first of THROWN) {
		for (const second of FOLLOWERS) {
			it(`parses ${JSON.stringify(second)} after a parse of ${JSON.stringify(first)} that threw like a fresh parser`, () => {
				const builder = new Stopping(64);
				const parser = new PFMParser(builder);
				builder.reset();
				builder.stop = true;
				expect(() => parser.parse(first)).toThrow(Stopped);
				builder.stop = false;
				expect(parse_with(parser, builder, second)).toEqual(
					parse_fresh(second)
				);
			});
		}
	}

	for (const first of LEAKY) {
		for (const second of FOLLOWERS) {
			it(`parses ${JSON.stringify(second)} after ${JSON.stringify(first)} like a fresh parser`, () => {
				const builder = new TreeBuilder(64);
				const parser = new PFMParser(builder);
				parse_with(parser, builder, first);
				expect(parse_with(parser, builder, second)).toEqual(
					parse_fresh(second)
				);
			});
		}
	}
});
