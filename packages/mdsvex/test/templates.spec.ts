import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';
import { mappings_to_v3 } from '@mdsvex/render/sourcemap';
import { component_imports } from '@mdsvex/render/html-cursor';

import { compile, CompilerSession, FrontmatterError } from '../src/main';
import type {
	CompileOptions,
	ComponentSource,
	TemplateEntry,
} from '../src/main';
import { all_directives } from './utils';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

const POST: TemplateEntry = { specifier: 'mdsvex:template/post' };
const DOCS: TemplateEntry = {
	specifier: 'mdsvex:template/docs',
	components: ['h1', 'p'],
};
const ROOT: ComponentSource[] = [
	{ specifier: 'mdsvex:components', names: ['p', 'img'] },
];

/** the template module a document imports, null when it is not wrapped */
function wrapped_in(code: string): string | null {
	const m = /import Template_MDSVEX[^;]* from '([^']+)';/.exec(code);
	return m === null ? null : m[1];
}

/** every walk must render the same html, the vite plugin uses the trace one */
function compile_all(raw: string, options: CompileOptions): string {
	const plain = compile(raw, options).code;
	expect(compile(raw, { ...options, sourcemap: true }).code).toBe(plain);
	const session = new CompilerSession();
	expect(
		session.compile_trace(
			raw,
			undefined,
			options.components,
			undefined,
			options
		).code
	).toBe(plain);
	expect(
		session.compile_v3(
			raw,
			'doc.svx',
			undefined,
			options.components,
			undefined,
			options
		).code
	).toBe(plain);
	return plain;
}

function error_of(fn: () => unknown): Error {
	try {
		fn();
	} catch (e) {
		return e as Error;
	}
	throw new Error('expected a throw');
}

describe('template selection', () => {
	const templates = { default: POST, post: POST, docs: DOCS };

	test('frontmatter template: false wraps nothing, ahead of select_template', () => {
		const result = compile('---\ntemplate: false\n---\n\n# Hi\n', {
			templates,
			select_template: () => 'docs',
		});
		expect(wrapped_in(result.code)).toBeNull();
		expect(result.template).toBeUndefined();
	});

	test('frontmatter template: <name> picks that template', () => {
		const result = compile('---\ntemplate: docs\n---\n\n# Hi\n', {
			templates,
			select_template: () => 'post',
		});
		expect(wrapped_in(result.code)).toBe('mdsvex:template/docs');
		expect(result.template).toBe('docs');
	});

	test('select_template runs without a frontmatter template key', () => {
		const seen: unknown[] = [];
		const select = (metadata: Record<string, unknown>) => {
			seen.push(metadata);
			return metadata.kind === 'guide' ? 'docs' : undefined;
		};
		const guide = compile('---\nkind: guide\n---\n\n# Hi\n', {
			templates,
			select_template: select,
		});
		expect(guide.template).toBe('docs');
		// undefined falls through to the default entry
		expect(
			compile('# no frontmatter\n', { templates, select_template: select })
				.template
		).toBe('default');
		expect(seen).toEqual([{ kind: 'guide' }, {}]);
		// false is none even with a default
		expect(
			compile('# Hi\n', { templates, select_template: () => false }).template
		).toBeUndefined();
	});

	test('the default entry, default_template in its place, otherwise none', () => {
		expect(compile('# Hi\n', { templates }).template).toBe('default');
		expect(
			compile('# Hi\n', { templates, default_template: 'docs' }).template
		).toBe('docs');
		const none = compile('# Hi\n', { templates: { post: POST } });
		expect(none.template).toBeUndefined();
		expect(none.code).toBe('<h1>Hi</h1>');
		expect(compile('# Hi\n').code).toBe('<h1>Hi</h1>');
	});

	test('the template option comes ahead of the frontmatter', () => {
		const raw = '---\ntemplate: docs\n---\n\n# Hi\n';
		expect(compile(raw, { templates, template: 'post' }).template).toBe('post');
		expect(compile(raw, { templates, template: false }).template).toBe(
			undefined
		);
	});

	test('a template key that is not a key of the object picks nothing inherited', () => {
		const error = error_of(() =>
			compile('---\ntemplate: toString\n---\n# Hi\n', { templates })
		);
		expect(error.message).toContain('Unknown template "toString"');
	});
});

