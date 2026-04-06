import { readFileSync } from "node:fs";
import { bench, describe } from "vitest";

import { parse_markdown_svelte, PFMParser } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import * as htmlparser2 from "htmlparser2";
import * as parse5 from "parse5";
import { parse as svelte_parse } from "svelte/compiler";

//  Fixtures

const html_full = readFileSync(
	new URL("./fixture-html-only.html", import.meta.url),
	"utf-8",
);

// A smaller fragment (just the <main> content) for a tighter comparison
const html_fragment = html_full.slice(
	html_full.indexOf("<main"),
	html_full.indexOf("</main>") + "</main>".length,
);

// Svelte needs a .svelte-like structure, we wrap the HTML in a template
// so that svelte's parser treats it as component markup (no script/style).
const svelte_full = html_full
	.replace(/<!DOCTYPE html>\n?/, "")
	.replace(/<html[^>]*>\n?/, "")
	.replace(/<\/html>\n?/, "")
	.replace(/<head>[\s\S]*?<\/head>\n?/, "")
	.replace(/<body>\n?/, "")
	.replace(/<\/body>\n?/, "")
	.replace(/<script[\s\S]*?<\/script>\n?/g, "");

const svelte_fragment = html_fragment;

//  Full document parse

describe(`html parse: full document (${html_full.length} bytes)`, () => {
	bench("pfm", () => {
		parse_markdown_svelte(html_full);
	});

	bench("htmlparser2", () => {
		htmlparser2.parseDocument(html_full);
	});

	bench("parse5", () => {
		parse5.parse(html_full);
	});

	bench("svelte", () => {
		svelte_parse(svelte_full, { modern: true });
	});
});

//  Fragment parse

describe(`html parse: fragment (${html_fragment.length} bytes)`, () => {
	bench("pfm", () => {
		parse_markdown_svelte(html_fragment);
	});

	bench("htmlparser2", () => {
		htmlparser2.parseDocument(html_fragment);
	});

	bench("parse5", () => {
		parse5.parseFragment(html_fragment);
	});

	bench("svelte", () => {
		svelte_parse(svelte_fragment, { modern: true });
	});
});

//  htmlparser2 SAX-style (callback only, no tree)

describe(`html parse: SAX / callback-only (${html_full.length} bytes)`, () => {
	bench("pfm (opcode emitter)", () => {
		const tree = new TreeBuilder(html_full.length >> 3 || 128);
		const parser = new PFMParser(tree);
		parser.init();
		parser.feed(html_full);
		parser.finish();
	});

	bench("htmlparser2 (SAX handler)", () => {
		let depth = 0;
		const parser = new htmlparser2.Parser({
			onopentag() {
				depth++;
			},
			onclosetag() {
				depth--;
			},
			ontext() {},
		});
		parser.write(html_full);
		parser.end();
	});
});
