import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build, normalizePath } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// the config file loads mdsvex as an app would, the dev server the build starts loads it again
const DIST = pathToFileURL(resolve(HERE, '../dist/main.js')).href;

const CALLOUT = [
	'<script>',
	"  import logo from './logo.svg';",
	'  let { kind, label, children } = $props();',
	"  $effect(() => console.log('EFFECT_IN_COMPONENT'));",
	'</script>',
	'<aside class="callout {kind}"><img src={logo} alt="" />',
	'  <strong>{@render label()}</strong>{@render children()}',
	'  <small>prod={import.meta.env.PROD} define={__SECRET__}</small>',
	'</aside>',
	'<style>',
	'  .callout { border-left: 6px solid red; }',
	'</style>',
].join('\n');

function write_app(config: string): string {
	const root = mkdtempSync(join(HERE, '.tmp-static-build-'));
	const files: Record<string, string> = {
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
		}),
		'vite.config.js': config,
		'index.html':
			'<!doctype html><div id="app"></div><script type="module" src="/src/main.js"></script>',
		'src/main.js':
			"import { mount } from 'svelte';\nimport Doc from './doc.svx';\nmount(Doc, { target: document.getElementById('app') });\n",
		'src/lib/markdown.ts':
			"export * as directives from './directives/index.ts';",
		'src/lib/directives/index.ts': [
			"export { default as callout } from './Callout.static.svelte';",
			"export { default as counter } from './Counter.svelte';",
		].join('\n'),
		'src/lib/directives/Callout.static.svelte': CALLOUT,
		'src/lib/directives/Counter.svelte':
			'<script>let count = $state(0);</script><button onclick={() => count++}>{count}</button>',
		// large enough that the build emits it as a file
		'src/lib/directives/logo.svg':
			'<svg xmlns="http://www.w3.org/2000/svg"><!--' +
			'x'.repeat(6000) +
			'--></svg>',
		'src/doc.svx': ':::callout[Heads up](kind=warn)\nPress :counter[].\n:::\n',
	};
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

const CONFIG = [
	`import { mdsvex } from ${JSON.stringify(DIST)};`,
	"import { svelte } from '@sveltejs/vite-plugin-svelte';",
	'export default {',
	"  define: { __SECRET__: JSON.stringify('from-define') },",
	"  plugins: [mdsvex({ components: '#lib/markdown.ts' }), svelte({ extensions: ['.svelte', '.svx'] })],",
	'};',
].join('\n');

function read_all(dir: string, ext: string): string {
	return readdirSync(dir, { recursive: true })
		.map(String)
		.filter((f) => f.endsWith(ext))
		.map((f) => readFileSync(join(dir, f), 'utf8'))
		.join('\n');
}

describe('static directives in a build', () => {
	let root: string;

	beforeAll(async () => {
		root = write_app(CONFIG);
		await build({
			root,
			configFile: join(root, 'vite.config.js'),
			logLevel: 'silent',
		});
	}, 120_000);

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('the page carries the html the component rendered with the config of the build', () => {
		const js = read_all(join(root, 'dist'), '.js');
		expect(js).toContain('callout warn');
		// import.meta.env.PROD follows NODE_ENV, which vitest sets to test
		expect(js).toContain('define=from-define');
		expect(js).not.toContain('__mdsvex_asset_');
		// the live directive inside the shell still ships
		expect(js).toContain('count');
	});

	test('the component code never ships', () => {
		const js = read_all(join(root, 'dist'), '.js');
		expect(js).not.toContain('EFFECT_IN_COMPONENT');
		expect(js).not.toContain('Callout.static');
	});

	test('its scoped styles and its asset go through the build', () => {
		const css = read_all(join(root, 'dist'), '.css');
		expect(css).toMatch(
			/\.callout\.svelte-[\w-]+\{border-left:6px solid red\}/
		);
		const assets = readdirSync(join(root, 'dist/assets'));
		const logo = assets.find((f) => /^logo-[\w-]+\.svg$/.test(f));
		expect(logo).toBeDefined();
		expect(read_all(join(root, 'dist'), '.js')).toContain('/assets/' + logo);
	});
});

describe('a build with an inline config', () => {
	test('a static directive is an error naming it', async () => {
		const root = write_app('export default {};');
		try {
			const { mdsvex } = await import(DIST);
			const { svelte } = await import('@sveltejs/vite-plugin-svelte');
			const error = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [
					mdsvex({ components: '#lib/markdown.ts' }),
					svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
				],
			}).then(
				() => null,
				(e: Error) => e
			);
			expect(error?.message).toContain(
				'the static directive callout at ' +
					normalizePath(join(root, 'src/doc.svx')) +
					':1:1 can not render in a build whose vite config was given inline (configFile: false)'
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 60_000);
});
