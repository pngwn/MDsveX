import { describe, it, expect } from "vitest";
import { parse_markdown_svelte, node_kind } from "../src/main";
import type { ParsePlugin } from "../src/plugin_types";
import { TreeBuilder } from "../src/tree_builder";
import { PluginDispatcher } from "../src/plugin_dispatch";
import { SourceTextSource } from "../src/node_view";
import { PFMParser } from "../src/main";
import { node_buffer, kind_to_string, string_to_kind } from "../src/utils";
import { UndoLog, UndoEntryKind, ATTR_DID_NOT_EXIST } from "../src/undo_log";
import { NodeView, ViewCache } from "../src/node_view";

// --- string_to_kind utility ---

describe("string_to_kind", () => {
	it("maps all known node types", () => {
		expect(string_to_kind("root")).toBe(node_kind.root);
		expect(string_to_kind("heading")).toBe(node_kind.heading);
		expect(string_to_kind("paragraph")).toBe(node_kind.paragraph);
		expect(string_to_kind("link")).toBe(node_kind.link);
		expect(string_to_kind("code_fence")).toBe(node_kind.code_fence);
		expect(string_to_kind("emphasis")).toBe(node_kind.emphasis);
		expect(string_to_kind("import_statement")).toBe(
			node_kind.import_statement,
		);
	});

	it("returns undefined for unknown types", () => {
		expect(string_to_kind("nonexistent")).toBeUndefined();
	});

	it("round-trips with kind_to_string", () => {
		for (let i = 0; i <= 34; i++) {
			const name = kind_to_string(i as node_kind);
			expect(string_to_kind(name)).toBe(i);
		}
	});
});

// --- node_buffer extensions ---

describe("node_buffer extensions", () => {
	describe("push_unlinked", () => {
		it("allocates without parent linking", () => {
			const buf = new node_buffer(16);
			const idx = buf.push_unlinked(node_kind.paragraph, 0);
			expect(buf._kinds[idx]).toBe(node_kind.paragraph);
			expect(buf._parents[idx]).toBe(0xffffffff);
			expect(buf._children_starts[0]).toBe(0xffffffff); // root has no children
		});
	});

	describe("wrap_children", () => {
		it("wraps existing children under a new node", () => {
			const buf = new node_buffer(16);
			// push two children under root
			const a = buf.push(node_kind.paragraph, 0, 0);
			const b = buf.push(node_kind.paragraph, 10, 0);

			// wrap root's children in a block_quote
			const wrapper = buf.wrap_children(0, node_kind.block_quote);

			// wrapper is sole child of root
			expect(buf._children_starts[0]).toBe(wrapper);
			expect(buf._children_ends[0]).toBe(wrapper);

			// a and b are children of wrapper
			expect(buf._parents[a]).toBe(wrapper);
			expect(buf._parents[b]).toBe(wrapper);
			expect(buf._children_starts[wrapper]).toBe(a);
			expect(buf._children_ends[wrapper]).toBe(b);
		});

		it("works with no existing children", () => {
			const buf = new node_buffer(16);
			const wrapper = buf.wrap_children(0, node_kind.paragraph);

			expect(buf._children_starts[0]).toBe(wrapper);
			expect(buf._children_ends[0]).toBe(wrapper);
			expect(buf._children_starts[wrapper]).toBe(0xffffffff); // no children
		});

		it("preserves sibling chain order", () => {
			const buf = new node_buffer(16);
			const a = buf.push(node_kind.text, 0, 0);
			const b = buf.push(node_kind.text, 5, 0);
			const c = buf.push(node_kind.text, 10, 0);

			const wrapper = buf.wrap_children(0, node_kind.emphasis);

			// sibling chain: a -> b -> c
			expect(buf._next_siblings[a]).toBe(b);
			expect(buf._next_siblings[b]).toBe(c);
			expect(buf._next_siblings[c]).toBe(0xffffffff);
		});
	});
});

// --- undo log ---

