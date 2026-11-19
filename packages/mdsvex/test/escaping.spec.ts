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

	test('a backslash escape in a link destination or title is the character alone', () => {
		const raw =
			'[a](/u\\)b "t \\" \\{u\\} \\&amp;") ![i](/i\\(1\\).png "\\{t\\}")';
		const nodes = svelte_nodes(compile_all(raw));
		const [a] = find_all(nodes, 'a');
		expect(attr_value(a, 'href')).toBe('/u)b');
		expect(attr_value(a, 'title')).toBe('t " {u} &amp;');
		const [img] = find_all(nodes, 'img');
		expect(attr_value(img, 'src')).toBe('/i(1).png');
		expect(attr_value(img, 'title')).toBe('{t}');
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
		['list', '- `{a}`\n- ```\n  {b}\n  ```', 'code', ['{a}', '{b}']],
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

	test('a pre replacement gets meta props as strings', () => {
		const pre: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['pre'] },
		];
		const raw = '```js title="{t}" caption="</script>" x="{y}" flag\na\n```';
		const [node] = find_all(
			svelte_nodes(compile_all(raw, pre)),
			'Pre_MDSVEX_G'
		);
		const props: Record<string, unknown> = {};
		for (const a of node.attributes!)
			props[a.name] =
				a.value === true ? true : (a.value as SvelteNode).expression!.value;
		expect(props).toEqual({
			lang: 'js',
			meta: 'title="{t}" caption="</script>" x="{y}" flag',
			title: '{t}',
			caption: '</script>',
			x: '{y}',
			flag: true,
			code: 'a',
		});
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

describe('braces escaped with a backslash (#995)', () => {
	test('the paragraph from the issue', () => {
		expect(compile_all('a \\{1 + 1\\} b')).toBe('<p>a &#123;1 + 1&#125; b</p>');
		expect(shown_in('a \\{1 + 1\\} b', 'p')).toEqual(['a {1 + 1} b']);
	});

	test('text that is not javascript compiles', () => {
		expect(shown_in('\\{ some code \\}', 'p')).toEqual(['{ some code }']);
		expect(shown_in('a \\{ b', 'p')).toEqual(['a { b']);
		expect(shown_in('\\{\\}', 'p')).toEqual(['{}']);
		expect(shown_in('\\{#if x}', 'p')).toEqual(['{#if x}']);
	});

	test.each([
		['# h \\{x\\}', 'h1', 'h {x}'],
		['- \\{x\\}', 'li', '{x}'],
		['> \\{x\\}', 'p', '{x}'],
		['*\\{x\\}*', 'strong', '{x}'],
		['_\\{x\\}_', 'em', '{x}'],
		['[\\{x\\}](/u)', 'a', '{x}'],
		['| a |\n|-|\n| \\{x\\} |', 'td', '{x}'],
		['| \\{x\\} |\n|-|', 'th', '{x}'],
		['<span>\\{x\\}</span>', 'span', '{x}'],
		['<div>\n\n\\{x\\}\n\n</div>', 'p', '{x}'],
		['a\\\n\\{x\\}', 'p', 'a\n{x}'],
	])('%s', (raw, tag, text) => {
		expect(shown_in(raw, tag)).toEqual([text]);
	});

	test('in the text a replaced element gets', () => {
		const p: ComponentSource[] = [{ specifier: './c.js', names: ['p'] }];
		const nodes = svelte_nodes(compile_all('a \\{x\\} b', p));
		const [el] = find_all(nodes, 'P_MDSVEX_G');
		expect(shown(el)).toBe('a {x} b');
	});

	test('in the text of a directive', () => {
		const nodes = svelte_nodes(compile_all(':::note\n\\{x\\}\n:::'));
		expect(find_all(nodes, 'p').map(shown)).toEqual(['{x}']);
	});

	test('in the alt of an image', () => {
		const code = compile_all('![a \\{x\\} b](/u.png)');
		expect(code).toBe('<p><img src="/u.png" alt="a &#123;x&#125; b" /></p>');
		const [img] = find_all(svelte_nodes(code), 'img');
		expect(attr_value(img, 'alt')).toBe('a {x} b');
	});

	test('an unescaped brace is still an expression', () => {
		expect(compile_all('a {1 + 1} b')).toBe('<p>a {1 + 1} b</p>');
		expect(compile_all('a \\\\{x} b')).toBe('<p>a \\{x} b</p>');
		expect(shown_in('<script>let x = 1;</script>\n\na \\\\{x} b', 'p')).toEqual(
			['a \\<expr x> b']
		);
	});

	test('a brace after an escaped backslash and an escaped one', () => {
		expect(compile_all('a \\\\\\{x\\} b')).toBe('<p>a \\&#123;x&#125; b</p>');
	});

	test('random text keeps every expression and no other brace', () => {
		let seed = 995;
		const rand = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const pieces = [
			'a',
			' ',
			'\\{',
			'\\}',
			'{x}',
			'\\\\',
			'*',
			'_',
			'\n',
			'# ',
			'- ',
		];
		for (let i = 0; i < 300; i++) {
			let raw = 'a';
			let expressions = 0;
			const length = 1 + Math.floor(rand() * 8);
			for (let k = 0; k < length; k++) {
				const piece = pieces[Math.floor(rand() * pieces.length)];
				if (piece === '{x}') expressions++;
				raw += piece;
			}
			const code = compile_all(raw);
			const rest = code.split('{x}');
			expect(rest.length - 1, JSON.stringify(raw)).toBe(expressions);
			expect(rest.join(''), JSON.stringify(raw)).not.toMatch(/[{}]/);
		}
	});

	test('the other ways to write a brace are as they were', () => {
		expect(compile_all('&#123; &lbrace; `{`')).toBe(
			'<p>&#123; &lbrace; <code>&#123;</code></p>'
		);
		expect(compile_all("{'{'}")).toBe("<p>{'{'}</p>");
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
