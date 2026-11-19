import { describe, expect, test } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import type { NodeBuffer } from '../src/utils';
import { NodeKind } from '../src/utils';
import type { ParsePlugin } from '../src/plugin_types';
import { run_batch, run_wire } from './plugin_harness';
import { both, checked_tree, lines, pick, random } from './stream_shape';

describe('a code span with no closer in a table cell', () => {
	test('its backticks are text', () => {
		both('`a', ['text "`"', 'text "a"']);
		both('``a', ['text "``"', 'text "a"']);
	});

	test('the text after it is still inline', () => {
		both('`a *b* c', [
			'text "`"',
			'text "a "',
			'strong_emphasis',
			'  text "b"',
			'text " c"',
		]);
		both('``a `b` c', ['text "``"', 'text "a "', 'code_span "b"', 'text " c"']);
	});

	test('an escape after it is read', () => {
		both('`a\\*b', ['text "`"', 'text "a"', 'text "*b"']);
	});

	test('a delimiter around it still closes', () => {
		both('*`a*', ['strong_emphasis', '  text "`"', '  text "a"']);
	});

	test('a pipe ends the cell', () => {
		both('`a|b`', ['text "`"', 'text "a"'], ['text "b"', 'text "`"']);
		both('` a|b', ['text "`"', 'text " a"'], ['text "b"']);
	});
});

describe('an escaped pipe in a code span in a table cell', () => {
	test('stays in the span, without its backslash', () => {
		both('`a\\|b`', ['code_span "a|b"']);
		both('`\\|`', ['code_span "|"']);
		both('`\\|\\|`', ['code_span "||"']);
	});

	test('in a padded cell after another cell', () => {
		both(' Foo | `A \\| B` ', ['text "Foo"'], ['code_span "A | B"']);
	});

	test('with two backticks and text around it', () => {
		both('``a\\|b`` c', ['code_span "a|b"', 'text " c"']);
		both('x ``a\\|`b`` c', ['text "x "', 'code_span "a|`b"', 'text " c"']);
	});

	test('the span still loses its padding spaces', () => {
		both('` a\\|b `', ['code_span "a|b"']);
		both('` \\| `', ['code_span "|"']);
		both('`` \\|a ``', ['code_span "|a"']);
	});

	test('after a hint, and in one', () => {
		both('`#!js a\\|b`', ['code_span info="js" "a|b"']);
		both('`#!js  a\\|b `', ['code_span info="js" "a|b"']);
		both('`#!a\\|b c`', ['code_span info="a\\\\|b" "c"']);
	});

	test('inside emphasis, with a cell after it', () => {
		both(
			'*`a\\|b`*|`c\\|d`',
			['strong_emphasis', '  code_span "a|b"'],
			['code_span "c|d"']
		);
	});

	test('a pipe after the span still ends the cell', () => {
		both('`a\\|`|`b`', ['code_span "a|"'], ['code_span "b"']);
		both('`a\\|b` \\| c', ['code_span "a|b"', 'text " "', 'text "| c"']);
	});

	test('a backslash that is itself escaped escapes no pipe', () => {
		both(
			'`a\\\\|b`',
			['text "`"', 'text "a"', 'text "\\\\"'],
			['text "b"', 'text "`"']
		);
		both('`a\\\\\\|b`', ['code_span "a\\\\\\\\|b"']);
	});

	test('a span with no closer is text and the pipe stays in the cell', () => {
		both('`\\|', ['text "`"', 'text "|"']);
		both('` \\|', ['text "`"', 'text " "', 'text "|"']);
		both('`a\\|b', ['text "`"', 'text "a"', 'text "|b"']);
		both('``a\\|b', ['text "``"', 'text "a"', 'text "|b"']);
		both('` a\\|b', ['text "`"', 'text " a"', 'text "|b"']);
		both('`a\\|b|c', ['text "`"', 'text "a"', 'text "|b"'], ['text "c"']);
	});

	test('a hint with no closer', () => {
		both('`#!js a\\|b', ['text "`"', 'text "#"', 'text "!js a"', 'text "|b"']);
	});
});

describe('a lone backtick in a padded two backtick span in a table cell', () => {
	test('the cell end after it fails the span', () => {
		both('`` a `', ['text "``"', 'text " a "', 'text "`"']);
		both('``  `', ['text "``"', 'text "  "', 'text "`"']);
		both(
			'`` a `|b``',
			['text "``"', 'text " a "', 'text "`"'],
			['text "b"', 'text "``"']
		);
	});

	test('after a hint too', () => {
		both('b``#!js   `', [
			'text "b"',
			'text "``"',
			'text "#"',
			'text "!js   "',
			'text "`"',
		]);
		both('``#!js  a `', [
			'text "``"',
			'text "#"',
			'text "!js  a "',
			'text "`"',
		]);
	});

	test('an escaped pipe after it stays in the cell', () => {
		both('`` a `\\|', ['text "``"', 'text " a "', 'text "`"', 'text "|"']);
		both('`` a ` \\| ``', ['code_span "a ` |"']);
		both('`` a\\|b ` ``', ['code_span "a|b `"']);
	});

	test('the span runs on to its closer and loses its padding', () => {
		both('`` a ` ``', ['code_span "a `"']);
		both('`` a ` b ``', ['code_span "a ` b"']);
		both('`` ` ` ``', ['code_span "` `"']);
		both('`` a ``` ``', ['code_span "a ```"']);
	});
});

