import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';
import { print_ast } from './print';

function parse_incremental(source: string, chunk_size: number): NodeBuffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk_size) {
		parser.feed(source.slice(i, i + chunk_size));
	}
	parser.finish();
	return tree.get_buffer();
}

function expect_incremental_matches(input: string): void {
	const batch = print_ast(parse_markdown_svelte(input).nodes, input);
	for (const size of [1, 2, 3]) {
		expect(print_ast(parse_incremental(input, size), input)).toBe(batch);
	}
}

function kinds(nodes: NodeBuffer, parent: number = 0): string[] {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i).kind)
		.filter((k) => k !== 'line_break');
}

function print_batch(input: string): string {
	return print_ast(parse_markdown_svelte(input).nodes, input);
}

function print_incremental(input: string, chunk_size: number): string {
	return print_ast(parse_incremental(input, chunk_size), input);
}

let error_spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	error_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	error_spy.mockRestore();
});

describe('unclosed delimiter before a block interrupt', () => {
	test('ordered list: `1. ~1\\n2. *`', () => {
		const input = '1. ~1\n2. *';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "~1"',
				'    list_item',
				'      text "*"',
			].join('\n')
		);
	});

	test('nested list marker: `- *a\\n  - b`', () => {
		const input = '- *a\n  - b';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "*a"',
				'      list ordered=false start=0 tight=true',
				'        list_item',
				'          text "b"',
			].join('\n')
		);
	});

	const openers = ['*a', '_a', '~~a', '~a', '^a'];
	const interrupts: [string, string][] = [
		['- b', 'list'],
		['1. b', 'list'],
		['> b', 'block_quote'],
		['```\nb\n```', 'code_fence'],
		['<div>\n</div>', 'html'],
	];

	for (const opener of openers) {
		for (const [interrupt, kind] of interrupts) {
			const input = `${opener}\n${interrupt}`;
			test(JSON.stringify(input), () => {
				const { nodes } = parse_markdown_svelte(input);

				expect(error_spy).not.toHaveBeenCalled();
				expect(kinds(nodes)).toEqual(['paragraph', kind]);
				const para = nodes.get_node(0).children[0];
				expect(kinds(nodes, para).every((k) => k === 'text')).toBe(true);
			});
		}

		const input = `- ${opener}\n- b`;
		test(JSON.stringify(input), () => {
			const { nodes } = parse_markdown_svelte(input);

			expect(error_spy).not.toHaveBeenCalled();
			const list = nodes.get_node(0).children[0];
			expect(kinds(nodes)).toEqual(['list']);
			expect(kinds(nodes, list)).toEqual(['list_item', 'list_item']);
		});
	}
});

