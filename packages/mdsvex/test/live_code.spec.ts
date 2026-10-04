import { decode } from '@jridgewell/sourcemap-codec';
import {
	compile as svelte_compile,
	parse as svelte_parse,
} from 'svelte/compiler';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render as svelte_render } from 'svelte/server';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession, highlight_error_at } from '../src/main';
import type {
	ComponentSource,
	HighlightOption,
	Mapping,
	MappingData,
} from '../src/main';
import {
	create_highlight,
	default_annotations,
	eval_annotation,
	load_default_languages,
} from '../src/highlight';
import { meta_parts, read_meta } from '../src/code_meta';
import { live_groups, template_text } from '../src/live_code';

const languages = await load_default_languages();
const highlight = create_highlight({ languages });

const PRE: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['pre'] },
];

/** the code every walk renders, they must agree */
function compile_all(
	raw: string,
	components?: ComponentSource[],
	option: HighlightOption = highlight
): string {
	const plain = compile(raw, { components, highlight: option });
	const mapped = compile(raw, {
		components,
		sourcemap: true,
		highlight: option,
	});
	const session = new CompilerSession();
	const trace = session.compile_trace(
		raw,
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		undefined,
		option
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		undefined,
		option
	);
	for (const other of [mapped, trace, v3]) expect(other.code).toBe(plain.code);
	return plain.code;
}

interface SvelteNode {
	type: string;
	name?: string;
	data?: string;
	expression?: { type: string; name?: string; start: number; end: number };
	fragment?: { nodes: SvelteNode[] };
	[key: string]: unknown;
}

/** every node of the template, depth first */
function walk(nodes: SvelteNode[], out: SvelteNode[] = []): SvelteNode[] {
	for (const node of nodes) {
		out.push(node);
		for (const value of Object.values(node)) {
			if (value === null || typeof value !== 'object') continue;
			const kids = Array.isArray(value)
				? value
				: (value as { nodes?: unknown }).nodes;
			if (Array.isArray(kids)) walk(kids as SvelteNode[], out);
		}
	}
	return out;
}

/** the source of every expression tag svelte reads in code, after it compiles on client and server */
function live_in(code: string): string[] {
	const doc = '<script>let { ...p } = $props();</script>' + code;
	svelte_compile(doc, { generate: 'server', filename: 'doc.svelte' });
	svelte_compile(doc, { generate: 'client', filename: 'doc.svelte' });
	const ast = svelte_parse(doc, { modern: true }) as unknown as {
		fragment: { nodes: SvelteNode[] };
	};
	return walk(ast.fragment.nodes)
		.filter((n) => n.type === 'ExpressionTag' || n.type === 'HtmlTag')
		.map((n) => doc.slice(n.start as number, n.end as number));
}

