import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, PFMDocument } from '@mdsvex/parse';
import { renderNode, HTMLRenderer } from '../src/html';
import type { HtmlComponentMap } from '../src/html';
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

	it('renders inline HTML tags', () => {
		// In PFM, <b> is a first-class HTML element
		// At block level, inner text gets paragraph wrapping
		const html = render('<b>not bold</b>\n');
		expect(html).toContain('<b>');
		expect(html).toContain('not bold');
		expect(html).toContain('</b>');
	});

	it('escapes HTML entities in text', () => {
		// Angle brackets that don't form valid tags are escaped
		expect(render('1 < 2 and 3 > 1\n')).toContain('&lt;');
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

// ── HTML elements ───────────────────────────────────────────

describe('html: html elements', () => {
	it('self-closing tag', () => {
		const html = render('text <br /> more\n');
		expect(html).toContain('<br />');
	});

	it('self-closing tag with attributes', () => {
		const html = render('text <img src="photo.jpg" alt="pic" /> end\n');
		expect(html).toContain('<img src="photo.jpg" alt="pic" />');
	});

	it('non-void self-closing renders with closing tag', () => {
		const html = render('text <Widget count="3" /> end\n');
		// Non-void elements must have a closing tag for the browser
		expect(html).toContain('<Widget count="3"></Widget>');
		expect(html).not.toContain('<Widget count="3" />');
	});

	it('void self-closing renders as self-closing', () => {
		const html = render('text <br /> end\n');
		expect(html).toContain('<br />');
	});

	it('paired tag with content', () => {
		const html = render('text <span>inside</span> end\n');
		expect(html).toContain('<span>inside</span>');
	});

	it('nested HTML tags', () => {
		const html = render('<div><span>nested</span></div>\n');
		expect(html).toContain('<div>');
		expect(html).toContain('<span>');
		expect(html).toContain('nested');
		expect(html).toContain('</span>');
		expect(html).toContain('</div>');
	});

	it('HTML with attributes', () => {
		const html = render('<div class="box" id="main">content</div>\n');
		expect(html).toContain('class="box"');
		expect(html).toContain('id="main"');
	});

	it('boolean attributes', () => {
		const html = render('<input disabled />\n');
		expect(html).toContain('disabled');
	});

	it('HTML comment', () => {
		const html = render('text <!-- hidden --> more\n');
		expect(html).toContain('<!-- hidden -->');
	});

	it('markdown inside HTML', () => {
		const html = render('text <div>*strong* and _em_</div> end\n');
		expect(html).toContain('<strong>strong</strong>');
		expect(html).toContain('<em>em</em>');
	});

	it('block HTML with markdown content', () => {
		const html = render('<section>\n\n# Heading\n\nParagraph.\n\n</section>\n');
		expect(html).toContain('<section>');
		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<p>Paragraph.</p>');
		expect(html).toContain('</section>');
	});
});

// ── Custom components (HTML renderer) ────────────────────────

describe('html: custom components', () => {
	function render_with(source: string, components: HtmlComponentMap): string {
		const doc = parse_to_doc(source);
		return renderNode(doc.root!, components);
	}

	it('custom component replaces tag', () => {
		const components: HtmlComponentMap = {
			AlertBox: (attrs, innerHTML) =>
				`<div class="alert alert-${attrs.type || 'info'}">${innerHTML}</div>`,
		};
		const html = render_with('<AlertBox type="warning">\n\n*Watch out!*\n\n</AlertBox>\n', components);
		expect(html).toContain('<div class="alert alert-warning">');
		expect(html).toContain('<strong>Watch out!</strong>');
		expect(html).toContain('</div>');
		expect(html).not.toContain('<AlertBox');
	});

	it('self-closing custom component', () => {
		const components: HtmlComponentMap = {
			Widget: (attrs) => `<span class="widget" data-count="${attrs.count}"></span>`,
		};
		const html = render_with('text <Widget count="3" /> end\n', components);
		expect(html).toContain('<span class="widget" data-count="3"></span>');
		expect(html).not.toContain('<Widget');
	});

	it('unmatched tags fall through to default rendering', () => {
		const components: HtmlComponentMap = {
			Widget: () => '<span class="widget"></span>',
		};
		const html = render_with('<div>normal div</div>\n', components);
		expect(html).toContain('<div>');
		expect(html).not.toContain('<span class="widget">');
	});

	it('custom component receives boolean attrs', () => {
		const components: HtmlComponentMap = {
			Toggle: (attrs) => `<button ${attrs.disabled ? 'disabled' : ''}>toggle</button>`,
		};
		const html = render_with('<Toggle disabled />\n', components);
		expect(html).toContain('disabled');
	});

	it('components thread through nested content', () => {
		const components: HtmlComponentMap = {
			Box: (_attrs, innerHTML) => `<div class="box">${innerHTML}</div>`,
		};
		const html = render_with('<div>\n\n<Box>\n\n*inner*\n\n</Box>\n\n</div>\n', components);
		expect(html).toContain('<div class="box">');
		expect(html).toContain('<strong>inner</strong>');
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
