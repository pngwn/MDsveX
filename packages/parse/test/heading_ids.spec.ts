import { describe, expect, test } from 'vitest';

import { HeadingIdError, HeadingIds, heading_slug } from '../src/heading_ids';
import type { HeadingSlug } from '../src/heading_ids';
import { PFMParser, WireEmitter } from '../src/main';
import type { ParsePlugin } from '../src/plugin_types';
import type { NodeBuffer } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { CONTAINERS, Grammar, contained, edited, rows_of } from './grammar';
import { assign_heading_ids } from './heading_ids_oracle';
import { PATHS, run_batch } from './plugin_harness';

const NAMED = new Set(['amp', 'copy', 'mdash', 'nbsp', 'lt']);
const named = (name: string) => NAMED.has(name);

/** the id of every node that has one, in buffer order, which is document order here */
function ids_in(nodes: NodeBuffer): string[] {
	const out: string[] = [];
	for (let i = 0; i < nodes.size; i++) {
		const id = nodes.metadata_at(i)?.id;
		if (typeof id === 'string') out.push(id);
	}
	return out;
}

/** the ids of every path, which must all be the same */
function ids(
	source: string,
	plugins: () => ParsePlugin[] = () => [],
	slug: HeadingSlug = heading_slug
): string[] {
	let first: string[] | undefined;
	for (const [name, run] of PATHS) {
		const out = run(source, {
			plugins: plugins(),
			headings: new HeadingIds(slug, named),
		});
		const got = ids_in(out.nodes);
		if (first === undefined) first = got;
		else expect(got, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first!;
}

/** the error every path throws */
function error_of(source: string, plugins: () => ParsePlugin[] = () => []) {
	const errors: HeadingIdError[] = [];
	for (const [name, run] of PATHS) {
		try {
			run(source, {
				plugins: plugins(),
				headings: new HeadingIds(heading_slug, named),
			});
		} catch (e) {
			expect(e, name).toBeInstanceOf(HeadingIdError);
			errors.push(e as HeadingIdError);
			continue;
		}
		throw new Error(`${name} threw nothing`);
	}
	return errors;
}

describe('heading ids at the close of the heading', () => {
	test('are made from the text a reader sees', () => {
		expect(ids('## Hello *bold* _em_ ~~gone~~ world')).toEqual([
			'hello-bold-em-gone-world',
		]);
		expect(ids('## The `heading_ids` option')).toEqual([
			'the-heading_ids-option',
		]);
		expect(ids('## See [the *docs*](/docs "t") ![a *cat*](/c.png)')).toEqual([
			'see-the-docs-a-cat',
		]);
		expect(ids('## Version {version} <Badge>new</Badge> <kbd>K</kbd>')).toEqual(
			['version---k']
		);
		expect(ids('## caf&#233; Q&amp;A &copy; AT&T; &nope;')).toEqual([
			'café-qa--att-nope',
		]);
		expect(ids('## a <!-- c --> b')).toEqual(['a--b']);
	});

	test('a repeat is numbered from the ids before it', () => {
		expect(
			ids('## Dup\n\n## Dup\n\n## dup 1\n\n## Dup\n\n## DUP\n\n## Dup 1')
		).toEqual(['dup', 'dup-1', 'dup-1-1', 'dup-2', 'dup-3', 'dup-1-2']);
	});

	test('a heading that slugs to nothing has none and takes no number', () => {
		expect(ids('## ???\n\n##\n\n## {title}\n\n## Real\n\n## Real')).toEqual([
			'real',
			'real-1',
		]);
	});

	test('headings inside other blocks', () => {
		const source = [
			'> ## Quote',
			'',
			'- ## Item',
			'',
			'<section>',
			'',
			'## Section',
			'',
			'</section>',
			'',
			'{#if show}',
			'',
			'## Shown',
			'',
			'{/if}',
			'',
			':::note',
			'',
			'## Note',
			'',
			':::',
		].join('\n');
		expect(ids(source)).toEqual(['quote', 'item', 'section', 'shown', 'note']);
	});

	test('an element heading before takes its id, a later made id moves aside', () => {
		// an element keeps its id in its attributes
		expect(ids('<h2 id="later">typed</h2>\n\n## Later\n\n## Later')).toEqual([
			'later-1',
			'later-2',
		]);
		expect(
			ids('<h2 id={x}>typed</h2>\n\n<div id="box"></div>\n\n## Box')
		).toEqual(['box']);
	});

	test('an id a plugin set at open is kept and taken', () => {
		const fixed = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						if (node.depth === 1) node.attrs.id = 'intro';
					},
				},
			},
		];
		expect(ids('# Top\n\n## Intro\n\n## Intro', fixed)).toEqual([
			'intro',
			'intro-1',
			'intro-2',
		]);
	});

	test('the slug gets the text and the depth', () => {
		const slug: HeadingSlug = (text, { depth }) =>
			text === 'none' ? '' : `h${depth}-${heading_slug(text)}`;
		expect(
			ids('# Same\n\n## Same\n\n## Same\n\n### none', undefined, slug)
		).toEqual(['h1-same', 'h2-same', 'h2-same-1']);
	});

	test('a slug that is no string is a HeadingIdError', () => {
		const ids = new HeadingIds((() => 1) as any, named);
		for (const [name, run] of PATHS) {
			ids.start();
			expect(() => run('# A', { headings: ids }), name).toThrow(
				'[mdsvex] heading_ids.slug must return a string, it returned 1'
			);
		}
	});
});