describe('a pipe in the hint of a code span in a table cell', () => {
	test('ends the cell', () => {
		both(
			'`#!a|b c`',
			['text "`"', 'text "#"', 'text "!a"'],
			['text "b c"', 'text "`"']
		);
		both(
			'``#!a|b c``',
			['text "``"', 'text "#"', 'text "!a"'],
			['text "b c"', 'text "``"']
		);
		both('`#!|`', ['text "`"', 'text "#"', 'text "!"'], ['text "`"']);
		both(
			'x `#!a|b` c',
			['text "x "', 'text "`"', 'text "#"', 'text "!a"'],
			['text "b"', 'text "`"', 'text " c"']
		);
	});

	test('after a backslash that is itself escaped', () => {
		both(
			'`#!a\\\\|b c`',
			['text "`"', 'text "#"', 'text "!a"', 'text "\\\\"'],
			['text "b c"', 'text "`"']
		);
	});

	test('an escaped one stays in the hint', () => {
		both('`#!a\\|b c`|d', ['code_span info="a\\\\|b" "c"'], ['text "d"']);
	});
});

/** the text of each code span, a tree built over the wire has no source to slice */
function code_texts(nodes: NodeBuffer, source: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < nodes.size; i++) {
		if (nodes.kind_at(i) !== NodeKind.code_span) continue;
		const [start, end] = nodes.get_node(i).value;
		out.push(nodes._strings[i] ?? source.slice(start, end));
	}
	return out;
}

function wire_code_texts(source: string, chunk: number): string[] {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const builder = new WireTreeBuilder();
	parser.init();
	let fed = '';
	for (let i = 0; i < source.length; i += chunk) {
		fed = source.slice(0, i + chunk);
		emitter.set_source(fed);
		parser.feed(source.slice(i, i + chunk));
		builder.apply(emitter.flush());
	}
	emitter.set_source(source);
	parser.finish();
	builder.apply(emitter.flush());
	return code_texts(builder.get_buffer(), '');
}

function code_of(source: string): string[] {
	const texts = code_texts(parse_markdown_svelte(source).nodes, source);
	for (const chunk of [1, 2, 3, source.length]) {
		expect(wire_code_texts(source, chunk), `wire ${chunk}`).toEqual(texts);
	}
	return texts;
}

describe('the text of a code span that escapes a pipe', () => {
	test('is the same over the wire', () => {
		expect(code_of('|`a\\|b`|\n|-|\n|`c\\|d` `e`|\n')).toEqual([
			'a|b',
			'c|d',
			'e',
		]);
		expect(code_of('|x|\n|-|\n|` a \\| b ` and ``c\\|`d``|\n')).toEqual([
			'a | b',
			'c|`d',
		]);
		expect(code_of('|x|\n|-|\n|`#!ts string \\| number`')).toEqual([
			'string | number',
		]);
	});

	test('a backslash before anything else stays', () => {
		both('`a\\*b\\\\c`', ['code_span "a\\\\*b\\\\\\\\c"']);
		expect(code_of('|`a\\*b\\|c\\d`|\n|-|\n')).toEqual(['a\\*b|c\\d']);
	});

	test('outside a table the backslash stays', () => {
		expect(checked_tree('`a\\|b` and `` c\\|d ``\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    code_span "a\\\\|b"',
				'    text " and "',
				'    code_span "c\\\\|d"',
				'  line_break'
			)
		);
		expect(code_of('- `a\\|b`\n\n> `c\\|d`\n')).toEqual(['a\\|b', 'c\\|d']);
	});
});

describe('a parse plugin on a code span that escapes a pipe', () => {
	const source = '|`a\\|b`|\n|-|\n|x ` c \\| d `|\n';

	function seen(run: (plugins: ParsePlugin[]) => unknown): string[] {
		const out: string[] = [];
		const read = (name: string) => ({
			parse(node: { text_content: string }) {
				return () => {
					out.push(`${name} ${node.text_content}`);
				};
			},
		});
		run([{ code_span: read('code'), table_cell: read('cell') }]);
		return out;
	}

	const expected = ['code a|b', 'cell a|b', 'code c | d', 'cell x c | d'];

	test.each([0, 1, 2, 3])('reads the code at the close, fed %i', (chunk) => {
		expect(seen((plugins) => run_batch(source, plugins, chunk))).toEqual(
			expected
		);
	});

	test.each([0, 1, 2, 3])('and over the wire, fed %i', (chunk) => {
		expect(seen((plugins) => run_wire(source, plugins, chunk))).toEqual(
			expected
		);
	});
});

const PIECES = ['`', '`', '\\|', '\\|', '\\', 'a', ' ', '#!js ', '|', 'b', '*'];

function random_cells(rand: () => number): string {
	let out = '';
	const length = 1 + Math.floor(rand() * 9);
	for (let k = 0; k < length; k++) out += pick(rand, PIECES);
	return out;
}

describe('random code spans in table cells', () => {
	test('whole, fed and over the wire give the same code', () => {
		const rand = random(1);
		let tables = 0;
		for (let i = 0; i < 250; i++) {
			const cells = random_cells(rand);
			const columns = 1 + Math.floor(rand() * 3);
			const delimiters = `${'|-'.repeat(columns)}|\n`;
			for (const source of [
				`|${cells}|\n${delimiters}`,
				`${'|x'.repeat(columns)}|\n${delimiters}|${cells}|\n`,
				`${'|x'.repeat(columns)}|\n${delimiters}|${cells}`,
			]) {
				const tree = checked_tree(source);
				if (tree.includes('table_header')) tables++;
				code_of(source);
			}
		}
		expect(tables).toBeGreaterThan(450);
	});
});
