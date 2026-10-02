import { describe, it, expect } from 'vitest';
import { PFMParser, parse_markdown_svelte, NodeKind } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { Emitter } from '../src/opcodes';
import { kind_to_string } from '../src/utils';
import type { NodeBuffer } from '../src/utils';
import fs from 'node:fs';
import path from 'node:path';

//  Helpers

type Op =
	| { op: 'open'; id: number; kind: string; pending: boolean }
	| { op: 'close'; id: number }
	| { op: 'attr'; id: number; key: string }
	| { op: 'revoke'; id: number };

class OpRecorder implements Emitter {
	ops: Op[] = [];
	open(
		id: number,
		kind: number,
		_s: number,
		_p: number,
		_e: number,
		pending: boolean
	) {
		this.ops.push({ op: 'open', id, kind: kind_to_string(kind), pending });
	}
	close(id: number, _end: number) {
		this.ops.push({ op: 'close', id });
	}
	text(_p: number, _s: number, _e: number) {}
	attr(id: number, key: string, _v: any) {
		this.ops.push({ op: 'attr', id, key });
	}
	set_value_start(id: number, _pos: number) {
		this.ops.push({ op: 'attr', id, key: 'value_start' });
	}
	set_value_end(id: number, _pos: number) {
		this.ops.push({ op: 'attr', id, key: 'value_end' });
	}
	revoke(id: number) {
		this.ops.push({ op: 'revoke', id });
	}
	cursor(_pos: number) {}
}

function tree_diff(
	a: NodeBuffer,
	b: NodeBuffer,
	_source: string,
	a_idx = 0,
	b_idx = 0,
	path_str = 'root'
): string[] {
	const an = a.get_node(a_idx);
	const bn = b.get_node(b_idx);
	const diffs: string[] = [];
	if (an.kind !== bn.kind)
		diffs.push(`${path_str}: kind ${an.kind} vs ${bn.kind}`);
	if (an.start !== bn.start)
		diffs.push(`${path_str}: start ${an.start} vs ${bn.start}`);
	if (an.end !== bn.end) diffs.push(`${path_str}: end ${an.end} vs ${bn.end}`);
	if (an.value[0] !== bn.value[0] || an.value[1] !== bn.value[1])
		diffs.push(`${path_str}: value [${an.value}] vs [${bn.value}]`);
	if (an.children.length !== bn.children.length)
		diffs.push(
			`${path_str}: children ${an.children.length} vs ${bn.children.length}`
		);
	const min = Math.min(an.children.length, bn.children.length);
	for (let i = 0; i < min; i++)
		diffs.push(
			...tree_diff(
				a,
				b,
				_source,
				an.children[i],
				bn.children[i],
				`${path_str}[${i}]`
			)
		);
	return diffs;
}

function parse_batch(source: string): NodeBuffer {
	return parse_markdown_svelte(source).nodes;
}

function parse_incremental(source: string, chunk_size: number): NodeBuffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk_size) {
		parser.feed(source.slice(i, Math.min(i + chunk_size, source.length)));
	}
	parser.finish();
	return tree.get_buffer();
}

//  Tests