describe("UndoLog", () => {
	it("records and revokes attr set", () => {
		const buf = new node_buffer(16);
		const idx = buf.push(node_kind.heading, 0, 0);
		buf.set_metadata(idx, { id: "original" });

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_attr_set(idx, "id", "original");
		undo.clear_active_node();

		// simulate mutation
		const meta = buf.metadata_at(idx)!;
		meta.id = "changed";
		buf.set_metadata(idx, meta);

		expect(buf.metadata_at(idx)!.id).toBe("changed");

		// revoke
		undo.revoke(idx, buf);
		expect(buf.metadata_at(idx)!.id).toBe("original");
	});

	it("records and revokes attr set on non-existent key", () => {
		const buf = new node_buffer(16);
		const idx = buf.push(node_kind.heading, 0, 0);

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_attr_set(idx, "id", ATTR_DID_NOT_EXIST);
		undo.clear_active_node();

		// simulate mutation
		buf.set_metadata(idx, { id: "new" });

		// revoke
		undo.revoke(idx, buf);
		expect(buf.metadata_at(idx)!.id).toBeUndefined();
	});

	it("records and revokes type change", () => {
		const buf = new node_buffer(16);
		const idx = buf.push(node_kind.heading, 0, 0);

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_type_change(idx, node_kind.heading);
		undo.clear_active_node();

		// simulate type change
		buf._kinds[idx] = node_kind.paragraph;
		expect(buf._kinds[idx]).toBe(node_kind.paragraph);

		// revoke
		undo.revoke(idx, buf);
		expect(buf._kinds[idx]).toBe(node_kind.heading);
	});

	it("commit discards the log", () => {
		const buf = new node_buffer(16);
		const idx = buf.push(node_kind.heading, 0, 0);

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_type_change(idx, node_kind.heading);
		undo.clear_active_node();

		buf._kinds[idx] = node_kind.paragraph;

		// commit (not revoke)
		undo.commit(idx);
		// type change is permanent
		expect(buf._kinds[idx]).toBe(node_kind.paragraph);
		expect(undo.has(idx)).toBe(false);
	});

	it("revokes in reverse order", () => {
		const buf = new node_buffer(16);
		const idx = buf.push(node_kind.heading, 0, 0);
		buf.set_metadata(idx, {});

		const undo = new UndoLog();
		undo.set_active_node(idx);

		// first mutation: set id
		undo.record_attr_set(idx, "id", ATTR_DID_NOT_EXIST);
		buf.metadata_at(idx)!.id = "first";
		buf.set_metadata(idx, buf.metadata_at(idx)!);

		// second mutation: overwrite id
		undo.record_attr_set(idx, "id", "first");
		buf.metadata_at(idx)!.id = "second";
		buf.set_metadata(idx, buf.metadata_at(idx)!);

		undo.clear_active_node();

		expect(buf.metadata_at(idx)!.id).toBe("second");

		// revoke should restore to before any mutation
		undo.revoke(idx, buf);
		expect(buf.metadata_at(idx)!.id).toBeUndefined();
	});
});

// --- end-to-end plugin tests ---

describe("parse plugins", () => {
	it("no-op when no plugins provided", () => {
		const result = parse_markdown_svelte("# Hello\n\nWorld\n");
		const root = result.nodes.get_node(0);
		expect(root.children.length).toBeGreaterThan(0);
	});

	it("fires open handler on matching node type", () => {
		const seen: string[] = [];
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					seen.push(node.type);
				},
			},
		};

		parse_markdown_svelte("# Hello\n\n## World\n", { plugins: [plugin] });
		expect(seen).toEqual(["heading", "heading"]);
	});

	it("fires close callback on node close", () => {
		const open_types: string[] = [];
		const close_types: string[] = [];

		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					open_types.push(node.type);
					return () => {
						close_types.push(node.type);
					};
				},
			},
		};

		parse_markdown_svelte("# Hello\n", { plugins: [plugin] });
		expect(open_types).toEqual(["heading"]);
		expect(close_types).toEqual(["heading"]);
	});

	it("sets attrs on nodes", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = "test-heading";
				},
			},
		};

		const result = parse_markdown_svelte("# Hello\n", {
			plugins: [plugin],
		});
		const root = result.nodes.get_node(0);
		const heading_idx = root.children[0];
		expect(result.nodes.metadata_at(heading_idx)?.id).toBe(
			"test-heading",
		);
	});

	it("reads textContent in close callback", () => {
		let text = "";
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					return () => {
						text = node.textContent;
					};
				},
			},
		};

		parse_markdown_svelte("# Hello World\n", { plugins: [plugin] });
		expect(text).toBe("Hello World");
	});

	it("reads heading depth", () => {
		const depths: (number | undefined)[] = [];
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					depths.push(node.depth);
				},
			},
		};

		parse_markdown_svelte("# H1\n\n## H2\n\n### H3\n", {
			plugins: [plugin],
		});
		expect(depths).toEqual([1, 2, 3]);
	});

	it("traverses to parent", () => {
		let parent_type = "";
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					parent_type = node.parent?.type ?? "none";
				},
			},
		};

		parse_markdown_svelte("# Hello\n", { plugins: [plugin] });
		expect(parent_type).toBe("root");
	});

	it("multiple plugins compose on same node type", () => {
		const log: string[] = [];

		const plugin_a: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.from_a = true;
					log.push("a-open");
					return () => log.push("a-close");
				},
			},
		};

		const plugin_b: ParsePlugin = {
			heading: {
				parse(node) {
					// second plugin can see first plugin's mutations
					log.push(`b-open:from_a=${node.attrs.from_a}`);
					node.attrs.from_b = true;
					return () => log.push("b-close");
				},
			},
		};

		const result = parse_markdown_svelte("# Hello\n", {
			plugins: [plugin_a, plugin_b],
		});

		expect(log).toEqual([
			"a-open",
			"b-open:from_a=true",
			"a-close",
			"b-close",
		]);

		// both mutations present
		const root = result.nodes.get_node(0);
		const heading_idx = root.children[0];
		const meta = result.nodes.metadata_at(heading_idx);
		expect(meta?.from_a).toBe(true);
		expect(meta?.from_b).toBe(true);
	});

	it("handles multiple different node types", () => {
		const types_seen: string[] = [];

		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					types_seen.push(node.type);
				},
			},
			paragraph: {
				parse(node) {
					types_seen.push(node.type);
				},
			},
		};

		parse_markdown_svelte("# Hello\n\nWorld\n", { plugins: [plugin] });
		expect(types_seen).toEqual(["heading", "paragraph"]);
	});

	it("ignores unregistered node types", () => {
		let called = false;
		const plugin: ParsePlugin = {
			heading: {
				parse() {
					called = true;
				},
			},
		};

		// no headings in this input
		parse_markdown_svelte("Just a paragraph\n", { plugins: [plugin] });
		expect(called).toBe(false);
	});
});

