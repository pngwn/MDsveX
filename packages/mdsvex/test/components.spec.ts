import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';
import { mappings_to_v3 } from '@mdsvex/render/sourcemap';
import { ComponentScope, component_imports } from '@mdsvex/render/html-cursor';

import { compile, CompilerSession } from '../src/main';
import type { ComponentSource, ParsePlugin } from '../src/main';

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
function compile_all(raw: string, components: ComponentSource[]): string {
	const plain = compile(raw, { components }).code;
	expect(compile(raw, { components, sourcemap: true }).code).toBe(plain);
	const session = new CompilerSession();
	expect(session.compile_trace(raw, undefined, components).code).toBe(plain);
	expect(session.compile_v3(raw, 'doc.svx', undefined, components).code).toBe(
		plain
	);
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
				'<code class="language-js title=&quot;x&quot; {1}">let a = {b: &quot;&lt;/script&gt;&quot;};</code></Pre_MDSVEX_G>',
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
			expect(session.compile(raw, { components, frontmatter }).code, file).toBe(
				compile(raw, { frontmatter }).code
			);
		}
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
	const components = only(...ELEMENTS);
	// some fixtures open with frontmatter that is not yaml, keep it as metadata
	const frontmatter = { parse: (raw: string) => ({ raw }) };

	test('the v3 map equals mappings_to_v3 over the mapped compile', () => {
		const session = new CompilerSession();
		let replaced = 0;
		for (const file of files) {
			const raw = readFileSync(file, 'utf8');
			const mapped = compile(raw, { components, sourcemap: true, frontmatter });
			const plain = compile(raw, { components, frontmatter });
			expect(mapped.code, file).toBe(plain.code);
			if (plain.code.includes('_MDSVEX_G')) replaced++;
			const got = session.compile_v3(
				raw,
				'doc.svx',
				undefined,
				components,
				frontmatter.parse
			);
			expect(got.code, file).toBe(mapped.code);
			expect(JSON.stringify(got.map), file).toBe(
				JSON.stringify(
					mappings_to_v3(mapped.mappings!, raw, mapped.code, 'doc.svx')
				)
			);
			expect(
				session.compile_trace(raw, undefined, components, frontmatter.parse)
					.code,
				file
			).toBe(mapped.code);
		}
		expect(replaced).toBeGreaterThan(100);
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

	test('an unknown component_mode is an error, all is accepted', () => {
		expect(() =>
			compile('a', { components: only('p'), component_mode: 'nope' as any })
		).toThrow(/component_mode/);
		expect(
			compile('a', { components: only('p'), component_mode: 'all' }).code
		).toContain('<P_MDSVEX_G>');
	});
});