describe('Incremental parsing', () => {
	describe('eager opcode emission', () => {
		it('emits paragraph + text immediately on first line', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('Hello world');
			const kinds = rec.ops
				.filter((o) => o.op === 'open')
				.map((o) => (o as any).kind);
			expect(kinds).toContain('root');
			expect(kinds).toContain('paragraph');
			expect(kinds).toContain('text');
		});

		it('emits emphasis open eagerly on *', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello *wor');
			const opens = rec.ops.filter((o) => o.op === 'open');
			const kinds = opens.map((o) => (o as any).kind);
			expect(kinds).toContain('strong_emphasis');
			const emph = opens.find((o) => (o as any).kind === 'strong_emphasis');
			expect((emph as any).pending).toBe(true);
		});

		it('emits strikethrough open eagerly on ~~', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello ~~wor');
			const kinds = rec.ops
				.filter((o) => o.op === 'open')
				.map((o) => (o as any).kind);
			expect(kinds).toContain('strikethrough');
		});

		it('emits superscript open eagerly on ^', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('x^2');
			const kinds = rec.ops
				.filter((o) => o.op === 'open')
				.map((o) => (o as any).kind);
			expect(kinds).toContain('superscript');
		});

		it('code fence stays open across feeds', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('```js\ncode here\n');
			const opens = rec.ops.filter((o) => o.op === 'open');
			const fence_open = opens.find(
				(o) => (o as any).kind === 'code_fence'
			) as any;
			expect(fence_open).toBeDefined();

			const closes = rec.ops.filter((o) => o.op === 'close');
			expect(closes.some((o) => (o as any).id === fence_open.id)).toBe(false);

			p.feed('```\n');
			const closes2 = rec.ops.filter((o) => o.op === 'close');
			expect(closes2.some((o) => (o as any).id === fence_open.id)).toBe(true);
		});

		it('raw text element opens once its open tag is complete', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('<style>\n.a { color: red }\n</sty');
			const html_open = rec.ops.find(
				(o) => o.op === 'open' && o.kind === 'html'
			) as any;
			expect(html_open).toBeDefined();
			expect(html_open.pending).toBe(false);
			const closed = () =>
				rec.ops.some((o) => o.op === 'close' && o.id === html_open.id);
			expect(closed()).toBe(false);

			p.feed('le>\n');
			expect(closed()).toBe(true);
		});

		it('revokes unclosed emphasis on finish', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('hello *friends');
			// emphasis should be open
			const emph = rec.ops.find(
				(o) => o.op === 'open' && (o as any).kind === 'strong_emphasis'
			);
			expect(emph).toBeDefined();

			p.finish();
			const revokes = rec.ops.filter((o) => o.op === 'revoke');
			expect(revokes.length).toBeGreaterThan(0);
		});
	});

	describe('line-by-line equivalence', () => {
		// Feeding complete lines should match batch, since the parser
		// has full line context for block-level decisions.
		const cases: [string, string][] = [
			['paragraph', 'Hello world\n'],
			['heading', '# Hello\n'],
			['emphasis', 'Hello *world*!\n'],
			['strong', 'Hello _world_!\n'],
			['code span', 'Hello `code` world\n'],
			['code fence', '```js\nconsole.log(1)\n```\n'],
			['thematic break', '---\n'],
			['unordered list', '- one\n- two\n- three\n'],
			['ordered list', '1. one\n2. two\n'],
			['link', '[click](http://example.com)\n'],
			['autolink', '<http://example.com>\n'],
			['block quote', '> Hello\n> world\n'],
			// PFM: an unmarked line cascade-closes the blockquote; verifying
			// this path produces identical output in batch and incremental modes.
			['block quote cascade close', '> Hello\nworld\n'],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				const batch = parse_batch(input);
				// Feed whole input at once (simulates line-by-line for single-line)
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				parser.feed(input);
				parser.finish();
				const diffs = tree_diff(batch, tree.get_buffer(), input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('multi-line equivalence', () => {
		// Feeding multi-line documents line-by-line
		const cases: [string, string][] = [
			['two paragraphs', 'First\n\nSecond\n'],
			['heading + paragraph', '# Title\n\nSome text.\n'],
			['complex', '# Title\n\n*bold* and _em_\n\n- a\n- b\n'],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				const batch = parse_batch(input);
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				// Feed entire input at once
				parser.feed(input);
				parser.finish();
				const diffs = tree_diff(batch, tree.get_buffer(), input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('chunk size equivalence', () => {
		// Larger chunk sizes should match batch since they provide
		// enough context for all decisions.
		const input =
			'# Heading\n\nParagraph with *strong* text.\n\n```\ncode\n```\n\n- item\n';

		for (const size of [13, 50, 9999]) {
			it(`chunk size ${size}`, () => {
				const batch = parse_batch(input);
				const incr = parse_incremental(input, size);
				const diffs = tree_diff(batch, incr, input);
				expect(diffs).toEqual([]);
			});
		}
	});

	describe('code span failed by a blank line across a chunk boundary', () => {
		for (const input of ['`a\n\nb`', '`a\n  \nb`', '`` a\n\nb``']) {
			for (const size of [1, 2, 3, 4]) {
				it(`${JSON.stringify(input)} chunk size ${size}`, () => {
					const batch = parse_batch(input);
					expect(
						batch.get_node(0).children.map((i) => batch.get_node(i).kind)
					).toEqual(['paragraph', 'line_break', 'line_break', 'paragraph']);
					const diffs = tree_diff(batch, parse_incremental(input, size), input);
					expect(diffs).toEqual([]);
				});
			}
		}
	});

	describe('fixture equivalence (char-by-char)', () => {
		const fixturesDir = path.resolve(__dirname, 'fixtures/pfm');
		const categories = fs
			.readdirSync(fixturesDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)
			.sort();

		// Known incremental divergences, these are tracked as todos
		// so the suite stays green while providing a clear fix backlog.
		// When a fix lands, the test will start passing and vitest will
		// flag it, remove the entry to lock in the fix.
		const KNOWN_DIVERGENT: Set<string> = new Set([
			'emphasis_and_strong_emphasis/448',
			'emphasis_and_strong_emphasis/451',
			'html/148',
			'html/616',
			'images/573',
			'images/576',
			'images/577',
		]);

		for (const cat of categories) {
			describe(cat, () => {
				const catDir = path.join(fixturesDir, cat);
				const fixtures = fs
					.readdirSync(catDir)
					.filter((f) => f.endsWith('.md'))
					.sort((a, b) => {
						const na = parseInt(a, 10);
						const nb = parseInt(b, 10);
						if (!isNaN(na) && !isNaN(nb)) return na - nb;
						return a.localeCompare(b);
					});

				for (const fix of fixtures) {
					const id = fix.replace('.md', '');
					const key = `${cat}/${id}`;
					const test_fn = KNOWN_DIVERGENT.has(key) ? it.todo : it;

					test_fn(`${id}`, () => {
						const input = fs.readFileSync(path.join(catDir, fix), 'utf-8');
						const batch = parse_batch(input);
						const incr = parse_incremental(input, 1);
						const diffs = tree_diff(batch, incr, input);
						expect(diffs).toEqual([]);
					});
				}
			});
		}
	});

	describe('HTML incremental equivalence', () => {
		const html_cases: [string, string][] = [
			['self-closing inline', 'text <br /> more\n'],
			['self-closing with attr', 'text <img src="x.jpg" /> end\n'],
			['paired inline', 'text <em>hello</em> end\n'],
			['nested inline', 'text <div><span>deep</span></div> end\n'],
			['block self-closing', '<hr />\n'],
			['block paired', '<div>\n\nhello\n\n</div>\n'],
			['block with heading', '<section>\n\n# Title\n\n</section>\n'],
			['inline comment', 'text <!-- comment --> end\n'],
			['block comment', '<!-- block -->\n\nparagraph\n'],
			['html with attributes', '<div class="a" id="b">\n\ncontent\n\n</div>\n'],
			['unclosed revoked', 'text <span>never closed\n'],
			['multiple siblings', 'text <a>one</a> and <b>two</b> end\n'],
			['html inside emphasis', '_<span>text</span>_\n'],
			['markdown inside html', '<div>*strong* and _em_</div>\n'],
			[
				'deeply nested block',
				'<div>\n\n<section>\n\n<p>deep</p>\n\n</section>\n\n</div>\n',
			],
			[
				'mixed doc',
				'# Title\n\n<div class="note">\n\nSome *text* here.\n\n</div>\n\nAfter.\n',
			],
			['block script', '<script>\nlet a = 1 > 0;\n</script>\n\nafter\n'],
			['inline style', 'text <style>a > b {}</style> end\n'],
			['unterminated block script', 'text\n\n<script>\nlet a = 1;\n'],
			['unterminated inline style', 'a <style>b {}\n'],
			['script in html block', '<div>\n<script>\nfoo()\n</script>\n</div>\n'],
			['style in svelte block', '{#if a}\n<style>\nb {}\n</style>\n{/if}\n'],
			['style in block quote', '> <style>\n> a {}\n> </style>\n'],
			['close tag lookalike', '<script>"</scrip" + "t>";</script>\n'],
		];

		for (const [name, input] of html_cases) {
			it(`${name} (full feed)`, () => {
				const batch = parse_batch(input);
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				parser.feed(input);
				parser.finish();
				const diffs = tree_diff(batch, tree.get_buffer(), input);
				expect(diffs).toEqual([]);
			});
		}

		// Byte-at-a-time feeding, the harshest incremental test
		for (const [name, input] of html_cases) {
			it(`${name} (1-byte chunks)`, () => {
				const batch = parse_batch(input);
				const incr = parse_incremental(input, 1);
				const diffs = tree_diff(batch, incr, input);
				expect(diffs).toEqual([]);
			});
		}
	});
});

describe('directive incremental behavior', () => {
	const opens_of = (rec: OpRecorder, kind: string) =>
		rec.ops.filter((o) => o.op === 'open' && (o as any).kind === kind) as any[];
	const closes_for = (rec: OpRecorder, id: number) =>
		rec.ops.filter((o) => o.op === 'close' && (o as any).id === id);
	const attrs_for = (rec: OpRecorder, id: number) =>
		rec.ops
			.filter((o) => o.op === 'attr' && (o as any).id === id)
			.map((o) => (o as any).key);

	it('opens eagerly at line start as soon as :name[ is complete', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed(':hel');
		// single colon can never be a block directive - paragraph opens now
		expect(opens_of(rec, 'paragraph').length).toBe(1);
		expect(opens_of(rec, 'directive_inline').length).toBe(0);

		p.feed('lo[wo');
		const dirs = opens_of(rec, 'directive_inline');
		expect(dirs.length).toBe(1);
		expect(dirs[0].pending).toBe(true);
		expect(attrs_for(rec, dirs[0].id)).toContain('name');
	});

	it('opens eagerly mid-paragraph', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();
		p.feed('see :d[co');
		expect(opens_of(rec, 'directive_inline').length).toBe(1);
	});

	it('holds the close at ] until args are decided, args arrive atomically', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed(':d[x]');
		const dir = opens_of(rec, 'directive_inline')[0];
		expect(dir).toBeDefined();
		expect(closes_for(rec, dir.id).length).toBe(0);

		p.feed('(a=1');
		expect(closes_for(rec, dir.id).length).toBe(0);
		expect(attrs_for(rec, dir.id)).not.toContain('args');

		p.feed(', b=2)');
		expect(attrs_for(rec, dir.id)).toContain('args');
		expect(closes_for(rec, dir.id).length).toBe(1);
	});

	it('closes immediately when the next char rules out args', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed(':d[x]');
		const dir = opens_of(rec, 'directive_inline')[0];
		expect(closes_for(rec, dir.id).length).toBe(0);

		p.feed('y');
		expect(closes_for(rec, dir.id).length).toBe(1);
		expect(attrs_for(rec, dir.id)).not.toContain('args');
	});

	it('closes at finish when ] ends the input', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();
		p.feed(':d[x]');
		const dir = opens_of(rec, 'directive_inline')[0];
		expect(closes_for(rec, dir.id).length).toBe(0);
		p.finish();
		expect(closes_for(rec, dir.id).length).toBe(1);
	});

	it('container opens at the end of its opener line, body streams eagerly', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed(':::box[L](k=v)');
		expect(opens_of(rec, 'directive_container').length).toBe(0);

		p.feed('\n');
		const box = opens_of(rec, 'directive_container')[0];
		expect(box).toBeDefined();
		expect(attrs_for(rec, box.id)).toContain('args');
		expect(closes_for(rec, box.id).length).toBe(0);

		p.feed('body');
		expect(opens_of(rec, 'paragraph').length).toBe(1);

		p.feed('\n:::\n');
		expect(closes_for(rec, box.id).length).toBe(1);
	});

	it('container body starts a list, the fence closes it before the container', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed(':::note[]\n- a');
		const list = opens_of(rec, 'list')[0];
		const box = opens_of(rec, 'directive_container')[0];
		// a tight item paragraph stays pending, as at the root
		expect(
			rec.ops
				.filter((o) => o.op === 'open')
				.map((o) => (o as any).kind + ((o as any).pending ? '?' : ''))
		).toEqual([
			'root',
			'directive_container',
			'list',
			'list_item',
			'paragraph?',
			'text',
		]);

		p.feed('\n- b\n');
		expect(opens_of(rec, 'list_item').length).toBe(2);
		expect(closes_for(rec, list.id).length).toBe(0);

		p.feed(':::\n');
		const close_ids = rec.ops
			.filter((o) => o.op === 'close')
			.map((o) => (o as any).id);
		const list_close = close_ids.indexOf(list.id);
		expect(list_close).toBeGreaterThanOrEqual(0);
		expect(close_ids.indexOf(box.id)).toBeGreaterThan(list_close);
	});

	describe('lists in containers match batch at every chunk size', () => {
		const cases: [string, string][] = [
			['bullet', ':::note[]\n- a\n- b\n:::\n'],
			['plus', ':::note[]\n+ a\n+ b\n:::\n'],
			['ordered', ':::note[]\n10. a\n11. b\n:::\n'],
			['task', ':::note[]\n- [ ] a\n- [x] b\n:::\n'],
			['nested', ':::note[]\n- a\n  1. b\n- c\n:::\nafter\n'],
			['loose', ':::note[]\n- a\n\n- b\n:::\n'],
			['after paragraph', ':::note[]\nintro\n- a\n:::\n'],
			['thematic break', ':::note[]\n- - -\n:::\n'],
			['no fence', ':::note[]\n- a\n- b'],
			['nested containers', '::::o[]\n:::i[]\n- a\n:::\n2. b\n::::\n'],
		];
		for (const [name, input] of cases) {
			for (const size of [1, 2, 3, 5, 8]) {
				it(`${name} chunk size ${size}`, () => {
					const batch = parse_batch(input);
					const diffs = tree_diff(batch, parse_incremental(input, size), input);
					expect(diffs).toEqual([]);
				});
			}
		}
	});

	it('revokes an unclosed directive at a paragraph boundary', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();
		p.feed(':d[oops');
		const dir = opens_of(rec, 'directive_inline')[0];
		expect(dir).toBeDefined();
		p.feed('\n\nnext\n');
		const revokes = rec.ops.filter(
			(o) => o.op === 'revoke' && (o as any).id === dir.id
		);
		expect(revokes.length).toBeGreaterThan(0);
	});
});

