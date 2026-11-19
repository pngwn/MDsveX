import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import {
	compile,
	compile_inputs,
	CompilerSession,
	FootnoteError,
	heading_slug,
} from '../src/main';
import type { CompileOptions, CompileWarning } from '../src/main';

const ARROW = '\u21a9\ufe0e';

/** the code every walk renders, they must agree, and svelte takes it */
function compile_all(raw: string, options: CompileOptions = {}): string {
	const plain = compile(raw, options);
	const mapped = compile(raw, { ...options, sourcemap: true });
	const session = new CompilerSession();
	const again = session.compile(raw, options);
	const inputs = compile_inputs();
	inputs.footnotes = options.footnotes;
	if (options.heading_ids === true) inputs.heading_ids = heading_slug;
	// the parse and the render of a session take inputs, which have no smart punctuation option
	const kept =
		options.smart_punctuation === undefined
			? session.render(session.parse(raw, inputs), inputs)
			: again;
	const syntax = {
		heading_ids: options.heading_ids,
		footnotes: options.footnotes,
		smart_punctuation: options.smart_punctuation,
	};
	const trace = session.compile_trace(
		raw,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		syntax
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		syntax
	);
	for (const other of [mapped, again, kept, trace, v3])
		expect(other.code).toBe(plain.code);
	svelte_compile(plain.code, { generate: 'server', filename: 'doc.svelte' });
	return plain.code;
}

function ref(number: number, label: string, nth = 1): string {
	const id = nth === 1 ? `fnref-${number}` : `fnref-${number}-${nth}`;
	return `<sup><a href="#fn-${label}" id="${id}" role="doc-noteref">${number}</a></sup>`;
}

function back(number: number, nth = 1): string {
	const name = nth === 1 ? `${number}` : `${number}-${nth}`;
	const mark = nth === 1 ? ARROW : `${ARROW}<sup>${nth}</sup>`;
	return ` <a href="#fnref-${name}" role="doc-backlink" aria-label="Back to reference ${name}">${mark}</a>`;
}

function section(...items: string[]): string {
	return (
		'<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">\n<ol>\n' +
		items.map((item) => item + '\n').join('') +
		'</ol>\n</section>'
	);
}

function caught(raw: string, options: CompileOptions = {}): any {
	try {
		compile(raw, options);
	} catch (e) {
		return e;
	}
	throw new Error('compiled');
}

function codes(warnings: CompileWarning[] | undefined) {
	return (warnings ?? []).map((w) => [w.code, w.start.line, w.start.column]);
}

