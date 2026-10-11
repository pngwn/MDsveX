import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, it, expect } from "vitest";
import { parse_markdown_svelte } from "@mdsvex/parse";
import { autolink } from "@mdsvex/plugin-autolink";

import { write_app } from "../../test/app";

const HERE = dirname(fileURLToPath(import.meta.url));

function get_nodes_by_kind(
	nodes: ReturnType<typeof parse_markdown_svelte>["nodes"],
	kind: string,
) {
	const result: ReturnType<typeof nodes.get_node>[] = [];
	function walk(idx: number) {
		const node = nodes.get_node(idx);
		if (node.kind === kind) result.push(node);
		for (const child of node.children) walk(child);
	}
	walk(0);
	return result;
}

describe("@mdsvex/plugin-autolink", () => {
	it("adds id to heading and wraps content in a link", () => {
		const { nodes } = parse_markdown_svelte("# Hello World\n", {
			plugins: [autolink()],
		});

		const headings = get_nodes_by_kind(nodes, "heading");
		expect(headings).toHaveLength(1);

		const h = headings[0];
		expect(h.metadata.id).toBe("hello-world");

		// heading's first child is a link
		expect(h.children.length).toBeGreaterThan(0);
		const link = nodes.get_node(h.children[0]);
		expect(link.kind).toBe("link");
		expect(link.metadata.href).toBe("#hello-world");
	});

	it("handles multiple headings", () => {
		const { nodes } = parse_markdown_svelte(
			"# First Heading\n\n## Second Heading\n\n### Third\n",
			{ plugins: [autolink()] },
		);

		const headings = get_nodes_by_kind(nodes, "heading");
		expect(headings).toHaveLength(3);

		expect(headings[0].metadata.id).toBe("first-heading");
		expect(headings[1].metadata.id).toBe("second-heading");
		expect(headings[2].metadata.id).toBe("third");

		for (const h of headings) {
			const link = nodes.get_node(h.children[0]);
			expect(link.kind).toBe("link");
			expect(link.metadata.href).toBe(`#${h.metadata.id}`);
		}
	});

	it("slugifies special characters", () => {
		const { nodes } = parse_markdown_svelte(
			"# Hello, World! How's it going?\n",
			{ plugins: [autolink()] },
		);

		const h = get_nodes_by_kind(nodes, "heading")[0];
		expect(h.metadata.id).toBe("hello-world-how-s-it-going");
	});

	it("accepts a custom slug function", () => {
		const { nodes } = parse_markdown_svelte("# Test Heading\n", {
			plugins: [
				autolink({
					slug: (text) => `custom-${text.length}`,
				}),
			],
		});

		const h = get_nodes_by_kind(nodes, "heading")[0];
		expect(h.metadata.id).toBe("custom-12");

		const link = nodes.get_node(h.children[0]);
		expect(link.metadata.href).toBe("#custom-12");
	});

	it("composes with other plugins", () => {
		const { nodes } = parse_markdown_svelte("# Hello\n", {
			plugins: [
				autolink(),
				{
					heading: {
						parse(node) {
							node.attrs.class = "autolinked";
						},
					},
				},
			],
		});

		const h = get_nodes_by_kind(nodes, "heading")[0];
		expect(h.metadata.id).toBe("hello");
		expect(h.metadata.class).toBe("autolinked");
	});

	it("preserves heading text content through the link wrapper", () => {
		const { nodes, errors } = parse_markdown_svelte(
			"# Hello World\n",
			{ plugins: [autolink()] },
		);

		expect(errors.size).toBe(0);

		const headings = get_nodes_by_kind(nodes, "heading");
		expect(headings).toHaveLength(1);

		// the link wrapper should have text children
		const link = nodes.get_node(headings[0].children[0]);
		expect(link.kind).toBe("link");
		expect(link.children.length).toBeGreaterThan(0);
	});
});

describe("as published", () => {
	it("publishes the files its exports name", async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, "index.js")).resolve(
				"@mdsvex/plugin-autolink",
			);
			expect(entry).toBe(
				join(
					root,
					"node_modules",
					"@mdsvex",
					"plugin-autolink",
					"dist",
					"index.js",
				),
			);
			const installed = await import(pathToFileURL(entry).href);
			const { nodes } = parse_markdown_svelte("# Hello\n", {
				plugins: [installed.autolink()],
			});
			expect(nodes.get_node(1).metadata.id).toBe("hello");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
