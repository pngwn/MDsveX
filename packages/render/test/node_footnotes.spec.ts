import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { Component } from 'svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { ComponentRenderer, FOOTNOTES_BLOCK } from '../src/component';
import type { ComponentBlock } from '../src/component';
import { CursorHTMLRenderer } from '../src/html_cursor';

const HERE = dirname(fileURLToPath(import.meta.url));
// inside the package so the compiled module finds its svelte and parse
const DIR = join(HERE, '.node-footnotes');

let Node: Component<any>;

beforeAll(async () => {
	mkdirSync(DIR, { recursive: true });
	const js = compile(readFileSync(join(HERE, '../src/Node.svelte'), 'utf8'), {
		generate: 'server',
		filename: 'Node.svelte',
	}).js.code.replace("'./Node.svelte'", "'./Node.js'");
	writeFileSync(join(DIR, 'Node.js'), js);
	Node = (await import(pathToFileURL(join(DIR, 'Node.js')).href)).default;
});
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

class Stream {
	tree = new TreeBuilder(128);
	parser = new PFMParser(this.tree);
	renderer = new ComponentRenderer();
	source = '';
	blocks: ComponentBlock[] = [];

	constructor() {
		this.parser.init();
	}

	feed(part: string): this {
		this.source += part;
		this.parser.feed(part);
		this.blocks = this.renderer.update(this.tree.get_buffer(), this.source);
		return this;
	}

	finish(): this {
		this.parser.finish();
		this.blocks = this.renderer.update(this.tree.get_buffer(), this.source);
		return this;
	}

	raw(numbered = true): string[] {
		return this.blocks.map(
			(block) =>
				render(Node, {
					props: {
						buf: this.tree.get_buffer(),
						idx: block.idx,
						source: this.source,
						footnotes: numbered ? this.renderer.footnotes : undefined,
					},
				}).body
		);
	}

	get html(): string {
		return tidy(this.raw().join(''));
	}

	get section(): ComponentBlock | undefined {
		return this.blocks.find((block) => block.idx === FOOTNOTES_BLOCK);
	}
}

/** html with no comments and no space between blocks */
function tidy(html: string): string {
	return html
		.replace(/<!--[^]*?-->/g, '')
		.replace(/>\s+</g, (space) => (space.includes('\n') ? '><' : space))
		.replace(/\s+<\/li>/g, '</li>')
		.replace(/(<\/(?:p|ul)>) +(?= <a)/g, '$1');
}

function whole(source: string): Stream {
	return new Stream().feed(source).finish();
}

function compiled(source: string): string {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	parser.feed(source);
	parser.finish();
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return tidy(renderer.html);
}

const ARROW = String.fromCharCode(0x21a9, 0xfe0e);
const back = (ref: string, name: string, nth = '') =>
	` <a href="#${ref}" role="doc-backlink" aria-label="Back to reference ${name}">${ARROW}${nth}</a>`;

describe('footnotes in a stream', () => {
	test('a reference before its definition is numbered and linked at once, the note comes when it is written', () => {
		const stream = new Stream().feed('one[^a] two\n\n');
		expect(stream.html).toBe(
			'<p>one<sup><a href="#fn-a" id="fnref-1" role="doc-noteref">1</a></sup> two</p>'
		);
		expect(stream.section).toBeUndefined();

		stream.feed('[^a]: the note\n\n').finish();
		expect(stream.html).toBe(
			'<p>one<sup><a href="#fn-a" id="fnref-1" role="doc-noteref">1</a></sup> two</p>' +
				'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes"><ol>' +
				`<li id="fn-a"><p>the note${back('fnref-1', '1')}</p></li>` +
				'</ol></section>'
		);
	});

	test('a definition before its reference is not drawn until the reference arrives', () => {
		const stream = new Stream().feed('[^a]: the note\n\nbefore\n\n');
		expect(stream.html).toBe('<p>before</p>');
		expect(stream.section).toBeUndefined();

		stream.feed('one[^a]\n').finish();
		expect(stream.html).toBe(
			'<p>before</p>' +
				'<p>one<sup><a href="#fn-a" id="fnref-1" role="doc-noteref">1</a></sup></p>' +
				'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes"><ol>' +
				`<li id="fn-a"><p>the note${back('fnref-1', '1')}</p></li>` +
				'</ol></section>'
		);
		expect(stream.blocks.at(-1)!.idx).toBe(FOOTNOTES_BLOCK);
	});

	test('a repeated reference keeps its number, gets its own id and a link back of its own', () => {
		const stream = whole(
			'one[^a] two[^b] three[^a]\n\n[^a]: first\n\n[^b]: second\n'
		);
		expect(stream.html).toBe(
			'<p>one<sup><a href="#fn-a" id="fnref-1" role="doc-noteref">1</a></sup>' +
				' two<sup><a href="#fn-b" id="fnref-2" role="doc-noteref">2</a></sup>' +
				' three<sup><a href="#fn-a" id="fnref-1-2" role="doc-noteref">1</a></sup></p>' +
				'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes"><ol>' +
				`<li id="fn-a"><p>first${back('fnref-1', '1')}${back('fnref-1-2', '1-2', '<sup>2</sup>')}</p></li>` +
				`<li id="fn-b"><p>second${back('fnref-2', '2')}</p></li>` +
				'</ol></section>'
		);
	});

	test('a definition no reference reaches is not drawn, in place or in a section', () => {
		const stream = whole('text\n\n[^a]: unused\n');
		expect(stream.html).toBe('<p>text</p>');
		expect(stream.section).toBeUndefined();
	});

	test('a document with none has no numbers and no section, and is drawn as without the prop', () => {
		const stream = whole(
			'# a\n\ntext *em* `code`\n\n- one\n- two\n\n```js\nlet a;\n```\n\n<div>x</div>\n'
		);
		expect(stream.renderer.footnotes).toBeNull();
		expect(stream.section).toBeUndefined();
		expect(stream.raw()).toEqual(stream.raw(false));
	});

	test('a reference with no definition takes a number, which the list then skips', () => {
		const stream = whole('one[^x] two[^a]\n\n[^a]: note\n');
		expect(stream.html).toBe(
			'<p>one<sup><a href="#fn-x" id="fnref-1" role="doc-noteref">1</a></sup>' +
				' two<sup><a href="#fn-a" id="fnref-2" role="doc-noteref">2</a></sup></p>' +
				'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes"><ol>' +
				`<li id="fn-a" value="2"><p>note${back('fnref-2', '2')}</p></li>` +
				'</ol></section>'
		);
	});

	test('the links back follow the last block of a note that is no paragraph', () => {
		const stream = whole('one[^a]\n\n[^a]: note\n\n    - item\n');
		expect(stream.html).toContain(
			`<li id="fn-a"><p>note</p><ul><li>item</li></ul>${back('fnref-1', '1')}</li>`
		);
	});

	test.each([
		'one[^a] two[^b] three[^a]\n\n[^a]: first\n\n[^b]: second\n',
		'[^b]: second with *em*\n\none[^a] two[^b]\n\n[^a]: first\n\n    more\n\n    - item\n\nafter\n',
		'one[^x] two[^a]\n\n[^a]: note[^c]\n\n[^c]: reached from a note\n\n[^d]: unused\n',
	])('the markup is what a compiled page holds: %j', (source) => {
		expect(whole(source).html).toBe(compiled(source));
	});

	test('the label of a reference goes into its href encoded', () => {
		const source = 'one[^a%b]\n\n[^a%b]: note\n';
		const html = whole(source).html;
		expect(html).toContain(
			'<a href="#fn-a%25b" id="fnref-1" role="doc-noteref">1</a>'
		);
		expect(html).toContain('<li id="fn-a%b">');
		expect(html).toBe(compiled(source));
	});
});