describe('footnotes', () => {
	test('a reference is a numbered link and its definition goes to the end', () => {
		const raw =
			'A claim[^1], and a second one[^smith].\n\n[^1]: The source, with a [link](https://example.com).\n[^smith]: Smith, 2020.\n\nAfter.\n';
		expect(compile_all(raw)).toBe(
			`<p>A claim${ref(1, '1')}, and a second one${ref(2, 'smith')}.</p>` +
				'<p>After.</p>' +
				section(
					`<li id="fn-1"><p>The source, with a <a href="https://example.com">link</a>.${back(1)}</p></li>`,
					`<li id="fn-smith"><p>Smith, 2020.${back(2)}</p></li>`
				)
		);
	});

	test('numbers follow the first reference, wherever the definitions are', () => {
		const raw = '[^b]: second\n[^a]: first\n\nx[^a] y[^b] z[^a]\n';
		expect(compile_all(raw)).toBe(
			`<p>x${ref(1, 'a')} y${ref(2, 'b')} z${ref(1, 'a', 2)}</p>` +
				section(
					`<li id="fn-a"><p>first${back(1)}${back(1, 2)}</p></li>`,
					`<li id="fn-b"><p>second${back(2)}</p></li>`
				)
		);
	});

	test('a reference inside a definition is numbered when its definition is written', () => {
		const raw = 'a[^1] b[^3]\n\n[^1]: see[^2]\n[^2]: two\n[^3]: three\n';
		expect(compile_all(raw)).toBe(
			`<p>a${ref(1, '1')} b${ref(2, '3')}</p>` +
				section(
					`<li id="fn-1"><p>see${ref(3, '2')}${back(1)}</p></li>`,
					`<li id="fn-3"><p>three${back(2)}</p></li>`,
					`<li id="fn-2"><p>two${back(3)}</p></li>`
				)
		);
	});

	test('a definition renders nothing where it is written, in any container', () => {
		const raw =
			'> quoted[^q]\n>\n> [^q]: in the quote\n\n- item[^i]\n\n  [^i]: in the item\n\n<div>\n\n[^d]: in the element\n\n</div>\n\nlast[^d]\n';
		const code = compile_all(raw);
		expect(code).toBe(
			`<blockquote>\n<p>quoted${ref(1, 'q')}</p>\n</blockquote>` +
				`<ul>\n<li><p>item${ref(2, 'i')}</p></li>\n\n</ul>` +
				'<div></div>' +
				`<p>last${ref(3, 'd')}</p>` +
				section(
					`<li id="fn-q"><p>in the quote${back(1)}</p></li>`,
					`<li id="fn-i"><p>in the item${back(2)}</p></li>`,
					`<li id="fn-d"><p>in the element${back(3)}</p></li>`
				)
		);
	});

	test('a document with no footnote has no section', () => {
		expect(compile_all('a \\[^1] and `[^2]`\n')).toBe(
			'<p>a [^1] and <code>[^2]</code></p>'
		);
	});

	test('a label is escaped in the id and encoded in the link', () => {
		const raw = 'x[^a&b{c}"d]\n\n[^a&b{c}"d]: y\n';
		const code = compile_all(raw);
		expect(code).toContain(
			'<a href="#fn-a%26b%7Bc%7D%22d" id="fnref-1" role="doc-noteref">1</a>'
		);
		expect(code).toContain('<li id="fn-a&amp;b&#123;c&#125;&quot;d">');
	});

	test('the names of the section and of the back links are options', () => {
		const code = compile_all('x[^1] y[^1]\n\n[^1]: z\n', {
			footnotes: { label: 'Notes & "more"', back_label: 'Up to {n}' },
		});
		expect(code).toContain(
			'<section class="footnotes" role="doc-endnotes" aria-label="Notes &amp; &quot;more&quot;">'
		);
		expect(code).toContain('aria-label="Up to 1"');
		expect(code).toContain('aria-label="Up to 1-2"');
	});

	test('the next document of a session has no footnotes', () => {
		const session = new CompilerSession();
		expect(session.compile('x[^1]\n\n[^1]: y\n').code).toContain('fn-1');
		expect(session.compile('x\n').code).toBe('<p>x</p>');
	});

	test('a footnote whose id a heading was given moves aside', () => {
		// a heading takes its id as it closes, the footnotes are numbered at the end
		const code = compile_all('# fn 1\n\n## fnref 1\n\nx[^1]\n\n[^1]: y\n', {
			heading_ids: true,
		});
		expect(code).toContain('<h1 id="fn-1">fn 1</h1>');
		expect(code).toContain('<h2 id="fnref-1">fnref 1</h2>');
		expect(code).toContain('<li id="fn-1-1">');
		expect(code).toContain('href="#fn-1-1" id="fnref-1-1" role="doc-noteref"');
		expect(code).toContain('href="#fnref-1-1" role="doc-backlink"');
		expect(compile_all('# fn 1\n\nx[^1]\n\n[^1]: y\n')).toContain(
			'<li id="fn-1">'
		);
	});

	test('a table cell, a heading and a link hold a reference', () => {
		const raw = '# t[^1]\n\n| a[^1] |\n|---|\n| b[^1] |\n\n[^1]: n\n';
		const code = compile_all(raw);
		expect(code).toContain(`<h1>t${ref(1, '1')}</h1>`);
		expect(code).toContain(`<th>a${ref(1, '1', 2)}</th>`);
		expect(code).toContain(`<td>b${ref(1, '1', 3)}</td>`);
	});

	test('smart punctuation reads a definition as prose', () => {
		const code = compile_all('"a"[^1]\n\n[^1]: "b" -- c\n', {
			smart_punctuation: true,
		});
		expect(code).toContain('<p>\u201ca\u201d<sup>');
		expect(code).toContain('<p>\u201cb\u201d \u2013 c <a');
	});
});

