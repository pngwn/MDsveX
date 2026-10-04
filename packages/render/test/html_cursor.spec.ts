import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import { ComponentScope, CursorHTMLRenderer } from '../src/html_cursor';

//  Helpers ��

function render(source: string): string {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return renderer.html;
}

//  Tests ��

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
	it('strong', () =>
		expect(render('*bold*\n')).toContain('<strong>bold</strong>'));
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

	it('code span', () =>
		expect(render('use `code` here\n')).toContain('<code>code</code>'));
	it('code fence with info', () => {
		const html = render('```js\nconst x = 1;\n```\n');
		expect(html).toContain('class="language-js"');
		expect(html).toContain('const x = 1;');
	});
	it('code fence no info', () => {
		expect(render('```\nhello\n```\n')).toContain(
			'<pre><code>hello</code></pre>'
		);
	});

	it('block quote', () => {
		const html = render('> quoted\n');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<p>quoted</p>');
	});

	it('link', () => {
		expect(render('[click](https://example.com)\n')).toContain(
			'<a href="https://example.com">click</a>'
		);
	});
	it('link with title', () => {
		expect(render('[text](url "title")\n')).toContain('title="title"');
	});
	it('image', () => {
		expect(render('![alt text](image.png)\n')).toContain(
			'<img src="image.png" alt="alt text"'
		);
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
	it('strikethrough', () =>
		expect(render('~~deleted~~\n')).toContain('<del>deleted</del>'));
	it('superscript', () =>
		expect(render('^super^\n')).toContain('<sup>super</sup>'));

	it('table', () => {
		const html = render('| foo | bar |\n| --- | --- |\n| baz | bim |\n');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>foo</th>');
		expect(html).toContain('<td>baz</td>');
	});
	it('table with alignment', () => {
		const html = render(
			'| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n'
		);
		expect(html).toContain('align="left"');
		expect(html).toContain('align="center"');
		expect(html).toContain('align="right"');
	});

	it('html self-closing', () =>
		expect(render('text <br /> more\n')).toContain('<br />'));
	it('html paired', () =>
		expect(render('text <span>inside</span> end\n')).toContain(
			'<span>inside</span>'
		));
	it('html block', () => {
		const html = render('<section>\n\n# Heading\n\nParagraph.\n\n</section>\n');
		expect(html).toContain('<section>');
		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<p>Paragraph.</p>');
	});
	it('html comment', () =>
		expect(render('text <!-- hidden --> more\n')).toContain('<!-- hidden -->'));

	it('complex document', () => {
		const html = render(
			'# Title\n\n' +
				'A paragraph with _emphasis_ and *bold*.\n\n' +
				'> A block quote with `code`\n\n' +
				'```js\nconst x = 1;\n```\n\n' +
				'- item one\n- item two\n\n' +
				'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
				'[link](url) and ![img](src)\n\n' +
				'---\n'
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

	//  Svelte syntax

	it('mustache expression', () => {
		expect(render('hello {name} world')).toBe('<p>hello {name} world</p>');
	});

	it('svelte void tag {@html}', () => {
		expect(render('{@html "<b>bold</b>"}')).toBe('{@html "<b>bold</b>"}');
	});

	it('svelte void tag {@debug}', () => {
		expect(render('{@debug myVar}')).toBe('{@debug myVar}');
	});

	it('svelte void tag {@const} no expression', () => {
		expect(render('{@debug}')).toBe('{@debug}');
	});

	it('svelte void tag with text keeps the paragraph', () => {
		expect(render('{@html raw} after')).toBe('<p>{@html raw} after</p>');
	});

	it('simple if block', () => {
		const html = render('{#if show}\nhello\n{/if}');
		expect(html).toBe('{#if show}\n<p>hello</p>{/if}');
	});

	it('if/else block', () => {
		const html = render('{#if a}\nfirst\n{:else}\nsecond\n{/if}');
		expect(html).toBe('{#if a}\n<p>first</p>{:else}\n<p>second</p>{/if}');
	});

	it('if/else if/else block', () => {
		const html = render(
			'{#if a}\none\n{:else if b}\ntwo\n{:else}\nthree\n{/if}'
		);
		expect(html).toBe(
			'{#if a}\n<p>one</p>{:else if b}\n<p>two</p>{:else}\n<p>three</p>{/if}'
		);
	});

	it('each block', () => {
		const html = render('{#each items as item}\n{item}\n{/each}');
		expect(html).toBe('{#each items as item}\n<p>{item}</p>{/each}');
	});

	it('await/then/catch block', () => {
		const html = render(
			'{#await promise}\nloading\n{:then value}\ndone\n{:catch error}\nfail\n{/await}'
		);
		expect(html).toBe(
			'{#await promise}\n<p>loading</p>{:then value}\n<p>done</p>{:catch error}\n<p>fail</p>{/await}'
		);
	});

	it('nested blocks', () => {
		const html = render('{#if a}\n{#if b}\ninner\n{/if}\n{/if}');
		expect(html).toBe('{#if a}\n{#if b}\n<p>inner</p>{/if}{/if}');
	});

	it('block with markdown content', () => {
		const html = render('{#if show}\n# Title\n{/if}');
		expect(html).toBe('{#if show}\n<h1>Title</h1>{/if}');
	});
});

describe('static chunk fold', () => {
	function parse(source: string) {
		const tree = new TreeBuilder(source.length >> 3 || 128);
		new PFMParser(tree).parse(source);
		return tree.get_buffer();
	}

	it('keeps output past the composite length cap', () => {
		const html = render('x\n\n' + '***\n\n'.repeat(60));
		expect(html).toBe('<p>x</p>' + '<hr />'.repeat(60));
	});

	it('matches the mapped render, which does not fold', () => {
		const source =
			'# Title\n\n> quote\n\n- one\n- two\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n\n' +
			'[link](/x "t") and ![img](/i.png) and `code`\n\n---\n\n```js\nx\n```\n\n' +
			'<div class="a">b</div>\n\n<br />\n\n{#if a}\nyes\n{:else}\nno\n{/if}\n\n{@html x}\n';
		const buf = parse(source);
		const folded = new CursorHTMLRenderer({ cache: false });
		folded.update(buf, source);
		const mapped = new CursorHTMLRenderer({ cache: false });
		mapped.update_mapped(buf, source);
		expect(folded.html).toBe(mapped.html);
		const cached = new CursorHTMLRenderer();
		cached.update(buf, source);
		expect(cached.html).toBe(mapped.html);
	});
});

describe('raw html attribute values', () => {
	const cases: [string, string][] = [
		['<div title="a &amp; b">x</div>\n', '<div title="a &amp; b">x</div>'],
		['<div title="a & <b>">x</div>\n', '<div title="a & <b>">x</div>'],
		[
			`<div title='"a" &amp; b'>x</div>\n`,
			'<div title="&quot;a&quot; &amp; b">x</div>',
		],
		[
			'text <span title="&lt;&gt;">x</span>\n',
			'<p>text <span title="&lt;&gt;">x</span></p>',
		],
	];

	for (const [input, expected] of cases) {
		it(JSON.stringify(input), () => {
			const tree = new TreeBuilder(128);
			new PFMParser(tree).parse(input);
			const buf = tree.get_buffer();
			const folded = new CursorHTMLRenderer({ cache: false });
			folded.update(buf, input);
			expect(folded.html).toBe(expected);
			const mapped = new CursorHTMLRenderer({ cache: false });
			mapped.update_mapped(buf, input);
			expect(mapped.html).toBe(expected);
			const cached = new CursorHTMLRenderer();
			cached.update(buf, input);
			expect(cached.html).toBe(expected);
		});
	}
});

describe('character references', () => {
	const cases: [string, string][] = [
		['a &lt; b &copy;\n', '<p>a &lt; b &copy;</p>'],
		['<div>a &mdash; b</div>\n', '<div>a &mdash; b</div>'],
		[
			'&#123; &#x7D; &MadeUp; &copy & \\&amp; `&amp; x`\n',
			'<p>&#123; &#x7D; &amp;MadeUp; &amp;copy &amp; &amp;amp; <code>&amp;amp; x</code></p>',
		],
		[
			'> ```\n> &lt; &copy;\n> ```\n',
			'<blockquote>\n<pre><code>&amp;lt; &amp;copy;</code></pre>\n</blockquote>',
		],
		[
			'[a &amp; b](/x?a&amp;b "&quot;t&quot;") ![&copy;](/i?a&b)\n',
			'<p><a href="/x?a&amp;b" title="&quot;t&quot;">a &amp; b</a> <img src="/i?a&amp;b" alt="&copy;" /></p>',
		],
	];

	for (const [input, expected] of cases) {
		it(JSON.stringify(input), () => {
			const tree = new TreeBuilder(128);
			new PFMParser(tree).parse(input);
			const buf = tree.get_buffer();
			const folded = new CursorHTMLRenderer({ cache: false });
			folded.update(buf, input);
			expect(folded.html).toBe(expected);
			const mapped = new CursorHTMLRenderer({ cache: false });
			mapped.update_mapped(buf, input);
			expect(mapped.html).toBe(expected);
			const traced = new CursorHTMLRenderer({ cache: false });
			traced.update_trace(buf, input);
			expect(traced.html).toBe(expected);
			const cached = new CursorHTMLRenderer();
			cached.update(buf, input);
			expect(cached.html).toBe(expected);
		});
	}
});

describe('braces in code', () => {
	const cases: [string, string][] = [
		[
			'Use `{ a: 1 }` here.\n',
			'<p>Use <code>&#123; a: 1 &#125;</code> here.</p>',
		],
		[
			'```js {1}\nconst o = { a: 1 };\n```\n',
			'<pre><code class="language-js">const o = &#123; a: 1 &#125;;</code></pre>',
		],
		[
			'> ```\n> {a} &lt;\n> ```\n',
			'<blockquote>\n<pre><code>&#123;a&#125; &amp;lt;</code></pre>\n</blockquote>',
		],
		[
			'```sh title="shell" {1}\nls\n```\n',
			'<pre><code class="language-sh">ls</code></pre>',
		],
	];

	for (const [input, expected] of cases) {
		it(JSON.stringify(input), () => {
			const tree = new TreeBuilder(128);
			new PFMParser(tree).parse(input);
			const buf = tree.get_buffer();
			const folded = new CursorHTMLRenderer({ cache: false });
			folded.update(buf, input);
			expect(folded.html).toBe(expected);
			const mapped = new CursorHTMLRenderer({ cache: false });
			mapped.update_mapped(buf, input);
			expect(mapped.html).toBe(expected);
			const traced = new CursorHTMLRenderer({ cache: false });
			traced.update_trace(buf, input);
			expect(traced.html).toBe(expected);
			const cached = new CursorHTMLRenderer();
			cached.update(buf, input);
			expect(cached.html).toBe(expected);
		});
	}
});

describe('paragraphs around tags and components', () => {
	const cases: [string, string][] = [
		['<X />\n', '<X />'],
		['<X /> <Y />\n', '<X /> <Y />'],
		['<X />\n<Y />\n', '<X />\n<Y />'],
		['<X>child</X>\n', '<X>child</X>'],
		['<img src="a.png">\n', '<img src="a.png">'],
		['<!-- note -->\n', '<!-- note -->'],
		['<X /> hello\n', '<p><X /> hello</p>'],
		['<X />\nhello *world*\n', '<p><X />\nhello <strong>world</strong></p>'],
		['hello\n<X />\n', '<p>hello\n<X /></p>'],
		['a <X />\n<Y />\n', '<p>a <X />\n<Y /></p>'],
		['<X>child</X> after\n', '<p><X>child</X> after</p>'],
		['{title}\n', '<p>{title}</p>'],
		['<div><p>hi</p></div>\n', '<div><p>hi</p></div>'],
		['<div>a</div>\n', '<div>a</div>'],
		['<div>*a*</div>\n', '<div><strong>a</strong></div>'],
		['<div>a</div> b\n', '<div>a</div> b'],
		['<div>\n# hi\n</div>\n', '<div><h1>hi</h1></div>'],
		[
			'<details><summary>Title</summary>\n\nBody\n\n</details>\n',
			'<details><summary>Title</summary><p>Body</p></details>',
		],
		['<p>\ntext\n</p>\n', '<p>text</p>'],
		['<span>\ntext\n</span>\n', '<span>text</span>'],
	];

	for (const [input, expected] of cases) {
		it(JSON.stringify(input), () => {
			expect(render(input).replace(/\n+$/, '')).toBe(expected);
		});
	}
});

describe('directives no component replaces', () => {
	const cases: [string, string][] = [
		['::x[a *b*]\n', ''],
		[':::x[a *b*]\nbody\n:::\n', '<p>body</p>'],
		['a\n\n::x[`l` :y[i]](k=v)\n\nc\n', '<p>a</p><p>c</p>'],
	];
	it.each(cases)('every walk leaves out the label of %j', (source, html) => {
		const parse = () => {
			const tree = new TreeBuilder(64);
			new PFMParser(tree).parse(source);
			return tree.get_buffer();
		};
		expect(render(source)).toBe(html);
		const cached = new CursorHTMLRenderer();
		cached.update(parse(), source);
		expect(cached.html).toBe(html);
		const mapped = new CursorHTMLRenderer({ cache: false });
		mapped.update_mapped(parse(), source);
		expect(mapped.html).toBe(html);
		const traced = new CursorHTMLRenderer({ cache: false });
		traced.update_trace(parse(), source);
		expect(traced.html).toBe(html);
	});
});

describe('code fences inside block quotes', () => {
	const cases: [string, string, string][] = [
		[
			'depth 1',
			'> ```js\n> a\n> b\n> ```\n',
			'<blockquote>\n<pre><code class="language-js">a\nb</code></pre>\n</blockquote>',
		],
		[
			'depth 2',
			'> > ```\n> > a\n> > b\n> > ```\n',
			'<blockquote>\n<blockquote>\n<pre><code>a\nb</code></pre>\n</blockquote>\n</blockquote>',
		],
		[
			'a blank > line',
			'> ```\n> a\n>\n> b\n> ```\n',
			'<blockquote>\n<pre><code>a\n\nb</code></pre>\n</blockquote>',
		],
		[
			'indented content',
			'> ```\n> a\n>   b\n> ```\n',
			'<blockquote>\n<pre><code>a\n  b</code></pre>\n</blockquote>',
		],
		[
			'markers without a space',
			'>```\n>a\n>>b\n>```\n',
			'<blockquote>\n<pre><code>a\n&gt;b</code></pre>\n</blockquote>',
		],
	];
	it.each(cases)('every walk strips the markers, %s', (_, source, html) => {
		const parse = () => {
			const tree = new TreeBuilder(64);
			new PFMParser(tree).parse(source);
			return tree.get_buffer();
		};
		expect(render(source)).toBe(html);
		const cached = new CursorHTMLRenderer();
		cached.update(parse(), source);
		expect(cached.html).toBe(html);
		const mapped = new CursorHTMLRenderer({ cache: false });
		mapped.update_mapped(parse(), source);
		expect(mapped.html).toBe(html);
		const traced = new CursorHTMLRenderer({ cache: false });
		traced.update_trace(parse(), source);
		expect(traced.html).toBe(html);
	});
});

describe('extended tables', () => {
	function parse(source: string) {
		const tree = new TreeBuilder(source.length >> 3 || 128);
		new PFMParser(tree).parse(source);
		return tree.get_buffer();
	}

	/** the html every walk renders, the cached one only without replacements */
	function every_walk(source: string, scope?: ComponentScope): string {
		const walks: string[] = [];
		const folded = new CursorHTMLRenderer({ cache: false });
		const mapped = new CursorHTMLRenderer({ cache: false });
		const traced = new CursorHTMLRenderer({ cache: false });
		if (scope) folded.scope = mapped.scope = traced.scope = scope;
		folded.update(parse(source), source);
		mapped.update_mapped(parse(source), source);
		traced.update_trace(parse(source), source);
		walks.push(folded.html, mapped.html, traced.html);
		if (!scope) {
			const cached = new CursorHTMLRenderer();
			cached.update(parse(source), source);
			walks.push(cached.html);
		}
		for (const html of walks) expect(html).toBe(walks[0]);
		return walks[0];
	}

	const table = (head: string, body: string) =>
		`<table>\n<thead>\n<tr>\n${head}</tr>\n</thead>\n<tbody>\n${body}</tbody>\n</table>`;

	const cases: [string, string, string][] = [
		[
			'left header columns',
			'| h || a | b |\n|---||---|---|\n| 1 || 2 | 3 |\n',
			table(
				'<th>h</th>\n<th>a</th>\n<th>b</th>\n',
				'<tr>\n<th scope="row">1</th>\n<td>2</td>\n<td>3</td>\n</tr>\n'
			),
		],
		[
			'right header columns',
			'| a | b || r |\n|---|---||---|\n| 1 | 2 || 3 |\n',
			table(
				'<th>a</th>\n<th>b</th>\n<th>r</th>\n',
				'<tr>\n<td>1</td>\n<td>2</td>\n<th scope="row">3</th>\n</tr>\n'
			),
		],
		[
			'header columns on both sides',
			'| l || a || r |\n|:--||---||--:|\n| 1 || 2 || 3 |\n',
			table(
				'<th align="left">l</th>\n<th>a</th>\n<th align="right">r</th>\n',
				'<tr>\n<th scope="row" align="left">1</th>\n<td>2</td>\n<th scope="row" align="right">3</th>\n</tr>\n'
			),
		],
		[
			'colspan in the header row',
			'| a | b |> | c |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |\n',
			table(
				'<th>a</th>\n<th colspan="2">b</th>\n<th>c</th>\n',
				'<tr>\n<td>1</td>\n<td>2</td>\n<td>3</td>\n<td>4</td>\n</tr>\n'
			),
		],
		[
			'colspan in body rows',
			'| a | b | c |\n|---|---|---|\n| 1 | 2 |> |\n| x |> |> |\n',
			table(
				'<th>a</th>\n<th>b</th>\n<th>c</th>\n',
				'<tr>\n<td>1</td>\n<td colspan="2">2</td>\n</tr>\n' +
					'<tr>\n<td colspan="3">x</td>\n</tr>\n'
			),
		],
		[
			'rowspan',
			'| a | b |\n|---|---|\n| 1 | 2 |\n|^ | 3 |\n|^ | 4 |\n',
			table(
				'<th>a</th>\n<th>b</th>\n',
				'<tr>\n<td rowspan="3">1</td>\n<td>2</td>\n</tr>\n' +
					'<tr>\n<td>3</td>\n</tr>\n<tr>\n<td>4</td>\n</tr>\n'
			),
		],
		[
			'a merged rectangle',
			'| a | b | c |\n|---|---|---|\n| x |> | 1 |\n|^ |^ | 2 |\n',
			table(
				'<th>a</th>\n<th>b</th>\n<th>c</th>\n',
				'<tr>\n<td colspan="2" rowspan="2">x</td>\n<td>1</td>\n</tr>\n' +
					'<tr>\n<td>2</td>\n</tr>\n'
			),
		],
		[
			'cells after a merged cell keep their column alignment',
			'| a | b | c | d |\n|:-:|---|--:|:--|\n| x |> | r | l |\n|^ |^ | s | m |\n',
			table(
				'<th align="center">a</th>\n<th>b</th>\n<th align="right">c</th>\n<th align="left">d</th>\n',
				'<tr>\n<td align="center" colspan="2" rowspan="2">x</td>\n<td align="right">r</td>\n<td align="left">l</td>\n</tr>\n' +
					'<tr>\n<td align="right">s</td>\n<td align="left">m</td>\n</tr>\n'
			),
		],
		[
			'spans next to header columns',
			'| h || a | b |\n|---||---|---|\n| 1 || x |> |\n|^ || y | z |\n',
			table(
				'<th>h</th>\n<th>a</th>\n<th>b</th>\n',
				'<tr>\n<th scope="row" rowspan="2">1</th>\n<td colspan="2">x</td>\n</tr>\n' +
					'<tr>\n<td>y</td>\n<td>z</td>\n</tr>\n'
			),
		],
	];

	it.each(cases)('%s', (_, source, html) => {
		expect(every_walk(source)).toBe(html);
	});

	it('markers with nothing to merge into stay text in a plain table', () => {
		expect(every_walk('| a | b |\n|:--|--:|\n| > | ^ |\n| 1 | 2 |\n')).toBe(
			table(
				'<th align="left">a</th>\n<th align="right">b</th>\n',
				'<tr>\n<td align="left">&gt;</td>\n<td align="right">^</td>\n</tr>\n' +
					'<tr>\n<td align="left">1</td>\n<td align="right">2</td>\n</tr>\n'
			)
		);
	});

	it('replaced th and td take scope and spans as they take align', () => {
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['th', 'td'] }],
			'G'
		);
		const html = every_walk(
			'| h || a | b |\n|---||:-:|---|\n| 1 || x |> |\n|^ || y | z |\n',
			scope
		);
		expect(html.replace(/^<script>[^]*?<\/script>/, '')).toBe(
			table(
				'<Th_MDSVEX_G>h</Th_MDSVEX_G>\n<Th_MDSVEX_G align="center">a</Th_MDSVEX_G>\n<Th_MDSVEX_G>b</Th_MDSVEX_G>\n',
				'<tr>\n<Th_MDSVEX_G scope="row" rowspan="2">1</Th_MDSVEX_G>\n<Td_MDSVEX_G align="center" colspan="2">x</Td_MDSVEX_G>\n</tr>\n' +
					'<tr>\n<Td_MDSVEX_G align="center">y</Td_MDSVEX_G>\n<Td_MDSVEX_G>z</Td_MDSVEX_G>\n</tr>\n'
			)
		);
	});

	it('a row header uses a replaced th even when no header cell is replaced', () => {
		const scope = new ComponentScope([{ specifier: 'm', names: ['th'] }], 'G');
		const html = every_walk('| a || b |\n|---||---|\n| 1 || 2 |\n', scope);
		expect(html).toContain("import { th as Th_MDSVEX_G } from 'm';");
		expect(html).toContain(
			'<Th_MDSVEX_G scope="row">1</Th_MDSVEX_G>\n<td>2</td>'
		);
		const only_td = new ComponentScope(
			[{ specifier: 'm', names: ['td'] }],
			'G'
		);
		const td_html = every_walk('| a || b |\n|---||---|\n| 1 || 2 |\n', only_td);
		expect(td_html).toContain(
			'<th scope="row">1</th>\n<Td_MDSVEX_G>2</Td_MDSVEX_G>'
		);
	});
});
