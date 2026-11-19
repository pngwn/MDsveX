import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bench, describe } from 'vitest';

import { parse_markdown_svelte } from '@mdsvex/parse';
import { parse as svelte_parse } from 'svelte/compiler';
import {
	initSync,
	parse_svelte as rsvelte_wasm_parse,
} from '@rsvelte/compiler';

const require = createRequire(import.meta.url);
const rsvelte = require('@rsvelte/vite-plugin-svelte-native');
const {
	decodeParseEnvelope,
} = require('@rsvelte/vite-plugin-svelte-native/parse-envelope.js');

initSync({
	module: readFileSync(
		require.resolve('@rsvelte/compiler/rsvelte_compiler_bg.wasm')
	),
});

// flatten so every parser reads one flat string, not a rope
const flat = (s: string) => Buffer.from(s).toString();

// every tracked component outside the tests, read at bench time
const root = new URL('../../../', import.meta.url);
const corpus = execFileSync('git', ['ls-files', '*.svelte'], { cwd: root })
	.toString()
	.trim()
	.split('\n')
	.filter((f) => !/fixtures|test/.test(f))
	.map((f) => flat(readFileSync(new URL(f, root), 'utf-8')));

const largest = corpus.reduce((a, b) => (b.length > a.length ? b : a));

// the html bench fixture as component markup, no script or style
const html = readFileSync(
	new URL('./fixture-html-only.html', import.meta.url),
	'utf-8'
);
const markup = flat(
	html
		.replace(/<!DOCTYPE html>\n?/, '')
		.replace(/<html[^>]*>\n?/, '')
		.replace(/<\/html>\n?/, '')
		.replace(/<head>[\s\S]*?<\/head>\n?/, '')
		.replace(/<body>\n?/, '')
		.replace(/<\/body>\n?/, '')
		.replace(/<script[\s\S]*?<\/script>\n?/g, '')
);
const markup_large = flat(
	html
		.slice(html.indexOf('<main'), html.indexOf('</main>') + '</main>'.length)
		.repeat(60)
);

// string rows stop at the native boundary, the others build js objects
const parsers: [string, (s: string) => unknown][] = [
	['pfm', (s) => parse_markdown_svelte(s)],
	['svelte', (s) => svelte_parse(s, { modern: true })],
	['rsvelte native, string', (s) => rsvelte.parse(s, { modern: true })],
	[
		'rsvelte native, JSON.parse',
		(s) => JSON.parse(rsvelte.parse(s, { modern: true })),
	],
	[
		'rsvelte native, envelope',
		(s) => decodeParseEnvelope(rsvelte.parseEnvelope(s, { modern: true })),
	],
	['rsvelte wasm, string', (s) => rsvelte_wasm_parse(s).ast],
];

function suite(name: string, docs: string[]) {
	const bytes = docs.reduce((n, s) => n + s.length, 0);
	describe(`svelte parse: ${name} (${bytes} bytes)`, () => {
		for (const [label, parse] of parsers) {
			bench(label, () => {
				for (let i = 0; i < docs.length; i++) parse(docs[i]);
			});
		}
	});
}

suite(`component corpus, ${corpus.length} files`, corpus);
suite('largest component', [largest]);
suite('markup only', [markup]);
suite('markup only, large', [markup_large]);
