import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile as svelte_compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const mdsvex_dist = resolve(here, '../../mdsvex/dist/compile.js');

let mdsvex = null;
async function load_mdsvex() {
	if (mdsvex === null)
		mdsvex = await import(pathToFileURL(mdsvex_dist).href).catch((e) => {
			throw new Error(
				`could not load ${mdsvex_dist}, build parse, render and mdsvex first\n${e.message}`
			);
		});
	return mdsvex;
}

/** the esbuild plugin that serves the page and compiles every .svelte file */
function svelte_plugin(page_svelte, generate) {
	const options = { generate, runes: true, dev: false };
	return {
		name: 'hydration-page',
		setup(b) {
			b.onResolve({ filter: /^page:/ }, () => ({
				path: join(here, 'page.svelte'),
				namespace: 'page',
			}));
			b.onLoad({ filter: /.*/, namespace: 'page' }, () => ({
				contents: svelte_compile(page_svelte, {
					...options,
					filename: 'page.svelte',
				}).js.code,
				loader: 'js',
				resolveDir: here,
			}));
			b.onLoad({ filter: /\.svelte$/ }, (args) => ({
				contents: svelte_compile(readFileSync(args.path, 'utf8'), {
					...options,
					filename: args.path,
				}).js.code,
				loader: 'js',
			}));
		},
	};
}

const CLIENT_ENTRY = `
import { hydrate, unmount, flushSync } from 'svelte';
import App from 'page:';
export function run(target) {
	const t0 = performance.now();
	const app = hydrate(App, { target });
	flushSync();
	const t1 = performance.now();
	return { app, ms: t1 - t0 };
}
export { unmount };
`;

const SERVER_ENTRY = `
import { render } from 'svelte/server';
import App from 'page:';
export function html() { return render(App).body; }
`;

async function bundle(entry, page_svelte, generate) {
	const out = await build({
		stdin: { contents: entry, resolveDir: here, loader: 'js' },
		bundle: true,
		write: false,
		format: 'esm',
		platform: generate === 'server' ? 'node' : 'browser',
		conditions:
			generate === 'server' ? ['production'] : ['browser', 'production'],
		minify: generate === 'client',
		legalComments: 'none',
		logLevel: 'silent',
		plugins: [svelte_plugin(page_svelte, generate)],
	});
	return out.outputFiles[0].text;
}

/**
 * one arm of one page, the svelte mdsvex wrote, the client bundle and the
 * server rendered html
 */
export async function build_arm(source, compile_options) {
	const { compile } = await load_mdsvex();
	const page_svelte = compile(source, compile_options).code;
	const [client, server] = await Promise.all([
		bundle(CLIENT_ENTRY, page_svelte, 'client'),
		bundle(SERVER_ENTRY, page_svelte, 'server'),
	]);
	const mod = await import(
		'data:text/javascript;base64,' + Buffer.from(server).toString('base64')
	);
	return { page_svelte, client, html: mod.html() };
}