describe('footnote errors', () => {
	test('a reference with no definition is a FootnoteError at the reference', () => {
		const e = caught('# t\n\ntext [^nope] and [^1]\n\n[^1]: one\n', {
			filename: 'doc.svx',
		});
		expect(e).toBeInstanceOf(FootnoteError);
		expect(e.name).toBe('FootnoteError');
		expect(e.code).toBe('footnote_undefined');
		expect(e.label).toBe('nope');
		expect([e.line, e.column]).toEqual([3, 6]);
		expect(e.message).toBe(
			'the footnote reference [^nope] has no definition, add `[^nope]: text`, or escape the bracket as `\\[^nope]` if it is not a footnote (doc.svx:3)'
		);
	});

	test('a negated character class in prose is one, escaped or in code it is not', () => {
		expect(caught('the class [^abc] matches\n').code).toBe(
			'footnote_undefined'
		);
		expect(compile('the class \\[^abc] or `[^abc]` matches\n').code).toBe(
			'<p>the class [^abc] or <code>[^abc]</code> matches</p>'
		);
	});

	test('it lists every problem of the document, in its order', () => {
		const e = caught('a[^x]\n\n[^1]: one\n[^1]: again\n\nb[^y] c[^1]\n');
		expect(e.problems).toEqual([
			{ code: 'footnote_duplicate', label: '1', line: 4, column: 1 },
			{ code: 'footnote_undefined', label: 'x', line: 1, column: 2 },
			{ code: 'footnote_undefined', label: 'y', line: 6, column: 2 },
		]);
		expect(e.message).toBe(
			'the footnote [^1] is defined twice, a label has one definition (line 4)'
		);
	});

	test('every entry point throws it, a parse of the session too', () => {
		const raw = 'a[^x]\n';
		const session = new CompilerSession();
		expect(() => compile(raw, { sourcemap: true })).toThrow(FootnoteError);
		expect(() => session.compile(raw)).toThrow(FootnoteError);
		expect(() => session.parse(raw, compile_inputs())).toThrow(FootnoteError);
		expect(() => session.compile_trace(raw)).toThrow(FootnoteError);
		expect(() => session.compile_v3(raw, 'doc.svx')).toThrow(FootnoteError);
		// the session is fit for the next document
		expect(session.compile('ok\n').code).toBe('<p>ok</p>');
	});

	test('a definition nothing refers to is not rendered, with a warning', () => {
		const out = compile('a[^1]\n\n[^1]: one\n\n[^2]: two[^3]\n\n[^3]: three\n');
		expect(out.code).toBe(
			`<p>a${ref(1, '1')}</p>` +
				section(`<li id="fn-1"><p>one${back(1)}</p></li>`)
		);
		expect(codes(out.warnings)).toEqual([
			['footnote_unused', 5, 0],
			['footnote_unused', 7, 0],
		]);
		expect(out.warnings![0].message).toBe(
			'the footnote [^2] is never referenced, so it is not rendered'
		);
	});

	test('strict false numbers and links what a compile rejects, with warnings', () => {
		const out = compile('a[^x] b[^1]\n\n[^1]: one\n[^1]: again\n', {
			footnotes: { strict: false },
		});
		expect(out.code).toBe(
			`<p>a${ref(1, 'x')} b${ref(2, '1')}</p>` +
				section(`<li id="fn-1" value="2"><p>one${back(2)}</p></li>`)
		);
		expect(codes(out.warnings)).toEqual([
			['footnote_duplicate', 4, 0],
			['footnote_undefined', 1, 1],
		]);
	});

	test('a definition with no text is a FootnoteError at the definition', () => {
		for (const raw of ['a[^1]\n\n[^1]:\n', 'a[^1]\n\n[^1]:\nnot indented\n']) {
			const e = caught(raw, { filename: 'doc.svx' });
			expect(e.code).toBe('footnote_empty');
			expect([e.line, e.column]).toEqual([3, 1]);
			expect(e.message).toBe(
				'the footnote [^1] has no text, write it after `[^1]:` or on the lines below indented by four spaces (doc.svx:3)'
			);
		}
	});

	test('strict false renders a definition with no text, with a warning', () => {
		const out = compile('a[^1]\n\n[^1]:\nnot indented\n', {
			footnotes: { strict: false },
		});
		expect(out.code).toBe(
			`<p>a${ref(1, '1')}</p><p>not indented</p>` +
				section(`<li id="fn-1"> ${back(1).trim()}</li>`)
		);
		expect(codes(out.warnings)).toEqual([['footnote_empty', 3, 0]]);
	});

	test('an option of the wrong type throws before any document', () => {
		expect(() => compile('a', { footnotes: 'x' as never })).toThrow(
			/footnotes must be an object/
		);
		expect(() => compile('a', { footnotes: { label: 1 as never } })).toThrow(
			/footnotes\.label must be a string/
		);
		expect(() =>
			compile('a', { footnotes: { strict: 'no' as never } })
		).toThrow(/footnotes\.strict must be true or false/);
	});
});

