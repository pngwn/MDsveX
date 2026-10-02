import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { mappings_to_v3, trace_to_v3 } from '@mdsvex/render/sourcemap';
import {
	ComponentScope,
	CursorHTMLRenderer,
	component_imports,
} from '@mdsvex/render/html-cursor';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';

import { compile, CompilerSession } from '../src/main';
import type {
	ComponentMode,
	ComponentSource,
	CompileWarning,
	ParsePlugin,
} from '../src/main';
import { all_directives } from './utils';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files.sort();
}

const ELEMENTS = [
	'p',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'em',
	'strong',
	'del',
	'sup',
	'sub',
	'blockquote',
	'ol',
	'ul',
	'li',
	'code',
	'pre',
	'a',
	'img',
	'hr',
	'br',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
];

const M = 'mdsvex:components';

function only(...names: string[]): ComponentSource[] {
	return [{ specifier: M, names }];
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

function imports_of(code: string): string {
	const m = /^<script>\n([^]*?)<\/script>/.exec(code);
	return m === null ? '' : m[1];
}

/** every walk must render the same html, the vite plugin uses the trace one */
function compile_all(
	raw: string,
	components: ComponentSource[],
	component_mode?: ComponentMode
): string {
	return compile_warned(raw, components, component_mode).code;
}

/** compile_all, also checking every walk gives the same warnings */
function compile_warned(
	raw: string,
	components: ComponentSource[],
	component_mode?: ComponentMode
): { code: string; warnings?: CompileWarning[] } {
	const plain = compile(raw, { components, component_mode });
	const mapped = compile(raw, { components, component_mode, sourcemap: true });
	expect(mapped.code).toBe(plain.code);
	const session = new CompilerSession();
	const trace = session.compile_trace(
		raw,
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		component_mode
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		component_mode
	);
	for (const other of [mapped, trace, v3]) {
		expect(other.code).toBe(plain.code);
		expect(other.warnings).toEqual(plain.warnings);
	}
	return plain;
}

describe('element replacement, markdown mode', () => {
	const cases: [string, string, string[], string][] = [
		['paragraph', 'text', ['p'], '<P_MDSVEX_G>text</P_MDSVEX_G>'],
		...[1, 2, 3, 4, 5, 6].map((d): [string, string, string[], string] => [
			`h${d} gets level`,
			'#'.repeat(d) + ' Title',
			[`h${d}`],
			`<H${d}_MDSVEX_G level={${d}}>Title</H${d}_MDSVEX_G>`,
		]),
		['emphasis', '_a_', ['em'], '<p><Em_MDSVEX_G>a</Em_MDSVEX_G></p>'],
		[
			'strong',
			'*a*',
			['strong'],
			'<p><Strong_MDSVEX_G>a</Strong_MDSVEX_G></p>',
		],
		['del', '~~a~~', ['del'], '<p><Del_MDSVEX_G>a</Del_MDSVEX_G></p>'],
		['sup', '^a^', ['sup'], '<p><Sup_MDSVEX_G>a</Sup_MDSVEX_G></p>'],
		['sub', '~a~', ['sub'], '<p><Sub_MDSVEX_G>a</Sub_MDSVEX_G></p>'],
		[
			'inline code keeps its escaped text as children',
			'`a <b>`',
			['code'],
			'<p><Code_MDSVEX_G>a &lt;b&gt;</Code_MDSVEX_G></p>',
		],
		[
			'link passes href and title',
			'[x](/u "t")',
			['a'],
			'<p><A_MDSVEX_G href="/u" title="t">x</A_MDSVEX_G></p>',
		],
		[
			'image is void and passes src, alt and title',
			'![al *t*](/i.png "tt")',
			['img'],
			'<p><Img_MDSVEX_G src="/i.png" alt="al t" title="tt" /></p>',
		],
		['hr is void', '---', ['hr'], '<Hr_MDSVEX_G />'],
		['br is void', 'a\\\nb', ['br'], '<p>a<Br_MDSVEX_G />\nb</p>'],
		[
			'blockquote',
			'> q',
			['blockquote'],
			'<Blockquote_MDSVEX_G>\n<p>q</p>\n</Blockquote_MDSVEX_G>',
		],
		[
			'ul and li',
			'- a\n- b',
			['ul', 'li'],
			'<Ul_MDSVEX_G>\n<Li_MDSVEX_G>a</Li_MDSVEX_G>\n<Li_MDSVEX_G>b</Li_MDSVEX_G>\n\n</Ul_MDSVEX_G>',
		],
		[
			'ol gets start, 1 when the list starts there',
			'1. a',
			['ol'],
			'<Ol_MDSVEX_G start={1}>\n<li>a</li>\n\n</Ol_MDSVEX_G>',
		],
		[
			'ol gets its start',
			'3. a',
			['ol'],
			'<Ol_MDSVEX_G start={3}>\n<li>a</li>\n\n</Ol_MDSVEX_G>',
		],
		[
			'a loose item keeps its paragraph, a tight one has none',
			'- a\n\n- b',
			['p'],
			'<ul>\n<li><P_MDSVEX_G>a</P_MDSVEX_G></li>\n<li><P_MDSVEX_G>b</P_MDSVEX_G></li>\n\n</ul>',
		],
		[
			'fenced code passes lang, meta and the raw code',
			'```js title="x" {1}\nlet a = {b: "</script>"};\n```',
			['pre'],
			'<Pre_MDSVEX_G lang={"js"} meta={"title=\\"x\\" {1}"} code={"let a = {b: \\"</script>\\"};"}>' +
				'<code class="language-js title=&quot;x&quot; &#123;1&#125;">let a = &#123;b: &quot;&lt;/script&gt;&quot;&#125;;</code></Pre_MDSVEX_G>',
		],
		[
			'fenced code with only a language has no meta',
			'```ts\nx\n```',
			['pre'],
			'<Pre_MDSVEX_G lang={"ts"} code={"x"}><code class="language-ts">x</code></Pre_MDSVEX_G>',
		],
		[
			'fenced code without info passes only code',
			'```\nplain\n```',
			['pre'],
			'<Pre_MDSVEX_G code={"plain"}><code>plain</code></Pre_MDSVEX_G>',
		],
		[
			'fenced code in a block quote passes the code without the markers',
			'> ```\n> a\n>\n>   b\n> ```',
			['pre'],
			'<blockquote>\n<Pre_MDSVEX_G code={"a\\n\\n  b"}><code>a\n\n  b</code></Pre_MDSVEX_G>\n</blockquote>',
		],
		[
			'fenced code does not use the inline code replacement',
			'```\nplain\n```',
			['code'],
			'<pre><code>plain</code></pre>',
		],
		[
			'table parts, th and td pass align',
			'| a | b | c |\n|:--|--:|---|\n| 1 | 2 | 3 |',
			['table', 'thead', 'tbody', 'tr', 'th', 'td'],
			'<Table_MDSVEX_G>\n<Thead_MDSVEX_G>\n<Tr_MDSVEX_G>\n' +
				'<Th_MDSVEX_G align="left">a</Th_MDSVEX_G>\n<Th_MDSVEX_G align="right">b</Th_MDSVEX_G>\n<Th_MDSVEX_G>c</Th_MDSVEX_G>\n' +
				'</Tr_MDSVEX_G>\n</Thead_MDSVEX_G>\n<Tbody_MDSVEX_G>\n<Tr_MDSVEX_G>\n' +
				'<Td_MDSVEX_G align="left">1</Td_MDSVEX_G>\n<Td_MDSVEX_G align="right">2</Td_MDSVEX_G>\n<Td_MDSVEX_G>3</Td_MDSVEX_G>\n' +
				'</Tr_MDSVEX_G>\n</Tbody_MDSVEX_G>\n</Table_MDSVEX_G>',
		],
		[
			'a cell alone, inside a plain table',
			'| a |\n|---|\n| 1 |',
			['td'],
			'<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<Td_MDSVEX_G>1</Td_MDSVEX_G>\n</tr>\n</tbody>\n</table>',
		],
		[
			'markdown inside raw html is replaced',
			'<div>\n\n# in html\n\n</div>',
			['h1'],
			'<div><H1_MDSVEX_G level={1}>in html</H1_MDSVEX_G></div>',
		],
	];

	for (const [name, raw, names, want] of cases) {
		test(name, () => {
			const code = compile_all(raw, only(...names));
			expect(body(code)).toBe(want);
		});
	}

	test('html the author typed is never replaced', () => {
		const raw =
			'<h1>raw</h1>\n\n<p>raw <img src="/a.png" /> <code>x</code></p>\n\n<hr />';
		const code = compile_all(raw, only(...ELEMENTS));
		expect(code).toBe(compile(raw).code);
		expect(code).not.toContain('<script>');
	});

	test('a replacement takes every plugin attribute as a prop', () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = 'header-2';
				},
			},
		};
		const code = compile('## Header 2', {
			components: only('h2'),
			parse_plugins: [plugin],
		}).code;
		expect(body(code)).toBe(
			'<H2_MDSVEX_G id="header-2" level={2}>Header 2</H2_MDSVEX_G>'
		);
	});

	test('li gets checked from a task plugin, also when false', () => {
		let n = 0;
		const plugin: ParsePlugin = {
			list_item: {
				parse(node) {
					node.attrs.checked = n++ === 0;
				},
			},
		};
		const code = compile('- a\n- b', {
			components: only('li'),
			parse_plugins: [plugin],
		}).code;
		expect(body(code)).toBe(
			'<ul>\n<Li_MDSVEX_G checked={true}>a</Li_MDSVEX_G>\n<Li_MDSVEX_G checked={false}>b</Li_MDSVEX_G>\n\n</ul>'
		);
	});

	test('elements a parse plugin creates are replaced, typed ones are not', () => {
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					node.append('html', { tag: 'mark', attributes: { class: 'hi' } });
				},
			},
		};
		const code = compile('text <mark>typed</mark>', {
			components: only('mark'),
			parse_plugins: [plugin],
		}).code;
		expect(imports_of(code)).toBe(
			"import { mark as Mark_MDSVEX_G } from 'mdsvex:components';\n"
		);
		// the handler runs when the paragraph opens, before its text
		expect(body(code)).toBe(
			'<p><Mark_MDSVEX_G class="hi"></Mark_MDSVEX_G>text <mark>typed</mark></p>'
		);
	});

	test('a document that uses no replacement renders as without components', () => {
		const session = new CompilerSession();
		// some fixtures open with frontmatter that is not yaml, keep it as metadata
		const frontmatter = { parse: (raw: string) => ({ raw }) };
		for (const file of fixture_files(FIXTURES)) {
			const raw = readFileSync(file, 'utf8');
			const components = only('nothing-here', 'mark');
			const directives = all_directives(raw);
			expect(
				session.compile(raw, { components, directives, frontmatter }).code,
				file
			).toBe(compile(raw, { directives, frontmatter }).code);
		}
	});
});

