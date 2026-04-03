import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { PFMCursor } from '@mdsvex/parse/cursor';
import { CursorHTMLRenderer } from '../src/html_cursor';

// ── Helpers ───────��──────────────────────────────────────────

function render(source: string): string {
	const tree = new TreeBuilder((source.length >> 3) || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return renderer.html;
}

// ── Tests ─────────────────────��──────────────────────────────

describe('CursorHTMLRenderer', () => {
	it('simple paragraph', () => {
		expect(render('hello world\n')).toBe('<p>hello world</p>');
	});

	it('multiple paragraphs', () => {
		const html = render('first\n\nsecond\n');
		expect(html).toContain('<p>first</p>');
		expect(html).toContain('<p>second</p>');
	});

	it('h1', () => expect(render('# Hello\n')).toBe('<h1>Hello</h1>'));
	it('h2', () => expect(render('## Title\n')).toBe('<h2>Title</h2>'));
	it('h3-h6', () => {
		expect(render('### H3\n')).toBe('<h3>H3</h3>');
		expect(render('#### H4\n')).toBe('<h4>H4</h4>');
		expect(render('##### H5\n')).toBe('<h5>H5</h5>');
		expect(render('###### H6\n')).toBe('<h6>H6</h6>');
	});

	it('emphasis', () => expect(render('_hello_\n')).toContain('<em>hello</em>'));
	it('strong', () => expect(render('*bold*\n')).toContain('<strong>bold</strong>'));
	it('mixed emphasis', () => {
		const html = render('before _middle_ after\n');
		expect(html).toContain('before ');
		expect(html).toContain('<em>middle</em>');
		expect(html).toContain(' after');
	});
	it('nested emphasis', () => {
		const html = render('_em *strong* em_\n');
		expect(html).toContain('<em>');
		expect(html).toContain('<strong>strong</strong>');
	});

	it('code span', () => expect(render('use `code` here\n')).toContain('<code>code</code>'));
	it('code fence with info', () => {
		const html = render('```js\nconst x = 1;\n```\n');
		expect(html).toContain('class="language-js"');
		expect(html).toContain('const x = 1;');
	});
	it('code fence no info', () => {
		expect(render('```\nhello\n```\n')).toContain('<pre><code>hello</code></pre>');
	});

	it('block quote', () => {
		const html = render('> quoted\n');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<p>quoted</p>');
	});

	it('link', () => {
		expect(render('[click](https://example.com)\n')).toContain('<a href="https://example.com">click</a>');
	});
	it('link with title', () => {
		expect(render('[text](url "title")\n')).toContain('title="title"');
	});
	it('image', () => {
		expect(render('![alt text](image.png)\n')).toContain('<img src="image.png" alt="alt text"');
	});

	it('unordered list (tight)', () => {
		const html = render('- one\n- two\n');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>one</li>');
		expect(html).toContain('<li>two</li>');
		expect(html).not.toContain('<p>');
	});
	it('ordered list (tight)', () => {
		const html = render('1. one\n2. two\n');
		expect(html).toContain('<ol>');
		expect(html).toContain('<li>one</li>');
		expect(html).toContain('<li>two</li>');
	});

	it('thematic break', () => expect(render('---\n')).toContain('<hr />'));
	it('strikethrough', () => expect(render('~~deleted~~\n')).toContain('<del>deleted</del>'));
	it('superscript', () => expect(render('^super^\n')).toContain('<sup>super</sup>'));

	it('table', () => {
		const html = render('| foo | bar |\n| --- | --- |\n| baz | bim |\n');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>foo</th>');
		expect(html).toContain('<td>baz</td>');
	});
	it('table with alignment', () => {
		const html = render('| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n');
		expect(html).toContain('align="left"');
		expect(html).toContain('align="center"');
		expect(html).toContain('align="right"');
	});

	it('html self-closing', () => expect(render('text <br /> more\n')).toContain('<br />'));
	it('html paired', () => expect(render('text <span>inside</span> end\n')).toContain('<span>inside</span>'));
	it('html block', () => {
		const html = render('<section>\n\n# Heading\n\nParagraph.\n\n</section>\n');
		expect(html).toContain('<section>');
		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<p>Paragraph.</p>');
	});
	it('html comment', () => expect(render('text <!-- hidden --> more\n')).toContain('<!-- hidden -->'));

	it('complex document', () => {
		const html = render(
			'# Title\n\n' +
			'A paragraph with _emphasis_ and *bold*.\n\n' +
			'> A block quote with `code`\n\n' +
			'```js\nconst x = 1;\n```\n\n' +
			'- item one\n- item two\n\n' +
			'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
			'[link](url) and ![img](src)\n\n' +
			'---\n',
		);
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<em>emphasis</em>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<code>code</code>');
		expect(html).toContain('class="language-js"');
		expect(html).toContain('<li>item one</li>');
		expect(html).toContain('<a href="url">link</a>');
		expect(html).toContain('<img src="src" alt="img"');
		expect(html).toContain('<hr />');
	});

	it('escapes HTML entities in text', () => {
		expect(render('1 < 2 and 3 > 1\n')).toContain('&lt;');
	});

	it('escapes HTML in code spans', () => {
		expect(render('`<div>`\n')).toContain('<code>&lt;div&gt;</code>');
	});
});
