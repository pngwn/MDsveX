import { describe, it, expect } from "vitest";
import { parse_markdown_svelte, NodeKind } from "../src/main";
import type { ParsePlugin } from "../src/plugin_types";
import { TreeBuilder } from "../src/tree_builder";
import { PluginDispatcher } from "../src/plugin_dispatch";
import { SourceTextSource, WireTextSource } from "../src/node_view";
import { PFMParser, WireEmitter } from "../src/main";
import { WireTreeBuilder } from "../src/wire_tree_builder";
import { NodeBuffer, kind_to_string, string_to_kind } from "../src/utils";
import { UndoLog, UndoEntryKind, ATTR_DID_NOT_EXIST } from "../src/undo_log";
import { NodeView, ViewCache } from "../src/node_view";


describe("string_to_kind", () => {
	it("maps all known node types", () => {
		expect(string_to_kind("root")).toBe(NodeKind.root);
		expect(string_to_kind("heading")).toBe(NodeKind.heading);
		expect(string_to_kind("paragraph")).toBe(NodeKind.paragraph);
		expect(string_to_kind("link")).toBe(NodeKind.link);
		expect(string_to_kind("code_fence")).toBe(NodeKind.code_fence);
		expect(string_to_kind("emphasis")).toBe(NodeKind.emphasis);
		expect(string_to_kind("import_statement")).toBe(
			NodeKind.import_statement,
		);
	});

	it("returns undefined for unknown types", () => {
		expect(string_to_kind("nonexistent")).toBeUndefined();
	});

	it("round-trips with kind_to_string", () => {
		for (let i = 0; i <= 34; i++) {
			const name = kind_to_string(i as NodeKind);
			expect(string_to_kind(name)).toBe(i);
		}
	});
});


describe("NodeBuffer extensions", () => {
	describe("push_unlinked", () => {
		it("allocates without parent linking", () => {
			const buf = new NodeBuffer(16);
			const idx = buf.push_unlinked(NodeKind.paragraph, 0);
			expect(buf._kinds[idx]).toBe(NodeKind.paragraph);
			expect(buf._parents[idx]).toBe(0xffffffff);
			expect(buf._children_starts[0]).toBe(0xffffffff); // root has no children
		});
	});

	describe("wrap_children", () => {
		it("wraps existing children under a new node", () => {
			const buf = new NodeBuffer(16);
			// push two children under root
			const a = buf.push(NodeKind.paragraph, 0, 0);
			const b = buf.push(NodeKind.paragraph, 10, 0);

			// wrap root's children in a block_quote
			const wrapper = buf.wrap_children(0, NodeKind.block_quote);

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
			const buf = new NodeBuffer(16);
			const wrapper = buf.wrap_children(0, NodeKind.paragraph);

			expect(buf._children_starts[0]).toBe(wrapper);
			expect(buf._children_ends[0]).toBe(wrapper);
			expect(buf._children_starts[wrapper]).toBe(0xffffffff); // no children
		});

		it("preserves sibling chain order", () => {
			const buf = new NodeBuffer(16);
			const a = buf.push(NodeKind.text, 0, 0);
			const b = buf.push(NodeKind.text, 5, 0);
			const c = buf.push(NodeKind.text, 10, 0);

			const wrapper = buf.wrap_children(0, NodeKind.emphasis);

			// sibling chain: a -> b -> c
			expect(buf._next_siblings[a]).toBe(b);
			expect(buf._next_siblings[b]).toBe(c);
			expect(buf._next_siblings[c]).toBe(0xffffffff);
		});
	});
});