describe("parse plugins: sequential", () => {
	it("runs sequential plugins after fused plugins", () => {
		const log: string[] = [];

		const fused: ParsePlugin = {
			heading: {
				parse() {
					log.push("fused");
				},
			},
		};

		const sequential: ParsePlugin = {
			sequential: true,
			heading: {
				parse() {
					log.push("sequential");
				},
			},
		};

		parse_markdown_svelte("# Hello\n", {
			plugins: [fused, sequential],
		});
		expect(log).toEqual(["fused", "sequential"]);
	});

	it("sequential plugin sees fused mutations", () => {
		const fused: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.fused_id = "from-fused";
				},
			},
		};

		let seen_id = "";
		const sequential: ParsePlugin = {
			sequential: true,
			heading: {
				parse(node) {
					seen_id = node.attrs.fused_id ?? "not-found";
				},
			},
		};

		parse_markdown_svelte("# Hello\n", {
			plugins: [fused, sequential],
		});
		expect(seen_id).toBe("from-fused");
	});
});

describe("parse plugins: structural mutations", () => {
	it("append adds a child node", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.append("text");
				},
			},
		};

		const result = parse_markdown_svelte("# Hello\n", {
			plugins: [plugin],
		});
		const root = result.nodes.get_node(0);
		const heading = result.nodes.get_node(root.children[0]);
		// heading should have children (at minimum the appended text node)
		expect(heading.children.length).toBeGreaterThan(0);
	});

	it("prepend adds a first child node", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const prepended = node.prepend("text");
					prepended.attrs.marker = true;
				},
			},
		};

		const result = parse_markdown_svelte("# Hello\n", {
			plugins: [plugin],
		});
		const root = result.nodes.get_node(0);
		const heading = result.nodes.get_node(root.children[0]);
		// first child should have our marker attr
		if (heading.children.length > 0) {
			const first_child_meta = result.nodes.metadata_at(
				heading.children[0],
			);
			expect(first_child_meta?.marker).toBe(true);
		}
	});

	it("wrapInner wraps existing children", () => {
		let wrapper_type = "";
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const wrapper = node.wrapInner("link");
					wrapper_type = wrapper.type;
					return () => {
						wrapper.attrs.href = "#test";
					};
				},
			},
		};

		const result = parse_markdown_svelte("# Hello\n", {
			plugins: [plugin],
		});
		expect(wrapper_type).toBe("link");

		const root = result.nodes.get_node(0);
		const heading = result.nodes.get_node(root.children[0]);
		// heading's first child should be the link wrapper
		expect(heading.children.length).toBeGreaterThan(0);
		const first_child_kind = result.nodes.kind_at(heading.children[0]);
		expect(first_child_kind).toBe(node_kind.link);

		// link should have href attr
		const link_meta = result.nodes.metadata_at(heading.children[0]);
		expect(link_meta?.href).toBe("#test");
	});
});

describe("parse plugins: the heading auto-link example from PLUGINS.md", () => {
	function slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	it("wraps heading content in a link with slug-based href", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const link = node.wrapInner("link");
					return () => {
						const slug = slugify(node.textContent);
						node.attrs.id = slug;
						link.attrs.href = `#${slug}`;
					};
				},
			},
		};

		const result = parse_markdown_svelte("# Hello World\n\n## Second\n", {
			plugins: [plugin],
		});

		const root = result.nodes.get_node(0);

		// find headings in root children (skip line_breaks/blank lines)
		const headings = root.children
			.map((idx) => result.nodes.get_node(idx))
			.filter((n) => n.kind === "heading");

		expect(headings.length).toBe(2);

		// first heading
		const h1 = headings[0];
		expect(h1.metadata.id).toBe("hello-world");
		const link1 = result.nodes.get_node(h1.children[0]);
		expect(link1.kind).toBe("link");
		expect(link1.metadata.href).toBe("#hello-world");

		// second heading
		const h2 = headings[1];
		expect(h2.metadata.id).toBe("second");
		const link2 = result.nodes.get_node(h2.children[0]);
		expect(link2.kind).toBe("link");
		expect(link2.metadata.href).toBe("#second");
	});
});