describe('element replacement, all mode', () => {
	const all = (raw: string, ...names: string[]) =>
		body(compile_all(raw, only(...names), 'all'));

	const cases: [string, string, string[], string][] = [
		[
			'a typed element takes its attributes as written',
			'<div class="a" data-x=1 title=\'t\' hidden>x</div>',
			['div'],
			'<Div_MDSVEX_G class="a" data-x=1 title=\'t\' hidden>x</Div_MDSVEX_G>',
		],
		[
			'expressions, shorthands, spreads and attachments pass as props',
			'<span a={x > 1} {y} {...rest} {@attach f}>x</span>',
			['span'],
			'<Span_MDSVEX_G a={x > 1} {y} {...rest} {@attach f}>x</Span_MDSVEX_G>',
		],
		[
			'a typed heading gets level',
			'<h3 id="t">Title</h3>',
			['h3'],
			'<H3_MDSVEX_G id="t" level={3}>Title</H3_MDSVEX_G>',
		],
		[
			'a level the author wrote is kept',
			'<h3 level={9}>Title</h3>',
			['h3'],
			'<H3_MDSVEX_G level={9}>Title</H3_MDSVEX_G>',
		],
		[
			'a typed ol gets start 1, a written start passes as written',
			'<ol><li>a</li></ol>\n\n<ol start="3"><li>b</li></ol>',
			['ol'],
			'<Ol_MDSVEX_G start={1}><li>a</li></Ol_MDSVEX_G><Ol_MDSVEX_G start="3"><li>b</li></Ol_MDSVEX_G>',
		],
		[
			'a typed link and image pass their attributes',
			'<a href="/u" title="t">l</a> <img src="/i.png" alt="i">',
			['a', 'img'],
			'<A_MDSVEX_G href="/u" title="t">l</A_MDSVEX_G> <Img_MDSVEX_G src="/i.png" alt="i" />',
		],
		[
			'void elements close themselves and get no children',
			'a <br> b <hr/> <input value={v}>',
			['br', 'hr', 'input'],
			'<p>a <Br_MDSVEX_G /> b <Hr_MDSVEX_G /> <Input_MDSVEX_G value={v} /></p>',
		],
		[
			'a self closing custom tag stays self closing',
			'<warning type="x" />',
			['warning'],
			'<Warning_MDSVEX_G type="x" />',
		],
		[
			'an attribute spanning lines keeps its lines',
			'<img\n  src={x}\n  {...rest}\n/>',
			['img'],
			'<Img_MDSVEX_G\n  src={x}\n  {...rest} />',
		],
		[
			'a lowercase custom tag matches the name it exports',
			'<warning type="x">\n\n*bold* text\n\n</warning>',
			['warning'],
			'<Warning_MDSVEX_G type="x"><p><strong>bold</strong> text</p></Warning_MDSVEX_G>',
		],
		[
			'a custom tag with a dash',
			'<my-note>n</my-note>',
			['my-note'],
			'<My_note_MDSVEX_G>n</My_note_MDSVEX_G>',
		],
		[
			'an empty element has an empty body',
			'<warning></warning>',
			['warning'],
			'<Warning_MDSVEX_G></Warning_MDSVEX_G>',
		],
		[
			'nested elements are each replaced',
			'<div><div>in <span>s</span></div></div>',
			['div', 'span'],
			'<Div_MDSVEX_G><Div_MDSVEX_G>in <Span_MDSVEX_G>s</Span_MDSVEX_G></Div_MDSVEX_G></Div_MDSVEX_G>',
		],
		[
			'markdown inside a typed element is replaced too',
			'<div>\n\n## sub\n\n</div>',
			['div', 'h2'],
			'<Div_MDSVEX_G><H2_MDSVEX_G level={2}>sub</H2_MDSVEX_G></Div_MDSVEX_G>',
		],
		[
			'markdown and typed elements share a replacement',
			'## md\n\n<h2>typed</h2>',
			['h2'],
			'<H2_MDSVEX_G level={2}>md</H2_MDSVEX_G><H2_MDSVEX_G level={2}>typed</H2_MDSVEX_G>',
		],
		[
			'names nothing exports stay elements',
			'<div><span>s</span></div>',
			['span'],
			'<div><Span_MDSVEX_G>s</Span_MDSVEX_G></div>',
		],
		[
			'svelte:element is the escape hatch',
			'<svelte:element this="img" src="a" />',
			['img', 'svelte:element'],
			'<svelte:element this="img" src="a" />',
		],
		[
			'components and svelte tags are never replaced',
			'<Img src="a" />\n\n<svelte:head><title>t</title></svelte:head>',
			['img', 'Img', 'title'],
			'<Img src="a" /><svelte:head><Title_MDSVEX_G>t</Title_MDSVEX_G></svelte:head>',
		],
		[
			'entities in a typed value stay as typed',
			'<div title="a &amp; b < c">x</div>',
			['div'],
			'<Div_MDSVEX_G title="a &amp; b < c">x</Div_MDSVEX_G>',
		],
		[
			'a rebuilt value keeps its entities',
			'<span title="a &amp; b" title="c &amp; d">x</span>',
			['span'],
			'<Span_MDSVEX_G title="c &amp; d">x</Span_MDSVEX_G>',
		],
		[
			'attributes the source does not spell are rebuilt',
			'<span title="a" title="b">x</span>',
			['span'],
			'<Span_MDSVEX_G title="b">x</Span_MDSVEX_G>',
		],
	];

	for (const [name, raw, names, want] of cases) {
		test(name, () => expect(all(raw, ...names)).toBe(want));
	}

	test('script and style are never replaced', () => {
		const raw = '<script>\n  let a = 1;\n</script>\n\n<style>p {}</style>\n\nx';
		expect(compile_all(raw, only('script', 'style', 'p'), 'all')).toBe(
			"<script>\nimport { p as P_MDSVEX_G } from 'mdsvex:components';\n\n  let a = 1;\n</script>" +
				'<style>p {}</style><P_MDSVEX_G>x</P_MDSVEX_G>'
		);
	});

	test('markdown mode leaves typed elements, as without a mode', () => {
		const raw = '<h2>t</h2>\n\n<warning>w</warning>';
		const want = compile(raw).code;
		expect(compile_all(raw, only('h2', 'warning'))).toBe(want);
		expect(compile_all(raw, only('h2', 'warning'), 'markdown')).toBe(want);
	});

	test('a template scope replaces typed elements without root components', () => {
		const templates = {
			docs: { specifier: 'mdsvex:template/docs', components: ['h2'] },
		};
		const raw = '<h2>typed</h2>\n\n<input bind:value={v}>';
		const all = compile(raw, {
			templates,
			template: 'docs',
			component_mode: 'all',
		});
		expect(all.code).toContain('<H2_MDSVEX_T level={2}>typed</H2_MDSVEX_T>');
		expect(all.warnings).toBeUndefined();
		const markdown = compile(raw, { templates, template: 'docs' });
		expect(markdown.code).toContain('<h2>typed</h2>');
		const session = new CompilerSession();
		const trace = session.compile_trace(
			raw,
			undefined,
			undefined,
			undefined,
			{ templates, template: 'docs' },
			undefined,
			'all'
		);
		expect(trace.code).toBe(all.code);
	});

	test('an element a parse plugin creates gets no extras', () => {
		const plugin: ParsePlugin = {
			paragraph: {
				parse(node) {
					node.append('html', { tag: 'h2', attributes: { id: 'p' } });
				},
			},
		};
		const code = compile('text', {
			components: only('h2'),
			component_mode: 'all',
			parse_plugins: [plugin],
		}).code;
		expect(body(code)).toBe('<p><H2_MDSVEX_G id="p"></H2_MDSVEX_G>text</p>');
	});

	describe('directives', () => {
		const directives = [
			'bind:value={v}',
			'on:click={f}',
			'use:act',
			'class:on={x}',
			'style:color="red"',
			'transition:fade',
			'in:fly',
			'out:fly|local',
			'animate:flip',
			'let:item',
		];
		for (const directive of directives) {
			const name = directive.split(/[={]/)[0];
			test(`${name} keeps the element and warns`, () => {
				const raw = `text\n\n<div id="a" ${directive}>x</div>`;
				const { code, warnings } = compile_warned(raw, only('div'), 'all');
				expect(code).toBe(compile(raw).code);
				expect(warnings).toEqual([
					{
						code: 'element_directive',
						message: `<div> stays an element, a component can't take ${name}`,
						start: { line: 3, column: 0 },
					},
				]);
			});
		}

		test('the children of a kept element are still replaced', () => {
			const raw = '<div on:click={f}>\n\n<span>s</span> *b*\n\n</div>';
			const { code, warnings } = compile_warned(
				raw,
				only('div', 'span', 'strong'),
				'all'
			);
			expect(body(code)).toBe(
				'<div on:click={f}><p><Span_MDSVEX_G>s</Span_MDSVEX_G> <Strong_MDSVEX_G>b</Strong_MDSVEX_G></p></div>'
			);
			expect(warnings).toHaveLength(1);
		});

		test('handler attributes are props, they are no directive', () => {
			const raw = '<button onclick={f}>b</button>';
			const { code, warnings } = compile_warned(raw, only('button'), 'all');
			expect(body(code)).toBe(
				'<Button_MDSVEX_G onclick={f}>b</Button_MDSVEX_G>'
			);
			expect(warnings).toBeUndefined();
		});

		test('only an element something would replace warns', () => {
			const raw = '<input bind:value={v}>\n\n<div class:a={b}>x</div>';
			const { warnings } = compile_warned(raw, only('div'), 'all');
			expect(warnings?.map((w) => w.message)).toEqual([
				"<div> stays an element, a component can't take class:a",
			]);
			expect(
				compile(raw, { components: only('div') }).warnings
			).toBeUndefined();
		});

		test('a later compile without components has no warnings', () => {
			const raw = '<input bind:value={v}>';
			const session = new CompilerSession();
			const options = {
				components: only('input'),
				component_mode: 'all' as const,
			};
			expect(session.compile(raw, options).warnings).toHaveLength(1);
			expect(session.compile(raw).warnings).toBeUndefined();
			expect(session.compile_trace(raw).warnings).toBeUndefined();
			expect(compile(raw, options).warnings).toHaveLength(1);
			expect(compile(raw).warnings).toBeUndefined();
		});

		test('positions count lines of the raw source', () => {
			const raw = 'a\r\n\r\n- item <input bind:value={v}>\r\n';
			const { warnings } = compile_warned(raw, only('input'), 'all');
			expect(warnings?.[0].start).toEqual({ line: 3, column: 7 });
		});
	});

	test('the document compiles with svelte 5', () => {
		const raw = [
			'<script>',
			'  let v = $state(1);',
			'  let rest = {};',
			'  const f = () => {};',
			'</script>',
			'',
			'<h2 id="t">Title</h2>',
			'',
			'<warning type="x">',
			'',
			'*bold* <img src="/a.png" {...rest} />',
			'',
			'</warning>',
			'',
			'<div {@attach f} {...rest}>a</div>',
			'',
			'<input bind:value={v}> <svelte:element this="img" src="/b.png" />',
			'',
			'<ol><li>one</li></ol>',
		].join('\n');
		const names = ['h2', 'warning', 'img', 'div', 'input', 'ol', 'li'];
		const { code, warnings } = compile_warned(raw, only(...names), 'all');
		expect(warnings).toHaveLength(1);
		for (const generate of ['client', 'server'] as const) {
			const out = svelte_compile(code, { generate, filename: 'doc.svelte' });
			expect(out.js.code).toContain("from 'mdsvex:components'");
		}
	});

	describe('sourcemaps', () => {
		const raw = [
			'para',
			'',
			'<img',
			'  src={x}',
			'  {...rest} />',
			'',
			'<h2 id="t" {...h}>T</h2> <br>',
		].join('\n');
		const names = ['img', 'h2', 'br'];

		/** the source line from 1 and column the generated text at needle maps to */
		function origin(map: any, code: string, needle: string) {
			const at = code.indexOf(needle);
			expect(at, needle).toBeGreaterThan(-1);
			const before = code.slice(0, at);
			const line = before.split('\n').length;
			const column = at - (before.lastIndexOf('\n') + 1);
			const pos = originalPositionFor(new TraceMap(map), { line, column });
			return [pos.line, pos.column];
		}

		function maps(raw: string) {
			const components = only(...names);
			const session = new CompilerSession();
			const v3 = session.compile_v3(
				raw,
				'doc.svx',
				undefined,
				components,
				undefined,
				undefined,
				undefined,
				'all'
			);
			const mapped = compile(raw, {
				components,
				component_mode: 'all',
				sourcemap: true,
			});
			const trace = session.compile_trace(
				raw,
				undefined,
				components,
				undefined,
				undefined,
				undefined,
				'all'
			);
			return {
				code: v3.code,
				all: [
					v3.map,
					mappings_to_v3(mapped.mappings!, raw, mapped.code, 'doc.svx'),
					trace_to_v3(trace.trace, trace.source, trace.code, 'doc.svx'),
				],
			};
		}

		test('copied attributes map as identity, the rest to the tag', () => {
			const { code, all } = maps(raw);
			expect(JSON.stringify(all[1])).toBe(JSON.stringify(all[0]));
			for (const map of all) {
				expect(origin(map, code, '<Img_MDSVEX_G')).toEqual([3, 0]);
				expect(origin(map, code, 'src={x}')).toEqual([4, 2]);
				expect(origin(map, code, 'x}')).toEqual([4, 7]);
				expect(origin(map, code, '{...rest}')).toEqual([5, 2]);
				expect(origin(map, code, 'rest}')).toEqual([5, 6]);
				expect(origin(map, code, ' />')).toEqual([5, 11]);
				expect(origin(map, code, '<H2_MDSVEX_G')).toEqual([7, 0]);
				expect(origin(map, code, 'id="t"')).toEqual([7, 4]);
				expect(origin(map, code, '{...h}')).toEqual([7, 11]);
				expect(origin(map, code, 'T</H2')).toEqual([7, 18]);
				expect(origin(map, code, '<Br_MDSVEX_G')).toEqual([7, 25]);
			}
		});

		test('crlf positions hold in the raw source', () => {
			const crlf = raw.replace(/\n/g, '\r\n');
			const { code, all } = maps(crlf);
			for (const map of all) {
				expect(origin(map, code, 'src={x}')).toEqual([4, 2]);
				expect(origin(map, code, '{...h}')).toEqual([7, 11]);
			}
		});
	});
});

describe('typed attributes in braces', () => {
	test('spreads, attachments and spaced shorthands keep their braces', () => {
		const raw =
			'<div {...rest} {@attach f} { y } {z} x={x}>a</div>\n\n<img {...r} />';
		const want =
			'<div {...rest} {@attach f} { y } z={z} x={x}>a</div><img {...r} />';
		expect(compile_all(raw, [])).toBe(want);
		const tree = new TreeBuilder(64);
		new PFMParser(tree).parse(raw);
		const renderer = new CursorHTMLRenderer();
		renderer.update(tree.get_buffer(), raw);
		expect(renderer.html).toBe(want);
	});
});

describe('raw html attribute values', () => {
	const cases: [string, string, string][] = [
		[
			'an entity renders as typed',
			'<div title="a &amp; b">x</div>',
			'<div title="a &amp; b">x</div>',
		],
		[
			'bare ampersands and angle brackets render as typed',
			'<div title="a & b < c > d">x</div>',
			'<div title="a & b < c > d">x</div>',
		],
		[
			'a quote from a single quoted value is escaped',
			`<div title='say "hi" &amp; go'>x</div>`,
			'<div title="say &quot;hi&quot; &amp; go">x</div>',
		],
		[
			'an external script renders as typed',
			'<script src="/a.js?x=1&amp;y=2"></script>',
			'<svelte:element this={"script"} src="/a.js?x=1&amp;y=2"></svelte:element>',
		],
		[
			'a self closing tag passes its source through',
			'<img alt="a &amp; b" />',
			'<img alt="a &amp; b" />',
		],
	];

	for (const [name, raw, want] of cases) {
		test(name, () => {
			expect(body(compile_all(raw, []))).toBe(want);
			expect(body(compile_all(raw, only(...ELEMENTS, 'div')))).toBe(want);
		});
	}

	const plugin: ParsePlugin = {
		paragraph: {
			parse(node) {
				node.append('html', {
					tag: 'mark',
					attributes: { title: 'a &amp; <b> "c"' },
				});
			},
		},
	};

	test('a value a plugin set is escaped in full', () => {
		const code = compile('text', { parse_plugins: [plugin] }).code;
		expect(body(code)).toBe(
			'<p><mark title="a &amp;amp; &lt;b&gt; &quot;c&quot;"></mark>text</p>'
		);
		const mapped = compile('text', {
			parse_plugins: [plugin],
			sourcemap: true,
		});
		expect(mapped.code).toBe(code);
	});

	test('a value a plugin set is escaped in full as a prop', () => {
		const code = compile('text', {
			components: only('mark'),
			parse_plugins: [plugin],
		}).code;
		expect(body(code)).toBe(
			'<p><Mark_MDSVEX_G title="a &amp;amp; &lt;b&gt; &quot;c&quot;"></Mark_MDSVEX_G>text</p>'
		);
	});
});

describe('imports', () => {
	test('one named import per used replacement, unused names are not imported', () => {
		const code = compile('# a\n\nb ![c](/c.png)', {
			components: only(...ELEMENTS),
		}).code;
		expect(imports_of(code)).toBe(
			"import { h1 as H1_MDSVEX_G, p as P_MDSVEX_G, img as Img_MDSVEX_G } from 'mdsvex:components';\n"
		);
		expect(code).not.toContain('import *');
	});

	test('a later source wins, each module gets its own statement', () => {
		const components = [
			{ specifier: 'mdsvex:components/0', names: ['p', 'h1'] },
			{ specifier: 'mdsvex:components/1', names: ['p'] },
		];
		const code = compile('# a\n\nb', { components }).code;
		expect(imports_of(code)).toBe(
			"import { h1 as H1_MDSVEX_G } from 'mdsvex:components/0';\n" +
				"import { p as P_MDSVEX_G } from 'mdsvex:components/1';\n"
		);
	});

	test('a specifier that is not a plain path is quoted as json', () => {
		const code = compile('a', {
			components: [{ specifier: "it's", names: ['p'] }],
		}).code;
		expect(imports_of(code)).toBe('import { p as P_MDSVEX_G } from "it\'s";\n');
	});

	test('they join the instance script after its own imports', () => {
		const raw =
			"import X from './x';\n\n<script>\n  let y = 1;\n</script>\n\n# a";
		expect(compile_all(raw, only('h1'))).toBe(
			"<script>\nimport X from './x';\nimport { h1 as H1_MDSVEX_G } from 'mdsvex:components';\n\n  let y = 1;\n</script>" +
				'<H1_MDSVEX_G level={1}>a</H1_MDSVEX_G>'
		);
	});

	test('they join the script hoisted imports start', () => {
		const raw = "import X from './x';\n\n# a";
		expect(compile_all(raw, only('h1'))).toBe(
			"<script>\nimport X from './x';\nimport { h1 as H1_MDSVEX_G } from 'mdsvex:components';\n</script>" +
				'<H1_MDSVEX_G level={1}>a</H1_MDSVEX_G>'
		);
	});

	test('they start a script when there is none, a module script is not one', () => {
		const raw = '<script module>\n  export const a = 1;\n</script>\n\n# a';
		expect(compile_all(raw, only('h1'))).toBe(
			"<script>\nimport { h1 as H1_MDSVEX_G } from 'mdsvex:components';\n</script>" +
				'<script module>\n  export const a = 1;\n</script><H1_MDSVEX_G level={1}>a</H1_MDSVEX_G>'
		);
	});
});

describe('ComponentScope', () => {
	test('closest scope first, then its parent', () => {
		const root = new ComponentScope(
			[{ specifier: 'root', names: ['p', 'img'] }],
			'G'
		);
		const template = new ComponentScope(
			[{ specifier: 'template', names: ['p'] }],
			'T',
			root
		);
		expect(template.get('p')).toEqual({
			name: 'p',
			specifier: 'template',
			local: 'P_MDSVEX_T',
		});
		expect(template.get('img')?.specifier).toBe('root');
		expect(template.get('h1')).toBeUndefined();
		expect(template.size).toBe(3);
	});

	test('locals are identifiers and stay apart', () => {
		const scope = new ComponentScope(
			[{ specifier: 'm', names: ['my-el', 'my_el', '1x'] }],
			'G'
		);
		const locals = ['my-el', 'my_el', '1x'].map((n) => scope.get(n)!.local);
		expect(new Set(locals).size).toBe(3);
		for (const local of locals) expect(local).toMatch(/^[A-Za-z_$][\w$]*$/);
		expect(component_imports(['my-el'].map((n) => scope.get(n)!))).toBe(
			`import { "my-el" as ${locals[0]} } from 'm';\n`
		);
	});
});

describe('walks agree with replacements', () => {
	const files = fixture_files(FIXTURES);
	// some fixtures open with frontmatter that is not yaml, keep it as metadata
	const frontmatter = { parse: (raw: string) => ({ raw }) };

	const modes: [ComponentMode, string[]][] = [
		['markdown', ELEMENTS],
		['all', [...ELEMENTS, 'div', 'span', 'input', 'details', 'summary', 'b']],
	];
	for (const [component_mode, names] of modes) {
		test(`the v3 map equals mappings_to_v3 over the mapped compile, ${component_mode} mode`, () => {
			const components = only(...names);
			const session = new CompilerSession();
			let replaced = 0;
			let with_directives = 0;
			for (const file of files) {
				const raw = readFileSync(file, 'utf8');
				const directives = all_directives(raw);
				if (directives !== undefined) with_directives++;
				const options = { components, directives, component_mode, frontmatter };
				const mapped = compile(raw, { ...options, sourcemap: true });
				const plain = compile(raw, options);
				expect(mapped.code, file).toBe(plain.code);
				if (plain.code.includes('_MDSVEX_G')) replaced++;
				const got = session.compile_v3(
					raw,
					'doc.svx',
					undefined,
					components,
					frontmatter.parse,
					undefined,
					directives,
					component_mode
				);
				expect(got.code, file).toBe(mapped.code);
				expect(JSON.stringify(got.map), file).toBe(
					JSON.stringify(
						mappings_to_v3(mapped.mappings!, raw, mapped.code, 'doc.svx')
					)
				);
				const trace = session.compile_trace(
					raw,
					undefined,
					components,
					frontmatter.parse,
					undefined,
					directives,
					component_mode
				);
				expect(trace.code, file).toBe(mapped.code);
				expect(
					JSON.stringify(
						trace_to_v3(trace.trace, trace.source, trace.code, 'doc.svx')
					),
					file
				).toBe(JSON.stringify(got.map));
			}
			expect(replaced).toBeGreaterThan(100);
			expect(with_directives).toBeGreaterThan(10);
		});
	}

	test('all mode replaces typed elements of the fixtures', () => {
		let typed = 0;
		for (const file of files) {
			const raw = readFileSync(file, 'utf8');
			const code = compile(raw, {
				components: only('div', 'span'),
				directives: all_directives(raw),
				component_mode: 'all',
				frontmatter,
			}).code;
			if (/<(Div|Span)_MDSVEX_G/.test(code)) typed++;
		}
		expect(typed).toBeGreaterThan(5);
	});
});

describe('svelte 5', () => {
	test('a document with every replacement compiles', () => {
		const raw = [
			'# One',
			'',
			'para _em_ *st* ~~del~~ ^sup^ ~sub~ `code` [l](/u "t") ![al](/i.png)',
			'a\\',
			'b',
			'',
			'> quote',
			'',
			'3. a',
			'4. b',
			'',
			'- c',
			'',
			'---',
			'',
			'```js meta',
			'let a = 1;',
			'```',
			'',
			'| a | b |',
			'|:--|--:|',
			'| 1 | 2 |',
		].join('\n');
		const code = compile(raw, { components: only(...ELEMENTS) }).code;
		for (const generate of ['client', 'server'] as const) {
			const out = svelte_compile(code, { generate, filename: 'doc.svelte' });
			expect(out.js.code).toContain("from 'mdsvex:components'");
		}
	});

	test('an unknown component_mode is an error', () => {
		expect(() =>
			compile('a', { components: only('p'), component_mode: 'nope' as any })
		).toThrow(/component_mode/);
	});
});
