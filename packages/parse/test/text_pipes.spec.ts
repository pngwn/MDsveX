import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { ParsePlugin } from '../src/plugin_types';
import { run_batch, run_wire, shape } from './plugin_harness';
import {
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

function paragraph(...children: string[]): string {
	return lines(
		'root',
		'  paragraph',
		...children.map((child) => `    ${child}`),
		'  line_break'
	);
}

describe('a pipe outside a table is text', () => {
	test('in a paragraph', () => {
		expect(every_path('one | two | three\n')).toBe(
			paragraph('text "one | two | three"')
		);
		expect(every_path('a|b\n')).toBe(paragraph('text "a|b"'));
		expect(every_path('a || b |\n')).toBe(paragraph('text "a || b |"'));
		expect(every_path('a |> b |^ c\n')).toBe(
			paragraph('text "a |> b |"', 'text "^ c"')
		);
	});

	test('at the start of a line that is no table row', () => {
		expect(every_path('| a\n')).toBe(paragraph('text "| a"'));
		expect(every_path('|\n')).toBe(paragraph('text "|"'));
		expect(every_path('| a | b |\nc\n')).toBe(
			paragraph('text "| a | b |"', 'soft_break', 'text "c"')
		);
	});

	test('in a heading', () => {
		expect(every_path('# a | b\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "a | b"',
				'    text "a | b"',
				'  line_break'
			)
		);
	});

	test('in a list item', () => {
		expect(every_path('- a | b\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a | b"',
				'  line_break'
			)
		);
	});

	test('in a block quote', () => {
		expect(every_path('> a | b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a | b"',
				'  line_break'
			)
		);
	});

	test('inside emphasis, a link and an element', () => {
		expect(every_path('*a | b*\n')).toBe(
			paragraph('strong_emphasis', '  text "a | b"')
		);
		expect(every_path('[a | b](u)\n')).toBe(
			paragraph('link href="u"', '  text "a | b"')
		);
		expect(every_path('x <b>a | b</b>\n')).toBe(
			paragraph('text "x "', 'html tag="b"', '  text "a | b"')
		);
	});

	test('after an inline node', () => {
		expect(every_path('`a` | b\n')).toBe(
			paragraph('code_span "a"', 'text " | b"')
		);
		expect(every_path('{a}|b\n')).toBe(paragraph('mustache "a"', 'text "|b"'));
	});

	test('after a table has ended', () => {
		expect(every_path('|a|\n|-|\n\nx | y\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'  line_break',
				'  paragraph',
				'    text "x | y"',
				'  line_break'
			)
		);
	});
});

describe('a pipe next to an emphasis mark is the intraword marker', () => {
	test('it gets no text', () => {
		expect(every_path('fan|_tas_|tic\n')).toBe(
			paragraph('text "fan"', 'emphasis', '  text "tas"', 'text "tic"')
		);
		expect(every_path('caf|*e*|s\n')).toBe(
			paragraph('text "caf"', 'strong_emphasis', '  text "e"', 'text "s"')
		);
		expect(every_path('caf|~~e~~|s\n')).toBe(
			paragraph('text "caf"', 'strikethrough', '  text "e"', 'text "s"')
		);
	});

	test('with a pipe that is text on the same line', () => {
		expect(every_path('a | fan|_tas_|tic | b\n')).toBe(
			paragraph('text "a | fan"', 'emphasis', '  text "tas"', 'text "tic | b"')
		);
	});

	test('a pipe after an escaped mark is text', () => {
		expect(every_path('a\\*|b\n')).toBe(paragraph('text "a"', 'text "*|b"'));
	});
});

describe('a pipe next to a mark that stays literal is text', () => {
	test('before a mark that opens nothing', () => {
		expect(every_path('x |* y\n')).toBe(
			paragraph('text "x "', 'text "|"', 'text "* y"')
		);
		expect(every_path('x |_ y\n')).toBe(
			paragraph('text "x "', 'text "|"', 'text "_ y"')
		);
		expect(every_path('x |~~ y\n')).toBe(
			paragraph('text "x "', 'text "|"', 'text "~"', 'text "~ y"')
		);
		expect(every_path('x |*\n')).toBe(
			paragraph('text "x "', 'text "|"', 'text "*"')
		);
	});

	test('after a mark that closes nothing', () => {
		expect(every_path('a_|b\n')).toBe(paragraph('text "a"', 'text "_|b"'));
		expect(every_path('a*|b\n')).toBe(paragraph('text "a"', 'text "*|b"'));
		expect(every_path('a *| b\n')).toBe(paragraph('text "a "', 'text "*| b"'));
	});

	test('after a mark that opens', () => {
		expect(every_path('x ~| y\n')).toBe(paragraph('text "x "', 'text "~| y"'));
		expect(every_path('_|a_\n')).toBe(paragraph('emphasis', '  text "|a"'));
	});

	test('before a mark that closes', () => {
		expect(every_path('_a|_ b\n')).toBe(
			paragraph('emphasis', '  text "a"', '  text "|"', 'text " b"')
		);
		expect(every_path('*a|* b\n')).toBe(
			paragraph('strong_emphasis', '  text "a"', '  text "|"', 'text " b"')
		);
	});

	test('before a mark that opens and never closes', () => {
		expect(every_path('fan|_tas tic\n')).toBe(
			paragraph('text "fan"', 'text "|_tas tic"')
		);
		expect(every_path('fan|*tas tic\n')).toBe(
			paragraph('text "fan"', 'text "|*tas tic"')
		);
		expect(every_path('fan|~~tas tic\n')).toBe(
			paragraph('text "fan"', 'text "|~~tas tic"')
		);
		expect(every_path('a|~b c\n')).toBe(paragraph('text "a"', 'text "|~b c"'));
		expect(every_path('fan|_tas\n\ntic\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "fan"',
				'    text "|_tas"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "tic"',
				'  line_break'
			)
		);
	});

	test('before a mark that opens a node with nothing in it', () => {
		expect(every_path('a|__ b\n')).toBe(
			paragraph('text "a"', 'text "|_"', 'text "_ b"')
		);
		expect(every_path('a|** b\n')).toBe(
			paragraph('text "a"', 'text "|*"', 'text "* b"')
		);
	});

	test('before a mark left open around one that closes', () => {
		expect(every_path('fan|*_tas_ tic\n')).toBe(
			paragraph(
				'text "fan"',
				'text "|*"',
				'emphasis',
				'  text "tas"',
				'text " tic"'
			)
		);
	});

	test('in a heading, a list item and a block quote', () => {
		expect(every_path('# fan|_tas tic\n')).toContain('text "|_tas tic"');
		expect(every_path('- fan|_tas tic\n')).toContain('text "|_tas tic"');
		expect(every_path('> fan|_tas tic\n')).toContain('text "|_tas tic"');
		expect(every_path('> x |* y\n')).toContain('text "|"');
	});

	test('the text of the pipe and its mark covers both in the source', () => {
		const source = 'fan|_tas tic\n';
		const { nodes } = parse_markdown_svelte(source);
		const texts = nodes
			.get_node(nodes.get_node(0).children[0])
			.children.map((child) => nodes.get_node(child).value);
		expect(texts).toEqual([
			[0, 3],
			[3, 12],
		]);
	});
});

describe('a pipe before a mark left open, with parse plugins', () => {
	const plugins = (): ParsePlugin[] => [
		{
			emphasis: {
				parse(node) {
					node.attrs.seen = true;
				},
			},
			strong_emphasis: {
				parse(node) {
					node.attrs.seen = true;
				},
			},
			strikethrough: {
				parse(node) {
					node.attrs.seen = true;
				},
			},
		},
	];
	const options = { merge_text: true };

	test('is text again in the batch tree and over the wire', () => {
		for (const source of [
			'fan|_tas tic\n',
			'fan|*tas tic\n',
			'fan|~~tas tic\n',
			'fan|*_tas_ tic\n',
			'a|__ b\n',
			'# fan|_tas\n\n- x|*y\n',
		]) {
			const plain = shape(run_batch(source).nodes, source, 0, options);
			expect(JSON.stringify(plain), source).toContain('|');
			for (const chunk of [0, 1, 3]) {
				expect(
					shape(run_batch(source, plugins(), chunk).nodes, source, 0, options),
					`${source} batch fed ${chunk}`
				).toEqual(plain);
				expect(
					shape(run_wire(source, plugins(), chunk).nodes, null, 0, options),
					`${source} wire fed ${chunk}`
				).toEqual(plain);
			}
		}
	});
});

describe('a pipe next to a mark that opens or closes is still the marker', () => {
	test('around a node on a line of its own', () => {
		expect(every_path('|*a*|\n')).toBe(
			paragraph('strong_emphasis', '  text "a"')
		);
		expect(every_path('x |_a_| y\n')).toBe(
			paragraph('text "x "', 'emphasis', '  text "a"', 'text " y"')
		);
	});

	test('between two nodes', () => {
		expect(every_path('*a*|*b*\n')).toBe(
			paragraph(
				'strong_emphasis',
				'  text "a"',
				'strong_emphasis',
				'  text "b"'
			)
		);
		expect(every_path('_a_|*b*|~~c~~\n')).toBe(
			paragraph(
				'emphasis',
				'  text "a"',
				'strong_emphasis',
				'  text "b"',
				'strikethrough',
				'  text "c"'
			)
		);
	});

	test('around nested nodes', () => {
		expect(every_path('fan|*_tas_*|tic\n')).toBe(
			paragraph(
				'text "fan"',
				'strong_emphasis',
				'  emphasis',
				'    text "tas"',
				'text "tic"'
			)
		);
		expect(every_path('fan|**tas**|tic\n')).toBe(
			paragraph(
				'text "fan"',
				'strong_emphasis',
				'  strong_emphasis',
				'    text "tas"',
				'text "tic"'
			)
		);
	});

	test('after a subscript', () => {
		expect(every_path('H|~2~|O\n')).toBe(
			paragraph('text "H"', 'subscript', '  text "2"', 'text "O"')
		);
	});
});

describe('random lines with pipes', () => {
	const PIECES = [
		'|',
		'|',
		' | ',
		'||',
		'a',
		'b c',
		' ',
		'*',
		'_',
		'~~',
		'~',
		'\\',
		'`',
		'[',
		'](u)',
		'{x}',
		'<b>',
		'</b>',
		'\n',
		'\n\n',
		'# ',
		'> ',
		'- ',
		'|-|\n',
	];

	test('build one tree whole and fed, and a sound one over the wire', () => {
		const rand = random(967);
		for (let i = 0; i < 1500; i++) {
			let source = '';
			const length = 1 + Math.floor(rand() * 10);
			for (let k = 0; k < length; k++) source += pick(rand, PIECES);
			expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			for (const chunk of [0, 1, 3]) {
				expect(
					problems(source, chunk),
					`${JSON.stringify(source)} fed ${chunk}`
				).toEqual([]);
			}
		}
	});

	const MARKED = new Set([
		'emphasis',
		'strong_emphasis',
		'strikethrough',
		'subscript',
	]);

	/** each pipe no text covers and no node that opened after it or closed before it accounts for */
	function lost_pipes(source: string): number[] {
		const { nodes } = parse_markdown_svelte(source);
		const kept = new Set<number>();
		const walk = (index: number): void => {
			const node = nodes.get_node(index);
			if (node.kind === 'text') {
				for (let at = node.value[0]; at < node.value[1]; at++) kept.add(at);
			} else if (MARKED.has(node.kind)) {
				kept.add(node.start);
				kept.add(node.end);
			}
			for (const child of node.children) walk(child);
		};
		walk(0);
		const lost: number[] = [];
		for (
			let at = source.indexOf('|');
			at !== -1;
			at = source.indexOf('|', at + 1)
		)
			if (!kept.has(at)) lost.push(at);
		return lost;
	}

	test('keep every pipe no open or close mark uses', () => {
		const rand = random(985);
		const pieces = [
			'|',
			'|',
			'|',
			'a',
			'b c',
			' ',
			'*',
			'*',
			'_',
			'~~',
			'~',
			'.',
		];
		for (let i = 0; i < 1500; i++) {
			let source = pick(rand, ['x', 'x ', '', '# ', '- ', '> ']);
			const length = 1 + Math.floor(rand() * 9);
			for (let k = 0; k < length; k++) source += pick(rand, pieces);
			source += pick(rand, ['\n', '\n', '', '\ny\n', '\n\ny\n']);
			const label = JSON.stringify(source);
			expect(lost_pipes(source), label).toEqual([]);
			expect(fed_mismatch(source), label).toBe('');
			for (const chunk of [0, 1, 3]) {
				expect(problems(source, chunk), `${label} fed ${chunk}`).toEqual([]);
			}
		}
	});

	test('keep every pipe that is not next to a mark', () => {
		const rand = random(968);
		const pieces = ['|', ' | ', '||', 'a', 'b c', ' ', '.', '(', ')'];
		for (let i = 0; i < 500; i++) {
			let source = 'x';
			const length = 1 + Math.floor(rand() * 8);
			for (let k = 0; k < length; k++) source += pick(rand, pieces);
			source = source.replace(/ +$/, '') + '.';
			expect(every_path(source + '\n'), JSON.stringify(source)).toBe(
				paragraph(`text "${source}"`)
			);
		}
	});
});
