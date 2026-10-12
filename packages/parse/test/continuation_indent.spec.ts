import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';
import { print_ast } from './print';
import {
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

function item(...children: string[]): string {
	return lines(
		'root',
		'  list ordered=false start=0 tight=true',
		'    list_item',
		...children.map((child) => `      ${child}`),
		'  line_break'
	);
}

function quoted(...children: string[]): string {
	return lines(
		'root',
		'  block_quote',
		...children.map((child) => `    ${child}`),
		'  line_break'
	);
}

describe('a continuation line of a list item', () => {
	test('gives its indent no text', () => {
		expect(every_path('- a\n  b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n      b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n  b\n  c\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"', 'soft_break', 'text "c"')
		);
	});

	test('gives it none before another node', () => {
		expect(every_path('- a\n  :b\n')).toBe(
			item('text "a"', 'soft_break', 'text ":b"')
		);
		expect(every_path('- a\n  *b*\n')).toBe(
			item('text "a"', 'soft_break', 'strong_emphasis', '  text "b"')
		);
		expect(every_path('- a\n  `b`\n')).toBe(
			item('text "a"', 'soft_break', 'code_span "b"')
		);
		expect(every_path('- a\n  {b}\n')).toBe(
			item('text "a"', 'soft_break', 'mustache "b"')
		);
	});

	test('gives it none inside an inline node', () => {
		expect(every_path('- a *x\n  y* b\n')).toBe(
			item(
				'text "a "',
				'strong_emphasis',
				'  text "x"',
				'  soft_break',
				'  text "y"',
				'text " b"'
			)
		);
		expect(every_path('- [x\n  y](u)\n')).toBe(
			item('link href="u"', '  text "x"', '  soft_break', '  text "y"')
		);
		expect(every_path('- a <b>x\n  y</b>\n')).toBe(
			item(
				'text "a "',
				'html tag="b"',
				'  text "x"',
				'  soft_break',
				'  text "y"'
			)
		);
	});

	test('in an ordered and a nested list', () => {
		expect(every_path('1. a\n   b\n')).toBe(
			lines(
				'root',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "a"',
				'      soft_break',
				'      text "b"',
				'  line_break'
			)
		);
		expect(every_path('- a\n  - b\n    c\n')).toBe(
			item(
				'text "a"',
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "b"',
				'    soft_break',
				'    text "c"'
			)
		);
	});

	test('in a paragraph of a loose item', () => {
		expect(every_path('- a\n\n  b\n  c\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=false',
				'    list_item',
				'      paragraph',
				'        text "a"',
				'      paragraph',
				'        text "b"',
				'        soft_break',
				'        text "c"',
				'  line_break'
			)
		);
	});

	test('in a block quote', () => {
		expect(every_path('> - a\n>   b\n')).toBe(
			quoted(
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "a"',
				'    soft_break',
				'    text "b"'
			)
		);
		expect(every_path('> - a\n>   *b*\n')).toBe(
			quoted(
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "a"',
				'    soft_break',
				'    strong_emphasis',
				'      text "b"'
			)
		);
	});

	test('keeps a tab, as a paragraph does', () => {
		expect(every_path('a\n\tb\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a"',
				'    soft_break',
				'    text "\tb"',
				'  line_break'
			)
		);
		expect(every_path('- a\n\tb\n')).toBe(
			item('text "a"', 'soft_break', 'text "\tb"')
		);
	});
});

describe('a continuation line of a quoted paragraph', () => {
	test('gives its indent no text', () => {
		expect(every_path('> a\n>   b\n')).toBe(
			quoted('paragraph', '  text "a"', '  soft_break', '  text "b"')
		);
		expect(every_path('> a\n>  *b*\n')).toBe(
			quoted(
				'paragraph',
				'  text "a"',
				'  soft_break',
				'  strong_emphasis',
				'    text "b"'
			)
		);
		expect(every_path('> a *x\n>   y*\n')).toBe(
			quoted(
				'paragraph',
				'  text "a "',
				'  strong_emphasis',
				'    text "x"',
				'    soft_break',
				'    text "y"'
			)
		);
	});
});

describe('a continuation line inside a code span', () => {
	const code = (source: string): string[] => {
		const { nodes } = parse_markdown_svelte(source);
		return nodes.get_kinds(NodeKind.code_span).map((index) => {
			const [start, end] = nodes.get_node(index).value;
			return nodes._strings[index] ?? source.slice(start, end);
		});
	};

	test('gives its indent no code in a list item', () => {
		expect(every_path('- x `a\n  b`\n')).toBe(
			item('text "x "', 'code_span "a\\nb"')
		);
		expect(every_path('- x `a\n      b` c\n')).toBe(
			item('text "x "', 'code_span "a\\nb"', 'text " c"')
		);
		expect(every_path('1. x ``a\n   b\n   c``\n')).toContain(
			'code_span "a\\nb\\nc"'
		);
		expect(every_path('- x\n  - y `a\n    b`\n')).toContain(
			'code_span "a\\nb"'
		);
	});

	test('gives it none in a paragraph', () => {
		expect(every_path('x `a\n  b`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    code_span "a\\nb"',
				'  line_break'
			)
		);
		expect(every_path('x `a\n  b\n    c` d')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    code_span "a\\nb\\nc"',
				'    text " d"'
			)
		);
	});

	test('gives it none in a block quote', () => {
		expect(every_path('> x `a\n>   b`\n')).toBe(
			quoted('paragraph', '  text "x "', '  code_span "a\\nb"')
		);
		expect(every_path('> - x `a\n>   b`\n')).toBe(
			quoted(
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "x "',
				'    code_span "a\\nb"'
			)
		);
	});

	test('with a language hint or padding', () => {
		expect(every_path('- `#!js a\n  b`\n')).toBe(
			item('code_span info="js" "a\\nb"')
		);
		expect(every_path('- ` a\n  b `\n')).toBe(item('code_span "a\\nb"'));
		expect(every_path('- `  a\n  b  `\n')).toBe(item('code_span " a\\nb "'));
	});

	test('keeps the spaces before the line end and after the code', () => {
		expect(code('- x `a  \n  b  c`\n')).toEqual(['a  \nb  c']);
		expect(code('x `a \n b `\n')).toEqual(['a \nb ']);
	});

	test('keeps a tab, as text does', () => {
		expect(code('- x `a\n\tb`\n')).toEqual(['a\n\tb']);
		expect(code('x `a\n\tb`\n')).toEqual(['a\n\tb']);
	});

	test('a line of only its indent leaves the line end', () => {
		expect(code('- x `a\n  `\n')).toEqual(['a\n']);
		expect(code('x ` a\n   `\n')).toEqual(['a\n']);
	});

	test('the value still covers the source as written', () => {
		const source = '- x `a\n  b`\n';
		const { nodes } = parse_markdown_svelte(source);
		const span = nodes.get_node(nodes.get_kinds(NodeKind.code_span)[0]);
		expect(source.slice(span.value[0], span.value[1])).toBe('a\n  b');
		expect(source.slice(span.start, span.end)).toBe('`a\n  b`');
	});

	test('a span with no indent to drop stores no string', () => {
		const source = 'x `a\nb`\n';
		const { nodes } = parse_markdown_svelte(source);
		const index = nodes.get_kinds(NodeKind.code_span)[0];
		expect(nodes._strings[index]).toBeUndefined();
	});
});

