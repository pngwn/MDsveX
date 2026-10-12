import { describe, expect, it } from 'vitest';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { footnote_index } from '@mdsvex/parse/buf-utils';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import {
	ComponentScope,
	CursorHTMLRenderer,
	FOOTNOTES_BLOCK,
} from '../src/html_cursor';
import type { FootnoteRender } from '../src/html_cursor';

type Walk = (r: CursorHTMLRenderer, buf: NodeBuffer, source: string) => unknown;

const WALKS: [string, Walk, boolean][] = [
	['fold', (r, buf, src) => r.update(buf, src), false],
	['cached', (r, buf, src) => r.update(buf, src), true],
	['mapped', (r, buf, src) => r.update_mapped(buf, src), false],
	['trace', (r, buf, src) => r.update_trace(buf, src), false],
	['v3', (r, buf, src) => r.update_v3(buf, src, src), false],
];

function parse(source: string): NodeBuffer {
	const tree = new TreeBuilder(128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

/** the html of every walk, which must agree, strict gives each the index a compile would */
function render_all(
	source: string,
	options: { strict?: boolean; scope?: ComponentScope } = {}
): string {
	const outs: string[] = [];
	for (const [name, walk, cache] of WALKS) {
		// the cached render ignores replacements
		if (cache && options.scope) continue;
		const buf = parse(source);
		const r = new CursorHTMLRenderer({ cache });
		if (options.scope) r.scope = options.scope;
		if (options.strict) r.footnotes = footnote_index(buf) as FootnoteRender;
		walk(r, buf, source);
		expect(r.html, name).toBe(outs[0] ?? r.html);
		outs.push(r.html);
	}
	return outs[0];
}

const BACK =
	' <a href="#fnref-1" role="doc-backlink" aria-label="Back to reference 1">\u21a9\ufe0e</a>';
const REF = '<sup><a href="#fn-a" id="fnref-1" role="doc-noteref">1</a></sup>';
const OPEN =
	'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">\n<ol>\n';
const CLOSE = '</ol>\n</section>';

describe('footnotes in every walk', () => {
	it('a render given no index numbers them itself', () => {
		expect(render_all('x[^a]\n\n[^a]: *y*\n\nz\n')).toBe(
			`<p>x${REF}</p><p>z</p>${OPEN}<li id="fn-a"><p><strong>y</strong>${BACK}</p></li>\n${CLOSE}`
		);
	});

	it('and writes what a strict index gives when the document is sound', () => {
		const source =
			'[^b]: two[^c]\n\n# h[^a]\n\n> q[^b] and [^a]\n\n[^a]: one\n[^c]: three\n';
		expect(render_all(source)).toBe(render_all(source, { strict: true }));
		expect(render_all(source)).toContain('<li id="fn-c">');
	});

	it('a reference with no definition is numbered and linked, and no section is written for it', () => {
		expect(render_all('x[^a] y[^b]\n')).toBe(
			`<p>x${REF} y<sup><a href="#fn-b" id="fnref-2" role="doc-noteref">2</a></sup></p>`
		);
	});

	it('the list says which number an item has when one before it has no definition', () => {
		expect(render_all('x[^a] y[^b]\n\n[^b]: two\n')).toContain(
			'<li id="fn-b" value="2"><p>two <a href="#fnref-2"'
		);
	});

	it('a strict index gives a reference it has no number for nothing', () => {
		expect(render_all('x[^a] y[^b]\n\n[^a]: one\n', { strict: true })).toBe(
			`<p>x${REF} y</p>${OPEN}<li id="fn-a"><p>one${BACK}</p></li>\n${CLOSE}`
		);
	});

	it('a definition whose last block is no paragraph gets its links after it', () => {
		const html = render_all('x[^a]\n\n[^a]: `y`\n', {
			scope: new ComponentScope([{ specifier: 'm', names: ['p'] }], 'G'),
		});
		expect(html).toContain(
			`<li id="fn-a"><P_MDSVEX_G><code>y</code></P_MDSVEX_G>${BACK}</li>`
		);
	});

	it('writes the section inside a template, after the content', () => {
		for (const [name, walk, cache] of WALKS) {
			if (cache) continue;
			const source = 'x[^a]\n\n[^a]: y\n';
			const r = new CursorHTMLRenderer({ cache: false });
			r.template = { specifier: 't', metadata: false };
			walk(r, parse(source), source);
			expect(r.html, name).toMatch(
				/<p>x<sup>.*<\/sup><\/p><section class="footnotes"[^]*<\/section><\/Template_MDSVEX>$/
			);
		}
	});
});

describe('footnotes in the cached render', () => {
	/** the html after each char over the wire, the cached renderer must draw what a fresh one does */
	function steps(source: string): { last: string; cached: CursorHTMLRenderer } {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const builder = new WireTreeBuilder(128);
		const cached = new CursorHTMLRenderer();
		parser.init();
		for (let i = 0; i < source.length; i++) {
			const fed = source.slice(0, i + 1);
			emitter.set_source(fed);
			parser.feed(source[i]);
			builder.apply(emitter.flush());
			const fresh = new CursorHTMLRenderer({ cache: false });
			fresh.update(builder.get_buffer(), '');
			cached.update(builder.get_buffer(), '');
			expect(cached.html, `cached at ${JSON.stringify(fed)}`).toBe(fresh.html);
		}
		emitter.set_source(source);
		parser.finish();
		builder.apply(emitter.flush());
		cached.update(builder.get_buffer(), '');
		return { last: cached.html, cached };
	}

	it('a definition that arrives after its reference fills the section', () => {
		const { last, cached } = steps('x[^a] y\n\nmore\n\n[^a]: note\n\nend\n');
		expect(last).toBe(
			`<p>x${REF} y</p><p>more</p><p>end</p>${OPEN}<li id="fn-a"><p>note${BACK}</p></li>\n${CLOSE}`
		);
		const blocks = cached.blocks;
		expect(blocks[blocks.length - 1].idx).toBe(FOOTNOTES_BLOCK);
		// the definition keeps its place among the blocks, with nothing in it
		expect(blocks.map((b) => b.html === '')).toEqual([
			false,
			false,
			true,
			false,
			false,
		]);
	});

	it('a later reference to a new label takes the next number', () => {
		const { last } = steps('[^b]: two\n\nx[^a]\n\ny[^b]\n\n[^a]: one\n');
		expect(last).toContain('<li id="fn-a"><p>one');
		expect(last.indexOf('fn-a"><p>one')).toBeLessThan(
			last.indexOf('fn-b"><p>two')
		);
	});

	it('reset forgets the footnotes of the last document', () => {
		const r = new CursorHTMLRenderer();
		const a = 'x[^a]\n\n[^a]: y\n';
		r.update(parse(a), a);
		expect(r.html).toContain('footnotes');
		r.reset();
		r.update(parse('plain\n'), 'plain\n');
		expect(r.html).toBe('<p>plain</p>');
		expect(r.blocks).toHaveLength(1);
	});
});
