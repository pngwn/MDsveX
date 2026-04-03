import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, PFMDocument } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { PFMCursor } from '@mdsvex/parse/cursor';
import { renderNode } from '../src/html';
import { renderCursor } from '../src/html_cursor';

// ── Helpers ──────────────────────────────────────────────────

/** Render via PFMNode path (wire → doc → renderNode). */
function render_node(source: string): string {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();
	const doc = new PFMDocument();
	doc.apply(batch);
	return renderNode(doc.root!);
}

/** Render via cursor path (TreeBuilder → cursor → renderCursor). */
function render_cursor(source: string): string {
	const tree = new TreeBuilder((source.length >> 3) || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const cursor = new PFMCursor(tree.get_buffer(), source);
	return renderCursor(cursor);
}

/** Assert both paths produce identical HTML. */
function assert_same(source: string): void {
	const from_node = render_node(source);
	const from_cursor = render_cursor(source);
	expect(from_cursor).toBe(from_node);
}

// ── Tests ────────────────────────────────────────────────────

describe('cursor renderer matches node renderer', () => {
	it('simple paragraph', () => assert_same('hello world\n'));
	it('multi-line paragraph', () => assert_same('line one\nline two\n'));
	it('multiple paragraphs', () => assert_same('first\n\nsecond\n'));

	it('h1', () => assert_same('# Hello\n'));
	it('h2', () => assert_same('## Title\n'));
	it('h3-h6', () => {
		assert_same('### H3\n');
		assert_same('#### H4\n');
		assert_same('##### H5\n');
		assert_same('###### H6\n');
	});

	it('emphasis', () => assert_same('_hello_\n'));
	it('strong', () => assert_same('*bold*\n'));
	it('mixed emphasis', () => assert_same('before _middle_ after\n'));
	it('nested emphasis', () => assert_same('_em *strong* em_\n'));

	it('code span', () => assert_same('use `code` here\n'));
	it('code fence', () => assert_same('```js\nconst x = 1;\n```\n'));
	it('code fence no info', () => assert_same('```\nhello\n```\n'));

	it('block quote', () => assert_same('> quoted\n'));
	it('link', () => assert_same('[click](https://example.com)\n'));
	it('link with title', () => assert_same('[text](url "title")\n'));
	it('image', () => assert_same('![alt text](image.png)\n'));

	it('unordered list', () => {
		// TreeBuilder does tight-list paragraph unwrapping (correct CommonMark behavior)
		const html = render_cursor('- one\n- two\n');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>one</li>');
		expect(html).toContain('<li>two</li>');
		expect(html).not.toContain('<p>');
	});
	it('ordered list', () => {
		const html = render_cursor('1. one\n2. two\n');
		expect(html).toContain('<ol>');
		expect(html).toContain('<li>one</li>');
		expect(html).toContain('<li>two</li>');
		expect(html).not.toContain('<p>');
	});

	it('thematic break', () => assert_same('---\n'));
	it('strikethrough', () => assert_same('~~deleted~~\n'));
	it('superscript', () => assert_same('^super^\n'));

	it('table', () => assert_same('| foo | bar |\n| --- | --- |\n| baz | bim |\n'));
	it('table with alignment', () =>
		assert_same('| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n'));

	it('html self-closing', () => assert_same('text <br /> more\n'));
	it('html paired', () => assert_same('text <span>inside</span> end\n'));
	it('html block', () => assert_same('<section>\n\n# Heading\n\nParagraph.\n\n</section>\n'));
	it('html comment', () => assert_same('text <!-- hidden --> more\n'));

	it('complex document', () => {
		const source =
			'# Title\n\n' +
			'A paragraph with _emphasis_ and *bold*.\n\n' +
			'> A block quote with `code`\n\n' +
			'```js\nconst x = 1;\n```\n\n' +
			'- item one\n- item two\n\n' +
			'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
			'[link](url) and ![img](src)\n\n' +
			'---\n';
		const html = render_cursor(source);
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<em>emphasis</em>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<code>code</code>');
		expect(html).toContain('class="language-js"');
		expect(html).toContain('const x = 1;');
		expect(html).toContain('<li>item one</li>');
		expect(html).toContain('<th>a</th>');
		expect(html).toContain('<a href="url">link</a>');
		expect(html).toContain('<img src="src" alt="img" />');
		expect(html).toContain('<hr />');
	});
});
