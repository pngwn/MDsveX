import { readFileSync } from "node:fs";
import { PFMParser, parse_markdown_svelte } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
import { bench, describe } from "vitest";

function load(name: string): string {
	return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

const corpus = [
	load("fixture.md"),
	load("fixture-code.md"),
	load("fixture-html.md"),
	load("fixture-tables.md"),
];

const parsed = corpus.map((source) => parse_markdown_svelte(source));
const options = { time: 1_500, warmupTime: 300 };

describe(`next core pipeline (${corpus.reduce((n, source) => n + source.length, 0)} bytes)`, () => {
	bench("parse direct", () => {
		let nodes = 0;
		for (const source of corpus) {
			const tree = new TreeBuilder(source.length >> 3 || 128);
			new PFMParser(tree).parse(source);
			nodes += tree.get_buffer().size;
		}
		return nodes;
	}, options);

	bench("parse public", () => {
		let nodes = 0;
		for (const source of corpus) {
			nodes += parse_markdown_svelte(source).nodes.size;
		}
		return nodes;
	}, options);

	bench("render cursor", () => {
		let bytes = 0;
		for (const result of parsed) {
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.update(result.nodes, result.source);
			bytes += renderer.html.length;
		}
		return bytes;
	}, options);

	bench("render mapped", () => {
		let mappings = 0;
		for (const result of parsed) {
			const renderer = new CursorHTMLRenderer({ cache: false });
			mappings += renderer.update_mapped(result.nodes, result.source).mappings.length;
		}
		return mappings;
	}, options);

	bench("parse and render", () => {
		let bytes = 0;
		for (const source of corpus) {
			const result = parse_markdown_svelte(source);
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.update(result.nodes, result.source);
			bytes += renderer.html.length;
		}
		return bytes;
	}, options);

	bench("parse and render mapped", () => {
		let mappings = 0;
		for (const source of corpus) {
			const result = parse_markdown_svelte(source);
			const renderer = new CursorHTMLRenderer({ cache: false });
			mappings += renderer.update_mapped(result.nodes, result.source).mappings.length;
		}
		return mappings;
	}, options);
});
