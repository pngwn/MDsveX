import { describe, expect, test } from 'vitest';
import {
	compile as svelte_compile,
	parse as svelte_parse,
} from 'svelte/compiler';
import type { ParsePlugin } from '@mdsvex/parse';

import {
	compile,
	CompilerSession,
	FrontmatterError,
	mdsvex,
} from '../src/main';
import type { CompileOptions } from '../src/main';

/** the metadata the module script exports, as svelte parses it */
function metadata_in(code: string): unknown {
	const ast = svelte_parse(code, { modern: true });
	const module = ast.module;
	expect(module).toBeTruthy();
	const content = module!.content as any;
	const decl = content.body.find(
		(n: any) =>
			n.type === 'ExportNamedDeclaration' &&
			n.declaration?.declarations?.[0]?.id?.name === 'metadata'
	);
	expect(decl).toBeTruthy();
	const init = decl.declaration.declarations[0].init;
	return JSON.parse(code.slice(init.start, init.end));
}

function compile_all(raw: string, options?: CompileOptions) {
	const results = [
		compile(raw, options),
		compile(raw, { ...options, sourcemap: true }),
		new CompilerSession().compile(raw, options),
		new CompilerSession().compile_v3(
			raw,
			'doc.md',
			options?.parse_plugins,
			options?.components,
			options?.frontmatter?.parse
		),
		new CompilerSession().compile_trace(
			raw,
			options?.parse_plugins,
			options?.components,
			options?.frontmatter?.parse
		),
	];
	for (const r of results) {
		expect(r.code).toBe(results[0].code);
		expect(r.metadata).toEqual(results[0].metadata);
	}
	return results[0];
}

describe('frontmatter metadata', () => {
	test('exports the metadata from a module script', () => {
		const { code, metadata } = compile_all(
			'---\ntitle: Hello\ntags: [a, b]\n---\n\n# Hello\n'
		);
		expect(metadata).toEqual({ title: 'Hello', tags: ['a', 'b'] });
		expect(code).toBe(
			'<script module>\nexport const metadata = {"title":"Hello","tags":["a","b"]};\n</script><h1>Hello</h1>'
		);
		expect(metadata_in(code)).toEqual(metadata);
		svelte_compile(code, { generate: 'server' });
	});

	test('documents without frontmatter are unchanged', () => {
		const { code, metadata } = compile_all('# Hello\n\n---\n\ntext\n');
		expect(metadata).toBeUndefined();
		expect(code).toBe('<h1>Hello</h1><hr /><p>text</p>');
	});

	test('empty frontmatter exports an empty object', () => {
		const { code, metadata } = compile_all('---\n---\n\ntext\n');
		expect(metadata).toEqual({});
		expect(code).toBe(
			'<script module>\nexport const metadata = {};\n</script><p>text</p>'
		);
	});

	test.each([
		'<script module>',
		'<script module lang="ts">',
		'<script lang="ts" module>',
		'<script context="module">',
		'<script context=\'module\' lang="ts">',
	])('merges into an existing %s (#261)', (open) => {
		const raw = `---\ntitle: Hi\n---\n\n${open}\n  export const extra = 1;\n</script>\n\n<script>\n  let x = 1;\n</script>\n\n# {metadata.title}\n`;
		const { code } = compile_all(raw);
		expect(code.match(/<script/g)!.length).toBe(2);
		// the renderer writes attributes with double quotes
		expect(code).toContain(
			`${open.replace(/'/g, '"')}\nexport const metadata = {"title":"Hi"};\n\n  export const extra = 1;\n</script>`
		);
		expect(metadata_in(code)).toEqual({ title: 'Hi' });
		svelte_compile(code, { generate: 'server' });
	});

	test('a module script in one document does not suppress the next', () => {
		const session = new CompilerSession();
		for (const run of [compile, session.compile.bind(session)]) {
			run('---\na: 1\n---\n\n<script module>\n</script>\n');
			expect(run('---\nb: 2\n---\n\ntext\n').code).toBe(
				'<script module>\nexport const metadata = {"b":2};\n</script><p>text</p>'
			);
		}
	});

	test('sits beside the script that imports replacements', () => {
		const { code } = compile_all('---\ntitle: Hi\n---\n\n# Hi\n', {
			components: [{ specifier: 'mdsvex:components', names: ['h1'] }],
		});
		expect(code).toBe(
			"<script>\nimport { h1 as H1_MDSVEX_G } from 'mdsvex:components';\n</script>" +
				'<script module>\nexport const metadata = {"title":"Hi"};\n</script>' +
				'<H1_MDSVEX_G level={1}>Hi</H1_MDSVEX_G>'
		);
		svelte_compile(code, { generate: 'server' });
	});

	test('merges into a module script written after the markdown', () => {
		const raw =
			'---\ntitle: Hi\n---\n\n# Hi\n\n<script module>\n  export const extra = 1;\n</script>\n';
		const { code } = compile_all(raw);
		expect(code).toBe(
			'<h1>Hi</h1><script module>\nexport const metadata = {"title":"Hi"};\n\n  export const extra = 1;\n</script>'
		);
	});

	test.each([
		['</script>', 'a</script><script>alert(1)</script>b'],
		['</style>', '</style><style>body{}</style>'],
		['upper case tags', '</SCRIPT></Style >'],
		['an opening tag', '<script src=x.js>'],
	])('escapes %s in strings', (_, value) => {
		const raw = `---\ntitle: '${value}'\nnested:\n  - "${value}"\n---\n\nbody\n`;
		const { code, metadata } = compile_all(raw);
		expect(metadata).toEqual({ title: value, nested: [value] });
		expect(code.match(/<\/?script/gi)!.length).toBe(2);
		expect(code.match(/<\/?style/gi)).toBeNull();
		expect(metadata_in(code)).toEqual(metadata);
		svelte_compile(code, { generate: 'server' });
	});

	test('keeps other < in strings readable', () => {
		const { code } = compile('---\nmath: a < b <em>\n---\n');
		expect(code).toContain('"math":"a < b <em>"');
	});

	test('crlf documents give the same metadata and code as lf', () => {
		const lf = '---\ntitle: x\ntext: |\n  a\n  b\n---\n\n# x\n';
		const crlf = lf.replace(/\n/g, '\r\n');
		const a = compile_all(crlf);
		const b = compile_all(lf);
		expect(a.metadata).toEqual({ title: 'x', text: 'a\nb\n' });
		expect(a.metadata).toEqual(b.metadata);
		expect(a.code).toBe(b.code);
	});

	test('parse plugins keep the metadata', () => {
		const plugin: ParsePlugin = { heading: { parse() {} } };
		const { code, metadata } = compile_all('---\ntitle: P\n---\n\n# P\n', {
			parse_plugins: [plugin],
		});
		expect(metadata).toEqual({ title: 'P' });
		expect(code).toContain('export const metadata = {"title":"P"};');
	});
});

