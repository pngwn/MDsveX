import {
	compile as svelte_compile,
	parse as svelte_parse,
} from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession } from '../src/main';
import type { ComponentSource, HighlightOption } from '../src/main';
import { create_highlight, load_default_languages } from '../src/highlight';

const DIRECTIVES: ComponentSource[] = [
	{ specifier: 'mdsvex:directives', names: ['note'] },
];

/** the code every walk renders, they must agree */
function compile_all(
	raw: string,
	components?: ComponentSource[],
	highlight?: HighlightOption
): string {
	const plain = compile(raw, { components, directives: DIRECTIVES, highlight });
	const mapped = compile(raw, {
		components,
		directives: DIRECTIVES,
		sourcemap: true,
		highlight,
	});
	const session = new CompilerSession();
	const trace = session.compile_trace(
		raw,
		undefined,
		components,
		undefined,
		undefined,
		DIRECTIVES,
		undefined,
		highlight
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		components,
		undefined,
		undefined,
		DIRECTIVES,
		undefined,
		highlight
	);
	for (const other of [mapped, trace, v3]) expect(other.code).toBe(plain.code);
	return plain.code;
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

interface SvelteNode {
	type: string;
	name?: string;
	data?: string;
	value?: unknown;
	expression?: { type: string; value?: unknown; name?: string };
	attributes?: SvelteNode[];
	fragment?: { nodes: SvelteNode[] };
	body?: { nodes: SvelteNode[] };
	[key: string]: unknown;
}

/** compiles code with svelte and returns the template nodes */
function svelte_nodes(code: string): SvelteNode[] {
	svelte_compile(code, { generate: 'server', filename: 'doc.svelte' });
	svelte_compile(code, { generate: 'client', filename: 'doc.svelte' });
	const ast = svelte_parse(code, { modern: true }) as unknown as {
		fragment: { nodes: SvelteNode[] };
	};
	return ast.fragment.nodes;
}

/** every element or component named name, depth first */
function find_all(nodes: SvelteNode[], name: string, out: SvelteNode[] = []) {
	for (const node of nodes) {
		if (node.name === name) out.push(node);
		for (const value of Object.values(node)) {
			if (value === null || typeof value !== 'object') continue;
			const kids = Array.isArray(value)
				? value
				: (value as { nodes?: unknown }).nodes;
			if (Array.isArray(kids)) find_all(kids as SvelteNode[], name, out);
		}
	}
	return out;
}

/** the text a reader sees in node, an expression would render something else */
function shown(node: SvelteNode): string {
	let text = '';
	for (const child of (node.fragment ?? node.body)!.nodes) {
		if (child.type === 'Text') text += child.data;
		else if (child.type === 'ExpressionTag')
			text += '<expr ' + (child.expression!.name ?? '?') + '>';
		else text += shown(child);
	}
	return text;
}

/** the text of every element named tag, as svelte shows it */
function shown_in(
	raw: string,
	tag: string,
	components?: ComponentSource[],
	highlight?: HighlightOption
) {
	const nodes = svelte_nodes(compile_all(raw, components, highlight));
	return find_all(nodes, tag).map(shown);
}

/** the decoded value of a static attribute */
function attr_value(node: SvelteNode, name: string): string {
	const attr = node.attributes!.find((a) => a.name === name)!;
	return (attr.value as SvelteNode[]).map((v) => v.data).join('');
}

describe('character references', () => {
	test('the text from the issue', () => {
		expect(compile_all('a &lt; b &copy;')).toBe('<p>a &lt; b &copy;</p>');
		expect(shown_in('a &lt; b &copy;', 'p')).toEqual(['a < b ©']);
	});

	test('the raw html from the issue', () => {
		expect(compile_all('<div>a &mdash; b</div>')).toBe(
			'<div>a &mdash; b</div>'
		);
		expect(shown_in('<div>a &mdash; b</div>', 'div')).toEqual(['a — b']);
	});

	const text: [string, string][] = [
		['&#123; &#x7D; &#X41; &#0065;', '{ } A A'],
		['AT&T & b && c', 'AT&T & b && c'],
		[
			'&MadeUp; &copy &#; &#x; &#12345678; &#xabcdefa;',
			'&MadeUp; &copy &#; &#x; &#12345678; &#xabcdefa;',
		],
		['&amp;lt; &AMP; &CounterClockwiseContourIntegral;', '&lt; & ∳'],
		['\\&copy; and \\\\&copy;', '&copy; and \\©'],
		['<b>&copy;</b> _&lt;_', '© <'],
	];
	for (const [raw, want] of text) {
		test(JSON.stringify(raw), () => {
			expect(shown_in(raw, 'p')).toEqual([want]);
		});
	}

	test('a bare & is escaped', () => {
		expect(compile_all('a & b &copy')).toBe('<p>a &amp; b &amp;copy</p>');
	});

	const nested: [string, string, string, string[]][] = [
		['block quote', '> &copy;', 'p', ['©']],
		['list', '- &copy;\n- &lt;', 'li', ['©', '<']],
		['heading', '# &copy;', 'h1', ['©']],
		['table cell', '| &copy; |\n|-|\n| &lt; |', 'td', ['<']],
		['raw html block', '<div>\n\n&copy; &\n\n</div>', 'p', ['© &']],
		['directive label', '::note[&copy; `a`]', 'Note_MDSVEX_D_G', ['© a']],
	];
	for (const [name, raw, tag, want] of nested) {
		test(`inside a ${name}`, () => {
			expect(shown_in(raw, tag)).toEqual(want);
		});
	}

	test('code shows references as written', () => {
		expect(shown_in('`&lt;` and &lt;', 'p')).toEqual(['&lt; and <']);
		expect(compile_all('`&lt; &copy; &`')).toBe(
			'<p><code>&amp;lt; &amp;copy; &amp;</code></p>'
		);
		expect(shown_in('```\n&lt; &copy; &#123;\n```', 'code')).toEqual([
			'&lt; &copy; &#123;',
		]);
	});

	test('link and image attributes keep references', () => {
		const raw =
			'[a &copy;](/x?a=1&amp;b=2&c "t &lt;") ![i &copy;](/i.png?a&amp;b)';
		const nodes = svelte_nodes(compile_all(raw));
		const [a] = find_all(nodes, 'a');
		expect(attr_value(a, 'href')).toBe('/x?a=1&b=2&c');
		expect(attr_value(a, 'title')).toBe('t <');
		expect(shown(a)).toBe('a ©');
		const [img] = find_all(nodes, 'img');
		expect(attr_value(img, 'src')).toBe('/i.png?a&b');
		expect(attr_value(img, 'alt')).toBe('i ©');
	});
});

describe('braces in code (#839)', () => {
	test('the code span from the issue', () => {
		expect(compile_all('Use `{ a: 1 }` here.')).toBe(
			'<p>Use <code>&#123; a: 1 &#125;</code> here.</p>'
		);
		expect(shown_in('Use `{ a: 1 }` here.', 'code')).toEqual(['{ a: 1 }']);
	});

	test('the fence from the issue', () => {
		const raw = '```js\nconst o = { a: 1 };\n```';
		expect(compile_all(raw)).toBe(
			'<pre><code class="language-js">const o = &#123; a: 1 &#125;;</code></pre>'
		);
		expect(shown_in(raw, 'code')).toEqual(['const o = { a: 1 };']);
	});

	test('a code span holding a name shows it, not its value', () => {
		expect(shown_in('`{name}`', 'code')).toEqual(['{name}']);
	});

	test('braces in prose stay expressions', () => {
		expect(shown_in('{name} and `{name}`', 'p')).toEqual([
			'<expr name> and {name}',
		]);
	});

	const nested: [string, string, string, string[]][] = [
		['block quote', '> `{a}`\n>\n> ```\n> {b}\n> ```', 'code', ['{a}', '{b}']],
		['nested block quote', '> > ```\n> > {a}\n> > ```', 'code', ['{a}']],
		['list', '- `{a}`\n- ```\n  {b}\n  ```', 'code', ['{a}', '  {b}']],
		['heading', '# `{a}`', 'code', ['{a}']],
		['link text', '[`{a}`](/x)', 'code', ['{a}']],
		['table cell', '| `{a}` |\n|-|\n| `{b}` |', 'code', ['{a}', '{b}']],
		['inline raw html', '<div>`{a}`</div>', 'code', ['{a}']],
		['raw html block', '<div>\n\n```\n{a}\n```\n\n</div>', 'code', ['{a}']],
		['directive label', '::note[`{a}`]', 'code', ['{a}']],
		['container directive', ':::note[x]\n```\n{a}\n```\n:::', 'code', ['{a}']],
	];
	for (const [name, raw, tag, want] of nested) {
		test(`inside a ${name}`, () => {
			expect(shown_in(raw, tag)).toEqual(want);
		});
	}

	test('the class carries the language, never the meta', () => {
		const raw = '```js {1,3} title="a {b}"\nx\n```';
		expect(compile_all(raw)).toBe(
			'<pre><code class="language-js">x</code></pre>'
		);
	});

	test('a language keeps its braces as text', () => {
		const raw = '```{js}\nx\n```';
		expect(compile_all(raw)).toBe(
			'<pre><code class="language-&#123;js&#125;">x</code></pre>'
		);
		const [code] = find_all(svelte_nodes(compile_all(raw)), 'code');
		expect(attr_value(code, 'class')).toBe('language-{js}');
	});

	test('a pre replacement gets the raw code as a string prop', () => {
		const pre: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['pre', 'code'] },
		];
		const source = 'const s = "&amp;" + {a: 1} + `</script>`;';
		const raw = '```js\n' + source + '\n```';
		const code = compile_all(raw, pre);
		expect(body(code)).toBe(
			'<Pre_MDSVEX_G lang={"js"} code={' +
				JSON.stringify(source) +
				'}><pre><code class="language-js">const s = &quot;&amp;amp;&quot; + &#123;a: 1&#125; + `&lt;/script&gt;`;</code></pre></Pre_MDSVEX_G>'
		);
		const [node] = find_all(svelte_nodes(code), 'Pre_MDSVEX_G');
		const prop = node.attributes!.find((a) => a.name === 'code')!;
		expect((prop.value as SvelteNode).expression!.value).toBe(source);
		expect(find_all(node.fragment!.nodes, 'code').map(shown)).toEqual([source]);
	});

	test('a code replacement shows braces as text', () => {
		const code_only: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['code'] },
		];
		expect(shown_in('`{a} &lt;`', 'Code_MDSVEX_G', code_only)).toEqual([
			'{a} &lt;',
		]);
	});
});