describe('an id the document fixes', () => {
	test('a node before it was given is a HeadingIdError, made or fixed', () => {
		const errors = error_of('## Later\n\ntext\n\n<h2 id="later">typed</h2>\n');
		expect(errors[0].code).toBe('id_taken');
		expect(errors[0].id).toBe('later');
		expect(errors[0].message).toBe(
			'[mdsvex] the id "later" of the element <h2> at 5:1 was given to the heading at 1:1 before it, give one of them another id'
		);
		// the wire has no positions
		expect(errors[4].message).toBe(
			'[mdsvex] the id "later" of the element <h2> was given to the heading before it, give one of them another id'
		);
		expect(
			error_of('<h2 id="a">x</h2>\n\n<h3 id="a">y</h3>\n')[0].message
		).toBe(
			'[mdsvex] the id "a" of the element <h3> at 3:1 was given to the element <h2> at 1:1 before it, give one of them another id'
		);
	});

	test('set on a heading by a plugin, a node before it was given is a HeadingIdError', () => {
		const fixed = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						return () => {
							if (node.text_content === 'Fixed') node.attrs.id = 'intro';
						};
					},
				},
			},
		];
		const errors = error_of('## Intro\n\n## Fixed\n', fixed);
		expect(errors[0].message).toBe(
			'[mdsvex] the id "intro" of the heading at 3:1 was given to the heading at 1:1 before it, give one of them another id'
		);
	});
});

describe('footnote ids', () => {
	/** the moved footnote ids of every path, which must all be the same */
	function moved_of(source: string): [string, string][] {
		let first: [string, string][] | undefined;
		for (const [name, run] of PATHS) {
			const headings = new HeadingIds(heading_slug, named);
			run(source, { headings });
			const moved = [...(headings.moved ?? [])];
			if (first === undefined) first = moved;
			else expect(moved, name).toEqual(first);
		}
		return first!;
	}

	test('a footnote whose id a heading was given moves to the next free one', () => {
		const source = '# fn 1\n\n## fnref 1\n\n## fn 1 1\n\nx[^1]\n\n[^1]: y\n';
		expect(ids(source)).toEqual(['fn-1', 'fnref-1', 'fn-1-1']);
		expect(moved_of(source)).toEqual([
			['fn-1', 'fn-1-2'],
			['fnref-1', 'fnref-1-1'],
		]);
	});

	test('keep their own ids otherwise', () => {
		expect(ids('# fn 2\n\nx[^1]\n\n[^1]: y\n')).toEqual(['fn-2']);
		expect(moved_of('# fn 2\n\nx[^1] y[^1]\n\n[^1]: y\n')).toEqual([]);
		expect(moved_of('x[^1]\n')).toEqual([]);
	});
});

describe('heading ids and plugins', () => {
	test('a close callback that reads the id gets it, an open handler does not', () => {
		const log: string[] = [];
		const reader = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						log.push(`open ${node.attrs.id}`);
						return () => log.push(`close ${node.attrs.id}`);
					},
				},
			},
		];
		expect(ids('# One\n\n# One', reader)).toEqual(['one', 'one-1']);
		expect(log.slice(0, 4)).toEqual([
			'open undefined',
			'close one',
			'open undefined',
			'close one-1',
		]);
	});

	test('a plugin that changes the text counts when it runs before the first that reads the id', () => {
		const drop: ParsePlugin = {
			heading: {
				parse(node) {
					return () => node.first_child!.remove();
				},
			},
		};
		const read = (seen: string[]): ParsePlugin => ({
			heading: {
				parse(node) {
					return () => seen.push(node.attrs.id);
				},
			},
		});
		// alone, the id is made after every callback
		expect(ids('## *a* b', () => [drop])).toEqual(['b']);
		const before: string[] = [];
		expect(ids('## *a* b', () => [drop, read(before)])).toEqual(['b']);
		expect(before[0]).toBe('b');
		const after: string[] = [];
		expect(ids('## *a* b', () => [read(after), drop])).toEqual(['a-b']);
		expect(after[0]).toBe('a-b');
	});

	test('an id set in a close callback before any read is kept', () => {
		const set = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						return () => {
							if (node.text_content === 'Two') node.attrs.id = 'second';
						};
					},
				},
			},
			{
				heading: {
					parse(node) {
						return () => node.attrs.class;
					},
				},
			},
		];
		expect(ids('# One\n\n# Two\n\n# Second', set)).toEqual([
			'one',
			'second',
			'second-1',
		]);
	});

	test('an id set after a read takes the place of the one made', () => {
		const log: string[] = [];
		const replace = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						return () => {
							log.push(node.attrs.id);
							if (node.depth === 1 && node.text_content === 'Two')
								node.attrs.id = 'second';
						};
					},
				},
			},
		];
		// the second heading gets two, as if the first had never had it
		expect(ids('# Two\n\n## Two\n\n# One', replace)).toEqual([
			'second',
			'two',
			'one',
		]);
		expect(log.slice(0, 3)).toEqual(['two', 'two', 'one']);
	});

	test('a heading a plugin made something else gets none', () => {
		const label = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						if (node.depth === 2) node.type = 'paragraph';
					},
				},
			},
		];
		expect(ids('# One\n\n## Two', label)).toEqual(['one']);
	});

	test('text a plugin added is not part of the id', () => {
		const prefix = (): ParsePlugin[] => [
			{
				heading: {
					parse(node) {
						node.prepend('text', 'Step 1: ');
					},
				},
			},
		];
		expect(ids('## Title', prefix)).toEqual(['title']);
	});
});

