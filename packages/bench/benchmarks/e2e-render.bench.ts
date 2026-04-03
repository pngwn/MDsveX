import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';

import { PFMParser, WireEmitter, PFMDocument } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { DocumentBuilder } from '@mdsvex/parse/document-builder';
import { PFMCursor } from '@mdsvex/parse/cursor';
import { renderNode, HTMLRenderer } from '@mdsvex/render';
import { renderCursor } from '@mdsvex/render/html-cursor';
import { marked } from 'marked';
import { createMarkdownExit } from 'markdown-exit';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

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

// ── Helpers ──────────────────────────────────────────────────

/** Parse via WireEmitter → PFMDocument, return doc. */
function pfm_parse_to_doc(source: string): PFMDocument {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();
	const doc = new PFMDocument();
	doc.apply(batch);
	return doc;
}

/** Full e2e: parse + render to HTML string (via wire format). */
function pfm_e2e(source: string): string {
	const doc = pfm_parse_to_doc(source);
	return renderNode(doc.root!);
}

/** Full e2e: parse + render via DocumentBuilder (no wire roundtrip). */
function pfm_e2e_direct(source: string): string {
	const builder = new DocumentBuilder();
	builder.set_source(source);
	const parser = new PFMParser(builder);
	parser.parse(source);
	return renderNode(builder.root!);
}

/** Full e2e: parse + render via TreeBuilder + cursor (SOA, zero per-node allocs). */
function pfm_e2e_cursor(source: string): string {
	const tree = new TreeBuilder((source.length >> 3) || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const cursor = new PFMCursor(tree.get_buffer(), source);
	return renderCursor(cursor);
}

const mdexit = createMarkdownExit();
const remark_html = remark().use(remarkHtml);

// ── E2e comparison across fixtures ──────────────────────────

for (const [name, source] of Object.entries(fixtures)) {
	describe(`e2e: ${name} (${source.length} bytes)`, () => {
		bench('pfm (wire)', () => {
			pfm_e2e(source);
		});

		bench('pfm (direct)', () => {
			pfm_e2e_direct(source);
		});

		bench('pfm (cursor)', () => {
			pfm_e2e_cursor(source);
		});

		bench('marked', () => {
			marked.parse(source);
		});

		bench('markdown-exit', () => {
			mdexit.render(source);
		});

		// bench('remark-html', () => {
		// 	remark_html.processSync(source);
		// });
	});
}

// ── PFM breakdown (prose fixture) ───────────────────────────

describe('pfm breakdown: parse vs render (prose)', () => {
	const source = fixtures.prose;

	bench('parse only (WireEmitter)', () => {
		const emitter = new WireEmitter();
		emitter.set_source(source);
		const parser = new PFMParser(emitter);
		parser.parse(source);
		emitter.flush();
	});

	bench('parse only (TreeBuilder)', () => {
		const tree = new TreeBuilder((source.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.parse(source);
	});

	bench('parse + build doc (wire)', () => {
		pfm_parse_to_doc(source);
	});

	bench('parse + build doc + render (wire)', () => {
		pfm_e2e(source);
	});

	bench('parse + build doc (direct)', () => {
		const builder = new DocumentBuilder();
		builder.set_source(source);
		const parser = new PFMParser(builder);
		parser.parse(source);
	});

	bench('parse + build doc + render (direct)', () => {
		pfm_e2e_direct(source);
	});

	bench('parse + render (cursor)', () => {
		pfm_e2e_cursor(source);
	});
});

// ── Incremental e2e (prose fixture) ─────────────────────────

const CHUNK_SIZE = 50;

function make_chunks(source: string): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < source.length; i += CHUNK_SIZE) {
		chunks.push(source.slice(i, Math.min(i + CHUNK_SIZE, source.length)));
	}
	return chunks;
}

const prose_chunks = make_chunks(fixtures.prose);

describe(`incremental e2e: prose (${CHUNK_SIZE}-char chunks, ${prose_chunks.length} chunks)`, () => {
	bench('pfm incremental (feed + HTMLRenderer)', () => {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const doc = new PFMDocument();
		const renderer = new HTMLRenderer();

		parser.init();
		let acc = '';

		for (let i = 0; i < prose_chunks.length; i++) {
			acc += prose_chunks[i];
			emitter.set_source(acc);
			parser.feed(prose_chunks[i]);
			const batch = emitter.flush();
			if (batch.length > 0) {
				doc.apply(batch);
				renderer.update(doc);
			}
		}

		emitter.set_source(acc);
		parser.finish();
		const final = emitter.flush();
		if (final.length > 0) {
			doc.apply(final);
			renderer.update(doc);
		}
	});

	bench('pfm batch (for comparison)', () => {
		pfm_e2e(fixtures.prose);
	});

	bench('marked (reparse each chunk)', () => {
		for (let i = 0; i < prose_chunks.length; i++) {
			marked.parse(prose_chunks.slice(0, i + 1).join(''));
		}
	});

	bench('markdown-exit (reparse each chunk)', () => {
		const md = createMarkdownExit();
		for (let i = 0; i < prose_chunks.length; i++) {
			md.render(prose_chunks.slice(0, i + 1).join(''));
		}
	});
});