describe('frontmatter.parse', () => {
	test('replaces the built in parser', () => {
		const seen: string[] = [];
		const parse = (raw: string) => {
			seen.push(raw);
			return { custom: raw.trim().toUpperCase() };
		};
		const { code, metadata } = compile_all(
			'---\r\nanything: &goes\r\n---\r\n\r\ntext\r\n',
			{ frontmatter: { parse } }
		);
		expect(seen.every((s) => s === 'anything: &goes\n')).toBe(true);
		expect(metadata).toEqual({ custom: 'ANYTHING: &GOES' });
		expect(code).toContain(
			'export const metadata = {"custom":"ANYTHING: &GOES"};'
		);
	});

	test('null or undefined is no metadata', () => {
		for (const value of [null, undefined]) {
			const { metadata, code } = compile('---\nx\n---\n', {
				frontmatter: { parse: () => value },
			});
			expect(metadata).toEqual({});
			expect(code).toContain('export const metadata = {};');
		}
	});

	test('a value that is not an object throws', () => {
		for (const value of [[1], 'text', 3]) {
			expect(() =>
				compile('---\nx\n---\n', {
					frontmatter: { parse: () => value as any },
				})
			).toThrow(FrontmatterError);
		}
	});

	test('its errors reach the caller', () => {
		const parse = () => {
			throw new SyntaxError('bad yaml');
		};
		expect(() => compile('---\nx\n---\n', { frontmatter: { parse } })).toThrow(
			'bad yaml'
		);
	});
});

describe('unsupported frontmatter', () => {
	test('names the document line and suggests a parse function', () => {
		const raw = '---\ntitle: x\nbase: &base\n  a: 1\n---\n\ntext\n';
		let error: unknown;
		try {
			compile(raw);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(FrontmatterError);
		const fe = error as FrontmatterError;
		expect(fe.line).toBe(3);
		expect(fe.column).toBe(7);
		expect(fe.message).toContain('line 3');
		expect(fe.message).toContain("anchors (&) aren't supported");
		expect(fe.message).toContain('frontmatter: { parse:');
	});

	test('lines count the same with crlf', () => {
		expect(() => compile('---\r\na: 1\r\n\r\nb: *x\r\n---\r\n')).toThrow(
			/line 4/
		);
	});

	test('a later compile still works', () => {
		expect(() => compile('---\na: *x\n---\n')).toThrow(FrontmatterError);
		expect(compile('---\na: 1\n---\n').metadata).toEqual({ a: 1 });
	});
});

describe('vite plugin', () => {
	test('passes frontmatter options to the compile', () => {
		const [pre] = mdsvex({
			frontmatter: { parse: () => ({ from: 'option' }) },
		}) as any[];
		const out = pre.transform('---\nignored\n---\n\n# Hi\n', '/doc.svx');
		expect(out.code).toBe(
			'<script module>\nexport const metadata = {"from":"option"};\n</script><h1>Hi</h1>'
		);
	});

	test('exports metadata with the built in parser', () => {
		const [pre] = mdsvex() as any[];
		const out = pre.transform('---\ntitle: Vite\n---\n\n# Hi\n', '/doc.svx');
		expect(metadata_in(out.code)).toEqual({ title: 'Vite' });
	});
});