/** the html svelte renders on the server with the given values in scope */
async function rendered(code: string, values: Record<string, string>) {
	const names = Object.keys(values);
	const script =
		'<script>' +
		names.map((n) => `const ${n} = ${JSON.stringify(values[n])};`).join('') +
		'</script>';
	const { js } = svelte_compile(script + code, {
		generate: 'server',
		filename: 'doc.svelte',
	});
	// inside the package, so the module finds svelte
	const dir = mkdtempSync(
		join(dirname(fileURLToPath(import.meta.url)), '.tmp-')
	);
	try {
		const file = join(dir, 'doc.js');
		writeFileSync(file, js.code);
		const mod = await import(/* @vite-ignore */ pathToFileURL(file).href);
		return svelte_render(mod.default).body;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** the text of html with tags dropped and references decoded */
function text_of(html: string): string {
	return html
		.replace(/<!--[^]*?-->/g, '')
		.replace(/<[^>]*>/g, '')
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&');
}

function warnings(raw: string, option: HighlightOption = highlight) {
	return (compile(raw, { highlight: option }).warnings ?? []).map((w) => [
		w.code,
		w.message,
	]);
}

describe('the [!eval] marker', () => {
	test('is on by default', () => {
		expect(default_annotations).toContain(eval_annotation);
	});

	test('the nested object example makes only the marked group live', () => {
		const raw =
			'```js\nfunction my_func() {\n  console.log({ a: {some_val} }) // [!eval ="{some_val}"]\n}\n```';
		const code = compile_all(raw);
		expect(live_in(code)).toEqual(['{some_val}']);
		expect(code).not.toContain('[!eval');
		expect(text_of(code)).toBe(
			'function my_func() {\n  console.log({ a: {some_val} })\n}'
		);
	});

	test('the shell example makes the command live', () => {
		const raw = '```sh\n{install_command} @pkg/my-pkg # [!eval]\n```';
		const code = compile_all(raw);
		expect(live_in(code)).toEqual(['{install_command}']);
		expect(code).toContain('<span class="tok">{install_command}</span>');
	});

	test('the live value renders as text', async () => {
		const raw =
			'```sh\n{install_command} @pkg/my-pkg # [!eval]\n{other} stays\n```';
		const html = await rendered(compile_all(raw), {
			install_command: 'pnpm add <b>',
		});
		expect(text_of(html)).toBe('pnpm add <b> @pkg/my-pkg\n{other} stays');
		expect(html).toContain('pnpm add &lt;b>');
	});

	test('bare takes every top level group on its line', () => {
		const raw = '```js\nf({a}, {b}) // [!eval]\ng({c})\n```';
		expect(live_in(compile_all(raw))).toEqual(['{a}', '{b}']);
	});

	test('+N takes the lines below', () => {
		const raw =
			'```ts\n// [!eval +2]\nconst url = "{base_url}/api";\nconst key = "{public_key}";\nconst no = "{x}";\n```';
		const code = compile_all(raw);
		expect(live_in(code)).toEqual(['{base_url}', '{public_key}']);
		expect(text_of(code).split('\n')[0]).toBe('const url = "{base_url}/api";');
	});

	test(':N..M takes lines by number', () => {
		const raw = '```js\n// [!eval :2...3]\nf({a})\nf({b})\nf({c})\n```';
		expect(live_in(compile_all(raw))).toEqual(['{a}', '{b}']);
	});

	test('the set form takes each occurrence on the line', () => {
		const raw = '```js\nf({x}, {y}, {x}) // [!eval ="{x}"]\n```';
		expect(live_in(compile_all(raw))).toEqual(['{x}', '{x}']);
	});

	test('the set form with :* takes each occurrence in the fence', () => {
		const raw = '```js\n// [!eval ="{x}" :*]\nf({x})\ng({y}, {x})\n```';
		expect(live_in(compile_all(raw))).toEqual(['{x}', '{x}']);
	});

	test('an anchor range takes the groups between its anchors', () => {
		const raw = '```js\nf({a}, b, {c}, d, {e}) // [!eval b...d]\n```';
		expect(live_in(compile_all(raw))).toEqual(['{c}']);
	});

	test('a pair takes the groups between the two markers', () => {
		const raw =
			'```js\nconst a = {x}; // [!eval a...]\nmid({m})\nf({y}, b); // [!eval ...b]\nafter({z})\n```';
		expect(live_in(compile_all(raw))).toEqual(['{x}', '{m}', '{y}']);
	});

	test('two markers on a line make a group live once', () => {
		const raw = '```js\nf({a}) // [!eval] [!eval ="{a}"]\n```';
		const out = compile(raw, { highlight });
		expect(live_in(out.code)).toEqual(['{a}']);
		expect(out.warnings).toBeUndefined();
	});

	test('{@html} is live', () => {
		const raw = '```js\nf({@html markup}) // [!eval]\n```';
		expect(live_in(compile_all(raw))).toEqual(['{@html markup}']);
	});

	test('strings and template literals inside a group keep their braces', () => {
		const raw = '```js\nf({a ? "}" : `${b}{`}, {\'{\'}) // [!eval]\n```';
		expect(live_in(compile_all(raw))).toEqual(['{a ? "}" : `${b}{`}', "{'{'}"]);
	});

	test('a group inside a string takes the string type', () => {
		const code = compile_all('```js\nconst u = "{base}/x"; // [!eval]\n```');
		expect(code).toContain('{base}');
		expect(live_in(code)).toEqual(['{base}']);
		expect(code).toMatch(/<span class="tok string">\{base\}<\/span>/);
	});

	test('a < and an & in a group stay javascript', () => {
		const code = compile_all('```js\nf({a < b && c}) // [!eval]\n```');
		expect(live_in(code)).toEqual(['{a < b && c}']);
	});

	test('a blank group stays text', () => {
		const code = compile_all('```js\nf({}, {x}) // [!eval]\n```');
		expect(live_in(code)).toEqual(['{x}']);
		expect(text_of(code)).toBe('f({}, {x})');
	});

	test('a marker in a block comment hides whole', () => {
		for (const [lang, line] of [
			['svelte', '<p>{x}</p> <!-- [!eval] -->'],
			['html', '<p>{x}</p> <!-- [!eval] -->'],
			['css', 'a::after { content: "{x}" } /* [!eval ="{x}"] */'],
			['js', 'f({x}) /* [!eval] */'],
		]) {
			const code = compile_all('```' + lang + '\n' + line + '\n```');
			expect(live_in(code), lang).toEqual(['{x}']);
			expect(code, lang).not.toMatch(/\[!eval|\*\/|-->/);
		}
	});

	test('a marker with no group in its range warns', () => {
		expect(warnings('```js\nf(a) // [!eval]\n```')).toEqual([
			[
				'annotation',
				'[!eval] has no {...} group in its range (line 1 of the code)',
			],
		]);
	});

	test('a fence inside a markdown fence stays text', () => {
		// markdown tokenizes it again with offsets into the inner fence
		const raw = '````md\n# hi\n\n```js\nf({y}) // [!eval]\n```\n````';
		const out = compile(raw, { highlight });
		expect(live_in(compile_all(raw))).toEqual([]);
		expect(out.warnings).toBeUndefined();
	});

	test('a document without markers renders as before', () => {
		const raw = '```js\nconst a = { b: `${c}` };\n```';
		const off = create_highlight({ languages, annotations: false });
		expect(compile_all(raw)).toBe(compile_all(raw, undefined, off));
		expect(live_in(compile_all(raw))).toEqual([]);
	});

	test('annotations without eval leave the marker as text', () => {
		const none = create_highlight({ languages, annotations: [] });
		const code = compile_all('```js\nf({a}) // [!eval]\n```', undefined, none);
		expect(live_in(code)).toEqual([]);
		expect(text_of(code)).toBe('f({a}) // [!eval]');
	});
});

describe('groups that can not be live', () => {
	const cases: [string, string, RegExp][] = [
		['unbalanced', 'f({a) // [!eval]', /must close on its line/],
		['unbalanced at the end', 'f({a', /must close on its line/],
		[
			'a stray close',
			'} // [!eval]',
			/a \} in a live range closes no \{ \(line 1, column 1 of the code\)/,
		],
		['an if block', '{#if a}x{/if}', /\{#...\} is a block tag/],
		['an each block', '{#each a as b}', /block tag/],
		['a branch', '{:else}', /block tag/],
		['a close tag', '{/if}', /block tag/],
		['another @ tag', '{@const a = 1}', /not other \{@...\} tags/],
		['an unclosed string', '{"a}', /string in a live expression/],
		['an unclosed template', '{`a}', /template literal in a live/],
	];
	for (const [name, line, error] of cases) {
		test(name, () => {
			// the flag, as a string or regex in js could swallow a marker
			expect(() =>
				compile('text\n\n```eval\n' + line + '\n```', { highlight })
			).toThrow(error);
		});
	}

	test('a marker in a block comment checks its line too', () => {
		expect(() =>
			compile('```js\nf({#if a}) // [!eval]\n```', { highlight })
		).toThrow(/block tag/);
	});

	test('a group must sit on one line', () => {
		expect(() =>
			compile('```js\n// [!eval +2]\nf({\n  a })\n```', { highlight })
		).toThrow(/must close on its line \(line 2, column 3 of the code\)/);
	});

	test('the error says where the fence is', () => {
		expect(() =>
			compile('a\n\nb\n\n```js\nf({a) // [!eval]\n```', {
				highlight,
				filename: 'doc.svx',
			})
		).toThrow(/\(line 1, column 3 of the code\) \(`js` fence at doc\.svx:5\)/);
	});

	test('highlight_error_at gives the line and column of the group', () => {
		const at = (raw: string) => {
			try {
				compile(raw, { highlight });
			} catch (e) {
				return highlight_error_at(e);
			}
			throw new Error('compiled');
		};
		expect(at('a\n\n```js\nx\nf({a) // [!eval]\n```')).toEqual({
			line: 5,
			column: 3,
		});
		expect(at('> q\n>\n> ```js\n> f({a) // [!eval]\n> ```')).toEqual({
			line: 4,
			column: 5,
		});
		expect(at('p\n\n```js {9}\nx\n```')).toEqual({ line: 3, column: 1 });
		expect(highlight_error_at(new Error('x'))).toBeNull();
	});

	test('the scanner reports offsets in the code', () => {
		const out: number[] = [];
		live_groups('x {a} {b} y', 0, 11, out);
		expect(out).toEqual([2, 5, 6, 9]);
		const markers: number[] = [];
		live_groups('{a} [!eval ="{b}"] {c} [!x "]{"]', 0, 32, markers);
		expect(markers).toEqual([0, 3, 19, 22]);
	});
});

describe('the eval fence flag', () => {
	test('makes every group live', () => {
		const raw =
			'```sh eval\n{install_command} @pkg/my-pkg\n{run_command} dev\n```';
		expect(live_in(compile_all(raw))).toEqual([
			'{install_command}',
			'{run_command}',
		]);
	});

	test('works in a language without comments', () => {
		const raw = '```json eval\n["{pkg_name}", "{version}"]\n```';
		expect(live_in(compile_all(raw))).toEqual(['{pkg_name}', '{version}']);
	});

	test('an object literal becomes one expression, which svelte rejects', () => {
		const raw = '```json eval\n{ "name": "{pkg_name}" }\n```';
		expect(compile(raw, { highlight }).code).toContain(
			'<span class="tok">{ "name": "{pkg_name}" }</span>'
		);
		expect(() => live_in(compile(raw, { highlight }).code)).toThrow();
	});

	test('works on a fence with no language', () => {
		for (const fence of ['```eval', '``` eval']) {
			const raw = fence + '\n{install_command} x {@html y}\n```';
			const code = compile_all(raw);
			expect(live_in(code), fence).toEqual(['{install_command}', '{@html y}']);
			expect(code, fence).toMatch(/^<pre class="twinkleplop"><code>/);
			expect(compile(raw, { highlight }).warnings, fence).toBeUndefined();
		}
	});

	test('works on a language mdsvex does not know', () => {
		const out = compile('```nope eval\n{a} b\n```', { highlight });
		expect(live_in(out.code)).toEqual(['{a}']);
		expect(out.warnings?.map((w) => w.code)).toEqual(['unknown_language']);
	});

	test('is claimed, never a meta prop', () => {
		expect(read_meta('eval height=3').props).toEqual([['height', '3']]);
		expect(meta_parts('eval')).toEqual(['eval']);
		const code = compile_all('```sh eval height=3\n{a}\n```', PRE);
		expect(code).toContain('height={"3"}');
		expect(code).not.toMatch(/ eval=\{true\}/);
	});

	test('markers still hide, their braces stay out', () => {
		const raw = '```js eval\nf({a}) // [!eval ="{a}"] [!hl]\n```';
		const code = compile_all(raw);
		expect(live_in(code)).toEqual(['{a}']);
		expect(code).not.toContain('[!');
	});

	test('a brace heavy block fails loudly', () => {
		expect(() =>
			compile('```js eval\nfunction f() {\n}\n```', { highlight })
		).toThrow(/must close on its line \(line 1, column 14 of the code\)/);
	});

	test('a custom highlighter warns and keeps braces as text', () => {
		const custom: HighlightOption = (code) => `<pre><code>${code}</code></pre>`;
		for (const raw of ['```sh eval\n{a}\n```', '```eval\n{a}\n```']) {
			const out = compile(raw, { highlight: custom });
			expect(live_in(out.code)).toEqual([]);
			expect(out.warnings?.map((w) => w.code)).toEqual(['eval_unsupported']);
		}
	});

	test('compile without highlight renders the braces as text', () => {
		const code = compile('```sh eval\n{a}\n```').code;
		expect(live_in(code)).toEqual([]);
	});
});

describe('the code prop of a replaced pre', () => {
	function code_prop(code: string): string {
		const m = / code=\{(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")\}/.exec(code);
		return m![1];
	}

	test('interpolates live groups as a template literal', () => {
		const raw = '```sh\n{install_command} @pkg/my-pkg # [!eval]\n```';
		expect(code_prop(compile_all(raw, PRE))).toBe(
			'`${install_command} @pkg/my-pkg`'
		);
	});

	test('escapes backticks, backslashes and ${ in the static text', () => {
		const raw = '```js\nf(`a\\n${b}`, {c}) // [!eval ="{c}"]\n```';
		const prop = code_prop(compile_all(raw, PRE));
		expect(prop).toBe('`f(\\`a\\\\n\\${b}\\`, ${c})`');
		expect(new Function('c', `return ${prop}`)('C')).toBe('f(`a\\n${b}`, C)');
	});

	test('drops marker lines and {@html} gives its expression', () => {
		const raw = '```js\n// [!eval +1]\nf({@html m})\n```';
		const prop = code_prop(compile_all(raw, PRE));
		expect(new Function('m', `return ${prop}`)('<b>')).toBe('f(<b>)');
	});

	test('stays a string without live groups', () => {
		expect(code_prop(compile_all('```js\nf({a})\n```', PRE))).toBe('"f({a})"');
	});

	test('the template literal compiles with svelte', () => {
		const raw = '```sh eval\n{install_command} `x` \\ $y\n```';
		const code = compile_all(raw, PRE);
		expect(live_in(code.replace(/^<script>[^]*?<\/script>/, ''))).toEqual([
			'{install_command}',
		]);
		expect(code_prop(code)).toBe('`${install_command} \\`x\\` \\\\ $y`');
	});

	test('template literal helper', () => {
		expect(template_text('a`b\\c${d}$e')).toBe('a\\`b\\\\c\\${d}$e');
	});
});

describe('source maps', () => {
	/** the mappings that cover exactly the text in both source and output */
	function exact(
		raw: string,
		code: string,
		mappings: Mapping<MappingData>[],
		text: string
	) {
		return mappings.filter((m) => {
			const s = m.sourceOffsets[0];
			const g = m.generatedOffsets[0];
			const len = m.lengths[0];
			const glen = m.generatedLengths?.[0] ?? len;
			return (
				len === text.length &&
				glen === len &&
				raw.slice(s, s + len) === text &&
				code.slice(g, g + glen) === text
			);
		});
	}

	function check(
		raw: string,
		groups: string[],
		components?: ComponentSource[]
	) {
		const out = compile(raw, {
			highlight,
			sourcemap: true,
			components,
		});
		for (const group of groups) {
			const found = exact(raw, out.code, out.mappings!, group);
			expect(found.length, group).toBe(1);
			expect(found[0].data).toMatchObject({
				role: 'content',
				verification: true,
				completion: true,
				semantic: true,
				navigation: true,
			});
		}
		for (const group of groups) {
			// the code prop of a replaced pre holds it first
			const g = out.code.lastIndexOf(group);
			const over = out.mappings!.filter((m) => {
				if (m.data.role !== 'content') return false;
				const start = m.generatedOffsets[0];
				const end = start + (m.generatedLengths?.[0] ?? m.lengths[0]);
				return start < g + group.length && end > g;
			});
			expect(over.length, group).toBe(1);
		}
		return out;
	}

	test('each live group maps one to one', () => {
		check(
			'# t\n\n```js\nf({a}, {bb}) // [!eval]\nx\ng({ccc}) // [!eval]\n```\n',
			['{a}', '{bb}', '{ccc}']
		);
	});

	test('in a replaced pre', () => {
		check('```sh eval\n{install_command} x\n```', ['{install_command}'], PRE);
	});

	test('in a block quote', () => {
		check('> ```js\n> f({a}) // [!eval]\n> g({bb}) // [!eval]\n> ```', [
			'{a}',
			'{bb}',
		]);
	});

	test('with crlf line ends', () => {
		const raw = 'p\r\n\r\n```js\r\nf({a}) // [!eval]\r\n```\r\n';
		const out = compile(raw, { highlight, sourcemap: true });
		const found = exact(raw, out.code, out.mappings!, '{a}');
		expect(found.length).toBe(1);
	});

	test('the v3 and trace maps point each group at its source', () => {
		const raw = 'p\n\n```js\nf({a}) // [!eval]\n  g({bb}) // [!eval]\n```\n';
		const session = new CompilerSession();
		const v3 = session.compile_v3(
			raw,
			'doc.svx',
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			highlight
		);
		const lines = v3.code.split('\n');
		const decoded = decode(v3.map.mappings);
		for (const group of ['{a}', '{bb}']) {
			const line = lines.findIndex((l) => l.includes(group));
			const column = lines[line].indexOf(group);
			const seg = decoded[line].find((s) => s[0] === column);
			expect(seg, group).toBeDefined();
			const src_lines = raw.split('\n');
			expect(src_lines[seg![2]!].slice(seg![3]!).startsWith(group)).toBe(true);
			const after = decoded[line].find((s) => s[0] === column + group.length);
			expect(after, group).toBeDefined();
		}
	});
});