describe('the blocks of a ComponentRenderer with footnotes', () => {
	test('the section stays the last block as blocks arrive, and keeps its version while no note changes', () => {
		const stream = new Stream().feed('one[^a]\n\n[^a]: note\n\nnext\n\n');
		const section = stream.section!;
		expect(section).toBeDefined();
		expect(stream.blocks.at(-1)).toBe(section);

		stream.feed('more text\n\n');
		expect(stream.blocks.at(-1)!.idx).toBe(FOOTNOTES_BLOCK);
		expect(stream.section!.v).toBe(section.v);
		expect(stream.blocks.filter((b) => b.idx === FOOTNOTES_BLOCK)).toHaveLength(
			1
		);
	});

	test('the section is drawn again while a note is written and when a reference is added', () => {
		const stream = new Stream().feed('one[^a]\n\n[^a]: note\n');
		const first = stream.section!.v;
		stream.feed('\n    goes on\n');
		const second = stream.section!.v;
		expect(second).toBeGreaterThan(first);
		expect(stream.html).toContain('<p>goes on <a');

		stream.feed('\n\nclosed\n\n');
		const third = stream.section!.v;
		stream.feed('again[^a]\n\n');
		expect(stream.section!.v).toBeGreaterThan(third);
		expect(stream.html).toContain('fnref-1-2');
	});

	test('a closed block is not drawn again for a number, the footnotes are a new object instead', () => {
		const stream = new Stream().feed('one[^a]\n\nnext\n\n');
		const block = stream.blocks[0];
		const before = stream.renderer.footnotes;
		stream.feed('[^a]: note\n\n');
		expect(stream.blocks[0].v).toBe(block.v);
		expect(stream.renderer.footnotes).not.toBe(before);
	});

	test('a reference inside a note is renumbered when the body refers to another first', () => {
		const stream = new Stream().feed(
			'one[^a]\n\n[^a]: see[^b]\n\n[^b]: inner\n\n'
		);
		expect(stream.html).toContain(
			'<a href="#fn-b" id="fnref-2" role="doc-noteref">2</a>'
		);
		stream.feed('two[^c]\n\n[^c]: last\n').finish();
		expect(stream.html).toContain(
			'<a href="#fn-c" id="fnref-2" role="doc-noteref">2</a>'
		);
		expect(stream.html).toContain(
			'<a href="#fn-b" id="fnref-3" role="doc-noteref">3</a>'
		);
		expect(stream.html).toBe(compiled(stream.source));
	});

	test('reset forgets the footnotes', () => {
		const stream = whole('one[^a]\n\n[^a]: note\n');
		stream.renderer.reset();
		expect(stream.renderer.footnotes).toBeNull();
		expect(stream.renderer.blocks).toEqual([]);
	});
});

describe('Node.svelte without the footnotes prop', () => {
	test('a reference is its label and a definition is drawn where it was written', () => {
		const stream = whole('one[^a]\n\n[^a]: note\n');
		expect(tidy(stream.raw(false).join(''))).toBe(
			'<p>one<sup class="footnote-reference">a</sup></p>' +
				'<div class="footnote"><sup class="footnote-reference">a</sup> <p>note</p></div>'
		);
	});
});
