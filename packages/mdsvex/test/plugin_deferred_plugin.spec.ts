import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

import { mdsvex } from '../src/main';
import type { Bundle, MdsvexOptions } from '../src/main';
import { snippet_hash } from '../src/run_blocks';

const HERE = dirname(fileURLToPath(import.meta.url));

/** a promise and the function that resolves it */
function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { wait, open };
}

/** the src of an image written logo:name, from a lookup that takes a while */
const logos: Bundle = {
	name: 'logos',
	parse: {
		image: {
			parse(node, ctx) {
				return () => {
					const src = node.attrs.src as string;
					if (!src.startsWith('logo:')) return;
					ctx.defer(node, async (image) => {
						await new Promise((done) => setTimeout(done, 1));
						image.attrs.src = `./${src.slice(5)}.png`;
					});
				};
			},
		},
	},
};

/** a fence that shows a file, or one that runs, added by the document hook of a document that asks for it */
const appendix: Bundle = {
	name: 'appendix',
	parse: {
		async document(root, ctx) {
			const shows = ctx.frontmatter?.appendix;
			const runs = ctx.frontmatter?.run;
			if (shows === undefined && runs === undefined) return;
			await new Promise((done) => setTimeout(done, 1));
			if (shows !== undefined)
				root.append('code_fence', { info: `ts src=${shows}` });
			if (runs !== undefined) root.append('code_fence', { info: 'svelte run' });
		},
	},
};

/** where an import of the document goes, found by ctx.resolve in its document hook */
const where: Bundle = {
	name: 'where',
	parse: {
		async document(_root, ctx) {
			const spec = ctx.frontmatter?.where;
			if (typeof spec !== 'string') return;
			ctx.set('found', await ctx.resolve(spec));
		},
	},
};

function write(root: string, files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
}

const vite_path = (root: string, path: string) =>
	normalizePath(join(root, path));

describe('the vite plugin, what settle adds', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, '.tmp-deferred-plugin-'));
		write(root, {
			'package.json': '{"name":"app","private":true,"type":"module"}',
			'src/logo.svx': '![Acme](logo:acme)\n',
			'src/acme.png': 'png',
			'src/appendix.svx': '---\nappendix: ./a.ts\n---\n\n# One\n',
			'src/a.ts': 'export const a = 1;\n',
			'src/where.svx': '---\nwhere: ./a.ts\n---\n\n# Where\n',
			'src/run.svx': '---\nrun: true\n---\n\n# Run\n',
		});
		plugins = mdsvex({
			plugins: [logos, appendix, where],
			highlight: false,
		}) as Plugin[];
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			cacheDir: join(root, '.vite'),
			optimizeDeps: { noDiscovery: true, include: [] },
			server: { middlewareMode: true, hmr: false, watch: null },
			plugins: [
				plugins,
				svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
			],
		});
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('imports an image a deferred task gave its src', async () => {
		const result =
			await server.environments.ssr.transformRequest('/src/logo.svx');
		expect(result!.code).toContain('__vite_ssr_import__("/src/acme.png"');
		expect(result!.code).not.toContain('"./acme.png"');
	});

	test('reads a file a document hook shows', async () => {
		const result =
			await server.environments.ssr.transformRequest('/src/appendix.svx');
		expect(result!.code).toContain('export const a = 1;');
	});

	test('a block a document hook added is found by a load that reads the document from disk', async () => {
		const id =
			vite_path(root, 'src/run.svx') +
			`.snippet-${snippet_hash('svelte\n')}.svelte`;
		const loaded = await server.environments.ssr.pluginContainer.load(id);
		const code = typeof loaded === 'string' ? loaded : loaded?.code;
		expect(code).toBe('\n');
	});

	test('?data rebuilt to compare an edit resolves as its load did', async () => {
		const env = server.environments.ssr;
		const file = vite_path(root, 'src/where.svx');
		const loaded = await env.transformRequest('\0mdsvex:data:' + file + '.js');
		expect(loaded?.code).toContain(
			`"where":{"found":${JSON.stringify(vite_path(root, 'src/a.ts'))}}`
		);
		const code = '---\nwhere: ./a.ts\n---\n\n# Where\n\nmore\n';
		const hot = plugins[0].hotUpdate as Function;
		const changed = await hot.call(
			{ environment: env },
			{
				type: 'update',
				file,
				timestamp: 1,
				modules: [],
				read: async () => code,
				server,
			}
		);
		expect(changed).toBeUndefined();
	});
});

