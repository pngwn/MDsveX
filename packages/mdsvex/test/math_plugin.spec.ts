import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, test, vi } from 'vitest';

import { MANIFEST_PATH, mdsvex } from '../src/main';
import type { MdsvexManifest, MdsvexOptions } from '../src/main';
import { manifest_math } from '../src/plugin_math';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = '/src/routes/page.svx';
const MATH = '```math\nx\n```\n';
const OPEN = '<div class="math math-display" translate="no">';

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex(options) as any[];
	const warned: unknown[][] = [];
	const ctx = {
		addWatchFile() {},
		warn: (...args: unknown[]) => warned.push(args),
	};
	const transform = (code: string, id = ID) =>
		pre.transform.call(ctx, code, id);
	return { transform, warned };
}

describe('vite plugin math', () => {
	test('a document without a math fence compiles without loading a renderer', () => {
		// highlight false, so code never makes the transform wait either
		const { transform } = plugin({ highlight: false });
		for (const doc of [
			'# a\n\nsome math, `#!math x` and $x$\n',
			'```js\nmath\n```\n',
			'```mathematica\nx\n```\n',
			// a math fence shown as code is not one
			'````md\n```math\nx\n```\n````\n',
		]) {
			const out = transform(doc);
			expect(out).not.toBeInstanceOf(Promise);
			expect(out.code).not.toContain('<math');
		}
	});

	test('temml loads with the first document that has a math fence', async () => {
		const { transform, warned } = plugin({ highlight: false });
		const first = transform('a\n\n' + MATH);
		expect(first).toBeInstanceOf(Promise);
		expect((await first).code).toBe(
			'<p>a</p>' +
				OPEN +
				'<math display="block" class="tml-display" style="display:block math;"><mi>x</mi></math></div>'
		);
		const second = transform('> ````math\n> y\n> ````\n');
		expect(second).not.toBeInstanceOf(Promise);
		expect(second.code).toContain('<mi>y</mi>');
		expect(warned).toEqual([]);
	});

	test('documents that meet math while the renderer loads share the load', async () => {
		const { transform } = plugin({ highlight: false });
		const first = transform(MATH);
		const second = transform('```math\ny\n```\n');
		const plain = transform('# no math\n');
		expect(first).toBeInstanceOf(Promise);
		expect(second).toBeInstanceOf(Promise);
		expect(plain.code).toBe('<h1>no math</h1>');
		expect((await first).code).toContain('<mi>x</mi>');
		expect((await second).code).toContain('<mi>y</mi>');
	});

	test('math and twinkleplop load together and nothing warns', async () => {
		const { transform, warned } = plugin();
		const out = await transform(MATH + '\n```ts\nlet a\n```\n\n`#!math x`\n');
		expect(out.code).toContain(OPEN + '<math display="block"');
		expect(out.code).toContain('<pre class="twinkleplop language-ts"');
		expect(out.code).toContain('<code>x</code>');
		expect(warned).toEqual([]);
	});

	test('a custom highlighter never sees the math fence', async () => {
		const langs: string[] = [];
		const { transform } = plugin({
			highlight: (code, { lang }) => {
				langs.push(lang);
				return `<pre>${code}</pre>`;
			},
		});
		const doc = MATH + '\n```ts\na\n```\n';
		const out = await transform(doc);
		expect(out.code).toContain('<math display="block"');
		// the document that loads the renderer compiles a second time
		expect(langs).toEqual(['ts', 'ts']);
		expect(transform(doc).code).toBe(out.code);
		expect(langs).toEqual(['ts', 'ts', 'ts']);
	});

	test('false leaves the fence a code block and loads nothing', () => {
		const { transform } = plugin({ math: false, highlight: false });
		const out = transform(MATH);
		expect(out).not.toBeInstanceOf(Promise);
		expect(out.code).toBe('<pre><code class="language-math">x</code></pre>');
	});

	test('katex renders once it is chosen, options pass through', async () => {
		const { transform } = plugin({
			highlight: false,
			math: { renderer: 'katex', options: { macros: { '\\RR': 'R' } } },
		});
		const out = await transform('```math\n\\RR\n```\n');
		expect(out.code).toContain(OPEN + '<span class="katex-display">');
		expect(out.code).toContain(
			'<annotation encoding="application/x-tex">\\RR</annotation>'
		);
	});

	test('temml options pass through', async () => {
		const { transform } = plugin({
			highlight: false,
			math: { options: { macros: { '\\RR': '\\mathbb{R}' } } },
		});
		expect((await transform('```math\n\\RR\n```\n')).code).toContain(
			'<mi>ℝ</mi>'
		);
	});

	test('a renderer function is called synchronously with the file', () => {
		const files: (string | undefined)[] = [];
		const { transform } = plugin({
			highlight: false,
			math: (latex, { filename }) => {
				files.push(filename);
				return `<b>${latex}</b>`;
			},
		});
		const out = transform('```math\n{a}\n```\n', ID + '?x');
		expect(out.code).toBe(OPEN + '<b>&#123;a&#125;</b></div>');
		expect(files).toEqual([ID]);
	});

	test('invalid latex rejects with a MathError that names the file', async () => {
		const { transform } = plugin({ highlight: false });
		const e = await transform('a\n\n```math\n\\frac{a}{\n```\n').catch(
			(e: unknown) => e
		);
		expect(e.name).toBe('MathError');
		expect(e.message).toContain(`(\`math\` fence at ${ID}:3)`);
		expect([e.line, e.column]).toEqual([4, 10]);
	});

	test('rejects a math option of the wrong type', () => {
		expect(() => mdsvex({ math: 'temml' as never })).toThrow(/math must be/);
		expect(() => mdsvex({ math: true as never })).toThrow(/math must be/);
		expect(() => mdsvex({ math: { renderer: 'mathjax' as never } })).toThrow(
			/math.renderer must be 'temml' or 'katex', it is "mathjax"/
		);
		expect(() => mdsvex({ math: { options: 1 as never } })).toThrow(
			/math.options must be an object/
		);
	});
});

