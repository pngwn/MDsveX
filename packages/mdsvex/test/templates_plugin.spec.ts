import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { MANIFEST_PATH, mdsvex } from '../src/main';
import type { MdsvexManifest, MdsvexOptions } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));

function element(tag: string, cls: string): string {
	return [
		'<script>',
		'  let { children } = $props();',
		'</script>',
		`<${tag} class="${cls}">{@render children()}</${tag}>`,
	].join('\n');
}

function template(cls: string, module_lines: string[] = []): string {
	return [
		...(module_lines.length === 0
			? []
			: ['<script module>', ...module_lines, '</script>']),
		'<script>',
		'  let { title, extra, children } = $props();',
		'</script>',
		`<article class="${cls}" data-title={title} data-extra={extra}>{@render children()}</article>`,
	].join('\n');
}

const POST = template('post', [
	"  export { default as h1 } from '../PostHeading.svelte';",
]);

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-templates-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'node_modules/@acme/theme/package.json': JSON.stringify({
			name: '@acme/theme',
			type: 'module',
			exports: { './Layout.svelte': './Layout.svelte' },
		}),
		'node_modules/@acme/theme/Layout.svelte': template('theme', [
			"  export { default as h1 } from './ThemeHeading.svelte';",
			"  export { default as p } from './ThemeParagraph.svelte';",
		]),
		'node_modules/@acme/theme/ThemeHeading.svelte': element('h1', 'theme-own'),
		'node_modules/@acme/theme/ThemeParagraph.svelte': element('p', 'theme-p'),
		'src/lib/templates/Post.svelte': POST,
		'src/lib/PostHeading.svelte': element('h1', 'post-heading'),
		'src/lib/RootHeading.svelte': element('h1', 'root-heading'),
		'src/lib/RootImage.svelte': [
			'<script>',
			'  let { src, alt } = $props();',
			'</script>',
			'<figure><img {src} {alt} /></figure>',
		].join('\n'),
		'src/lib/markdown.ts': [
			"export { default as h1 } from './RootHeading.svelte';",
			"export { default as img } from './RootImage.svelte';",
		].join('\n'),
		'src/lib/theme.ts':
			"export { default as h1 } from './OverrideHeading.svelte';\n",
		'src/lib/OverrideHeading.svelte': element('h1', 'theme-override'),
		'src/lib/DocsParagraph.svelte': element('p', 'docs-p'),
		'src/Docs.svelte': template('docs', [
			"  export { default as p } from './lib/DocsParagraph.svelte';",
		]),
		'src/Blog.svelte': template('blog'),
		'src/post.svx': '---\ntitle: Hello\n---\n\n# Heading\n\n![cat](/cat.png)\n',
		'src/docs.svx': '---\ntemplate: docs\n---\n\n# Docs\n\ntext\n',
		'src/blog/entry.svx': '# Entry\n',
		'src/changelog/notes.svx': '# Notes\n',
		'src/none.svx': '---\ntemplate: false\n---\n\n# Bare\n',
		'src/theme.svx': '---\ntemplate: theme\n---\n\n# Themed\n\npara\n',
		'src/Wrapper.svelte': [
			'<script>',
			"  import Post from './post.svx';",
			"  import Bare from './post.svx?template=false';",
			"  import AsDocs from './post.svx?template=docs';",
			'</script>',
			'<Post extra="forwarded" />',
			'<section id="bare"><Bare /></section>',
			'<section id="as-docs"><AsDocs /></section>',
		].join('\n'),
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

