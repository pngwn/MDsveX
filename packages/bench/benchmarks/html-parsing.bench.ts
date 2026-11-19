import { readFileSync } from "node:fs";
import { bench, describe } from "vitest";

import { parse_markdown_svelte, PFMParser } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import * as htmlparser2 from "htmlparser2";
import * as parse5 from "parse5";
import * as lukeed from "@lukeed/html";
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

// flatten so every parser reads one flat string, not a rope
const html_large = Buffer.from(html_fragment.repeat(60)).toString();

// read every attribute and text value, the work other parsers do eagerly
function read_all(nodes: lukeed.Node[]): number {
	let n = 0;
	for (const node of nodes) {
		if (node.type === "element") {
			n += Object.keys(node.attributes).length;
			n += read_all(node.children);
		} else {
			n += node.value.length;
		}
	}
	return n;
}

//  Full document parse

describe(`html parse: full document (${html_full.length} bytes)`, () => {
	bench("pfm", () => {
		parse_markdown_svelte(html_full);
	});


	bench("@lukeed/html", () => {
		lukeed.parse(html_full);
	});

	bench("@lukeed/html, read all", () => {
		read_all(lukeed.parse(html_full).children);
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


	bench("@lukeed/html", () => {
		lukeed.parse(html_fragment);
	});

	bench("@lukeed/html, read all", () => {
		read_all(lukeed.parse(html_fragment).children);
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

//  Large body

describe(`html parse: large body (${html_large.length} bytes)`, () => {
	bench("pfm", () => {
		parse_markdown_svelte(html_large);
	});

	bench("@lukeed/html", () => {
		lukeed.parse(html_large);
	});

	bench("@lukeed/html, read all", () => {
		read_all(lukeed.parse(html_large).children);
	});

	bench("htmlparser2", () => {
		htmlparser2.parseDocument(html_large);
	});

	bench("parse5", () => {
		parse5.parseFragment(html_large);
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