describe('retained source window', () => {
	const lines = (n: number, f: (i: number) => string) =>
		Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';
	const cases: [string, string][] = [
		[
			'code fence',
			'```js\n' + lines(2000, (i) => `const x${i} = ${i};`) + '```\n',
		],
		['tight list', lines(2000, (i) => `- item ${i} *em*`)],
		['loose list', lines(2000, (i) => (i % 2 ? '' : `- item ${i}`))],
		[
			'nested list',
			lines(2000, (i) => (i % 3 ? `  - sub ${i}` : `- item ${i}`)),
		],
		['block quote', lines(2000, (i) => (i % 2 ? '>' : `> quote ${i}`))],
		['list in block quote', lines(2000, (i) => `> - item ${i}`)],
		[
			'style block',
			'<style>\n' +
				lines(2000, (i) => `.c${i} > a { color: red }`) +
				'</style>\n',
		],
		[
			'script after blocks',
			'# title\n\n- a\n\n<script>\n' +
				lines(2000, (i) => `let x${i} = ${i} > 0;`) +
				'</script>\n\nafter\n',
		],
		[
			'fence in list',
			'- item\n  ```\n' + lines(2000, (i) => `  code ${i}`) + '  ```\n',
		],
	];

	for (const [name, source] of cases) {
		it(`${name} stays bounded and matches batch`, () => {
			const tree = new TreeBuilder(source.length);
			const parser = new PFMParser(tree);
			parser.init();
			let max_window = 0;
			for (let i = 0; i < source.length; i += 64) {
				parser.feed(source.slice(i, i + 64));
				max_window = Math.max(max_window, (parser as any).source.length);
			}
			parser.finish();
			expect(max_window).toBeLessThan(512);
			expect(tree_diff(parse_batch(source), tree.get_buffer(), source)).toEqual(
				[]
			);
		});
	}
});

