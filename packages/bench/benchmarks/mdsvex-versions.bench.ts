import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';

import {
	compile as legacy_compile,
	mdsvex as legacy_mdsvex,
} from 'mdsvex-legacy';
import { compile, CompilerSession } from '../../mdsvex/dist/main.js';
import { create_highlight } from '../../mdsvex/dist/highlight.js';

function load(name: string): string {
	return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

const fixtures = {
	prose: load('fixture.md'),
	short: load('fixture-short.md'),
	tables: load('fixture-tables.md'),
	html: load('fixture-html.md'),
	code: load('fixture-code.md'),
};

const corpus = [fixtures.prose, fixtures.code, fixtures.html, fixtures.tables];

const highlight = create_highlight();
const session = new CompilerSession();
const legacy_defaults = legacy_mdsvex();
const legacy_plain = legacy_mdsvex({ highlight: false, smartypants: false });

// legacy defaults highlight and curl quotes, next does both only when asked
function suite(name: string, docs: string[]) {
	const bytes = docs.reduce((n, s) => n + s.length, 0);
	describe(`mdsvex compile: ${name} (${bytes} bytes)`, () => {
		bench('0.12.8 compile, defaults', async () => {
			for (const s of docs) await legacy_compile(s);
		});

		bench('0.12.8 preprocessor, defaults', async () => {
			for (const s of docs)
				await legacy_defaults.markup({ content: s, filename: 'doc.svx' });
		});

		bench('next, highlight and smart punctuation', () => {
			for (const s of docs) compile(s, { highlight, smart_punctuation: true });
		});

		bench('0.12.8 preprocessor, plain', async () => {
			for (const s of docs)
				await legacy_plain.markup({ content: s, filename: 'doc.svx' });
		});

		bench('next, plain', () => {
			for (const s of docs) compile(s);
		});

		bench('next, plain, reused session', () => {
			for (const s of docs) session.compile(s);
		});
	});
}

suite('corpus, 4 docs', corpus);
for (const [name, source] of Object.entries(fixtures)) suite(name, [source]);