describe('manifest math', () => {
	test('is left out for the default and holds what json can', () => {
		expect(manifest_math(undefined)).toBeUndefined();
		expect(manifest_math({})).toBeUndefined();
		expect(manifest_math({ renderer: 'temml', options: {} })).toBeUndefined();
		expect(manifest_math(false)).toBe(false);
		expect(manifest_math(() => '')).toEqual({ renderer: 'custom' });
		expect(manifest_math({ renderer: 'katex' })).toEqual({ renderer: 'katex' });
		expect(
			manifest_math({ options: { macros: { '\\RR': '\\mathbb{R}' } } })
		).toEqual({
			renderer: 'temml',
			options: { macros: { '\\RR': '\\mathbb{R}' } },
		});
		// a function is lost in json, so the editor is told it can not render
		expect(manifest_math({ options: { trust: () => true } })).toEqual({
			renderer: 'temml',
			options: null,
		});
	});
});

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(files: Record<string, string>): string {
	const root = mkdtempSync(join(HERE, '.tmp-math-'));
	const all: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		...files,
	};
	for (const [path, content] of Object.entries(all)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			main,
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		],
	});
}

/** server render in a fresh runner, so no module evaluated before is reused */
async function ssr(server: ViteDevServer, url: string): Promise<string> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		// the component and the renderer must share one svelte instance
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

describe('math in a dev server', () => {
	const FILES = {
		'src/lib/markdown.ts': [
			"export { default as math } from './Math.svelte';",
			"export { default as pre } from './Pre.svelte';",
		].join('\n'),
		'src/lib/Math.svelte': [
			'<script>',
			'  let { code, display, meta, children } = $props();',
			'</script>',
			'<figure data-latex={code} data-display={display} data-meta={meta}>{@render children()}</figure>',
		].join('\n'),
		'src/lib/Pre.svelte': [
			'<script>',
			'  let { children } = $props();',
			'</script>',
			'<section class="pre">{@render children()}</section>',
		].join('\n'),
		'src/plain.svx': '# no math here\n',
		'src/doc.svx': 'text\n\n```math label=eq:1\n\\frac{a}{b}\n```\n',
		'src/code.svx': '```js\nlet a\n```\n',
		'src/bad.svx': '# bad\n\n```math\n\\frac{a}{\n```\n',
	};

	test('renders mathml the browser needs no script for', async () => {
		const root = write_app(FILES);
		const server = await serve(root, mdsvex());
		try {
			expect(await ssr(server, '/src/plain.svx')).toBe('<h1>no math here</h1>');
			const html = await ssr(server, '/src/doc.svx');
			expect(html).toBe(
				'<p>text</p>' +
					OPEN +
					'<math display="block" class="tml-display" style="display:block math;">' +
					'<mfrac><mi>a</mi><mi>b</mi></mfrac></math></div>'
			);
			const client =
				await server.environments.client.transformRequest('/src/doc.svx');
			// static markup, the client imports nothing to draw it
			expect(client!.code).not.toMatch(/temml|katex/);
			await vi.waitFor(() => {
				const manifest: MdsvexManifest = JSON.parse(
					readFileSync(join(root, MANIFEST_PATH), 'utf8')
				);
				expect('math' in manifest).toBe(false);
			});
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a math export replaces math and pre does not', async () => {
		const root = write_app(FILES);
		const server = await serve(
			root,
			mdsvex({
				components: '#lib/markdown.ts',
				math: { options: { annotate: true } },
			})
		);
		try {
			const html = await ssr(server, '/src/doc.svx');
			expect(html).toContain(
				'<figure data-latex="\\frac{a}{b}" data-display="true" data-meta="label=eq:1">' +
					OPEN +
					'<math display="block"'
			);
			expect(html).toContain(
				'<annotation encoding="application/x-tex">\\frac{a}{b}</annotation>'
			);
			expect(html).not.toContain('class="pre"');
			expect(await ssr(server, '/src/code.svx')).toContain(
				'<section class="pre"><pre'
			);
			await vi.waitFor(() => {
				const manifest: MdsvexManifest = JSON.parse(
					readFileSync(join(root, MANIFEST_PATH), 'utf8')
				);
				expect(manifest.math).toEqual({
					renderer: 'temml',
					options: { annotate: true },
				});
			});
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('invalid latex fails the module with a position vite can show', async () => {
		const root = write_app(FILES);
		const server = await serve(root, mdsvex());
		try {
			const e: any = await server.environments.ssr
				.transformRequest('/src/bad.svx')
				.catch((e: unknown) => e);
			expect(e.name).toBe('MathError');
			expect(e.loc).toMatchObject({ line: 4, column: 10 });
			expect(e.id).toContain('src/bad.svx');
			// the renderer stays loaded, the next document compiles
			expect(await ssr(server, '/src/doc.svx')).toContain('<mfrac>');
		} finally {
			await server.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