describe('the vite plugin, transform', () => {
	const ID = '/app/src/page.svx';

	function plugin(options: MdsvexOptions, command: 'build' | 'serve') {
		const [pre] = mdsvex({ highlight: false, ...options }) as any[];
		pre.configResolved.call(
			{},
			{
				root: '/app',
				base: '/',
				command,
				plugins: [],
				logger: { warn() {} },
			}
		);
		const warned: string[] = [];
		const watched: string[] = [];
		const ctx = {
			addWatchFile: (file: string) => void watched.push(file),
			warn: (message: string) => void warned.push(message),
			resolve: async () => null,
		};
		const transform = (code: string, id = ID) =>
			pre.transform.call(ctx, code, id);
		return { transform, warned, watched };
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	/** a plugin that waits on the gate, from a task on each heading */
	function slow(wait: Promise<void>): Bundle {
		return {
			name: 'slow',
			parse: {
				heading: {
					parse: (node, ctx) => () =>
						ctx.defer(node, async (heading) => {
							await wait;
							heading.attrs.title = 'done';
						}),
				},
			},
		};
	}

	test('a dev server warns after five seconds, naming the plugin and the document', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { wait, open } = gate();
		const { transform, warned } = plugin({ plugins: [slow(wait)] }, 'serve');
		const out = transform('# One\n');
		expect(out).toBeInstanceOf(Promise);
		vi.advanceTimersByTime(4999);
		expect(warned).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(warned).toEqual([
			'/app/src/page.svx has waited 5 seconds for plugin "slow"',
		]);
		open();
		expect((await out).code).toContain('<h1 title="done">One</h1>');
		vi.advanceTimersByTime(10000);
		expect(warned).toHaveLength(1);
	});

	test('a document that settles sooner is never warned about', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { wait, open } = gate();
		const { transform, warned } = plugin({ plugins: [slow(wait)] }, 'serve');
		const out = transform('# One\n');
		open();
		await out;
		vi.advanceTimersByTime(10000);
		expect(warned).toEqual([]);
	});

	test('a build waits without a warning', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { wait, open } = gate();
		const { transform, warned } = plugin({ plugins: [slow(wait)] }, 'build');
		const out = transform('# One\n');
		vi.advanceTimersByTime(10000);
		open();
		await out;
		expect(warned).toEqual([]);
	});

	/** depends on a file from a handler, and on another from a task */
	const depending: Bundle = {
		name: 'depending',
		parse: {
			heading: {
				parse: (node, ctx) => () => {
					ctx.depend('/data/refs.bib');
					if (node.depth === 2)
						ctx.defer(node, async (_heading, task) => {
							await Promise.resolve();
							task.depend('/data/late.json');
						});
				},
			},
		},
	};

	test('a watch build watches what plugins depend on', async () => {
		const { transform, watched } = plugin({ plugins: [depending] }, 'build');
		transform('# One\n');
		expect(watched).toEqual(['/data/refs.bib']);
		watched.length = 0;
		await transform('# One\n\n## Two\n');
		expect(watched.sort()).toEqual(['/data/late.json', '/data/refs.bib']);
	});

	test('a dev server does not ask rollup to watch them', async () => {
		const { transform, watched } = plugin({ plugins: [depending] }, 'serve');
		await transform('# One\n\n## Two\n');
		expect(watched).toEqual([]);
	});
});