describe('random indented continuation lines', () => {
	const PIECES = [
		'a',
		'b c',
		' ',
		'*',
		'_',
		'[',
		'](u)',
		'{x}',
		'<b>',
		'`',
		'`',
		'``',
	];

	function inline(source: string, drop: number): string {
		return print_ast(parse_markdown_svelte(source).nodes, source)
			.split('\n')
			.slice(drop, -1)
			.map((row) => row.trim())
			.join('\n');
	}

	test('hold the inline nodes of a paragraph with the same lines', () => {
		const rand = random(986);
		const differ: string[] = [];
		for (let i = 0; i < 600; i++) {
			const rows: string[] = [];
			const count = 2 + Math.floor(rand() * 2);
			for (let l = 0; l < count; l++) {
				let row = pick(rand, ['a', 'b c', 'x ', '[']);
				const length = Math.floor(rand() * 4);
				for (let k = 0; k < length; k++) row += pick(rand, PIECES);
				rows.push(row);
			}
			const indent = ' '.repeat(2 + Math.floor(rand() * 3));
			const plain = rows.join('\n') + '\n';
			// three backticks may be a fence
			if (plain.includes('```')) continue;
			const indented = rows.join('\n' + indent) + '\n';
			const list = '- ' + rows.join('\n' + indent) + '\n';
			const quote = '> ' + rows.join('\n>' + indent) + '\n';
			const quoted_list = '> - ' + rows.join('\n> ' + indent) + '\n';
			const want = inline(plain, 2);
			if (inline(indented, 2) !== want) differ.push(JSON.stringify(indented));
			if (inline(list, 3) !== want) differ.push(JSON.stringify(list));
			if (inline(quote, 3) !== want) differ.push(JSON.stringify(quote));
			if (inline(quoted_list, 4) !== want)
				differ.push(JSON.stringify(quoted_list));
			for (const source of [indented, list, quote, quoted_list]) {
				expect(problems(source, 0), JSON.stringify(source)).toEqual([]);
				expect(problems(source, 1), JSON.stringify(source)).toEqual([]);
				expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			}
		}
		expect(differ).toEqual([]);
	}, 30_000);
});
