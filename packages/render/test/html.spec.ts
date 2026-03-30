import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, PFMDocument } from '@mdsvex/parse';
import { renderNode, HTMLRenderer } from '../src/html';
import type { PFMNode } from '@mdsvex/parse';

// ── Helpers ──────────────────────────────────────────────────

/** Full pipeline: source → parser → wire → PFMDocument → root node. */
function parse_to_doc(source: string): PFMDocument {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();

	const doc = new PFMDocument();
	doc.apply(batch);
	return doc;
}

/** Parse and render to HTML. */
function render(source: string): string {
	const doc = parse_to_doc(source);
	return renderNode(doc.root!);
}

/** Parse incrementally, return HTMLRenderer blocks after each batch. */
function render_incremental(
	source: string,
	chunk_size: number,
): { blocks: { id: number; html: string }[]; snapshots: string[][] } {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const doc = new PFMDocument();
	const renderer = new HTMLRenderer();
	const snapshots: string[][] = [];

	parser.init();
	let accumulated = '';

	for (let i = 0; i < source.length; i += chunk_size) {
		const chunk = source.slice(i, Math.min(i + chunk_size, source.length));
		accumulated += chunk;
		emitter.set_source(accumulated);
		parser.feed(chunk);
		const batch = emitter.flush();
		if (batch.length > 0) {
			doc.apply(batch);
			renderer.update(doc);
			snapshots.push(renderer.blocks.map((b) => b.html));
		}
	}

	emitter.set_source(accumulated);
	parser.finish();
	const final = emitter.flush();
	if (final.length > 0) {
		doc.apply(final);
		renderer.update(doc);
		snapshots.push(renderer.blocks.map((b) => b.html));
	}

	return { blocks: renderer.blocks, snapshots };
}

// ── Paragraphs ───────────────────────────────────────────────

describe('html: paragraphs', () => {
	it('simple paragraph', () => {
		expect(render('hello world\n')).toBe('<p>hello world</p>');
	});

	it('multi-line paragraph', () => {
		const html = render('line one\nline two\n');
		expect(html).toContain('line one');
		expect(html).toContain('line two');
	});

	it('multiple paragraphs', () => {
		const html = render('first\n\nsecond\n');
		expect(html).toContain('<p>first</p>');
		expect(html).toContain('<p>second</p>');
	});

	it('escapes HTML entities in text', () => {
		expect(render('<b>not bold</b>\n')).toContain('&lt;b&gt;not bold&lt;/b&gt;');
	});
});

// ── Headings ─────────────────────────────────────────────────

describe('html: headings', () => {
	it('h1', () => {
		expect(render('# Hello\n')).toBe('<h1>Hello</h1>');
	});

	it('h2', () => {
		expect(render('## Title\n')).toBe('<h2>Title</h2>');
	});

	it('h3 through h6', () => {
		expect(render('### H3\n')).toBe('<h3>H3</h3>');
		expect(render('#### H4\n')).toBe('<h4>H4</h4>');
		expect(render('##### H5\n')).toBe('<h5>H5</h5>');
		expect(render('###### H6\n')).toBe('<h6>H6</h6>');
	});
});

// ── Emphasis & strong ────────────────────────────────────────

describe('html: emphasis', () => {
	it('emphasis', () => {
		expect(render('_hello_\n')).toContain('<em>hello</em>');
	});

	it('strong', () => {
		expect(render('*bold*\n')).toContain('<strong>bold</strong>');
	});

	it('mixed text and emphasis', () => {
		const html = render('before _middle_ after\n');
		expect(html).toContain('before ');
		expect(html).toContain('<em>middle</em>');
		expect(html).toContain(' after');
	});

	it('nested emphasis and strong', () => {
		const html = render('_em *strong* em_\n');
		expect(html).toContain('<em>');
		expect(html).toContain('<strong>strong</strong>');
	});
});

// ── Code spans ───────────────────────────────────────────────

describe('html: code spans', () => {
	it('inline code', () => {
		const html = render('use `code` here\n');
		expect(html).toContain('<code>code</code>');
	});

	it('escapes HTML in code spans', () => {
		const html = render('`<div>`\n');
		expect(html).toContain('<code>&lt;div&gt;</code>');
	});
});

// ── Code fences ──────────────────────────────────────────────

describe('html: code fences', () => {
	it('code fence without info', () => {
		const html = render('```\nhello\n```\n');
		expect(html).toContain('<pre><code>hello</code></pre>');
	});

	it('code fence with info string', () => {
		const html = render('```js\nconst x = 1;\n```\n');
		expect(html).toContain('<pre><code class="language-js">');
		expect(html).toContain('const x = 1;');
	});

	it('escapes HTML in code fence content', () => {
		const html = render('```\n<div>hi</div>\n```\n');
		expect(html).toContain('&lt;div&gt;');
	});
});