/** ids and hot update files use forward slashes on every platform */
function vite_path(root: string, path: string): string {
	return normalizePath(join(root, path));
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

function options_for(root: string): MdsvexOptions {
	return {
		templates: {
			default: '#lib/templates/Post.svelte',
			docs: './src/Docs.svelte',
			blog: new URL('./src/Blog.svelte', pathToFileURL(root + '/')),
			theme: {
				component: '@acme/theme/Layout.svelte',
				components: '#lib/theme.ts',
			},
		},
		select_template: (id) =>
			id.includes('/changelog/')
				? false
				: id.includes('/blog/')
					? 'blog'
					: undefined,
		components: '#lib/markdown.ts',
	};
}

describe('templates option', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		plugins = mdsvex(options_for(root));
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('maps each template id to the resolved file', async () => {
		const container = server.environments.client.pluginContainer;
		const id = async (name: string) =>
			(await container.resolveId('mdsvex:template/' + name))?.id;
		// #lib subpath import, root relative path and a file URL
		expect(await id('default')).toBe(
			vite_path(root, 'src/lib/templates/Post.svelte')
		);
		expect(await id('docs')).toBe(vite_path(root, 'src/Docs.svelte'));
		expect(await id('blog')).toBe(vite_path(root, 'src/Blog.svelte'));
		// extra replacements resolve to a module merging both
		expect(await id('theme')).toBe('\0mdsvex:template/theme');
		expect(await id('missing')).toBeUndefined();
	});

	test('a merging module re-exports the template and the extra names', async () => {
		const loaded = await server.environments.ssr.pluginContainer.load(
			'\0mdsvex:template/theme'
		);
		const code = typeof loaded === 'string' ? loaded : loaded?.code;
		const layout = JSON.stringify(
			vite_path(root, 'node_modules/@acme/theme/Layout.svelte')
		);
		expect(code).toBe(
			`export * from ${layout};\nexport { default } from ${layout};\n` +
				`export { h1 } from ${JSON.stringify(vite_path(root, 'src/lib/theme.ts'))};\n`
		);
	});

	test('compiles against virtual ids, output holds no path', async () => {
		await server.environments.ssr.pluginContainer.resolveId(
			'mdsvex:template/default'
		);
		const transform = plugins[0].transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'---\ntitle: Hello\n---\n\n# Heading\n',
			vite_path(root, 'src/post.svx')
		);
		expect(result.code).toContain(
			"import Template_MDSVEX, { h1 as H1_MDSVEX_T } from 'mdsvex:template/default';\n"
		);
		expect(result.code).toContain(
			'<Template_MDSVEX {...metadata} {...__mdsvex_props}>'
		);
		expect(result.code).not.toContain(root);
	});

	test('the default template wraps, its replacements beat the root fallback', async () => {
		const html = await ssr(server, '/src/post.svx');
		expect(html).toContain('<article class="post" data-title="Hello">');
		expect(html).toContain('<h1 class="post-heading">Heading</h1>');
		// the template has no img, the root fallback does
		expect(html).toContain('<figure><img src="/cat.png" alt="cat"/></figure>');
	});

	test('frontmatter picks a template, false wraps nothing', async () => {
		const docs = await ssr(server, '/src/docs.svx');
		expect(docs).toContain('<article class="docs">');
		expect(docs).toContain('<p class="docs-p">text</p>');
		// docs has no h1, the root one applies
		expect(docs).toContain('<h1 class="root-heading">Docs</h1>');

		const bare = await ssr(server, '/src/none.svx');
		expect(bare).not.toContain('<article');
		expect(bare).toContain('<h1 class="root-heading">Bare</h1>');
	});

	test('select_template gets the file id', async () => {
		expect(await ssr(server, '/src/blog/entry.svx')).toContain(
			'<article class="blog">'
		);
		const notes = await ssr(server, '/src/changelog/notes.svx');
		expect(notes).not.toContain('<article');
	});

	test('writes what it resolved and picked to the editor manifest', async () => {
		await ssr(server, '/src/blog/entry.svx');
		await ssr(server, '/src/changelog/notes.svx');
		const file = join(root, MANIFEST_PATH);
		const read = (): MdsvexManifest => JSON.parse(readFileSync(file, 'utf8'));
		await vi.waitFor(() => {
			expect(
				Object.keys(read().documents).some((d) => d.endsWith('notes.svx'))
			).toBe(true);
		});
		const manifest = read();
		const at = (path: string) => vite_path(root, path);
		expect(manifest.version).toBe(1);
		expect(manifest.root).toBe(at(''));
		expect(manifest.extensions).toEqual(['.svx']);
		expect(manifest.component_mode).toBe('markdown');
		expect(manifest.select_template).toBe(true);
		expect(manifest.frontmatter_parse).toBe(false);
		expect(manifest.templates.default).toEqual({
			id: 'mdsvex:template/default',
			file: at('src/lib/templates/Post.svelte'),
			components: ['h1'],
			extra: null,
			directives: [],
		});
		expect(manifest.templates.blog.file).toBe(at('src/Blog.svelte'));
		expect(manifest.templates.theme).toMatchObject({
			file: at('node_modules/@acme/theme/Layout.svelte'),
			components: ['h1', 'p'],
			extra: { file: at('src/lib/theme.ts'), names: ['h1'] },
		});
		expect(manifest.components).toEqual([
			{
				id: 'mdsvex:components',
				file: at('src/lib/markdown.ts'),
				names: ['h1', 'img'],
			},
		]);
		// only select_template picks need recording, by file
		expect(manifest.documents[at('src/blog/entry.svx')]).toBe('blog');
		expect(manifest.documents[at('src/changelog/notes.svx')]).toBeNull();
	});

	test('a template you cannot edit takes extra replacements over its own', async () => {
		const html = await ssr(server, '/src/theme.svx');
		expect(html).toContain('<article class="theme">');
		expect(html).toContain('<h1 class="theme-override">Themed</h1>');
		expect(html).toContain('<p class="theme-p">para</p>');
	});

	test('props passed to the document reach the template, the query overrides', async () => {
		const html = await ssr(server, '/src/Wrapper.svelte');
		expect(html).toContain(
			'<article class="post" data-title="Hello" data-extra="forwarded">'
		);
		const bare = html.slice(html.indexOf('<section id="bare">'));
		expect(bare.slice(0, bare.indexOf('</section>'))).not.toContain('<article');
		const as_docs = html.slice(html.indexOf('<section id="as-docs">'));
		expect(as_docs).toMatch(/^<section id="as-docs"><article class="docs"/);
	});

	test('a changed export set recompiles only the documents that used it', async () => {
		const ssr_env = server.environments.ssr;
		const client_env = server.environments.client;
		for (const env of [ssr_env, client_env]) {
			await env.transformRequest('/src/docs.svx');
			await env.transformRequest('/src/post.svx');
		}

		const file = vite_path(root, 'src/Docs.svelte');
		const code = template('docs', [
			"  export { default as p } from './lib/DocsParagraph.svelte';",
			"  export { default as h1 } from './lib/PostHeading.svelte';",
		]);
		writeFileSync(file, code);
		for (const env of [ssr_env, client_env]) env.moduleGraph.onFileChange(file);

		const hot = plugins[0].hotUpdate as Function;
		const update = (
			environment: unknown,
			timestamp: number,
			f = file,
			c = code
		) =>
			hot.call(
				{ environment },
				{
					type: 'update',
					file: f,
					timestamp,
					modules: [],
					read: async () => c,
					server,
				}
			);

		const docs = vite_path(root, 'src/docs.svx');
		const post = vite_path(root, 'src/post.svx');
		const in_ssr = await update(ssr_env, 1);
		const in_client = await update(client_env, 1);
		expect(in_ssr.map((m: any) => m.id)).toContain(docs);
		expect(in_client.map((m: any) => m.id)).toContain(docs);
		// the wrapper imported post with ?template=docs, only that module used it
		expect(in_ssr.map((m: any) => m.id)).toContain(post + '?template=docs');
		expect(in_ssr.map((m: any) => m.id)).not.toContain(post);
		for (const mod of ssr_env.moduleGraph.getModulesByFile(docs)!)
			expect(mod.transformResult).toBeNull();

		expect(await ssr(server, '/src/docs.svx')).toContain(
			'<h1 class="post-heading">Docs</h1>'
		);
		// the same names again change nothing
		expect(await update(ssr_env, 2)).toBeUndefined();
	});

	test('extra replacements changing invalidate the merging module and its documents', async () => {
		const ssr_env = server.environments.ssr;
		await ssr(server, '/src/theme.svx');
		const file = vite_path(root, 'src/lib/theme.ts');
		const code = [
			"export { default as h1 } from './OverrideHeading.svelte';",
			"export { default as p } from './DocsParagraph.svelte';",
		].join('\n');
		writeFileSync(file, code);
		ssr_env.moduleGraph.onFileChange(file);
		const hot = plugins[0].hotUpdate as Function;
		const result = await hot.call(
			{ environment: ssr_env },
			{
				type: 'update',
				file,
				timestamp: 5,
				modules: [],
				read: async () => code,
				server,
			}
		);
		const ids = result.map((m: any) => m.id);
		expect(ids).toContain('\0mdsvex:template/theme');
		expect(ids).toContain(vite_path(root, 'src/theme.svx'));
		expect(await ssr(server, '/src/theme.svx')).toContain(
			'<p class="docs-p">para</p>'
		);
	});
});