describe('template errors', () => {
	const templates = { default: POST, docs: DOCS };

	test('an unknown frontmatter name lists the known names at its line', () => {
		const error = error_of(() =>
			compile('---\ntitle: Hi\ntemplate: blog\n---\n\n# Hi\n', { templates })
		);
		expect(error).toBeInstanceOf(FrontmatterError);
		expect(error.message).toBe(
			'Unknown template "blog" from frontmatter. Known templates: default, docs (frontmatter line 3)'
		);
		expect((error as FrontmatterError).line).toBe(3);
	});

	test('a frontmatter name without any templates says none are configured', () => {
		expect(
			error_of(() => compile('---\ntemplate: blog\n---\n# Hi\n')).message
		).toBe(
			'Unknown template "blog" from frontmatter. No templates are configured (frontmatter line 2)'
		);
	});

	test('unknown names from select_template, default_template and the option', () => {
		expect(
			error_of(() =>
				compile('# Hi\n', { templates, select_template: () => 'blog' })
			).message
		).toBe(
			'[mdsvex] Unknown template "blog" from select_template. Known templates: default, docs'
		);
		expect(
			error_of(() => compile('# Hi\n', { templates, default_template: 'x' }))
				.message
		).toContain('Unknown template "x" from default_template');
		expect(
			error_of(() => compile('# Hi\n', { templates, template: 'x' })).message
		).toContain('Unknown template "x" from the template option');
	});

	test('a template value that is not a name or false', () => {
		const error = error_of(() =>
			compile('---\ntemplate: 1\n---\n# Hi\n', { templates })
		);
		expect(error.message).toBe(
			'template must be the name of a template or false, got 1 (frontmatter line 2)'
		);
		expect(
			error_of(() =>
				compile('# Hi\n', { templates, select_template: () => 1 as any })
			).message
		).toContain('select_template must return a template name');
	});

	test('a frontmatter children key is an error at its line when wrapped', () => {
		const raw = '---\ntitle: Hi\n\nchildren: 3\n---\n\n# Hi\n';
		const error = error_of(() => compile(raw, { templates }));
		expect(error).toBeInstanceOf(FrontmatterError);
		expect(error.message).toBe(
			'The frontmatter key children collides with the children of template "default", rename it (frontmatter line 4)'
		);
		expect((error as FrontmatterError).line).toBe(4);
		// without a template it is just metadata
		expect(compile(raw).metadata).toEqual({ title: 'Hi', children: 3 });
	});

	test('the children line through a frontmatter parser', () => {
		const error = error_of(() =>
			compile('---\ntitle = "a"\nchildren = 1\n---\n# Hi\n', {
				templates,
				frontmatter: { parse: () => ({ children: 1 }) },
			})
		) as FrontmatterError;
		expect(error.line).toBe(3);
	});

	test('a throw leaves the shared compiler usable', () => {
		error_of(() => compile('---\ntemplate: nope\n---\n# Hi\n', { templates }));
		expect(compile('# Hi\n').code).toBe('<h1>Hi</h1>');
	});
});

