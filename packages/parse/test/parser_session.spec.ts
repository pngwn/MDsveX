import { describe, expect, test } from "vitest";
import {
	NodeKind,
	ParserSession,
	parse_markdown_svelte,
} from "../src/main";

function active_arena(result: ReturnType<ParserSession["parse"]>) {
	const nodes = result.nodes;
	return {
		source: result.source,
		errors: [...result.errors.slice()],
		size: nodes.size,
		kinds: [...nodes._kinds.subarray(0, nodes.size)],
		starts: [...nodes._starts.subarray(0, nodes.size)],
		ends: [...nodes._ends.subarray(0, nodes.size)],
		parents: [...nodes._parents.subarray(0, nodes.size)],
		metadata: Array.from(
			{ length: nodes.size },
			(_, index) => nodes.metadata_at(index),
		),
	};
}

describe("ParserSession", () => {
	test("matches the owned parser", () => {
		const source = "# hello\r\n\r\n- **one**\r\n- two";
		const session = new ParserSession();
		expect(active_arena(session.parse(source))).toEqual(
			active_arena(parse_markdown_svelte(source)),
		);
	});

	test("reuses and invalidates ordinary result storage", () => {
		const session = new ParserSession();
		const first = session.parse("# first");
		const borrowed = first.nodes;
		expect(first.nodes.kind_at(1)).toBe(NodeKind.heading);

		const second = session.parse("second");
		expect(second.nodes).toBe(borrowed);
		expect(first.nodes.kind_at(1)).toBe(NodeKind.paragraph);
	});

	test("drops oversized storage before the next parse", () => {
		const session = new ParserSession({
			initial_capacity: 2,
			max_retained_nodes: 4,
		});
		const oversized = session.parse("- one\n- two\n- three");
		const compact = session.parse("small");
		expect(compact.nodes).not.toBe(oversized.nodes);
		expect(session.parse("again").nodes).toBe(compact.nodes);
	});

	test("drops storage after an oversized source", () => {
		const session = new ParserSession({
			max_retained_source_length: 4,
		});
		const oversized = session.parse("long source");
		expect(session.parse("tiny").nodes).not.toBe(oversized.nodes);
	});

	test("clear invalidates and releases current storage", () => {
		const session = new ParserSession();
		const first = session.parse("first");
		session.clear();
		expect(session.parse("second").nodes).not.toBe(first.nodes);
	});

	test("rejects plugins and invalid limits", () => {
		expect(
			() => new ParserSession({ plugins: [] as never }),
		).toThrow(/does not support plugins/);
		expect(
			() => new ParserSession({ max_retained_nodes: 0 }),
		).toThrow(RangeError);
		expect(
			() => new ParserSession({ initial_capacity: 1_048_577 }),
		).toThrow(/exceeds limit/);
		expect(
			() => new ParserSession({ max_retained_nodes: 1_048_577 }),
		).toThrow(/exceeds limit/);
	});
});