describe('template resolution failure', () => {
	test('names each template key, specifier and the root when the server starts', async () => {
		const root = write_app();
		try {
			const message = await serve(
				root,
				mdsvex({
					templates: {
						default: '#lib/templates/Post.svelte',
						gone: '#lib/missing.svelte',
						theme: { component: './src/Docs.svelte', components: './nope.ts' },
					},
				})
			).then(
				async (server) => {
					await server.close();
					return 'started';
				},
				(e: Error) => e.message
			);
			const at = normalizePath(root);
			expect(message).toBe(
				`[mdsvex] could not resolve template "gone" at "#lib/missing.svelte" from the vite root ${at}\n` +
					`[mdsvex] could not resolve the components of template "theme" at "./nope.ts" from the vite root ${at}`
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('a malformed entry or selector throws when the plugin is made', () => {
		expect(() => mdsvex({ templates: { a: 1 as any } })).toThrow(
			'[mdsvex] templates.a must be a specifier, a URL or { component, components? }'
		);
		expect(() => mdsvex({ select_template: 'blog' as any })).toThrow(
			'select_template must be a function'
		);
	});
});

function directive(cls: string): string {
	return [
		'<script>',
		'  let { label, children } = $props();',
		'</script>',
		`<aside class="${cls}">{@render label?.()}|{@render children?.()}</aside>`,
	].join('\n');
}

describe('template directives', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app();
		const files: Record<string, string> = {
			'src/lib/markdown.ts': [
				"export { default as h1 } from './RootHeading.svelte';",
				"export * as directives from './directives/root.ts';",
			].join('\n'),
			'src/lib/directives/root.ts': [
				"export { default as Callout } from './RootCallout.svelte';",
				"export { default as note } from './RootNote.svelte';",
			].join('\n'),
			'src/lib/directives/RootCallout.svelte': directive('root-callout'),
			'src/lib/directives/RootNote.svelte': directive('root-note'),
			'src/lib/directives/docs.ts':
				"export { default as Callout } from './DocsCallout.svelte';\n",
			'src/lib/directives/DocsCallout.svelte': directive('docs-callout'),
			'src/lib/directives/DocsTip.svelte': directive('docs-tip'),
			'src/lib/directives/theme.ts':
				"export { default as Callout } from './ThemeCallout.svelte';\n",
			'src/lib/directives/ThemeCallout.svelte': directive('theme-callout'),
			'src/lib/theme.ts': [
				"export { default as h1 } from './OverrideHeading.svelte';",
				"export * as directives from './directives/theme.ts';",
			].join('\n'),
			'src/Docs.svelte': template('docs', [
				"  export { default as p } from './lib/DocsParagraph.svelte';",
				"  export * as directives from './lib/directives/docs.ts';",
			]),
			'src/docs.svx':
				'---\ntemplate: docs\n---\n\n:::Callout[Hi]\nbody\n:::\n\n::note[n]\n',
			'src/post.svx': ':::Callout[Hi]\nbody\n:::\n',
			'src/theme.svx': '---\ntemplate: theme\n---\n\n:::Callout[Hi]\n:::\n',
			'src/tip.svx': '---\ntemplate: docs\n---\n\n::tip[t]\n',
		};
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		plugins = mdsvex(options_for(root));
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('maps each template directives id to the module its namespace names', async () => {
		const container = server.environments.client.pluginContainer;
		const id = async (name: string) =>
			(await container.resolveId('mdsvex:template-directives/' + name))?.id;
		expect(await id('docs')).toBe(
			vite_path(root, 'src/lib/directives/docs.ts')
		);
		// the namespace of the extra replacements module of a template
		expect(await id('theme/components')).toBe(
			vite_path(root, 'src/lib/directives/theme.ts')
		);
		expect(await id('post')).toBeUndefined();
	});

	test('chain in front of the root directives, closest first', async () => {
		const docs = await ssr(server, '/src/docs.svx');
		expect(docs).toContain(
			'<aside class="docs-callout">Hi|<p class="docs-p">body</p></aside>'
		);
		// docs has no note, the root one applies
		expect(docs).toContain('<aside class="root-note">n|</aside>');
		// the default template has no directives
		expect(await ssr(server, '/src/post.svx')).toContain(
			'<aside class="root-callout">Hi|<p>body</p></aside>'
		);
		expect(await ssr(server, '/src/theme.svx')).toContain(
			'<aside class="theme-callout">Hi|</aside>'
		);
	});

	test('a changed template directives module recompiles its documents', async () => {
		const ssr_env = server.environments.ssr;
		await expect(ssr_env.transformRequest('/src/tip.svx')).rejects.toThrow(
			/::tip at 5:1/
		);
		await ssr_env.transformRequest('/src/docs.svx');

		const file = vite_path(root, 'src/lib/directives/docs.ts');
		const code = [
			"export { default as Callout } from './DocsCallout.svelte';",
			"export { default as tip } from './DocsTip.svelte';",
		].join('\n');
		writeFileSync(file, code);
		ssr_env.moduleGraph.onFileChange(file);
		const hot = plugins[0].hotUpdate as Function;
		const result = await hot.call(
			{ environment: ssr_env },
			{
				type: 'update',
				file,
				timestamp: 1,
				modules: [],
				read: async () => code,
				server,
			}
		);
		expect(result.map((m: any) => m.id)).toContain(
			vite_path(root, 'src/docs.svx')
		);
		expect(await ssr(server, '/src/tip.svx')).toContain(
			'<aside class="docs-tip">t|</aside>'
		);
	});
});
