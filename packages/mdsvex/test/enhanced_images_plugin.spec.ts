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
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { MANIFEST_PATH, mdsvex } from '../src/main';
import type { MdsvexManifest, MdsvexOptions } from '../src/main';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = '/src/routes/page.svx';
// the name enhanced-img gives its markup plugin, plugin_reach checks it
const MARKUP = 'vite-plugin-enhanced-img-markup';
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

/** the transform of a plugin whose config resolved with plugins of these names */
function resolved(options: MdsvexOptions, names: string[]) {
	const root = mkdtempSync(join(HERE, '.tmp-enhanced-'));
	const [pre] = mdsvex({ highlight: false, ...options }) as any[];
	try {
		pre.configResolved({
			// vite gives the root with forward slashes
			root: normalizePath(root),
			base: '/',
			command: 'build',
			plugins: names.map((name) => ({ name })),
			logger: { warn() {} },
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	const ctx = { addWatchFile() {}, warn() {} };
	return (code: string) => pre.transform.call(ctx, code, ID).code as string;
}

describe('the vite plugin with enhanced-img', () => {
	const doc = '![a](./a.png) ![b](./b.svg) ![c](./c.jpg?w=100)\n';

	test('imports with ?enhanced once enhancedImages() is in the plugins', () => {
		const code = resolved({}, ['vite:asset', MARKUP])(doc);
		expect(code).toContain("import __mdsvex_img_0 from './a.png?enhanced';");
		expect(code).toContain("import __mdsvex_img_1 from './b.svg';");
		expect(code).toContain("import __mdsvex_img_2 from './c.jpg?w=100';");
		expect(code).toContain(
			'<img src={__mdsvex_img_0.img.src} width={__mdsvex_img_0.img.w} height={__mdsvex_img_0.img.h} alt="a" /></picture>'
		);
	});

	test('without it, images are plain imports as before', () => {
		const code = resolved({}, ['vite:asset'])(doc);
		expect(code).toContain("import __mdsvex_img_0 from './a.png';");
		expect(code).not.toContain('picture');
		expect(code).toBe(resolved({ import_images: true }, [])(doc));
	});

	test('{ enhanced: false } keeps plain imports beside enhancedImages()', () => {
		expect(
			resolved({ import_images: { enhanced: false } }, [MARKUP])(doc)
		).toBe(resolved({}, [])(doc));
	});

	test('false imports nothing, enhancedImages() or not', () => {
		expect(resolved({ import_images: false }, [MARKUP])(doc)).toBe(
			'<p><img src="./a.png" alt="a" /> <img src="./b.svg" alt="b" /> <img src="./c.jpg?w=100" alt="c" /></p>'
		);
	});

	test('{ enhanced: true } fails at startup without enhancedImages()', () => {
		expect(() =>
			resolved({ import_images: { enhanced: true } }, ['vite:asset'])
		).toThrow(
			'[mdsvex] import_images.enhanced is true but enhancedImages() of @sveltejs/enhanced-img is not in the vite plugins'
		);
		expect(
			resolved({ import_images: { enhanced: true } }, [MARKUP])(doc)
		).toContain('./a.png?enhanced');
	});

	test('an option of the wrong shape throws when the plugin is made', () => {
		for (const bad of ['yes', null, { enhanced: 1 }])
			expect(() => mdsvex({ import_images: bad as any })).toThrow(
				'[mdsvex] import_images must be true, false or { enhanced: true | false }'
			);
	});
});

/** a stand in for enhanced-img, its markup plugin by name and a Picture for every ?enhanced */
const stand_in: Plugin[] = [
	{ name: MARKUP },
	{
		name: 'stand-in-imagetools',
		enforce: 'pre',
		load(id) {
			if (!id.endsWith('.png?enhanced')) return;
			const name = id.slice(id.lastIndexOf('/') + 1, -'.png?enhanced'.length);
			return `export default ${JSON.stringify({
				sources: { avif: `/${name}.avif 1x`, webp: `/${name}.webp 1x` },
				img: { src: `/${name}.png`, w: 4, h: 3 },
			})};`;
		},
	},
];

function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-enhanced-'));
	const files: Record<string, string | Buffer> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
		}),
		'src/lib/markdown.ts': "export { default as img } from './Image.svelte';",
		'src/lib/Image.svelte': [
			'<script>',
			'  let { src, alt } = $props();',
			'</script>',
			'<figure data-w={src.img.w}><img src={src.img.src} {alt} /></figure>',
		].join('\n'),
		'src/cat.png': PNG,
		'src/doc.svx':
			'# Title\n\n![a cat](./cat.png "Cat") ![the url](./cat.png?url)\n',
		'src/replaced.svx': '![a cat](./cat.png)\n',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

function serve(root: string, plugins: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			...plugins,
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		],
	});
}

async function ssr(server: ViteDevServer, url: string): Promise<string> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

describe('enhanced images in a dev server', () => {
	let root: string;
	beforeAll(() => {
		root = write_app();
	});
	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});
	const manifest_of = (): MdsvexManifest =>
		JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8'));

	test('a markdown image renders the picture enhanced-img would', async () => {
		const server = await serve(root, [...mdsvex(), ...stand_in]);
		try {
			expect(await ssr(server, '/src/doc.svx')).toBe(
				'<h1>Title</h1><p><picture>' +
					'<source srcset="/cat.avif 1x" type="image/avif"/>' +
					'<source srcset="/cat.webp 1x" type="image/webp"/>' +
					'<img src="/cat.png" width="4" height="3" alt="a cat" title="Cat"/></picture>' +
					' <img src="/src/cat.png" alt="the url"/></p>'
			);
			await vi.waitFor(() => {
				expect(manifest_of().import_images).toBe(true);
				expect(manifest_of().enhanced_images).toBe(true);
			});
		} finally {
			await server.close();
		}
	});

	test('a replaced img gets the Picture as its src', async () => {
		const server = await serve(root, [
			...mdsvex({ components: '/src/lib/markdown.ts' }),
			...stand_in,
		]);
		try {
			expect(await ssr(server, '/src/replaced.svx')).toBe(
				'<p><figure data-w="4"><img src="/cat.png" alt="a cat"/></figure></p>'
			);
		} finally {
			await server.close();
		}
	});

	test('opted out, the manifest says nothing of it', async () => {
		const server = await serve(root, [
			...mdsvex({ import_images: { enhanced: false } }),
			...stand_in,
		]);
		try {
			expect(await ssr(server, '/src/doc.svx')).toContain(
				'<img src="/src/cat.png" alt="a cat" title="Cat"/>'
			);
			await vi.waitFor(() => {
				expect(manifest_of().import_images).toBe(true);
				expect('enhanced_images' in manifest_of()).toBe(false);
			});
		} finally {
			await server.close();
		}
	});
});