describe('unclosed delimiter in a heading', () => {
	const openers = ['*a', '_)', '**)', '~~a', '~a', '^a', '[a', ':x[a', '<b>a'];

	for (const opener of openers) {
		for (const [prefix, outer] of [
			['# ', ['heading', 'paragraph']],
			['## a ', ['heading', 'paragraph']],
			['- # ', ['list', 'paragraph']],
		] as const) {
			const input = `${prefix}${opener}\nfoo`;
			test(JSON.stringify(input), () => {
				const { nodes } = parse_markdown_svelte(input);
				expect(error_spy).not.toHaveBeenCalled();
				expect(kinds(nodes)).toEqual(outer);
				expect_incremental_matches(input);
			});
		}
	}

	test('heading in a block quote ends at the line end: `> # *a\\n> foo`', () => {
		const input = '> # *a\n> foo';
		const { nodes } = parse_markdown_svelte(input);

		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  block_quote',
				'    heading depth=1 "*a"',
				'      text "*a"',
				'    paragraph',
				'      text "foo"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});
});

describe('unclosed link text at a linefeed', () => {
	for (const [input, outer] of [
		['[a\n# h', ['paragraph', 'heading']],
		['[a\n---', ['paragraph', 'thematic_break']],
		['[a\n> q', ['paragraph', 'block_quote']],
		['[a\n```\nx\n```', ['paragraph', 'code_fence']],
		[':x[a\n# h', ['paragraph', 'heading']],
		['> [a\nfoo', ['block_quote', 'paragraph']],
		['> :x[a\nfoo', ['block_quote', 'paragraph']],
	] as const) {
		test(JSON.stringify(input), () => {
			const { nodes } = parse_markdown_svelte(input);
			expect(error_spy).not.toHaveBeenCalled();
			expect(kinds(nodes)).toEqual(outer);
			expect_incremental_matches(input);
		});
	}

	test('list item marker ends the link text: `- [a\\n- b`', () => {
		const input = '- [a\n- b';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "[a"',
				'    list_item',
				'      text "b"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});

	test('link spans block quote lines: `> a [b\\n> c](d) e`', () => {
		const input = '> a [b\n> c](d) e';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      link href="d"',
				'        text "b"',
				'        soft_break',
				'        text "c"',
				'      text " e"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});
});

describe('unclosed delimiter before a linefeed', () => {
	const cases: [string, string[]][] = [
		['[\n_', ['text "["', 'soft_break', 'text "_"']],
		['![\n_', ['text "!["', 'soft_break', 'text "_"']],
		['^\n_', ['text "^"', 'soft_break', 'text "_"']],
		['^\na', ['text "^"', 'soft_break', 'text "a"']],
		['^\n*', ['text "^"', 'soft_break', 'text "*"']],
		['~~\n_', ['text "~"', 'text "~"', 'soft_break', 'text "_"']],
		['a ^\n_b', ['text "a "', 'text "^"', 'soft_break', 'text "_b"']],
		['*\n_', ['text "*"', 'soft_break', 'text "_"']],
		['_\n_', ['text "_"', 'soft_break', 'text "_"']],
		['~\n_', ['text "~"', 'soft_break', 'text "_"']],
	];

	for (const [input, children] of cases) {
		test(JSON.stringify(input), () => {
			const expected = ['root', '  paragraph']
				.concat(children.map((c) => `    ${c}`))
				.join('\n');

			expect(print_batch(input)).toBe(expected);
			for (const chunk_size of [1, 2, 3]) {
				expect(
					print_incremental(input, chunk_size),
					`chunk ${chunk_size}`
				).toBe(expected);
			}
		});
	}
});

describe('tilde closer split across chunks', () => {
	const inputs = [
		'~a~~',
		'~-~~-',
		'h~2~o',
		'~a~ b',
		'~~~~a',
		'~~>~~a',
		'~~a~~',
		'~~a~~b',
		'~~a~~ b',
	];

	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('thematic break at the end of a fed chunk', () => {
	const inputs = [
		'<b>---',
		'<b>\n---',
		'<b>\n\n---',
		'<b>\n***',
		'<div>\n- - -',
		'<div>\n- a',
		'<div>\n-a',
		'{#if x}\n---',
		'{#if x}\n---\n{/if}',
		':::x[]\n___',
		':::x[]\n---\n:::',
	];

	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('heading marker at the end of a fed chunk', () => {
	const inputs = [
		'a\n##](',
		'a\n##b',
		'a\n## b',
		'a\n ##b',
		'a\n######x',
		'a\n#######',
		'*a\n##b',
		'~~a\n##b',
		'[a\n##b',
	];

	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('unclosed inline directive', () => {
	const cases: [string, string[]][] = [
		[
			':x[\n#',
			[
				'  paragraph',
				'    text name="x" ":x["',
				'  line_break',
				'  heading depth=1',
			],
		],
		[
			':abc[\n> a',
			[
				'  paragraph',
				'    text name="abc" ":abc["',
				'  line_break',
				'  block_quote',
				'    paragraph',
				'      text "a"',
			],
		],
		[
			'a :x[\n\nb',
			[
				'  paragraph',
				'    text "a "',
				'    text name="x" ":x["',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
			],
		],
	];

	for (const [input, lines] of cases) {
		test(JSON.stringify(input), () => {
			expect(print_batch(input)).toBe(['root', ...lines].join('\n'));
			expect_incremental_matches(input);
		});
	}

	for (const input of [':x[\n#a', '[~~*:x[\n#[']) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('linefeed in link text at the end of a fed chunk', () => {
	const inputs = ['[\n##b', '![\n##b', '*:x[\n#]', '[<b>\n#]', ':x[<b>\n#]#'];

	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('linefeed after a closed element in an unclosed delimiter', () => {
	const inputs = [
		'*:x[a]\n#b',
		'*<b>a</b>\n#b',
		'~<b></b>\n#b',
		'~~a<b></b>\n#b',
		'^a<b></b>\n#b',
		'> ~<b></b>\n> #b',
	];

	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('list marker with no content at the end of a fed chunk', () => {
	const cases: [string, string[]][] = [
		['+ ', ['  paragraph', '    text "+ "']],
		['1. ', ['  paragraph', '    text "1. "']],
		['12) ', ['  paragraph', '    text "12) "']],
	];

	for (const [input, lines] of cases) {
		test(JSON.stringify(input), () => {
			expect(print_batch(input)).toBe(['root', ...lines].join('\n'));
			expect_incremental_matches(input);
		});
	}

	const inputs = [
		'+ a',
		'1. a',
		'> + ',
		'<div>\n1. ',
		'{#if x}\n+ ',
		'- a\n+ ',
		'- a\n  1. ',
		'+ a\n\n+ ',
		'1. a\n\n1. ',
		'1. >\n\n1. ',
	];
	for (const input of inputs) {
		test(JSON.stringify(input), () => {
			expect_incremental_matches(input);
		});
	}
});

describe('trailing whitespace in a heading', () => {
	const cases: [string, string[]][] = [
		['# <b> ', ['  heading depth=1 "<b>"', '    text tag="b" "<b>"']],
		[
			'# <b> \t\na',
			[
				'  heading depth=1 "<b>"',
				'    text tag="b" "<b>"',
				'  line_break',
				'  paragraph',
				'    text "a"',
			],
		],
		[
			'# ^<http://a> ',
			[
				'  heading depth=1 "^<http://a>"',
				'    text "^"',
				'    link href="http://a"',
				'      text "http://a"',
			],
		],
		[
			'# a <b> b',
			[
				'  heading depth=1 "a <b> b"',
				'    text "a "',
				'    text tag="b" "<b>"',
				'    text " b"',
			],
		],
	];

	for (const [input, lines] of cases) {
		test(JSON.stringify(input), () => {
			expect(print_batch(input)).toBe(['root', ...lines].join('\n'));
			expect_incremental_matches(input);
		});
	}
});

describe('batch and incremental parity', () => {
	const atoms = [
		'*',
		'_',
		'~',
		'~~',
		'^',
		'[',
		']',
		'](',
		':x[',
		'<b>',
		'</b>',
		'\n',
		'\n\n',
		'a',
		' ',
		'#',
		'-',
		'>',
		'---',
		'`',
	];

	function mulberry32(seed: number): () => number {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	test('seeded inputs parse the same in any chunk size', () => {
		const random = mulberry32(1);
		const mismatched: string[] = [];

		for (let i = 0; i < 2000; i++) {
			const len = 1 + Math.floor(random() * 8);
			let input = '';
			for (let j = 0; j < len; j++) {
				input += atoms[Math.floor(random() * atoms.length)];
			}

			const batch = print_batch(input);
			for (const chunk_size of [1, 2, 3]) {
				if (print_incremental(input, chunk_size) !== batch) {
					mismatched.push(input);
					break;
				}
			}
		}

		expect(mismatched).toEqual([]);
	});
});