// ── Block quotes ─────────────────────────────────────────────

describe('html: block quotes', () => {
	it('simple block quote', () => {
		const html = render('> quoted\n');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<p>quoted</p>');
		expect(html).toContain('</blockquote>');
	});
});

// ── Links ────────────────────────────────────────────────────

describe('html: links', () => {
	it('inline link', () => {
		const html = render('[click](https://example.com)\n');
		expect(html).toContain('<a href="https://example.com">click</a>');
	});

	it('link with title', () => {
		const html = render('[text](url "title")\n');
		expect(html).toContain('title="title"');
	});
});

// ── Images ───────────────────────────────────────────────────

describe('html: images', () => {
	it('inline image', () => {
		const html = render('![alt text](image.png)\n');
		expect(html).toContain('<img src="image.png" alt="alt text" />');
	});
});

// ── Lists ────────────────────────────────────────────────────

describe('html: lists', () => {
	it('unordered list', () => {
		const html = render('- one\n- two\n');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>');
		expect(html).toContain('one');
		expect(html).toContain('two');
		expect(html).toContain('</ul>');
	});

	it('ordered list', () => {
		const html = render('1. one\n2. two\n');
		expect(html).toContain('<ol>');
		expect(html).toContain('<li>');
		expect(html).toContain('</ol>');
	});
});

// ── Thematic breaks ──────────────────────────────────────────

describe('html: thematic breaks', () => {
	it('thematic break', () => {
		const html = render('---\n');
		expect(html).toContain('<hr />');
	});
});

// ── Strikethrough & superscript ──────────────────────────────

describe('html: extensions', () => {
	it('strikethrough', () => {
		const html = render('~~deleted~~\n');
		expect(html).toContain('<del>deleted</del>');
	});

	it('superscript', () => {
		const html = render('^super^\n');
		expect(html).toContain('<sup>super</sup>');
	});
});

// ── Tables ───────────────────────────────────────────────────

describe('html: tables', () => {
	it('basic table', () => {
		const html = render('| foo | bar |\n| --- | --- |\n| baz | bim |\n');
		expect(html).toContain('<table>');
		expect(html).toContain('<thead>');
		expect(html).toContain('<th>foo</th>');
		expect(html).toContain('<th>bar</th>');
		expect(html).toContain('<tbody>');
		expect(html).toContain('<td>baz</td>');
		expect(html).toContain('<td>bim</td>');
		expect(html).toContain('</table>');
	});

	it('table with alignment', () => {
		const html = render('| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n');
		expect(html).toContain('<th align="left">left</th>');
		expect(html).toContain('<th align="center">center</th>');
		expect(html).toContain('<th align="right">right</th>');
		expect(html).toContain('<td align="left">a</td>');
		expect(html).toContain('<td align="center">b</td>');
		expect(html).toContain('<td align="right">c</td>');
	});
});

// ── HTMLRenderer (incremental) ───────────────────────────────

describe('html: HTMLRenderer incremental', () => {
	it('produces stable block IDs', () => {
		const { blocks } = render_incremental('# Hello\n\nworld\n', 4);
		expect(blocks.length).toBe(2);
		// Each block has a unique ID
		expect(blocks[0].id).not.toBe(blocks[1].id);
	});

	it('final output matches batch render', () => {
		const source = '# Hello\n\nsome _text_ here\n\n```js\ncode\n```\n';
		const batch_html = render(source);
		const { blocks } = render_incremental(source, 5);
		const inc_html = blocks.map((b) => b.html).join('');
		expect(inc_html).toBe(batch_html);
	});

	it('closed blocks are not re-rendered', () => {
		const source = '# First\n\nsecond\n';
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const doc = new PFMDocument();
		const renderer = new HTMLRenderer();

		parser.init();
		let acc = '';

		// Feed enough to close the heading
		const chunk1 = '# First\n\n';
		acc += chunk1;
		emitter.set_source(acc);
		parser.feed(chunk1);
		let batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		const heading_html = renderer.blocks[0]?.html;

		// Feed the rest
		const chunk2 = 'second\n';
		acc += chunk2;
		emitter.set_source(acc);
		parser.feed(chunk2);
		batch = emitter.flush();
		if (batch.length) doc.apply(batch);

		emitter.set_source(acc);
		parser.finish();
		batch = emitter.flush();
		if (batch.length) doc.apply(batch);
		renderer.update(doc);

		// Heading block should be identical (cached)
		expect(renderer.blocks[0].html).toBe(heading_html);
		expect(renderer.blocks.length).toBe(2);
	});
});
