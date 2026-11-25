import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));

const svelte = {
	name: 'svelte',
	setup(b) {
		// Node.svelte sits in another package, which may resolve its own copy
		// of svelte, and two runtimes do not share their effects
		b.onResolve({ filter: /^svelte(\/|$)/ }, (args) =>
			args.resolveDir === here
				? undefined
				: b.resolve(args.path, { resolveDir: here, kind: args.kind })
		);
		b.onLoad({ filter: /\.svelte$/ }, (args) => ({
			contents: compile(readFileSync(args.path, 'utf8'), {
				generate: 'client',
				dev: false,
				filename: args.path,
			}).js.code,
			loader: 'js',
		}));
	},
};

/** the production bundle of one adapter by file name, the entry is adapter.js */
export async function build_adapter(name) {
	const out = await build({
		entryPoints: { adapter: join(here, 'adapters', name + '.js') },
		bundle: true,
		write: false,
		format: 'esm',
		splitting: true,
		outdir: join(here, 'out'),
		platform: 'browser',
		conditions: ['svelte', 'browser', 'production'],
		define: { 'process.env.NODE_ENV': '"production"' },
		loader: { '.wasm': 'binary' },
		minify: true,
		legalComments: 'none',
		logLevel: 'silent',
		plugins: [svelte],
	}).catch((e) => {
		throw new Error(
			`could not bundle ${name}, build parse and render first\n${e.message}`
		);
	});
	const files = new Map();
	for (const file of out.outputFiles)
		files.set(basename(file.path), {
			body: file.contents,
			gzip: gzipSync(file.contents, { level: 9 }).length,
		});
	return files;
}
