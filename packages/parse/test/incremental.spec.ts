import { describe, it, expect } from 'vitest';
import { PFMParser, parse_markdown_svelte, NodeKind } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { Emitter } from '../src/opcodes';
import { kind_to_string } from '../src/utils';
import type { NodeBuffer } from '../src/utils';
import fs from 'node:fs';
import path from 'node:path';
import { print_ast } from './print';

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

/** against batch with positions, at chunk sizes 1, 2 and 3 and split in two at every offset */
const fed_cases = (cases: [string, string][]) => {
	for (const [name, input] of cases) {
		for (const size of [1, 2, 3]) {
			it(`${name} chunk size ${size}`, () => {
				const batch = parse_batch(input);
				const incr = parse_incremental(input, size);
				expect(tree_diff(batch, incr, input)).toEqual([]);
				expect(print_ast(incr, input)).toBe(print_ast(batch, input));
			});
		}
		it(`${name} at every split offset`, () => {
			const batch = parse_batch(input);
			const printed = print_ast(batch, input);
			for (let at = 1; at < input.length; at++) {
				const tree = new TreeBuilder(input.length);
				const parser = new PFMParser(tree);
				parser.init();
				parser.feed(input.slice(0, at));
				parser.feed(input.slice(at));
				parser.finish();
				const incr = tree.get_buffer();
				expect(tree_diff(batch, incr, input), `split at ${at}`).toEqual([]);
				expect(print_ast(incr, input), `split at ${at}`).toBe(printed);
			}
		});
	}
};

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

	describe('block directives without brackets', () => {
		const open_kinds = (rec: OpRecorder) =>
			rec.ops.filter((o) => o.op === 'open').map((o) => (o as any).kind);

		it('a bare leaf stalls through its line and opens at the line end', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			for (const chunk of [':', ':', 'to', 'c', ' ', '\t']) {
				p.feed(chunk);
				expect(open_kinds(rec), JSON.stringify(chunk)).toEqual(['root']);
			}
			p.feed('\n');
			const leaf = opens_of(rec, 'directive_leaf')[0];
			expect(leaf).toBeDefined();
			expect(attrs_for(rec, leaf.id)).toEqual(['name']);
			expect(closes_for(rec, leaf.id).length).toBe(1);
			expect(opens_of(rec, 'paragraph').length).toBe(0);
		});

		it('a bare container stalls inside its args, the body streams eagerly', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			for (const chunk of [
				':::',
				'box',
				'(',
				'k',
				'=',
				'"a ',
				'b"',
				', l=m',
				')',
				'  ',
			]) {
				p.feed(chunk);
				expect(open_kinds(rec), JSON.stringify(chunk)).toEqual(['root']);
			}
			p.feed('\n');
			const box = opens_of(rec, 'directive_container')[0];
			expect(box).toBeDefined();
			expect(attrs_for(rec, box.id)).toEqual(['args', 'name']);
			expect(closes_for(rec, box.id).length).toBe(0);

			p.feed('body');
			expect(opens_of(rec, 'paragraph').length).toBe(1);
			p.feed('\n:::\n');
			expect(closes_for(rec, box.id).length).toBe(1);
		});

		it('a bare opener at the end of the input opens at finish', () => {
			for (const [input, kind] of [
				['::toc', 'directive_leaf'],
				['::toc ', 'directive_leaf'],
				['::toc(a=1)', 'directive_leaf'],
				[':::note', 'directive_container'],
			]) {
				const rec = new OpRecorder();
				const p = new PFMParser(rec);
				p.init();
				p.feed(input);
				expect(open_kinds(rec), input).toEqual(['root']);
				p.finish();
				expect(opens_of(rec, kind).length, input).toBe(1);
				expect(opens_of(rec, 'paragraph').length, input).toBe(0);
			}
		});

		it('prose after the name opens a paragraph at its first character', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed('::before');
			expect(open_kinds(rec)).toEqual(['root']);
			// trailing whitespace is still a directive, the next character decides
			p.feed(' ');
			expect(open_kinds(rec)).toEqual(['root']);
			p.feed('i');
			expect(open_kinds(rec)).toEqual(['root', 'paragraph', 'text', 'text']);
			p.feed('s a pseudo-element\n');
			p.finish();
			expect(opens_of(rec, 'directive_leaf').length).toBe(0);
		});

		it('a character that cannot follow the name opens a paragraph at once', () => {
			for (const tail of [':', '.', ',', '!', '{', '<', '*']) {
				const rec = new OpRecorder();
				const p = new PFMParser(rec);
				p.init();
				p.feed('::name');
				expect(open_kinds(rec), tail).toEqual(['root']);
				p.feed(tail);
				expect(open_kinds(rec)[1], tail).toBe('paragraph');
			}
		});

		it('malformed args open a paragraph where they go wrong', () => {
			const rec = new OpRecorder();
			const p = new PFMParser(rec);
			p.init();
			p.feed(':::note(k');
			expect(open_kinds(rec)).toEqual(['root']);
			p.feed(' ');
			expect(open_kinds(rec)).toEqual(['root']);
			// a key needs its =
			p.feed('v');
			expect(open_kinds(rec)[1]).toBe('paragraph');
		});

		const cases: [string, string][] = [
			['leaf', '::toc\n'],
			['leaf at the end of the input', '::toc'],
			['leaf with trailing whitespace', '::toc \t \nafter\n'],
			['leaf with args', '::toc(depth=2, title="On this page")\nafter\n'],
			['leaf with args at the end of the input', '::toc(a=1)'],
			['leaf with empty args', '::toc()\n'],
			['container', ':::note\nbody *x*\n:::\nafter\n'],
			['container with args', ':::note(kind=warn)  \nbody\n:::\n'],
			['container at the end of the input', ':::note'],
			['unclosed container', ':::note\nbody\n'],
			['empty container', ':::note\n:::\n'],
			['nested', ':::a\n:::b\nx\n:::\ny\n:::\n'],
			['nested by colon count', '::::a\n:::b\nx\n:::\n::leaf\n::::\n'],
			['after a paragraph line', 'text\n::toc\nmore\n:::note\nx\n:::\n'],
			['block quote', '> ::toc\n>\n> :::note(k=v)\n> x\n> :::\nafter\n'],
			['block quote, unmarked body', '> :::note\nbody\n'],
			['list item', '- ::toc\n- :::note\n  x\n  :::\n- b\n'],
			[
				'svelte block',
				'{#if a}\n::toc\n:::note(k=v)\nx\n:::\n{:else}\n::toc\n{/if}\n',
			],
			['prose', '::before is a pseudo-element\n'],
			['prose after a paragraph line', 'text\n::before is\nmore\n'],
			['name then punctuation', '::name:\n::name.\n::name::\n'],
			['space before the brackets', ':::name [x]\nbody\n:::\n'],
			['space before the args', '::name (k=v)\n'],
			['args then brackets', '::name(k=v)[x]\n'],
			['text after the args', '::name(k=v) x\n'],
			['malformed args', '::name(k)\n::name(k=v\n::name(k=v,)\n::name(k="v\n'],
			['unclosed args at the end of the input', '::name(k=v'],
			['closing lines alone', ':::\n\n::\n\n::::\n'],
			['fence in a container', ':::note\n```\n:::\n```\n:::\n'],
		];
		for (const [name, input] of cases) {
			for (const size of [1, 2, 3]) {
				it(`${name} chunk size ${size}`, () => {
					const batch = parse_batch(input);
					const incr = parse_incremental(input, size);
					expect(tree_diff(batch, incr, input)).toEqual([]);
					// tree_diff leaves metadata out, and the name and args are metadata
					expect(print_ast(incr, input)).toBe(print_ast(batch, input));
				});
			}
			it(`${name} split at every offset`, () => {
				const want = print_ast(parse_batch(input), input);
				for (let i = 0; i <= input.length; i++) {
					const tree = new TreeBuilder(input.length);
					const parser = new PFMParser(tree);
					parser.init();
					parser.feed(input.slice(0, i));
					parser.feed(input.slice(i));
					parser.finish();
					expect(print_ast(tree.get_buffer(), input), `split at ${i}`).toBe(
						want
					);
				}
			});
		}
	});

	describe('task items match batch at every chunk size', () => {
		const cases: [string, string][] = [
			['tight', '- [ ] a\n- [x] b\n- [X] c\n- d\n'],
			['ordered and nested', '1. [x] a\n2. [ ] b\n   - [x] c\n3. d\n'],
			['loose', '- [ ] a\n\n- [x] b\n\n  c\n'],
			['in a block quote', '> - [x] a\n> - [ ] b\n'],
			['spaces around the marker', '-   [x] a\n- [ ]   b\n- [x]\tc\n'],
			['marker with no content', '- [ ]\n- [x] \n- [ ]  \n- a\n'],
			['near misses', '- [x]a\n- [y] b\n- [  ] c\n- [] d\n- [x\n'],
			['block starts after the marker', '- [ ] - a\n- [x] # b\n- [ ] > c\n'],
			['ends inside the marker', '- [x'],
			['ends after the marker', '- [x]'],
			['ends after the space', '- [x] '],
			['ends at the content', '- [x] a'],
		];
		for (const [name, input] of cases) {
			for (const size of [1, 2, 3]) {
				it(`${name} chunk size ${size}`, () => {
					const batch = parse_batch(input);
					const incr = parse_incremental(input, size);
					expect(tree_diff(batch, incr, input)).toEqual([]);
					// tree_diff leaves metadata out, and checked is metadata
					expect(print_ast(incr, input)).toBe(print_ast(batch, input));
				});
			}
		}
	});

	describe('a leaf in a block quote matches batch however it is fed', () => {
		fed_cases([
			['quoted line', '> ::toc[]\n> text\n'],
			['two leaves', '> ::toc[x]\n> ::toc[y]\n'],
			['two levels', '> > ::toc[]\n> > text\n'],
			['unmarked line', '> ::toc[]\ntext\n'],
			['blank quoted line', '> ::toc[]\n>\n> text\n'],
			['one marker fewer', '> > ::toc[]\n> text\n'],
			['one marker more', '> ::toc[]\n> > text\n'],
			['args', '> ::toc[x](a=1)  \n> text\n'],
			['list item', '> - ::toc[]\n>   text\n> - b\n'],
			['container', '> :::box[]\n> ::toc[]\n> text\n> :::\n> after\n'],
			['no linefeed', '> ::toc[]'],
			['ends at the marker', '> ::toc[]\n>'],
		]);
	});

	describe('a backslash at a line end matches batch however it is fed', () => {
		fed_cases([
			['blank line', 'x\\\n\ny\n'],
			['heading', 'x\\\n# h\n'],
			['thematic break', 'x\\\n---\n'],
			['code fence', 'x\\\n```\ncode\n```\n'],
			['list', 'x\\\n- a\n'],
			['next list item', '- a\\\n- b\n'],
			['blank line in a list item', '- a\\\n\n  b\n'],
			['strong emphasis over a blank line', '**x\\\n\ny**\n'],
			['quote then unmarked blank line', '> a\\\n\nb\n'],
			['quote then blank marked line', '> a\\\n>\n> b\n'],
			['quote then heading', '> a\\\n> # h\n'],
			['quote then marked text', '> a\\\n> b\n'],
			['heading line', '# h\\\ny\n'],
			['table row', '| a |\n| - |\n| b\\\n| c |\n'],
			['svelte block close', '{#if a}\nx\\\n{/if}\n'],
			['after a code span', '`a`\\\n# h\n'],
			['text', 'x\\\ny\n'],
			['two breaks', 'x\\\n\\\ny\n'],
			['block directive label', '::toc[a\\\n# b]\n'],
			['label then the container close', ':::box[x\\\n:::]\n'],
			['ends at the linefeed', 'x\\\n'],
			['ends at the backslash', 'x\\'],
			['tag paragraph over a blank line', '<br>`\\\n\na<div>`'],
			[
				'tag paragraph from the fuzz',
				'<br></i>`\\\n\n</Tabs>\\a<div> \n<Chart />[\\`\n',
			],
		]);
	});

	describe('a line that ends a quoted paragraph matches batch however it is fed', () => {
		fed_cases([
			['emphasis before a nested quote', '> *a\n> > b*\n'],
			['emphasis before a fence', '> *a\n> ```\n> b*\n'],
			['emphasis before a directive close', '> :::box\n> _a\n> :::\n> b_\n'],
			['strikethrough before a quoted list item', '> - ~~a\n> - b~~\n'],
			['a link before a nested quote', '> [a\n> > b](u)\n'],
			['a link before a directive close', '> :::box\n> [a\n> :::\n> b](u)\n'],
			['an element before a nested quote', '> x <b>a\n> > b</b>\n'],
			['an element over a marked line', '> x <b>a\n> b</b> c\n'],
			['an element over two marked lines', '> x <b>a\n> b\n> c</b>\n> d\n'],
			['an element over a line in a nested quote', '> > x <b>a\n> > b</b>\n'],
			['an element before an unmarked line', '> x <b>a\nb</b>\n'],
			[
				'an element with a hard break in a quoted list',
				'> - ::toc[]<span>`a``\\\n> </div></b>|</span>\n',
			],
			['a backslash in emphasis before a nested quote', '> *a\\\n> > b*\n'],
			['a link closed at the start of a marked line', '> [a\n> ](u)\n'],
		]);
	});

	describe('a leaf in a list item matches batch however it is fed', () => {
		fed_cases([
			['line at the marker', '- ::toc[]\ntext\n'],
			['indented line', '- ::toc[]\n  text\n- b\n'],
			['sibling items', '- ::toc[x]\n- ::toc[y]\n'],
			['heading', '- ::toc[]\n# h\n'],
			['quote', '- ::toc[]\n> q\n'],
			['thematic break', '- ::toc[]\n---\n'],
			['leaf at the marker', '- ::toc[]\n::toc[]\n'],
			['blank then indented', '- ::toc[]\n\n  text\n'],
			['blank then at the marker', '- ::toc[]\n\ntext\n'],
			['loose item', '- a\n\n  ::toc[]\nout\n'],
			['ordered with args', '1. ::toc[x](a=1)  \n   text\n2. b\n'],
			['nested list', '- a\n  - ::toc[]\n  b\n- c\n'],
			['container fence', ':::box[]\n- ::toc[]\n:::\nafter\n'],
			['no linefeed', '- ::toc[]'],
			['ends at the linefeed', '- ::toc[]\n'],
		]);
	});

	it('closes a quoted leaf at its linefeed and opens the next line in the same quote', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed('> ::toc[]');
		expect(opens_of(rec, 'directive_leaf').length).toBe(0);

		p.feed('\n');
		const leaf = opens_of(rec, 'directive_leaf')[0];
		expect(leaf).toBeDefined();
		expect(closes_for(rec, leaf.id).length).toBe(1);

		p.feed('> te');
		expect(opens_of(rec, 'block_quote').length).toBe(1);
		expect(opens_of(rec, 'paragraph').length).toBe(1);

		p.feed('xt\n');
		p.finish();
		expect(opens_of(rec, 'block_quote').length).toBe(1);
	});

	it('closes a leaf in a list item at its linefeed and ends the list at an unindented line', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();

		p.feed('- ::toc[]\n');
		const leaf = opens_of(rec, 'directive_leaf')[0];
		expect(leaf).toBeDefined();
		expect(closes_for(rec, leaf.id).length).toBe(1);
		const list = opens_of(rec, 'list')[0];
		expect(closes_for(rec, list.id).length).toBe(0);

		p.feed('te');
		expect(closes_for(rec, list.id).length).toBe(1);
		const para = opens_of(rec, 'paragraph')[0];
		expect(para).toBeDefined();
		expect(rec.ops.indexOf(para)).toBeGreaterThan(
			rec.ops.findIndex((o) => o.op === 'close' && o.id === list.id)
		);
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

describe('unwrap_images matches batch at every chunk size', () => {
	const opens_of = (rec: OpRecorder, kind: string) =>
		rec.ops.filter((o) => o.op === 'open' && (o as any).kind === kind) as any[];
	const cases: [string, string][] = [
		['one image', '![a](/a.png)\n'],
		['no final linefeed', '![a](/a.png)'],
		['images on one line', '![a](/a.png) ![b](/b.png)\n'],
		['images on two lines', '![a](/a.png)\n![b](/b.png)\n\nafter\n'],
		['image in a link', '[![a](/a.png)](/b)\n'],
		['two images in a link', '[ ![a](/a.png) ![b](/b.png) ](/c)\n'],
		['text after', '![a](/a.png) text\n'],
		['text on the next line', '![a](/a.png)\ntext\n'],
		['link with text', '[![a](/a.png) text](/b)\n'],
		['link that never closes', '[![a](/a.png)\n![b](/b.png)\n'],
		['near misses', '!a\n\n![a\n\n![a](/a.png\n\n[!a](/b)\n'],
		['ends at the bang', '!'],
		['ends inside a linked image', '[!'],
		['with a component', '![a](/a.png) <Badge />\n\n<Badge /> ![a](/a.png)\n'],
		['block quote', '> ![a](/a.png)\n> ![b](/b.png)\n\n> ![c](/c.png) text\n'],
		['tight list', '- ![a](/a.png)\n- ![b](/b.png) text\n- [x] ![c](/c.png)\n'],
		[
			'loose list',
			'- ![a](/a.png)\n\n- ![b](/b.png) text\n\n- [x] ![c](/c.png)\n\n- [![d](/d.png)](/e)\n',
		],
		['container', ':::note[]\n![a](/a.png)\n\n![b](/b.png) text\n:::\n'],
		['html block', '<div>\n\n![a](/a.png)\n\n</div>\n'],
		[
			'svelte block',
			'{#if x}\n![a](/a.png)\n{:else}\n![b](/b.png) text\n{/if}\n',
		],
		['reference', '[r]: /r.png\n\n![a][r]\n\n![r][]\n\n![a][none]\n'],
	];
	const feed = (input: string, size: number, unwrap_images: boolean) => {
		const tree = new TreeBuilder(input.length || 16);
		const parser = new PFMParser(tree, 2, { unwrap_images });
		parser.init();
		for (let i = 0; i < input.length; i += size) {
			parser.feed(input.slice(i, i + size));
		}
		parser.finish();
		return tree.get_buffer();
	};
	for (const [name, input] of cases) {
		for (const unwrap_images of [true, false]) {
			for (const size of [1, 2, 3]) {
				it(`${name}, ${unwrap_images ? 'on' : 'off'}, chunk size ${size}`, () => {
					const batch = parse_markdown_svelte(input, { unwrap_images }).nodes;
					const incr = feed(input, size, unwrap_images);
					expect(tree_diff(batch, incr, input)).toEqual([]);
					expect(print_ast(incr, input)).toBe(print_ast(batch, input));
				});
			}
		}
	}

	it('holds a paragraph back until an image can be ruled in or out', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec, 2, { unwrap_images: true });
		p.init();
		p.feed('!');
		expect(opens_of(rec, 'paragraph')).toEqual([]);
		p.feed('[');
		const para = opens_of(rec, 'paragraph')[0];
		expect(para.pending).toBe(true);
		p.feed('a](/a.png)');
		p.finish();
		expect(
			rec.ops.filter((o) => o.op === 'revoke' && (o as any).id === para.id)
		).toHaveLength(1);
	});

	it('opens a plain paragraph at once with the option off', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();
		p.feed('!');
		const para = opens_of(rec, 'paragraph')[0];
		expect(para.pending).toBe(false);
		p.feed('[a](/a.png)');
		p.finish();
		expect(rec.ops.filter((o) => o.op === 'revoke')).toEqual([]);
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

describe('a tag at the start of a line matches batch however it is fed', () => {
	fed_cases([
		['backtick in an element before a block', '<b>`</b>\n---\n'],
		['backtick in an element with a sibling', '<b>`</b> <i></i>\n---\n'],
		['space after a void element', '<img src="i.png"> '],
		['space after an element', '<div></div> \n'],
		['tab after a component', '<Chart />\t\n\ntext\n'],
		['space after an element in an element', '<div>\n<b>x</b> \n</div>\n'],
		['tag in a block quote', '> {@html x}'],
		['tag then text in a block quote', '> {@html x} a\n'],
		['expression in a block quote', '> {x}\n'],
		['escaped close tag before a block', '<b>\\</b>\n---\n'],
		['escaped close tag at the end', '<b>\\</b>'],
		['escaped close tag then text', '<b>\\</b> x\n\nb\n'],
		['escaped close tag then the real one', '<b>\\</b> x </b>\n\nb\n'],
		['escaped close tag of a block level tag', '<div>\\</div>\n\nb\n'],
		['escaped close tag after an open tag', '<b><i>\\</b>\n---\n'],
		['escaped close tag in a link', '<span>[\\</span>\n\nb\n'],
		['close tag in a script', '<b><script></b>\n---\n'],
		['close tag in a code span', '<span>[`</span>\n<div></div>`\n'],
		['close tag in a code span over a line', '<span>[`</span>\nx y`\n'],
		['close tag in an expression', '<b>{"</b>"}\n\nb\n'],
		['close tag in a comment', '<b><!-- </b> -->\n\nb\n'],
		['close tag in an attribute', '<b><i title="</b>">\n\nb\n'],
		['close tag in a link destination', '<b>[x](</b>)\n\nb\n'],
		['escaped close tag in a list item', '- <b>\\</b>\n- c\n'],
		['escaped close tag in a block quote', '> <b>\\</b>\n\nb\n'],
		['escaped close tag in an element', '<div>\n<b>\\</b>\n</div>\n'],
		['close tag with an attribute', '<b>x</b foo>\n\nb\n'],
		['self closing close tag', '<b>x</b/>\n\nb\n'],
		['close tag with a space', '<b>x</b >\n\nb\n'],
		['escaped open tag of the same name', '<b>\\<b></b> x </b>\n\nb\n'],
		['close tag of another element first', '<b></i>x</b>\n\nb\n'],
		[
			'open tag of the same name in an attribute',
			'<b><i title="<b>">x</b></b>\n',
		],
		['element of the same name closed with another', '<b><i><b></i></b>h\n'],
		['odd open tag of the same name', '<b><i><b"></i></b>h\n'],
		['element closed by a container close tag', '<div>\n<b>x</div>y</b>\n'],
		['tags closed by a container close tag', '<div>\n<Chart /> <b>x</div>\n'],
		['open tag closed by a later element', '<Chart /><b><i></b>\n\nb\n'],
		['element another close tag leaves open', '<Chart /> <b>x</i>\n\nb\n'],
		['emphasis in an element', '<Button on:click={save}>Save _now_</Button>\n'],
		['elements in an element', '<a href="https://x.y/z"><b>x</b></a>\n\nb\n'],
		['element in a script in an element', '<b><script></b></script></b>\n'],
		['open tag closed by the element', '<b><i></b>\n\nb\n'],
		['element another close tag leaves open in a quote', '> <b></i>\n\nb\n'],
		['open tag closed by a later element then text', '<Chart /><b><i></b>x\n'],
		[
			'block level tag closed by a container',
			'<section>\n<Chart /> <div>x</section>\n',
		],
		['block level tag left open', '<Chart /> <div>x\n\nb\n'],
		[
			'block level tag left open then one that closes',
			'<Chart /> <div>x <p>y</p>\n',
		],
		[
			'block level tag left open on a later line',
			'<Chart /> a\n<div>x\ny\n\nb\n',
		],
		['close tag of no element after a tag', '<Chart /></b>\n\nb\n'],
		['close tag of no element after a svelte tag', '{@html x}</b>\n\nb\n'],
		['close tag of no element after an element', '<b>y</b></n>\n\nb\n'],
		['close tag of no element in one left open', '<b>y</b><x></v>\n\nb\n'],
		['close tag of no element in an element', '<Chart /><b></i></b>\n\nb\n'],
	]);

	it('keeps the paragraph of an element whose close tag is not one', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		// as `x <b>\</b>` builds it, the literal open tag is text outside tags
		expect(printed('<b>\\</b>\n---\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<b>"',
				'    text "</b>"',
				'  line_break',
				'  thematic_break',
			].join('\n')
		);
		expect(printed('<b><i>\\</b>\n---\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<b>"',
				'    text "<i>"',
				'    text "</b>"',
				'  line_break',
				'  thematic_break',
			].join('\n')
		);
		expect(printed('<span>[\\</span>\n\nb\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<span>"',
				'    text "["',
				'    text "</span>"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<b><script></b>\n---\n')).toBe(
			['root', '  paragraph', '    text "<b>"', '    html tag="script"'].join(
				'\n'
			)
		);
		expect(printed('<span>[`</span>\nx y`\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<span>"',
				'    text "["',
				'    code_span "</span>\\nx y"',
				'  line_break',
			].join('\n')
		);
		// closes_on_line takes this for a close tag, the inline state does not
		expect(printed('<b>x</b foo>\n\nb\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<b>"',
				'    text "x"',
				'    text "</b foo>"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
		// a block level tag that is literal text is no block
		expect(printed('<div>\\</div>\n\nb\n')).toBe(
			[
				'root',
				'  paragraph',
				'    text "<div>"',
				'    text "</div>"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
	});

	it('gives an element no paragraph when a close tag of its container closes it', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		expect(printed('<div>\n<b>x</div>y</b>\n')).toBe(
			[
				'root',
				'  html tag="div"',
				'    line_break',
				'    html tag="b"',
				'      text "x"',
				'  paragraph',
				'    text "y"',
				'    text "</b>"',
				'  line_break',
			].join('\n')
		);
	});

	it('scans past an element that closes before or after the close tag found by text', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		expect(printed('<b>\\<b></b> x </b>\n\nb\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="b"',
				'      text "<b>"',
				'    text " x "',
				'    text "</b>"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<b>\\</b> x </b>\n\nb\n')).toBe(
			[
				'root',
				'  html tag="b"',
				'    text "</b> x "',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
	});

	it('keeps the paragraph of an element that never closes after other tags', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		// as `x <b>x</i>` builds it, a close tag of another name closes nothing
		expect(printed('<Chart /> <b>x</i>\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="Chart" self_closing=true',
				'    text " "',
				'    text "<b>"',
				'    text "x"',
				'    text "</i>"',
				'  line_break',
			].join('\n')
		);
		expect(printed('> <b></i>\n')).toBe(
			[
				'root',
				'  block_quote',
				'    paragraph',
				'      text "<b>"',
				'      text "</i>"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<b>y</b><x></v>\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="b"',
				'      text "y"',
				'    text "<x>"',
				'    text "</v>"',
				'  line_break',
			].join('\n')
		);
		// a block level tag that is literal text is no block
		expect(printed('<Chart /> <div>x\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="Chart" self_closing=true',
				'    text " "',
				'    text "<div>"',
				'    text "x"',
				'  line_break',
			].join('\n')
		);
	});

	it('gives tags no paragraph when one close tag closes two of them', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		// as `<b><i></b>` alone on its line
		expect(printed('<Chart /><b><i></b>\n')).toBe(
			[
				'root',
				'  html tag="Chart" self_closing=true',
				'  html tag="b"',
				'    html tag="i"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<Chart /><b><i></b>x\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="Chart" self_closing=true',
				'    html tag="b"',
				'      html tag="i"',
				'    text "x"',
				'  line_break',
			].join('\n')
		);
	});

	it('gives tags no paragraph when a close tag of their container closes one', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		expect(printed('<div>\n<Chart /> <b>x</div>\n')).toBe(
			[
				'root',
				'  html tag="div"',
				'    line_break',
				'    html tag="Chart" self_closing=true',
				'    text " "',
				'    html tag="b"',
				'      text "x"',
				'  line_break',
			].join('\n')
		);
		// with a block level tag still open there, which is then an element
		expect(printed('<section>\n<Chart /> <div>x</section>\n')).toBe(
			[
				'root',
				'  html tag="section"',
				'    line_break',
				'    html tag="Chart" self_closing=true',
				'    text " "',
				'    html tag="div"',
				'      text "x"',
				'  line_break',
			].join('\n')
		);
	});

	it('takes a close tag that closes nothing for text outside tags', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		// as `</b><Chart />` builds it
		expect(printed('<Chart /></b>\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="Chart" self_closing=true',
				'    text "</b>"',
				'  line_break',
			].join('\n')
		);
		expect(printed('{@html x}</b>\n')).toBe(
			[
				'root',
				'  paragraph',
				'    svelte_tag tag="html" "x"',
				'    text "</b>"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<b>y</b></n>\n')).toBe(
			[
				'root',
				'  paragraph',
				'    html tag="b"',
				'      text "y"',
				'    text "</n>"',
				'  line_break',
			].join('\n')
		);
		// inside an element it is text of that element
		expect(printed('<Chart /><b></i></b>\n')).toBe(
			[
				'root',
				'  html tag="Chart" self_closing=true',
				'  html tag="b"',
				'    text "</i>"',
				'  line_break',
			].join('\n')
		);
	});

	it('keeps the spaces after a tag alone on its line, as after a row of tags', () => {
		const printed = (input: string) => print_ast(parse_batch(input), input);
		expect(printed('<Chart /> \n')).toBe(
			[
				'root',
				'  html tag="Chart" self_closing=true',
				'  text " "',
				'  line_break',
			].join('\n')
		);
		expect(printed('<Chart /> <Legend /> \n')).toBe(
			[
				'root',
				'  html tag="Chart" self_closing=true',
				'  text " "',
				'  html tag="Legend" self_closing=true',
				'  text " "',
				'  line_break',
			].join('\n')
		);
	});

	it('a { in a block quote opens no paragraph until it can be a {@tag', () => {
		const rec = new OpRecorder();
		const p = new PFMParser(rec);
		p.init();
		p.feed('> {');
		p.feed('@');
		const opened = () =>
			rec.ops.filter((o) => o.op === 'open').map((o) => (o as any).kind);
		expect(opened()).toEqual(['root', 'block_quote']);
		p.feed('h');
		expect(opened()).toEqual(['root', 'block_quote', 'paragraph']);
		expect((rec.ops[rec.ops.length - 1] as any).pending).toBe(true);
	});
});

describe('a delimiter left open in a container matches batch however it is fed', () => {
	fed_cases([
		['list after an element and a delimiter', '<span>x<n>*y\n- a</span>\n'],
		['list after a stray angle bracket', '<span>><n>*>\n- a</span>\n'],
		['list in a later container', '<n><b>*>\n\n<d><span>\n- a</span>'],
		[
			'list after a comment and a tag',
			'<span>[<!-- c --><span>{@html y}*</i>\n\n- a</span> \n',
		],
		[
			'heading and list after a component',
			'<span><b x="<b>">*</i>\n\n  <Chart a={b} c="d"><span a={x}> \n# h\n- a</span>\t \n',
		],
		['paragraph after a delimiter', '<span>x *y\n\nb</span>\n'],
		['lines after a delimiter', '<span>\nsome *text\n\nmore\n</span>\n'],
		[
			'paragraph after a block level tag',
			'<div>\n<Chart /><p>*y\n\nb\n</div>\n',
		],
		['list after a paragraph that stays', '<div>\nx ~z **w\n- a</div>\n'],
		['list after a delimiter then a tag', '<div>\nx *<i>\n- a</div>\n'],
		['heading with delimiters', '<div>\n\n# ~z **w\n\ny\n</div>\n'],
		[
			'paragraph in a svelte block',
			'{#if a}\n{@html x}<div>*y ~z\n\nb\n{/if}\n',
		],
		['list in a directive', ':::note\nx ~z **w\n- a\n:::\n'],
		['container that never closes', '<b> *y\n'],
		['bracket in a container that never closes', '<a href="u">['],
	]);

	const printed = (input: string) => print_ast(parse_batch(input), input);

	it('keeps the blocks after it', () => {
		expect(printed('<span>x<n>*y\n- a</span>\n')).toBe(
			[
				'root',
				'  html tag="span"',
				'    text "x"',
				'    text "<n>"',
				'    text "*y"',
				'    line_break',
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "a"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<span>x *y\n\nb</span>\n')).toBe(
			[
				'root',
				'  html tag="span"',
				'    text "x "',
				'    text "*y"',
				'    line_break',
				'    line_break',
				'    text "b"',
				'  line_break',
			].join('\n')
		);
	});

	it('splits its text as a paragraph under the root does', () => {
		const para = [
			'paragraph',
			'  text "x "',
			'  text "~"',
			'  text "z "',
			'  text "*"',
			'  text "*w"',
		];
		const indent = (rows: string[], by: string) => rows.map((row) => by + row);
		expect(printed('x ~z **w\n')).toBe(
			['root', ...indent(para, '  '), '  line_break'].join('\n')
		);
		expect(printed('<div>\nx ~z **w\n- a</div>\n')).toBe(
			[
				'root',
				'  html tag="div"',
				'    line_break',
				...indent(para, '    '),
				'    line_break',
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "a"',
				'  line_break',
			].join('\n')
		);
		expect(printed('<div>\nx ~z **w\n</div>\n')).toBe(
			[
				'root',
				'  html tag="div"',
				'    line_break',
				...indent(para, '    '),
				'    line_break',
				'  line_break',
			].join('\n')
		);
	});
});