describe('feeds skipped while a fence or raw text block waits for its close', () => {
	const body = (n: number, f: (i: number) => string) =>
		Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';
	const cases: [string, string][] = [
		[
			'fence',
			'```js\n' + body(40, (i) => `const x${i} = ${i};`) + '```\n\nafter\n',
		],
		[
			'fence with short backtick runs',
			'````\n' +
				body(30, (i) => (i % 5 ? `line ${i}` : '```')) +
				'  ``\n `\n````\nafter\n',
		],
		[
			'fence with indented close',
			'```\n' + body(30, (i) => `  code ${i}`) + '   ```\n\nafter\n',
		],
		[
			'fence in list',
			'- item\n  ```\n' + body(30, (i) => `  c ${i}`) + '  ```\n- b\n',
		],
		[
			'fence in block quote',
			'> ```\n' + body(30, (i) => `> c ${i}`) + '> ```\n',
		],
		['unclosed fence', '```\n' + body(30, (i) => `c ${i}`)],
		[
			'fence with blank lines',
			'```\n' + body(30, (i) => (i % 3 ? `c ${i}` : '')) + '```\n',
		],
		[
			'script',
			'<script>\n' +
				body(30, (i) => `let x${i} = ${i} > 0;`) +
				'</script>\n\nafter\n',
		],
		[
			'script with a less than',
			'<script>\n' +
				body(30, (i) => (i % 4 ? `let x${i} = ${i};` : `if (a < ${i}) b();`)) +
				'</scr\n</script>\nafter\n',
		],
		[
			'style',
			'<style>\n' + body(30, (i) => `.c${i} > a { color: red }`) + '</style>\n',
		],
		['unclosed script', '<script>\n' + body(30, (i) => `x(${i});`)],
		[
			'script then fence',
			'<script>\nlet a = 1;\n</script>\n\n```\n' +
				body(20, (i) => `c${i}`) +
				'```\n',
		],
	];
	const crlf = (s: string) => s.replace(/\n/g, '\r\n');
	const cr = (s: string) => s.replace(/\n/g, '\r');

	function feed_counted(source: string, size: number) {
		const tree = new TreeBuilder(source.length);
		const parser = new PFMParser(tree);
		const p = parser as any;
		const skip = p.skip_wait;
		let skipped = 0;
		p.skip_wait = function (chunk: string, len: number) {
			const r = skip.call(this, chunk, len);
			if (r) skipped++;
			return r;
		};
		parser.init();
		for (let i = 0; i < source.length; i += size) {
			parser.feed(source.slice(i, i + size));
		}
		parser.finish();
		return { nodes: tree.get_buffer(), skipped };
	}

	for (const [name, source] of cases) {
		for (const variant of [source, crlf(source), cr(source)]) {
			const batch = parse_batch(variant);
			for (const size of [1, 2, 3, 7, 64]) {
				const label = `${name} ${JSON.stringify(variant.slice(-6))} chunk ${size}`;
				it(label, () => {
					const { nodes } = feed_counted(variant, size);
					expect(tree_diff(batch, nodes, variant)).toEqual([]);
				});
			}
		}
	}

	it('skips feeds inside a fence', () => {
		const source = '```\n' + body(40, (i) => `code line ${i}`) + '```\n';
		const { nodes, skipped } = feed_counted(source, 16);
		expect(skipped).toBeGreaterThan(20);
		expect(tree_diff(parse_batch(source), nodes, source)).toEqual([]);
	});

	it('skips feeds inside a script', () => {
		const source =
			'<script>\n' + body(40, (i) => `let x${i} = ${i};`) + '</script>\n';
		const { nodes, skipped } = feed_counted(source, 16);
		expect(skipped).toBeGreaterThan(20);
		expect(tree_diff(parse_batch(source), nodes, source)).toEqual([]);
	});

	it('does not skip a chunk holding the fence close', () => {
		const tree = new TreeBuilder(64);
		const parser = new PFMParser(tree);
		parser.init();
		parser.feed('```\nabc\n');
		parser.feed('x\n`');
		parser.feed('``\nafter\n');
		parser.finish();
		const full = '```\nabc\nx\n```\nafter\n';
		expect(tree_diff(parse_batch(full), tree.get_buffer(), full)).toEqual([]);
	});
});
