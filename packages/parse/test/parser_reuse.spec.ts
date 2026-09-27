import { describe, it, expect } from 'vitest';
import { PFMParser } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
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
const LEAKY = ['# ` ', '> # ` ', '- # ` ', '# a\u0000', '## x\u0000y'];

const FOLLOWERS = [
	'a\n~~~\nb',
	'Foo\n<b>\nbaz',
	'_a_ and *b*\nnext line',
	'# heading\n\ntext\nmore',
];

describe('a reused parser', () => {
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