describe('the wrapper', () => {
	const templates = { default: POST };

	test('wraps the body, spreading metadata and the document props', () => {
		const code = compile_all('---\ntitle: Hello\n---\n\n# Hi\n\ntext\n', {
			templates,
		});
		expect(code).toBe(
			"<script>\nimport Template_MDSVEX from 'mdsvex:template/post';\n" +
				'let __mdsvex_props = $props();\n</script>' +
				'<script module>\nexport const metadata = {"title":"Hello"};\n</script>' +
				'<Template_MDSVEX {...metadata} {...__mdsvex_props}><h1>Hi</h1><p>text</p></Template_MDSVEX>'
		);
	});

	test('no frontmatter spreads no metadata', () => {
		expect(compile_all('# Hi\n', { templates })).toBe(
			"<script>\nimport Template_MDSVEX from 'mdsvex:template/post';\n" +
				'let __mdsvex_props = $props();\n</script>' +
				'<Template_MDSVEX {...__mdsvex_props}><h1>Hi</h1></Template_MDSVEX>'
		);
	});

	test('hoists scripts, styles and top level svelte elements in document order', () => {
		const raw = [
			'---',
			'title: Hi',
			'---',
			'',
			'<script>',
			"  import Aside from './Aside.svelte';",
			'</script>',
			'',
			'<svelte:head><title>T</title></svelte:head>',
			'',
			'# Hello',
			'',
			'<svelte:window onkeydown={key} />',
			'',
			'<Aside>',
			'',
			'inside',
			'',
			'</Aside>',
			'',
			'<svelte:options runes />',
			'',
			'<svelte:body onclick={f} />',
			'',
			'<svelte:document onvisibilitychange={g} />',
			'',
			'<script module>',
			'  export const a = 1;',
			'</script>',
			'',
			'<style>',
			'  h1 { color: red }',
			'</style>',
			'',
			'last',
			'',
		].join('\n');
		const code = compile_all(raw, { templates });
		const open = code.indexOf('<Template_MDSVEX');
		const before = code.slice(0, open);
		const inside = code.slice(open);
		for (const hoisted of [
			'export const metadata',
			"import Aside from './Aside.svelte';",
			'<svelte:head><title>T</title></svelte:head>',
			'<svelte:window onkeydown={key} />',
			'<svelte:options runes />',
			'<svelte:body onclick={f} />',
			'<svelte:document onvisibilitychange={g} />',
			'export const a = 1;',
			'h1 { color: red }',
		])
			expect(before).toContain(hoisted);
		expect(before.indexOf('<svelte:head>')).toBeLessThan(
			before.indexOf('<svelte:window')
		);
		expect(before.indexOf('<svelte:document')).toBeLessThan(
			before.indexOf('<style>')
		);
		expect(inside).toMatch(
			/^<Template_MDSVEX \{\.\.\.metadata\} \{\.\.\.__mdsvex_props\}>[^]*<h1>Hello<\/h1>[^]*<Aside>[^]*<p>inside<\/p>[^]*<\/Aside>[^]*<p>last<\/p>[^]*<\/Template_MDSVEX>$/
		);
		// the template import joins the instance script of the document
		expect(before).toContain(
			"<script>\nimport Template_MDSVEX from 'mdsvex:template/post';\nlet __mdsvex_props = $props();\n\n  import Aside"
		);
		expect(() => svelte_compile(code, { generate: 'server' })).not.toThrow();
	});

	test('an external script is markup and stays inside', () => {
		const code = compile_all('<script src="/x.js"></script>\n\n# Hi\n', {
			templates,
		});
		expect(code).toContain(
			'<Template_MDSVEX {...__mdsvex_props}><svelte:element this={"script"} src="/x.js"></svelte:element>'
		);
	});

	test('bare import statements start the instance script', () => {
		expect(
			compile_all("import A from './A.svelte';\n\n<A />\n", { templates })
		).toBe(
			"<script>\nimport A from './A.svelte';\n" +
				"import Template_MDSVEX from 'mdsvex:template/post';\n" +
				'let __mdsvex_props = $props();\n</script>' +
				'<Template_MDSVEX {...__mdsvex_props}><A /></Template_MDSVEX>'
		);
	});

	test('a document binding its own props forwards that binding', () => {
		const code = compile_all(
			'<script lang="ts">\n  let props: { a?: number } = $props();\n</script>\n\n{props.a}\n',
			{ templates }
		);
		expect(code).not.toContain('__mdsvex_props');
		expect(code).toContain('<Template_MDSVEX {...props}>');
		expect(() =>
			svelte_compile(
				code.replace(' lang="ts"', '').replace(': { a?: number }', ''),
				{
					generate: 'server',
				}
			)
		).not.toThrow();
	});

	test('a document destructuring its props forwards none, $props() stays single', () => {
		const code = compile_all(
			'<script>\n  let { a } = $props();\n</script>\n\n{a}\n',
			{ templates }
		);
		expect(code).toContain('<Template_MDSVEX>');
		expect(code.match(/\$props\(\)/g)).toHaveLength(1);
		expect(() => svelte_compile(code, { generate: 'server' })).not.toThrow();
	});

	test('the cached incremental render is never wrapped', async () => {
		const { CursorHTMLRenderer } = await import('@mdsvex/render/html-cursor');
		const { PFMParser } = await import('@mdsvex/parse');
		const { TreeBuilder } = await import('@mdsvex/parse/tree-builder');
		const tree = new TreeBuilder(64);
		new PFMParser(tree).parse('# Hi\n');
		const renderer = new CursorHTMLRenderer();
		renderer.template = { specifier: 'T', metadata: false };
		renderer.update(tree.get_buffer(), '# Hi\n');
		expect(renderer.html).toBe('<h1>Hi</h1>');
	});
});

