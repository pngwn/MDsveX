import { describe, expect, test } from 'vitest';

import { parse_yaml, YamlError } from '../src/yaml';

function error_of(text: string): YamlError {
	try {
		parse_yaml(text);
	} catch (e) {
		if (e instanceof YamlError) return e;
		throw e;
	}
	throw new Error('expected a YamlError');
}

describe('yaml scalars', () => {
	test('plain strings', () => {
		expect(parse_yaml('title: Hello world\n')).toEqual({
			title: 'Hello world',
		});
		expect(parse_yaml('url: https://mdsvex.com/docs#options\n')).toEqual({
			url: 'https://mdsvex.com/docs#options',
		});
		expect(parse_yaml('lang: C#\n')).toEqual({ lang: 'C#' });
	});

	test('quoted strings', () => {
		expect(
			parse_yaml(
				`a: "say \\"hi\\"\\n\\ttab \\u00e9 \\x41 \\U0001F600"\nb: 'it''s # not a comment'\nc: ""\n`
			)
		).toEqual({
			a: 'say "hi"\n\ttab é A 😀',
			b: "it's # not a comment",
			c: '',
		});
	});

	test('numbers', () => {
		expect(
			parse_yaml(
				'a: 1\nb: -42\nc: +7\nd: 3.14\ne: 1e3\nf: .5\ng: 0x1F\nh: 0o17\ni: .inf\nj: -.Inf\n'
			)
		).toEqual({
			a: 1,
			b: -42,
			c: 7,
			d: 3.14,
			e: 1000,
			f: 0.5,
			g: 31,
			h: 15,
			i: Infinity,
			j: -Infinity,
		});
		expect(parse_yaml('n: .nan\n').n).toBeNaN();
	});

	test('booleans and null', () => {
		expect(
			parse_yaml(
				'a: true\nb: False\nc: TRUE\nd: null\ne: ~\nf:\ng: yes\nh: off\n'
			)
		).toEqual({
			a: true,
			b: false,
			c: true,
			d: null,
			e: null,
			f: null,
			// yaml 1.2 has no yes, no, on or off booleans
			g: 'yes',
			h: 'off',
		});
	});

	test('dates and versions stay strings', () => {
		expect(
			parse_yaml(
				'date: 2024-01-15\nat: 2024-01-15T10:30:00Z\nversion: 1.2.3\nzip: 01234\n'
			)
		).toEqual({
			date: '2024-01-15',
			at: '2024-01-15T10:30:00Z',
			version: '1.2.3',
			zip: 1234,
		});
	});

	test('quoted values are never resolved', () => {
		expect(parse_yaml(`a: "1"\nb: 'true'\nc: "null"\n`)).toEqual({
			a: '1',
			b: 'true',
			c: 'null',
		});
	});

	test('multi-line plain and quoted values fold', () => {
		expect(
			parse_yaml('a: one\n  two\n\n  three\nb: "x\n  y\\\n  z"\nc: next\n')
		).toEqual({ a: 'one two\nthree', b: 'x yz', c: 'next' });
		// yaml 1.2 production 112, empty lines after an escaped break are kept
		expect(parse_yaml('a: "x\\\n\n  y"\n')).toEqual({ a: 'x\ny' });
	});
});

describe('yaml block scalars', () => {
	test('literal keeps line breaks', () => {
		expect(
			parse_yaml('code: |\n  let x = 1;\n    indented\n\n  done\nnext: 1\n')
		).toEqual({ code: 'let x = 1;\n  indented\n\ndone\n', next: 1 });
	});

	test('folded joins lines', () => {
		expect(
			parse_yaml(
				'text: >\n  one\n  two\n\n  three\n    more indented\n  four\n'
			)
		).toEqual({ text: 'one two\nthree\n  more indented\nfour\n' });
	});

	test('chomping', () => {
		expect(
			parse_yaml('a: |-\n  x\n\nb: |+\n  y\n\nc: >\n  z\n\n\nd: |\n')
		).toEqual({ a: 'x', b: 'y\n\n', c: 'z\n', d: '' });
	});

	test('explicit indentation', () => {
		expect(parse_yaml('a: |2\n    two extra\n  base\n')).toEqual({
			a: '  two extra\nbase\n',
		});
	});

	test('comment lines inside are content', () => {
		expect(parse_yaml('a: | # header comment\n  # not a comment\n')).toEqual({
			a: '# not a comment\n',
		});
	});

	test('in sequences', () => {
		expect(parse_yaml('a:\n  - |\n    x\n  - >-\n    y\n    z\n')).toEqual({
			a: ['x\n', 'y z'],
		});
	});
});

