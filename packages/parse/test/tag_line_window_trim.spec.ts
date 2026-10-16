import { describe, expect, test } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { shape } from './plugin_harness';
import { print_ast } from './print';
import { every_path, lines } from './stream_shape';

// a feed trims its window inside a paragraph once the cursor is this far past the trim point
const PAST_TRIM = 'word '.repeat(220).trim();

/** the tree of a feed in two parts, split at cut */
function split_tree(source: string, cut: number): string {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	parser.feed(source.slice(0, cut));
	parser.feed(source.slice(cut));
	parser.finish();
	return print_ast(tree.get_buffer(), source);
}

/** the wire tree of a feed in two parts, split at cut, its text joined */
function split_wire(source: string, cut: number): unknown {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const builder = new WireTreeBuilder(128);
	parser.init();
	emitter.set_source(source.slice(0, cut));
	parser.feed(source.slice(0, cut));
	builder.apply(emitter.flush());
	emitter.set_source(source);
	parser.feed(source.slice(cut));
	parser.finish();
	builder.apply(emitter.flush());
	builder.end();
	return shape(builder.get_buffer(), null, 0, { merge_text: true });
}

/** a feed split anywhere on the line that holds line gives the whole tree */
function every_cut(source: string, line: string): void {
	const whole = print_ast(parse_markdown_svelte(source).nodes, source);
	const builder = new TreeBuilder(source.length);
	new PFMParser(builder).parse(source);
	const wire = shape(builder.get_buffer(), source, 0, { merge_text: true });
	const from = source.indexOf(line);
	for (let cut = from; cut <= from + line.length; cut++) {
		expect(split_tree(source, cut), `cut ${cut - from}`).toBe(whole);
		expect(split_wire(source, cut), `wire, cut ${cut - from}`).toEqual(wire);
	}
}

describe('a tag line in an open element, far into a feed', () => {
	const source = `<div>\n\n${PAST_TRIM}\n\n{@html a} b\n\n</div>\n`;

	test('keeps its paragraph when the feed stops in its text', () => {
		const cut = source.indexOf('} b') + 3;
		expect(split_tree(source, cut)).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    paragraph',
				`      text "${PAST_TRIM}"`,
				'    line_break',
				'    line_break',
				'    paragraph',
				'      svelte_tag tag="html" "a"',
				'      text " b"',
				'    line_break',
				'    line_break',
				'  line_break'
			)
		);
	});

	const div = (line: string) => `<div>\n\n${PAST_TRIM}\n\n${line}\n\n</div>\n`;

	test.each([
		['{@html a} b', 'in a div', div('{@html a} b')],
		['{@html a}   bc d', 'in a div', div('{@html a}   bc d')],
		['<b>x</b> yz', 'in a div', div('<b>x</b> yz')],
		['<!-- c --> yz', 'in a div', div('<!-- c --> yz')],
		['{@html a}  ', 'in a div', div('{@html a}  ')],
		[
			'{@html a} b',
			'in a div in a section',
			`<section>\n${div('{@html a} b')}</section>\n`,
		],
		[
			'{@html a} b',
			'in a div in a block quote',
			`> <div>\n>\n> ${PAST_TRIM}\n>\n> {@html a} b\n>\n> </div>\n`,
		],
		['{@html a} b', 'at the root', `${PAST_TRIM}\n\n{@html a} b\n`],
	])('%j %s is the same tree at every cut', (line, _, source) => {
		every_cut(source, line);
	});

	test('is the same tree whole, fed and over the wire', () => {
		every_path(source);
	});
});