describe('template replacements', () => {
	test('chain in front of the root fallback, closest first', () => {
		const code = compile_all('# Hi\n\ntext ![cat](/c.png)\n', {
			templates: { default: DOCS },
			components: ROOT,
		});
		expect(code).toBe(
			'<script>\n' +
				"import Template_MDSVEX, { h1 as H1_MDSVEX_T, p as P_MDSVEX_T } from 'mdsvex:template/docs';\n" +
				"import { img as Img_MDSVEX_G } from 'mdsvex:components';\n" +
				'let __mdsvex_props = $props();\n</script>' +
				'<Template_MDSVEX {...__mdsvex_props}>' +
				'<H1_MDSVEX_T level={1}>Hi</H1_MDSVEX_T>' +
				'<P_MDSVEX_T>text <Img_MDSVEX_G src="/c.png" alt="cat" /></P_MDSVEX_T>' +
				'</Template_MDSVEX>'
		);
	});

	test('template: false keeps only the root fallback', () => {
		const code = compile_all('---\ntemplate: false\n---\n\n# Hi\n\ntext\n', {
			templates: { default: DOCS },
			components: ROOT,
		});
		expect(code).toContain('<h1>Hi</h1><P_MDSVEX_G>text</P_MDSVEX_G>');
		expect(code).not.toContain('Template_MDSVEX');
	});

	test('markdown inside a component still uses the template set', () => {
		const code = compile_all('<Aside>\n\ntext\n\n</Aside>\n', {
			templates: { default: DOCS },
		});
		expect(code).toContain('<Aside><P_MDSVEX_T>text</P_MDSVEX_T></Aside>');
	});

	test('a default import shares its module statement', () => {
		expect(component_imports([], { specifier: 'a', local: 'T' })).toBe(
			"import T from 'a';\n"
		);
		expect(
			component_imports(
				[
					{ name: 'p', specifier: 'b', local: 'P_G' },
					{ name: 'h1', specifier: 'a', local: 'H1_T' },
				],
				{ specifier: 'a', local: 'T' }
			)
		).toBe(
			"import T, { h1 as H1_T } from 'a';\nimport { p as P_G } from 'b';\n"
		);
	});
});

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files.sort();
}

describe('walks agree with a template', () => {
	test('the v3 map equals mappings_to_v3 over the mapped compile', () => {
		const session = new CompilerSession();
		// some fixtures open with frontmatter that is not yaml, keep it as metadata
		const options: CompileOptions = {
			templates: { default: DOCS },
			components: ROOT,
			frontmatter: { parse: (raw: string) => ({ raw }) },
		};
		const files = fixture_files(FIXTURES);
		expect(files.length).toBeGreaterThan(100);
		for (const file of files) {
			const raw = readFileSync(file, 'utf8');
			const directives = all_directives(raw);
			const doc = { ...options, directives };
			const mapped = compile(raw, { ...doc, sourcemap: true });
			expect(mapped.code, file).toBe(compile(raw, doc).code);
			expect(wrapped_in(mapped.code), file).toBe('mdsvex:template/docs');
			const got = session.compile_v3(
				raw,
				'doc.svx',
				undefined,
				options.components,
				options.frontmatter!.parse,
				options,
				directives
			);
			expect(got.code, file).toBe(mapped.code);
			expect(JSON.stringify(got.map), file).toBe(
				JSON.stringify(
					mappings_to_v3(mapped.mappings!, raw, mapped.code, 'doc.svx')
				)
			);
		}
	});

	test('body text maps back to its source after the hoisted nodes', () => {
		const raw = '# Title\n\n<style>p {}</style>\n\nsome words\n';
		const { code, mappings } = compile(raw, {
			templates: { default: POST },
			sourcemap: true,
		});
		const at = code.indexOf('some words');
		const hit = mappings!.find(
			(m) =>
				m.generatedOffsets[0] <= at &&
				at < m.generatedOffsets[0] + m.lengths[0] &&
				m.sourceOffsets[0] !== undefined
		);
		expect(hit).toBeDefined();
		const src = hit!.sourceOffsets[0] + (at - hit!.generatedOffsets[0]);
		expect(raw.slice(src, src + 10)).toBe('some words');
	});
});