describe('a footnote that holds blocks', () => {
	test('the link back goes at the end of its last paragraph', () => {
		const raw = 'a[^1]\n\n[^1]: one\n\n    - two\n\n    three\n\nafter\n';
		expect(compile_all(raw)).toBe(
			`<p>a${ref(1, '1')}</p><p>after</p>` +
				section(
					`<li id="fn-1"><p>one</p><ul>\n<li>two</li>\n\n</ul><p>three${back(1)}</p></li>`
				)
		);
	});

	test('and after its last block when that is no paragraph', () => {
		const raw = 'a[^1]\n\n[^1]: one\n\n    ```js\n    let b;\n    ```\n';
		expect(compile_all(raw)).toBe(
			`<p>a${ref(1, '1')}</p>` +
				section(
					`<li id="fn-1"><p>one</p><pre><code class="language-js">let b;</code></pre>${back(1)}</li>`
				)
		);
	});
});

describe('a footnote with its text on the next line, as prettier writes it', () => {
	test.each([
		[
			'lines that go on',
			'a[^1]\n\n[^1]:\n    To add line breaks.\n    This is a second line.\n',
			'a[^1]\n\n[^1]: To add line breaks.\n    This is a second line.\n',
		],
		[
			'blocks',
			'a[^1]\n\n[^1]:\n    one\n\n    - two\n\n    ```js\n    let b;\n    ```\n\nafter\n',
			'a[^1]\n\n[^1]: one\n\n    - two\n\n    ```js\n    let b;\n    ```\n\nafter\n',
		],
	])('renders as written on one line, %s', (_, prettier, typed) => {
		expect(compile_all(prettier)).toBe(compile_all(typed));
	});
});

describe('footnote replacements', () => {
	const components = [
		{ specifier: 'mdsvex:components', names: ['footnote', 'footnotes', 'p'] },
	];

	test('footnote takes a reference and footnotes the section', () => {
		const out = compile('a[^n]\n\n[^n]: *one*\n', { components });
		const code = out.code.replace(/^<script>\n[^]*?<\/script>/, '');
		const sup = ref(1, 'n');
		expect(code).toBe(
			'<P_MDSVEX_G>a<Footnote_MDSVEX_G label={"n"} number={1} href={"#fn-n"} id={"fnref-1"}>' +
				'{#snippet note()}<P_MDSVEX_G><strong>one</strong></P_MDSVEX_G>{/snippet}' +
				`${sup}</Footnote_MDSVEX_G></P_MDSVEX_G>` +
				`<Footnotes_MDSVEX_G>\n<ol>\n<li id="fn-n"><P_MDSVEX_G><strong>one</strong></P_MDSVEX_G>${back(1)}</li>\n</ol>\n</Footnotes_MDSVEX_G>`
		);
		svelte_compile(out.code, { generate: 'server', filename: 'doc.svelte' });
		expect(
			compile('a[^n]\n\n[^n]: *one*\n', { components, sourcemap: true }).code
		).toBe(out.code);
	});

	test('footnote gets the ids a footnote moved to', () => {
		const raw = '# fn n\n\na[^n]\n\n[^n]: one\n';
		for (const sourcemap of [false, true]) {
			const code = compile(raw, {
				components,
				heading_ids: true,
				sourcemap,
			}).code;
			expect(code).toContain('href={"#fn-n-1"} id={"fnref-1"}>');
			expect(code).toContain('<li id="fn-n-1">');
		}
	});

	test('a document with no footnote imports neither', () => {
		expect(compile('a\n', { components }).code).not.toContain('ootnote');
	});
});
