import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';

import { parse_markdown_svelte, PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { remark } from 'remark';
import { marked } from 'marked';
import { createMarkdownExit } from 'markdown-exit';
import { parse as comark_parse, createParse as comark_createParse } from 'comark';
import { StreamParser, Renderer, MarkdownRecovery } from '@aibind/markdown';

// ── Fixtures ────────────────────────────────────────────────

function load(name: string): string {
	return readFileSync(new URL(`./${name}`, import.meta.url), 'utf-8');
}

const fixtures = {
	prose: load('fixture.md'),
	short: load('fixture-short.md'),
	tables: load('fixture-tables.md'),
	html: load('fixture-html.md'),
	code: load('fixture-code.md'),
};

const remark_processor = remark();
const mdexit = createMarkdownExit();

// ── Parser comparison across fixtures ───────────────────────

for (const [name, source] of Object.entries(fixtures)) {
	describe(`parse: ${name} (${source.length} bytes, ${source.split('\n').length} lines)`, () => {
		bench('pfm (parse_markdown_svelte)', () => {
			parse_markdown_svelte(source);
		});

		bench('remark', () => {
			remark_processor.parse(source);
		});

		bench('marked (lexer)', () => {
			marked.lexer(source);
		});

		bench('markdown-exit (parse)', () => {
			mdexit.parse(source);
		});

		bench('comark (parse)', async () => {
			await comark_parse(source);
		});
	});
}

// ── Incremental parsing (5-char chunks) ──────────────────────

const CHUNK_SIZE = 5;
const LARGE_CHUNK_SIZE = 50;

function make_chunks(source: string, size: number): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < source.length; i += size) {
		chunks.push(source.slice(i, Math.min(i + size, source.length)));
	}
	return chunks;
}

const prose = fixtures.prose;
const small_chunks = make_chunks(prose, CHUNK_SIZE);
const large_chunks = make_chunks(prose, LARGE_CHUNK_SIZE);

for (const [chunks, size] of [[small_chunks, CHUNK_SIZE], [large_chunks, LARGE_CHUNK_SIZE]] as const) {
	describe(`incremental: prose (${size}-char chunks, ${chunks.length} chunks)`, () => {
		bench('pfm (feed)', () => {
			const tree = new TreeBuilder((prose.length >> 3) || 128);
			const parser = new PFMParser(tree);
			parser.init();
			for (let i = 0; i < chunks.length; i++) {
				parser.feed(chunks[i]);
			}
			parser.finish();
		});

		bench('marked (reparse)', () => {
			for (let i = 0; i < chunks.length; i++) {
				marked.lexer(chunks.slice(0, i + 1).join(''));
			}
		});

		bench('markdown-exit (reparse)', () => {
			const md = createMarkdownExit();
			for (let i = 0; i < chunks.length; i++) {
				md.parse(chunks.slice(0, i + 1).join(''));
			}
		});

		bench('comark (streaming reparse)', async () => {
			const parse = comark_createParse();
			for (let i = 0; i < chunks.length; i++) {
				await parse(chunks.slice(0, i + 1).join(''), { streaming: true });
			}
		});
	});
}

// ── PFM incremental vs batch ────────────────────────────────

describe('pfm: incremental vs batch (prose)', () => {
	bench('pfm (feed 5-char chunks)', () => {
		const tree = new TreeBuilder((prose.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < small_chunks.length; i++) {
			parser.feed(small_chunks[i]);
		}
		parser.finish();
	});

	bench('pfm (feed 50-char chunks)', () => {
		const tree = new TreeBuilder((prose.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < large_chunks.length; i++) {
			parser.feed(large_chunks[i]);
		}
		parser.finish();
	});

	bench('pfm (feed whole)', () => {
		const tree = new TreeBuilder((prose.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.init();
		parser.feed(prose);
		parser.finish();
	});

	bench('pfm (parse_markdown_svelte)', () => {
		parse_markdown_svelte(prose);
	});
});