describe('a heading is settled at its close', () => {
	const literal: HeadingSlug = (text) => text;

	test('what never closed in it is text before it closes', () => {
		expect(ids('## The <head> element', undefined, literal)).toEqual([
			'The <head> element',
		]);
		expect(ids('## a *b <i>c', undefined, literal)).toEqual(['a *b <i>c']);
		expect(ids('## a [b](c', undefined, literal)).toEqual(['a [b](c']);
		// a container sweeps its elements only when it closes
		expect(
			ids(':::note\n\n## a <c> d\n\n## a c d\n\n:::\n', undefined, literal)
		).toEqual(['a <c> d', 'a c d']);
		expect(ids('> ## a <c>\n- ## b <d>\n')).toEqual(['a-c', 'b-d']);
	});

	test('a close callback reads that text', () => {
		const texts: string[] = [];
		ids('## The <head> *element\n\ntext', () => [
			{
				heading: {
					parse(node) {
						return () => texts.push(node.text_content);
					},
				},
			},
		]);
		expect(new Set(texts)).toEqual(new Set(['The <head> *element']));
	});
});

describe('a document that streams', () => {
	test('a heading has its id as soon as its line arrives', () => {
		const source = '# One\n\nsome text\n\n## Two\n\nmore\n';
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const builder = new WireTreeBuilder();
		builder.set_headings(new HeadingIds(heading_slug, named));
		parser.init();
		const seen: string[][] = [];
		for (let i = 0; i < source.length; i++) {
			emitter.set_source(source.slice(0, i + 1));
			parser.feed(source[i]);
			builder.apply(emitter.flush());
			seen.push(ids_in(builder.get_buffer()));
		}
		parser.finish();
		builder.apply(emitter.flush());
		builder.end();
		// the line of a heading ends with its linefeed
		expect(seen[source.indexOf('\n') - 1]).toEqual([]);
		expect(seen[source.indexOf('\n')]).toEqual(['one']);
		expect(seen[source.indexOf('## Two') + 6]).toEqual(['one', 'two']);
		expect(ids_in(builder.get_buffer())).toEqual(['one', 'two']);
	});
});

describe('generated documents', () => {
	/** every path makes the ids the pass after the parse made, or throws on each */
	function check(source: string, found: string[]): number {
		const { nodes } = run_batch(source);
		assign_heading_ids(nodes, source, heading_slug, named);
		const want = ids_in(nodes);
		let got: string[] | undefined;
		let thrown = 0;
		for (const [name, run] of PATHS) {
			try {
				const out = run(source, {
					headings: new HeadingIds(heading_slug, named),
				});
				const these = ids_in(out.nodes);
				if (got === undefined) got = these;
				else if (JSON.stringify(these) !== JSON.stringify(got))
					found.push(`${name} differs\n${source}`);
			} catch (e) {
				if (!(e instanceof HeadingIdError)) throw e;
				thrown++;
			}
		}
		if (thrown !== 0 && thrown !== PATHS.length)
			found.push(`${thrown} paths threw\n${source}`);
		else if (got !== undefined && JSON.stringify(got) !== JSON.stringify(want))
			found.push(
				`${JSON.stringify(got)} against ${JSON.stringify(want)}\n${source}`
			);
		return want.length;
	}

	// PFM_ID_SEEDS=n runs n seeds
	const seeds = Number(process.env.PFM_ID_SEEDS ?? 100);

	test(
		'get the ids of the pass after the parse, whole, fed and over the wire',
		{ timeout: seeds > 100 ? 0 : 20_000 },
		() => {
			const found: string[] = [];
			let headings = 0;
			for (let seed = 0; seed < seeds; seed++) {
				const grammar = new Grammar(seed);
				const rows = rows_of(grammar.file());
				const whole = rows.join('\n') + grammar.ending();
				// a few words in place of every word, so headings repeat
				const repeated = whole.replace(
					/q\d{3}/g,
					(w) => `w${Number(w.slice(1)) % 3}`
				);
				const sources = [whole, repeated, edited(whole, seed)];
				for (const container of CONTAINERS)
					sources.push(contained(container, rows).join('\n'));
				for (const source of sources) {
					headings += check(source, found);
				}
			}
			expect(found).toEqual([]);
			expect(headings).toBeGreaterThan(200);
		}
	);
});
