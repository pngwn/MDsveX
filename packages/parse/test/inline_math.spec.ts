import { describe, expect, test } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { NodeKind, take_math } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { both, every_path, lines } from './stream_shape';

/** the inline children of the one paragraph of a line, every path agreeing */
function inline(source: string): string[] {
	const tree = every_path(source + '\n').split('\n');
	expect(tree.slice(0, 2)).toEqual(['root', '  paragraph']);
	expect(tree[tree.length - 1]).toBe('  line_break');
	return tree.slice(2, -1).map((row) => row.slice(4));
}

const MATH = 'code_span math=true "x"';
const CODE = 'code_span "x"';

describe('inline math', () => {
	test.each([
		['$`x`$', [MATH]],
		['a $`x`$ b', ['text "a "', MATH, 'text " b"']],
		['a$`x`$b', ['text "a"', MATH, 'text "b"']],
		['$`x`$ and $`x`$', [MATH, 'text " and "', MATH]],
		['$``x``$', [MATH]],
		['$``a ` b``$', ['code_span math=true "a ` b"']],
		['$` x `$', [MATH]],
		['$`  x  `$', ['code_span math=true " x "']],
		['$` x`$', ['code_span math=true " x"']],
		['$` `$', ['code_span math=true " "']],
		['$`e^{i\\pi} + 1 = 0`$', ['code_span math=true "e^{i\\\\pi} + 1 = 0"']],
		[
			'$`a_1 *b* <c> [d](e) \\`$',
			['code_span math=true "a_1 *b* <c> [d](e) \\\\"'],
		],
		['*$`x`$*', ['strong_emphasis', '  ' + MATH]],
		['_a $`x`$_', ['emphasis', '  text "a "', '  ' + MATH]],
		['[$`x`$](/u)', ['link href="/u"', '  ' + MATH]],
		[':tag[$`x`$]', ['directive_inline name="tag"', '  ' + MATH]],
		['a <b>$`x`$</b>', ['text "a "', 'html tag="b"', '  ' + MATH]],
	])('%j is math', (source, kids) => {
		expect(inline(source)).toEqual(kids);
	});

	test.each([
		['$`x`', ['text "$"', CODE]],
		['a $`x` b', ['text "a $"', CODE, 'text " b"']],
		['`x`$', [CODE, 'text "$"']],
		['\\$`x`$', ['text "$"', CODE, 'text "$"']],
		['$ `x`$', ['text "$ "', CODE, 'text "$"']],
		['$`x` $', ['text "$"', CODE, 'text " $"']],
		['$5', ['text "$5"']],
		['a $ b', ['text "a $ b"']],
		['$x$', ['text "$x$"']],
		['$$x$$', ['text "$$x$$"']],
		['$5 and $10', ['text "$5 and $10"']],
		['$', ['text "$"']],
		['a $', ['text "a $"']],
		['$$`x`$$', ['text "$"', MATH, 'text "$"']],
		['$`x', ['text "$"', 'text "`"', 'text "x"']],
		['$`x``$', ['text "$"', 'text "`"', 'text "x"', 'text "``"', 'text "$"']],
		['$```x```$', ['text "$"', 'text "```x"', 'text "```$"']],
		['$`x`\\$', ['text "$"', CODE, 'text "$"']],
	])('%j is not math', (source, kids) => {
		expect(inline(source)).toEqual(kids);
	});

	test('a #! after the dollar is no language hint', () => {
		expect(inline('$`#!js x`$')).toEqual(['code_span math=true "#!js x"']);
		expect(inline('`#!js x`')).toEqual(['code_span info="js" "x"']);
	});

	test('it stays on one line, a code span that runs over a line end is code', () => {
		expect(every_path('$`a\nb`$\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "$"',
				'    code_span "a\\nb"',
				'    text "$"',
				'  line_break'
			)
		);
	});

	test('a heading holds it', () => {
		expect(every_path('# a $`x`$\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "a $`x`$"',
				'    text "a "',
				'    ' + MATH,
				'  line_break'
			)
		);
	});

	test('a list item and a block quote hold it', () => {
		expect(every_path('- $`x`$ a\n\n> a $`x`$\n> $`x`$\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      ' + MATH,
				'      text " a"',
				'  line_break',
				'  line_break',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      ' + MATH,
				'      soft_break',
				'      ' + MATH,
				'  line_break'
			)
		);
	});

	test('a table cell holds it, in the header and in the body', () => {
		both('$`x`$', [MATH]);
		both(' a $`x`$ | $`x`$ b ', ['text "a "', MATH], [MATH, 'text " b"']);
		both('$5|$`x`', ['text "$5"'], ['text "$"', CODE]);
	});

	test('an escaped pipe in a cell is a bar in the math, a bare one ends the cell', () => {
		both('$`a \\| b`$', ['code_span math=true "a | b"']);
		both(
			'$`a | b`$',
			['text "$"', 'text "`"', 'text "a"'],
			['text "b"', 'text "`"', 'text "$"']
		);
	});

	test('the node starts at the first dollar and ends after the last', () => {
		const source = 'a $` x `$ b\n';
		const { nodes } = parse_markdown_svelte(source);
		const paragraph = nodes.get_node(nodes.get_node(0).children[0]);
		const math = nodes.get_node(paragraph.children[1]);
		expect(source.slice(math.start, math.end)).toBe('$` x `$');
		expect(source.slice(math.value[0], math.value[1])).toBe('x');
		expect(nodes.extra_at(math.index)).toBe(1);
		const code = parse_markdown_svelte('`x`\n').nodes;
		for (let i = 0; i < code.size; i++) {
			if (code.kind_at(i) === NodeKind.code_span)
				expect(code.extra_at(i)).toBe(0);
		}
	});

	test('the wire carries the flag', () => {
		const source = 'a $`x`$ and `y`\n';
		const emitter = new WireEmitter();
		emitter.set_source(source);
		new PFMParser(emitter).parse(source);
		const wire = new WireTreeBuilder(64);
		wire.apply(emitter.flush());
		const nodes = wire.get_buffer();
		const flags: number[] = [];
		for (let i = 0; i < nodes.size; i++) {
			if (nodes.kind_at(i) === NodeKind.code_span)
				flags.push(nodes.extra_at(i));
		}
		expect(flags).toEqual([1, 0]);
	});

	test('a parse notes that it made a math span, once', () => {
		take_math();
		parse_markdown_svelte('a $5 `x` $`y`\n');
		expect(take_math()).toBe(false);
		parse_markdown_svelte('a $`x`$\n');
		expect(take_math()).toBe(true);
		expect(take_math()).toBe(false);
	});
});
