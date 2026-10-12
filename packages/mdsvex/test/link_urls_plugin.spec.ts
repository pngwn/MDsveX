import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';
import type { MdsvexOptions } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = '/src/routes/guide/+page.svx';

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex({ highlight: false, ...options }) as any[];
	const ctx = { addWatchFile() {}, warn() {} };
	return (code: string, id = ID) => pre.transform.call(ctx, code, id);
}

describe('vite plugin links', () => {
	test('a document transforms synchronously with every option set', () => {
		const transform = plugin({
			rewrite: (url) => (url === '/x' ? '/y' : undefined),
			links: {
				routes: 'src/routes',
				base: { import: 'resolve', from: '$app/paths' },
			},
		});
		const out = transform('[a](../about/+page.svx#team) [b](/x) [c](./c)\n');
		expect(out).not.toBeInstanceOf(Promise);
		expect(out.code).toBe(
			"<script>\nimport { resolve as __mdsvex_base } from '$app/paths';\n</script>" +
				"<p><a href={__mdsvex_base('/about#team')}>a</a> " +
				"<a href={__mdsvex_base('/y')}>b</a> " +
				'<a href="./c">c</a></p>'
		);
	});

	test('rewrite is told the file without its query', () => {
		const files: unknown[] = [];
		const transform = plugin({
			rewrite: (url, ctx) => void files.push(ctx.filename),
		});
		transform('[a](/a)\n', ID + '?x=1');
		expect(files).toEqual([ID]);
	});

	test('the extensions of the plugin are the documents', () => {
		const transform = plugin({
			extensions: ['.svx', 'md'],
			links: { routes: 'src/routes' },
		});
		expect(transform('[a](./a.md) [b](./b.svx) [c](./c.mdx)\n').code).toBe(
			'<p><a href="/guide/a">a</a> <a href="/guide/b">b</a> <a href="./c.mdx">c</a></p>'
		);
		const only = plugin({ links: { routes: 'src/routes' } });
		expect(only('[a](./a.md) [b](./b.svx)\n').code).toBe(
			'<p><a href="./a.md">a</a> <a href="/guide/b">b</a></p>'
		);
	});

	test('an absolute routes directory is taken as written, on windows too', () => {
		const transform = plugin({ links: { routes: 'C:\\site\\src\\routes' } });
		expect(
			transform(
				'[a](../about/+page.svx)\n',
				'C:/site/src/routes/guide/+page.svx'
			).code
		).toBe('<p><a href="/about">a</a></p>');
	});

	test('a document that waits for the math renderer keeps its rewritten urls', async () => {
		const seen: string[] = [];
		const transform = plugin({
			rewrite: (url) => (seen.push(url), '/x' + url),
		});
		const out = transform('[a](/a)\n\n```math\nx\n```\n');
		expect(out).toBeInstanceOf(Promise);
		expect((await out).code).toContain('<a href="/x/a">a</a>');
		expect((await out).code).toContain('<math display="block"');
		// it renders twice, as a highlighter of that document is called twice
		expect(seen).toEqual(['/a', '/a']);
		transform('[b](/b)\n\n```math\nx\n```\n');
		expect(seen).toEqual(['/a', '/a', '/b']);
	});

	test('rejects options of the wrong type when the plugin is made', () => {
		expect(() => mdsvex({ rewrite: '/x' as never })).toThrow(
			'[mdsvex] rewrite must be a function'
		);
		expect(() => mdsvex({ links: true as never })).toThrow(
			'[mdsvex] links must be an object'
		);
		expect(() => mdsvex({ links: { routes: 1 as never } })).toThrow(
			'[mdsvex] links.routes must be a directory path'
		);
		expect(() => mdsvex({ links: { base: 1 as never } })).toThrow(
			'[mdsvex] links.base must be a string or { import, from }'
		);
	});
});

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-links-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/paths.js':
			"export const with_base = (url) => '/runtime' + url;\nexport default with_base;\n",
		'src/lib/markdown.js': "export { default as a } from './Link.svelte';",
		'src/lib/Link.svelte': [
			'<script>',
			'  let { href, children } = $props();',
			'</script>',
			'<a class="link" {href}>{@render children()}</a>',
		].join('\n'),
		'src/routes/guide/+page.svx': [
			'# Guide',
			'',
			'[about](../about/+page.svx#team) [home](../+page.svx) [group](../(app)/pricing/+page.svx)',
			'',
			'[root](/static) [out](https://example.com/a.svx) [frag](#top) ![logo](/logo.png)',
			'',
		].join('\n'),
		'src/routes/about/+page.svx': '# About\n',
		'src/routes/+page.svx': '# Home\n',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

async function serve(
	root: string,
	main: Plugin[],
	base?: string
): Promise<ViteDevServer> {
	return createServer({
		root,
		base,
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

describe('links in a dev server', { timeout: 30_000 }, () => {
	let root: string;
	const servers: ViteDevServer[] = [];
	const PAGE = '/src/routes/guide/+page.svx';

	async function served(
		options: MdsvexOptions,
		base?: string
	): Promise<ViteDevServer> {
		const server = await serve(
			root,
			mdsvex({ highlight: false, ...options }),
			base
		);
		servers.push(server);
		return server;
	}

	beforeAll(() => {
		root = write_app();
	});

	afterAll(async () => {
		for (const server of servers) await server.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('routes is read from the vite root', async () => {
		const server = await served({ links: { routes: 'src/routes' } });
		expect(await ssr(server, PAGE)).toBe(
			'<h1>Guide</h1>' +
				'<p><a href="/about#team">about</a> <a href="/">home</a> <a href="/pricing">group</a></p>' +
				'<p><a href="/static">root</a> <a href="https://example.com/a.svx">out</a> <a href="#top">frag</a> <img src="/logo.png" alt="logo"/></p>'
		);
	});

	test('base: true is the base of vite', async () => {
		const server = await served(
			{ links: { routes: './src/routes/', base: true } },
			'/docs/'
		);
		expect(await ssr(server, PAGE)).toBe(
			'<h1>Guide</h1>' +
				'<p><a href="/docs/about#team">about</a> <a href="/docs/">home</a> <a href="/docs/pricing">group</a></p>' +
				'<p><a href="/docs/static">root</a> <a href="https://example.com/a.svx">out</a> <a href="#top">frag</a> <img src="/docs/logo.png" alt="logo"/></p>'
		);
	});

	test('base: true does nothing for a relative or default base', async () => {
		for (const base of [undefined, './']) {
			const server = await served({ links: { base: true } }, base);
			expect(await ssr(server, PAGE)).toContain('<a href="/static">root</a>');
		}
	});

	test('an imported base function runs where the page renders', async () => {
		const server = await served({
			links: {
				routes: 'src/routes',
				base: { import: 'with_base', from: '#lib/paths.js' },
			},
			components: '#lib/markdown.js',
		});
		const html = await ssr(server, PAGE);
		expect(html).toContain(
			'<a class="link" href="/runtime/about#team">about</a>'
		);
		expect(html).toContain('<a class="link" href="/runtime/">home</a>');
		expect(html).toContain('<a class="link" href="#top">frag</a>');
		expect(html).toContain('<img src="/runtime/logo.png" alt="logo"/>');
		const client = await server.environments.client.transformRequest(PAGE);
		expect(client!.code).toContain('/src/lib/paths.js');
	});
});