describe('yaml collections', () => {
	test('nested maps', () => {
		expect(
			parse_yaml(
				'author:\n  name: pngwn\n  links:\n    site: https://pngwn.io\nother: 1\n'
			)
		).toEqual({
			author: { name: 'pngwn', links: { site: 'https://pngwn.io' } },
			other: 1,
		});
	});

	test('block sequences, indented or not', () => {
		expect(
			parse_yaml('tags:\n  - svelte\n  - markdown\nmore:\n- a\n- b\nlast: 1\n')
		).toEqual({ tags: ['svelte', 'markdown'], more: ['a', 'b'], last: 1 });
	});

	test('maps in sequences', () => {
		expect(
			parse_yaml(
				'people:\n  - name: a\n    roles:\n    - x\n    - y\n  - name: b\n    age: 3\n'
			)
		).toEqual({
			people: [
				{ name: 'a', roles: ['x', 'y'] },
				{ name: 'b', age: 3 },
			],
		});
	});

	test('nested sequences', () => {
		expect(parse_yaml('m:\n  - - 1\n    - 2\n  -\n    - 3\n  -\n')).toEqual({
			m: [[1, 2], [3], null],
		});
	});

	test('flow sequences and maps', () => {
		expect(
			parse_yaml(
				`tags: [svelte, "mark, down", 'x', 1, true]\nempty: []\nmap: {a: 1, "b c": [x, y], d}\nnone: {}\n`
			)
		).toEqual({
			tags: ['svelte', 'mark, down', 'x', 1, true],
			empty: [],
			map: { a: 1, 'b c': ['x', 'y'], d: null },
			none: {},
		});
	});

	test('flow collections over several lines with comments', () => {
		expect(
			parse_yaml(
				'tags: [\n  a, # first\n  b,\n]\nlinks: [{ url: http://x.io }]\n'
			)
		).toEqual({ tags: ['a', 'b'], links: [{ url: 'http://x.io' }] });
	});

	test('a top level flow map', () => {
		expect(parse_yaml('{ title: Hi, n: 1 }\n')).toEqual({ title: 'Hi', n: 1 });
	});

	test('quoted keys', () => {
		expect(parse_yaml(`"a: b": 1\n'c': 2\nd e: 3\n`)).toEqual({
			'a: b': 1,
			c: 2,
			'd e': 3,
		});
	});

	test('__proto__ is an ordinary key', () => {
		const out = parse_yaml('__proto__:\n  polluted: true\n');
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
		expect(Object.keys(out)).toEqual(['__proto__']);
		expect(({} as any).polluted).toBeUndefined();
	});
});

describe('yaml comments and blank text', () => {
	test('comments anywhere a line or value can end', () => {
		expect(
			parse_yaml(
				'# leading\ntitle: Hi # trailing\n\n  # indented\nlist: # after key\n  - a # item\n  # between\n  - b\n'
			)
		).toEqual({ title: 'Hi', list: ['a', 'b'] });
	});

	test('empty or comment only text is an empty map', () => {
		expect(parse_yaml('')).toEqual({});
		expect(parse_yaml('\n  \n# nothing\n')).toEqual({});
	});
});

describe('yaml errors', () => {
	test.each([
		['a: &anchor 1\n', 1, "anchors (&) aren't supported"],
		['a: 1\nb: *anchor\n', 2, "aliases (*) aren't supported"],
		['a: !!str 1\n', 1, "tags (!) aren't supported"],
		['? complex\n: key\n', 1, "complex keys (?) aren't supported"],
		['a: 1\nb\n', 2, "expected 'key: value'"],
		['a: 1\n<<: {b: 2}\n', 2, "merge keys (<<) aren't supported"],
		['- a\n- b\n', 1, 'frontmatter must be a mapping'],
		['just text\n', 1, 'frontmatter must be a mapping'],
		['a: 1\na: 2\n', 2, "duplicate key 'a'"],
		['a:\n\tb: 1\n', 2, "tabs can't indent YAML"],
		['title: Hello: World\n', 1, "can't contain ': '"],
		['a: "open\nb: 1\n', 1, 'unterminated quoted value'],
		["a: 'x' y\n", 1, 'unexpected text after the value'],
		['a: [1, 2\nb: 3\n', 2, "expected ',' or ']'"],
		['a: [1,, 2]\n', 1, 'empty entry'],
		['a: [b: 1]\n', 1, 'needs braces'],
		['a: 1\n  b: 2\n', 2, "can't contain ': '"],
		['a:\n  b: 1\n c: 2\n', 3, 'unexpected indentation'],
		['a: - b\n', 1, "a sequence can't start on its key's line"],
		['a: @x\n', 1, "'@' can't start a plain value"],
		['a: "\\q"\n', 1, "unknown escape '\\q'"],
	])('%j fails at line %i', (text, line, reason) => {
		const e = error_of(text);
		expect(e.line).toBe(line);
		expect(e.reason).toContain(reason);
	});
});
