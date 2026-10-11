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
const ID = '/src/routes/page.svx';
// a one pixel png
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex(options) as any[];
	const ctx = { addWatchFile() {}, warn() {} };
	return (code: string, id = ID) => pre.transform.call(ctx, code, id);
}

describe('vite plugin import_images', () => {
	test('a document without a relative image transforms synchronously and as before', () => {
		const transform = plugin({ highlight: false });
		const off = plugin({ highlight: false, import_images: false });
		for (const doc of [
			'',
			'# a\n\ntext with a [link](./a.png)\n',
			'![abs](/a.png) ![remote](https://x.y/a.png) ![data](data:image/png;base64,AA)\n',
			'![live]({src}) ![part](./{name}.png) ![empty]()\n',
			'<img src="./typed.png" alt="typed">\n',
		]) {
			const out = transform(doc);
			expect(out).not.toBeInstanceOf(Promise);
			expect(out.code).toBe(off(doc).code);
			expect(out.code).not.toContain('import ');
		}
	});

	test('a relative image is imported without a promise either', () => {
		const transform = plugin({ highlight: false });
		const out = transform('![alt](./a.png)\n\n![again](a.png?url)\n');
		expect(out).not.toBeInstanceOf(Promise);
		expect(out.code).toBe(
			'<script>\n' +
				"import __mdsvex_img_0 from './a.png';\n" +
				"import __mdsvex_img_1 from './a.png?url';\n" +
				'</script>' +
				'<p><img src={__mdsvex_img_0} alt="alt" /></p>' +
				'<p><img src={__mdsvex_img_1} alt="again" /></p>'
		);
		expect(transform('![abs](/a.png)\n').code).toBe(
			'<p><img src="/a.png" alt="abs" /></p>'
		);
	});

	test('false leaves every url as written', () => {
		const transform = plugin({ highlight: false, import_images: false });
		expect(transform('![alt](./a.png)\n').code).toBe(
			'<p><img src="./a.png" alt="alt" /></p>'
		);
	});

	test('rejects an option of the wrong type', () => {
		expect(() => mdsvex({ import_images: 'yes' as any })).toThrow(
			'[mdsvex] import_images must be true or false'
		);
	});

	test('a document that waits for the math renderer keeps its images', async () => {
		const transform = plugin({ highlight: false });
		const out = transform('![alt](./a.png)\n\n```math\nx\n```\n');
		expect(out).toBeInstanceOf(Promise);
		expect(transform('![other](./b.png)\n').code).toContain("from './b.png'");
		const code = (await out).code;
		expect(code).toContain("import __mdsvex_img_0 from './a.png';");
		expect(code).not.toContain('./b.png');
		expect(code).toContain('<img src={__mdsvex_img_0} alt="alt" />');
		expect(code).toContain('<math display="block"');
	});
});

/** a vite app on disk inside the package, so svelte resolves from it */
function write_app(): string {
	const root = mkdtempSync(join(HERE, '.tmp-images-'));
	const files: Record<string, string | Buffer> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'src/lib/markdown.ts': "export { default as img } from './Image.svelte';",
		'src/lib/Image.svelte': [
			'<script>',
			'  let { src, alt } = $props();',
			'</script>',
			'<figure><img {src} {alt} /><figcaption>{typeof src}</figcaption></figure>',
		].join('\n'),
		'src/lib/logo.png': PNG,
		'src/docs/cat.png': PNG,
		'src/docs/img/a b.png': PNG,
		'src/dog.png': PNG,
		'src/docs/doc.svx': [
			'# Title',
			'',
			'![cat](./cat.png) ![bare](cat.png) ![up](../dog.png)',
			'',
			'![spaced](./img/a%20b.png) ![alias](#lib/logo.png) ![abs](/static.png)',
			'',
			'![raw](./cat.png?url) ![inline](./cat.png?inline)',
			'',
		].join('\n'),
		'src/docs/missing.svx': '# Title\n\n![gone](./gone.png)\n',
	};
	for (const [path, content] of Object.entries(files)) {
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

describe('images in a dev server', () => {
	let root: string;
	let server: ViteDevServer;
	let replaced: ViteDevServer;

	beforeAll(async () => {
		root = write_app();
		server = await serve(root, mdsvex({ highlight: false }));
		replaced = await serve(
			root,
			mdsvex({ highlight: false, components: '#lib/markdown.ts' })
		);
	});

	afterAll(async () => {
		await server?.close();
		await replaced?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the src is the url vite resolves the file to', async () => {
		const html = await ssr(server, '/src/docs/doc.svx');
		expect(html).toBe(
			'<h1>Title</h1>' +
				'<p><img src="/src/docs/cat.png" alt="cat"/> <img src="/src/docs/cat.png" alt="bare"/> <img src="/src/dog.png" alt="up"/></p>' +
				'<p><img src="/src/docs/img/a%20b.png" alt="spaced"/> <img src="/src/lib/logo.png" alt="alias"/> <img src="/static.png" alt="abs"/></p>' +
				`<p><img src="/src/docs/cat.png" alt="raw"/> <img src="data:image/png;base64,${PNG.toString('base64')}" alt="inline"/></p>`
		);
	});

	test('a replaced img gets that url as its src prop', async () => {
		const html = await ssr(replaced, '/src/docs/doc.svx');
		expect(html).toContain(
			'<figure><img src="/src/docs/cat.png" alt="cat"/><figcaption>string</figcaption></figure>'
		);
		expect(html).toContain(
			'<figure><img src="/src/lib/logo.png" alt="alias"/><figcaption>string</figcaption></figure>'
		);
		expect(html).toContain(
			'<figure><img src="/static.png" alt="abs"/><figcaption>string</figcaption></figure>'
		);
	});

	test('a missing image fails as a missing import does and names the document', async () => {
		const error = await server.environments.client
			.transformRequest('/src/docs/missing.svx')
			.then(
				() => null,
				(e: Error & { id?: string; frame?: string }) => e
			);
		expect(error).not.toBeNull();
		expect(error!.message).toMatch(
			/^Failed to resolve import "\.\/gone\.png" from ".*src\/docs\/missing\.svx"\. Does the file exist\?$/
		);
		expect(error!.id).toMatch(/src\/docs\/missing\.svx$/);
		expect(error!.frame).toContain("import __mdsvex_img_0 from './gone.png';");
	});
});
