import { readFileSync } from "node:fs";
import { bench, describe } from "vitest";

import { PFMParser, WireEmitter } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import { WireTreeBuilder } from "@mdsvex/parse/wire-tree-builder";
import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
import { marked } from "marked";
import { createMarkdownExit } from "markdown-exit";
import { remark } from "remark";

import remarkHtml from "remark-html";

//  Fixtures

function load(name: string): string {
	return readFileSync(new URL(`./${name}`, import.meta.url), "utf-8");
}

const fixtures = {
	prose: load("fixture.md"),
	short: load("fixture-short.md"),
	tables: load("fixture-tables.md"),
	html: load("fixture-html.md"),
	code: load("fixture-code.md"),
};

//  Helpers

/** Batch: parse + render via TreeBuilder -> cursor (same-process, fastest). */
function pfm_e2e(source: string): string {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return renderer.html;
}

const mdexit = createMarkdownExit();
const remark_html = remark().use(remarkHtml);

//  E2e comparison across fixtures

for (const [name, source] of Object.entries(fixtures)) {
	describe(`e2e: ${name} (${source.length} bytes)`, () => {
		bench("pfm", () => {
			pfm_e2e(source);
		});

		bench("marked", () => {
			marked.parse(source);
		});

		bench("markdown-exit", () => {
			mdexit.render(source);
		});

		bench("remark-html", () => {
			remark_html.processSync(source);
		});
	});
}

//  PFM breakdown (prose fixture)

describe("pfm breakdown: parse vs render (prose)", () => {
	const source = fixtures.prose;

	bench("parse only (TreeBuilder)", () => {
		const tree = new TreeBuilder(source.length >> 3 || 128);
		const parser = new PFMParser(tree);
		parser.parse(source);
	});

	bench("parse only (WireEmitter)", () => {
		const emitter = new WireEmitter();
		emitter.set_source(source);
		const parser = new PFMParser(emitter);
		parser.parse(source);
		emitter.flush();
	});

	bench("parse + render (TreeBuilder -> cursor)", () => {
		pfm_e2e(source);
	});
});

//  Incremental e2e (prose fixture)

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
	bench("pfm incremental (TreeBuilder -> CursorHTMLRenderer)", () => {
		const tree = new TreeBuilder(fixtures.prose.length >> 3 || 128);
		const parser = new PFMParser(tree);
		const renderer = new CursorHTMLRenderer();

		parser.init();
		let acc = "";

		for (let i = 0; i < prose_chunks.length; i++) {
			acc += prose_chunks[i];
			parser.feed(prose_chunks[i]);
			renderer.update(tree.get_buffer(), acc);
		}

		parser.finish();
		renderer.update(tree.get_buffer(), acc);
	});

	bench(
		"pfm incremental (wire -> WireTreeBuilder -> CursorHTMLRenderer)",
		() => {
			const emitter = new WireEmitter();
			const parser = new PFMParser(emitter);
			const builder = new WireTreeBuilder();
			const renderer = new CursorHTMLRenderer();

			parser.init();
			let acc = "";

			for (let i = 0; i < prose_chunks.length; i++) {
				acc += prose_chunks[i];
				emitter.set_source(acc);
				parser.feed(prose_chunks[i]);
				const batch = emitter.flush();
				if (batch.length > 0) {
					builder.apply(batch);
					renderer.update(builder.get_buffer(), "");
				}
			}

			emitter.set_source(acc);
			parser.finish();
			const final = emitter.flush();
			if (final.length > 0) {
				builder.apply(final);
				renderer.update(builder.get_buffer(), "");
			}
		},
	);

	bench("pfm batch (for comparison)", () => {
		pfm_e2e(fixtures.prose);
	});

	bench("marked (reparse each chunk)", () => {
		for (let i = 0; i < prose_chunks.length; i++) {
			marked.parse(prose_chunks.slice(0, i + 1).join(""));
		}
	});

	bench("markdown-exit (reparse each chunk)", () => {
		const md = createMarkdownExit();
		for (let i = 0; i < prose_chunks.length; i++) {
			md.render(prose_chunks.slice(0, i + 1).join(""));
		}
	});
});