describe('braces in highlighted code', async () => {
	const twinkleplop = create_highlight({
		languages: await load_default_languages(),
	});
	const custom: HighlightOption = (code, { inline }) =>
		inline
			? `<code class="x {i}">${code.replace(/</g, '&lt;')}</code>`
			: `<pre class="x" data-x="{a}"><code>${code.replace(/</g, '&lt;')}</code></pre>`;
	const both: [string, HighlightOption][] = [
		['twinkleplop', twinkleplop],
		['a custom highlighter', custom],
	];
	const pre_code: ComponentSource[] = [
		{ specifier: 'mdsvex:components', names: ['pre', 'code'] },
	];

	for (const [name, highlight] of both) {
		test(`a fence shows its braces as text, ${name}`, () => {
			const raw = '```js\nconst o = { a: `${b}` };\nif (a < b) {}\n```';
			expect(shown_in(raw, 'code', undefined, highlight)).toEqual([
				'const o = { a: `${b}` };\nif (a < b) {}',
			]);
		});

		test(`a #! code span shows its braces as text, ${name}`, () => {
			const raw = 'Use `#!ts { a: 1 }` and `{b}`.';
			expect(shown_in(raw, 'code', undefined, highlight)).toEqual([
				'{ a: 1 }',
				'{b}',
			]);
		});

		test(`a replaced pre and code show braces as text, ${name}`, () => {
			const raw =
				'```svelte title="{t}" x="{y}"\n<p>{a}</p>\n```\n\n`#!js {c}`';
			const nodes = svelte_nodes(compile_all(raw, pre_code, highlight));
			const [pre] = find_all(nodes, 'Pre_MDSVEX_G');
			expect(find_all(pre.fragment!.nodes, 'code').map(shown)).toEqual([
				'<p>{a}</p>',
			]);
			const [code] = find_all(nodes, 'Code_MDSVEX_G');
			expect(shown(code)).toBe('{c}');
		});
	}

	test('the info string never reaches the markup', () => {
		const raw = '```js {1} title="a {b}"\nx\n```';
		const code = compile_all(raw, undefined, twinkleplop);
		expect(code).not.toContain('{');
		expect(code).toContain('a &#123;b&#125;');
	});
});