describe("UndoLog", () => {
	it("records and revokes attr set", () => {
		const buf = new NodeBuffer(16);
		const idx = buf.push(NodeKind.heading, 0, 0);
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
		const buf = new NodeBuffer(16);
		const idx = buf.push(NodeKind.heading, 0, 0);

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
		const buf = new NodeBuffer(16);
		const idx = buf.push(NodeKind.heading, 0, 0);

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_type_change(idx, NodeKind.heading);
		undo.clear_active_node();

		// simulate type change
		buf._kinds[idx] = NodeKind.paragraph;
		expect(buf._kinds[idx]).toBe(NodeKind.paragraph);

		// revoke
		undo.revoke(idx, buf);
		expect(buf._kinds[idx]).toBe(NodeKind.heading);
	});

	it("commit discards the log", () => {
		const buf = new NodeBuffer(16);
		const idx = buf.push(NodeKind.heading, 0, 0);

		const undo = new UndoLog();
		undo.set_active_node(idx);
		undo.record_type_change(idx, NodeKind.heading);
		undo.clear_active_node();

		buf._kinds[idx] = NodeKind.paragraph;

		// commit (not revoke)
		undo.commit(idx);
		// type change is permanent
		expect(buf._kinds[idx]).toBe(NodeKind.paragraph);
		expect(undo.has(idx)).toBe(false);
	});

	it("revokes in reverse order", () => {
		const buf = new NodeBuffer(16);
		const idx = buf.push(NodeKind.heading, 0, 0);
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

	it("reads text_content in close callback", () => {
		let text = "";
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					return () => {
						text = node.text_content;
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

	it("wrap_inner wraps existing children", () => {
		let wrapper_type = "";
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const wrapper = node.wrap_inner("link");
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
		expect(first_child_kind).toBe(NodeKind.link);

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
					const link = node.wrap_inner("link");
					return () => {
						const slug = slugify(node.text_content);
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

describe("parse plugins: wire path (WireEmitter → WireTreeBuilder)", () => {
	function slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	it("simple attrs on strong_emphasis through wire pipeline", () => {
		const plugin: ParsePlugin = {
			strong_emphasis: {
				parse(node) {
					node.attrs.id = "boo";
				},
			},
		};

		const source = "hello *world*\n";
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		emitter.set_source(source);
		parser.parse(source);
		const batches = emitter.flush();

		const dispatcher = new PluginDispatcher(
			[plugin],
			new WireTextSource([]),
		);
		const builder = new WireTreeBuilder(128, dispatcher);
		builder.apply(batches);

		const buf = builder.get_buffer();

		// find strong_emphasis
		let strong_idx = -1;
		for (let i = 0; i < buf.size; i++) {
			if (buf.kind_at(i) === NodeKind.strong_emphasis) {
				strong_idx = i;
				break;
			}
		}
		expect(strong_idx).not.toBe(-1);
		expect(buf.metadata_at(strong_idx)).toEqual({ id: "boo" });
	});

	it("autolink works through wire pipeline", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const link = node.wrap_inner("link");
					return () => {
						const slug = slugify(node.text_content);
						node.attrs.id = slug;
						link.attrs.href = `#${slug}`;
					};
				},
			},
		};

		const source = "# Hello World\n";

		// wire pipeline: parser → WireEmitter → batches → WireTreeBuilder
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		emitter.set_source(source);
		parser.parse(source);
		const batches = emitter.flush();

		// build tree with plugin dispatcher
		const dispatcher = new PluginDispatcher([plugin], new WireTextSource([]));
		const builder = new WireTreeBuilder(128, dispatcher);
		builder.apply(batches);
		dispatcher.run_sequential(builder.get_buffer());

		const buf = builder.get_buffer();
		const root = buf.get_node(0);

		// find heading
		const heading_idx = root.children.find(
			(i: number) => buf.kind_at(i) === NodeKind.heading,
		)!;
		expect(heading_idx).toBeDefined();

		const heading = buf.get_node(heading_idx);
		expect(heading.metadata.id).toBe("hello-world");

		// heading's first child should be a link
		expect(heading.children.length).toBeGreaterThan(0);
		const link = buf.get_node(heading.children[0]);
		expect(link.kind).toBe("link");
		expect(link.metadata.href).toBe("#hello-world");
	});

	it("autolink works with incremental feeding", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					const link = node.wrap_inner("link");
					return () => {
						const slug = slugify(node.text_content);
						node.attrs.id = slug;
						link.attrs.href = `#${slug}`;
					};
				},
			},
		};

		const source = "# Hello World\n";

		// incremental wire pipeline: feed char by char
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();

		const dispatcher = new PluginDispatcher([plugin], new WireTextSource([]));
		const builder = new WireTreeBuilder(128, dispatcher);

		let accumulated = "";
		for (let i = 0; i < source.length; i++) {
			accumulated += source[i];
			emitter.set_source(accumulated);
			parser.feed(source[i]);
			const batch = emitter.flush();
			if (batch.length > 0) builder.apply(batch);
		}

		emitter.set_source(accumulated);
		parser.finish();
		const final_batch = emitter.flush();
		if (final_batch.length > 0) builder.apply(final_batch);

		dispatcher.run_sequential(builder.get_buffer());

		const buf = builder.get_buffer();
		const root = buf.get_node(0);

		const heading_idx = root.children.find(
			(i: number) => buf.kind_at(i) === NodeKind.heading,
		)!;
		const heading = buf.get_node(heading_idx);
		expect(heading.metadata.id).toBe("hello-world");

		const link = buf.get_node(heading.children[0]);
		expect(link.kind).toBe("link");
		expect(link.metadata.href).toBe("#hello-world");
	});

	it("structural mutations are unwound when node is revoked during streaming", () => {
		const plugin: ParsePlugin = {
			strong_emphasis: {
				parse(node) {
					node.prepend("link", { id: "HELLO" });
				},
			},
		};

		// "*h" opens strong_emphasis (pending), plugin prepends a link.
		// "*hello\n\n" causes revocation, the * was not valid emphasis.
		// the prepended link must be cleaned up.
		const source = "*hello\n\n";

		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();

		const dispatcher = new PluginDispatcher(
			[plugin],
			new WireTextSource([]),
		);
		const builder = new WireTreeBuilder(128, dispatcher);

		// feed char by char to trigger incremental open → revoke
		let accumulated = "";
		for (let i = 0; i < source.length; i++) {
			accumulated += source[i];
			emitter.set_source(accumulated);
			parser.feed(source[i]);
			const batch = emitter.flush();
			if (batch.length > 0) builder.apply(batch);
		}

		emitter.set_source(accumulated);
		parser.finish();
		const final_batch = emitter.flush();
		if (final_batch.length > 0) builder.apply(final_batch);

		const buf = builder.get_buffer();
		const root = buf.get_node(0);

		// should have a paragraph with text "*hello", no orphaned link nodes
		// no node in the tree should have id "HELLO"
		let found_hello = false;
		for (let i = 0; i < buf.size; i++) {
			const meta = buf.metadata_at(i);
			if (meta?.id === "HELLO" && buf._parents[i] !== 0xffffffff) {
				found_hello = true;
			}
		}
		expect(found_hello).toBe(false);

		// the paragraph's children should form a valid sibling chain
		const para_idx = root.children.find(
			(i: number) => buf.kind_at(i) === NodeKind.paragraph,
		);
		expect(para_idx).toBeDefined();
		const para = buf.get_node(para_idx!);
		expect(para.children.length).toBeGreaterThan(0);

		// walk the sibling chain to verify integrity
		let child = buf._children_starts[para_idx!];
		let count = 0;
		while (child !== 0xffffffff && buf._parents[child] === para_idx!) {
			count++;
			child = buf._next_siblings[child];
		}
		expect(count).toBe(para.children.length);
	});

	it("cross-node wrap_inner redirects children of the wrapped node", () => {
		// plugin wraps parent's children from a child handler.
		// children arriving AFTER the wrap should land inside the wrapper.
		const plugin: ParsePlugin = {
			strong_emphasis: {
				parse(node) {
					node.parent?.wrap_inner("link", { href: "#wrapped" });
				},
			},
		};

		const source = "This *works* fine\n";

		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();

		const dispatcher = new PluginDispatcher(
			[plugin],
			new WireTextSource([]),
		);
		const builder = new WireTreeBuilder(128, dispatcher);

		let accumulated = "";
		for (let i = 0; i < source.length; i++) {
			accumulated += source[i];
			emitter.set_source(accumulated);
			parser.feed(source[i]);
			const batch = emitter.flush();
			if (batch.length > 0) builder.apply(batch);
		}

		emitter.set_source(accumulated);
		parser.finish();
		const final_batch = emitter.flush();
		if (final_batch.length > 0) builder.apply(final_batch);

		const buf = builder.get_buffer();
		const root = buf.get_node(0);

		// find paragraph
		const para_idx = root.children.find(
			(i: number) => buf.kind_at(i) === NodeKind.paragraph,
		)!;
		const para = buf.get_node(para_idx);

		// paragraph's sole child should be the link wrapper
		expect(para.children.length).toBe(1);
		const link_idx = para.children[0];
		expect(buf.kind_at(link_idx)).toBe(NodeKind.link);
		expect(buf.metadata_at(link_idx)?.href).toBe("#wrapped");

		// the link should contain: text "This ", strong "works", text " fine"
		const link = buf.get_node(link_idx);
		expect(link.children.length).toBe(3);

		expect(buf.kind_at(link.children[0])).toBe(NodeKind.text);
		expect(buf.kind_at(link.children[1])).toBe(NodeKind.strong_emphasis);
		expect(buf.kind_at(link.children[2])).toBe(NodeKind.text);
	});

	it("cross-node wrap_inner redirect is cleaned up on revocation", () => {
		// if the handler node is revoked, the cross-node wrap_inner
		// should be undone and the redirect removed.
		const plugin: ParsePlugin = {
			strong_emphasis: {
				parse(node) {
					node.parent?.wrap_inner("link", { href: "#wrapped" });
				},
			},
		};

		// "*hello\n\n", strong_emphasis is revoked (unclosed)
		const source = "*hello\n\n";

		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();

		const dispatcher = new PluginDispatcher(
			[plugin],
			new WireTextSource([]),
		);
		const builder = new WireTreeBuilder(128, dispatcher);

		let accumulated = "";
		for (let i = 0; i < source.length; i++) {
			accumulated += source[i];
			emitter.set_source(accumulated);
			parser.feed(source[i]);
			const batch = emitter.flush();
			if (batch.length > 0) builder.apply(batch);
		}

		emitter.set_source(accumulated);
		parser.finish();
		const final_batch = emitter.flush();
		if (final_batch.length > 0) builder.apply(final_batch);

		const buf = builder.get_buffer();
		const root = buf.get_node(0);

		// no link wrapper should remain in the tree
		let found_link = false;
		for (let i = 0; i < buf.size; i++) {
			if (
				buf.kind_at(i) === NodeKind.link &&
				buf._parents[i] !== 0xffffffff
			) {
				found_link = true;
			}
		}
		expect(found_link).toBe(false);

		// paragraph should have text children directly (no wrapper)
		const para_idx = root.children.find(
			(i: number) => buf.kind_at(i) === NodeKind.paragraph,
		)!;
		expect(para_idx).toBeDefined();
		const para = buf.get_node(para_idx);
		expect(para.children.length).toBeGreaterThan(0);
		// first child should be text, not a link
		expect(buf.kind_at(para.children[0])).toBe(NodeKind.text);
	});
});
