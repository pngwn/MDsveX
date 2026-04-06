import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor';

// ── Helpers ──────────────────────────────────────────────────

/** Server path: PFMParser -> TreeBuilder -> CursorHTMLRenderer */
function via_tree(source: string): string {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return renderer.html;
}

/** Client path: PFMParser -> WireEmitter -> WireTreeBuilder -> CursorHTMLRenderer */
function via_wire(source: string): string {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();

	const builder = new WireTreeBuilder();
	builder.apply(batch);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(builder.get_buffer(), '');
	return renderer.html;
}

/** Incremental wire path: byte-by-byte feeding like the viewer */
function via_wire_incremental(source: string): string {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();

	const batches: unknown[][][] = [];
	let accumulated = '';
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		accumulated += ch;
		emitter.set_source(accumulated);
		parser.feed(ch);
		batches.push(emitter.flush());
	}
	emitter.set_source(accumulated);
	parser.finish();
	batches.push(emitter.flush());

	const builder = new WireTreeBuilder();
	for (const batch of batches) {
		if (batch.length > 0) builder.apply(batch);
	}
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(builder.get_buffer(), '');
	return renderer.html;
}

function assert_same(source: string): void {
	const from_tree = via_tree(source);
	const from_wire = via_wire(source);
	expect(from_wire).toBe(from_tree);
}

function assert_same_incremental(source: string): void {
	const from_tree = via_tree(source);
	const from_wire = via_wire_incremental(source);
	expect(from_wire).toBe(from_tree);
}

// ── Tests ────────────────────────────────────────────────────

describe('WireTreeBuilder produces same HTML as TreeBuilder', () => {
	it('simple paragraph', () => assert_same('hello world\n'));
	it('multiple paragraphs', () => assert_same('first\n\nsecond\n'));

	it('heading', () => assert_same('# Hello\n'));
	it('h2', () => assert_same('## Title\n'));

	it('emphasis', () => assert_same('_hello_\n'));
	it('strong', () => assert_same('*bold*\n'));
	it('nested emphasis', () => assert_same('_em *strong* em_\n'));

	it('code span', () => assert_same('use `code` here\n'));
	it('code fence with info', () => assert_same('```js\nconst x = 1;\n```\n'));
	it('code fence no info', () => assert_same('```\nhello\n```\n'));

	it('block quote', () => assert_same('> quoted\n'));

	it('link', () => assert_same('[click](https://example.com)\n'));
	it('link with title', () => assert_same('[text](url "title")\n'));
	it('image', () => assert_same('![alt text](image.png)\n'));

	it('unordered list', () => assert_same('- one\n- two\n'));
	it('ordered list', () => assert_same('1. one\n2. two\n'));

	it('thematic break', () => assert_same('---\n'));
	it('strikethrough', () => assert_same('~~deleted~~\n'));
	it('superscript', () => assert_same('^super^\n'));

	it('table', () =>
		assert_same('| foo | bar |\n| --- | --- |\n| baz | bim |\n'));
	it('table alignment', () =>
		assert_same(
			'| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n'
		));

	it('html self-closing', () => assert_same('text <br /> more\n'));
	it('html paired', () => assert_same('text <span>inside</span> end\n'));
	it('html block', () =>
		assert_same('<section>\n\n# Heading\n\nParagraph.\n\n</section>\n'));
	it('html comment', () => assert_same('text <!-- hidden --> more\n'));

	it('code span with leading space preserved', () => assert_same('` a`\n'));
	it('code span with both spaces stripped', () =>
		assert_same('`` foo ` bar ``\n'));

	it('revoked emphasis', () => assert_same('_not closed\n'));

	it('code span leading space preserved (incremental)', () =>
		assert_same_incremental('` a`\n'));
	it('code span both spaces stripped (incremental)', () =>
		assert_same_incremental('`` foo ` bar ``\n'));

	it('complex document', () =>
		assert_same(
			'# Title\n\n' +
				'A paragraph with _emphasis_ and *bold*.\n\n' +
				'> A block quote with `code`\n\n' +
				'```js\nconst x = 1;\n```\n\n' +
				'- item one\n- item two\n\n' +
				'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
				'[link](url) and ![img](src)\n\n' +
				'---\n'
		));
});
