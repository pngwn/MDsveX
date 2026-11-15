import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import { migrate, migrate_document } from "../src/main";

/** the migrated document, checked to be pfm with no errors, without its last linefeed */
function m(input: string): string {
	const out = migrate(input);
	const { errors } = parse_markdown_svelte(out);
	expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
	return out.replace(/\n$/, "");
}

/** the notes of a document as line and message */
function notes(input: string): [number, string, string][] {
	return migrate_document(input).notes.map((n) => [n.line, n.kind, n.message]);
}

describe("GitHub alerts", () => {
	test.each(["note", "tip", "important", "warning", "caution"])(
		"%s becomes a container directive",
		(kind) => {
			expect(m(`> [!${kind.toUpperCase()}]\n> Read *this*.\n> More.`)).toBe(
				`:::${kind}\nRead _this_.\nMore.\n:::`,
			);
		},
	);

	test("the marker is read in any case", () => {
		expect(m("> [!Warning]\n> Hot.")).toBe(":::warning\nHot.\n:::");
		expect(m("> [!tip]\n> Hot.")).toBe(":::tip\nHot.\n:::");
	});

	test("text after the marker is the title", () => {
		expect(m("> [!WARNING] Breaking *change*\n> Read it.")).toBe(
			":::warning[Breaking _change_]\nRead it.\n:::",
		);
		expect(m("> [!NOTE]   \n> Trailing spaces are a hard break.")).toBe(
			":::note\nTrailing spaces are a hard break.\n:::",
		);
	});

	test("a title with a bracket keeps it escaped", () => {
		expect(m("> [!NOTE] Arrays [1]\n> Body.")).toBe(":::note[Arrays \\[1\\]]\nBody.\n:::");
	});

	test("one level of quote comes off, nested quotes and blocks stay", () => {
		const source = ["> [!NOTE]", "> Intro.", ">", "> > Quoted.", ">", "> - one", "> - two", ">", "> ```js", "> x", "> ```"].join(
			"\n",
		);
		expect(m(source)).toBe(
			[":::note", "Intro.", "", "> Quoted.", "", "- one", "- two", "", "```js", "x", "```", ":::"].join("\n"),
		);
	});

	test("an empty alert is the directive alone", () => {
		expect(m("> [!CAUTION]")).toBe(":::caution\n:::");
		expect(m("> [!CAUTION] Only a title")).toBe(":::caution[Only a title]\n:::");
	});

	test("an alert followed by a plain block quote", () => {
		expect(m("> [!TIP]\n> Use it.\n\n> Plain quote.")).toBe(":::tip\nUse it.\n:::\n\n> Plain quote.");
	});

	test("an alert inside a block quote", () => {
		expect(m("> Outer.\n>\n> > [!NOTE]\n> > Inner.")).toBe("> Outer.\n>\n> :::note\n> Inner.\n> :::");
	});

	test("an alert in a list item", () => {
		expect(m("- item\n\n  > [!IMPORTANT]\n  > Inside.\n- next")).toBe(
			"- item\n\n  :::important\n  Inside.\n  :::\n- next",
		);
	});

	test("an alert in an alert takes more colons", () => {
		expect(m("> [!WARNING]\n> Outer.\n>\n> > [!NOTE]\n> > Inner.")).toBe(
			"::::warning\nOuter.\n\n:::note\nInner.\n:::\n::::",
		);
	});

	test("a lazy line stays in the alert", () => {
		expect(m("> [!NOTE]\n> One\ntwo")).toBe(":::note\nOne\ntwo\n:::");
	});

	test("a marker that runs into text, or that is not first, is a quote", () => {
		expect(m("> [!NOTE]text")).toBe("> \\[!NOTE\\]text");
		expect(m("> Text\n> [!NOTE]")).toBe("> Text\n> \\[!NOTE\\]");
		expect(notes("> [!NOTE]text")).toEqual([]);
	});

	test("a title with a link stays in the body, with a note", () => {
		const source = "Intro.\n\n> [!NOTE] See [the docs](/docs)\n> Body.";
		expect(m(source)).toBe("Intro.\n\n:::note\nSee [the docs](/docs)\n\nBody.\n:::");
		expect(notes(source)).toEqual([
			[3, "plugin", expect.stringContaining("Install `@mdsvex/plugin-callouts`")],
			[3, "manual", expect.stringContaining("has a link or an image")],
		]);
	});

	test("a document gets one note about the plugin, at its first alert", () => {
		const source = "---\ntitle: Hi\n---\n\n# Head\n\n> [!TIP]\n> One.\n\n> [!NOTE]\n> Two.";
		expect(notes(source)).toEqual([
			[
				7,
				"plugin",
				"GitHub alerts are now container directives, `> [!TIP]` is `:::tip`. Install `@mdsvex/plugin-callouts` and add `callouts()` to `plugins` to render them.",
			],
		]);
	});

	test("lines count svelte as written", () => {
		const source = "{#if a}\nx\n{/if}\n\n<script>\nlet a = 1;\n</script>\n\n> [!NOTE]\n> Hi.";
		expect(notes(source).map(([line]) => line)).toEqual([9]);
		expect(m(source)).toContain(":::note\nHi.\n:::");
	});
});

describe("Obsidian callouts", () => {
	test("a kind GitHub does not have is left as a quote, with a note", () => {
		const source = "> [!info] Title\n> Body.";
		expect(m(source)).toBe("> [!info] Title\n> Body.");
		expect(notes(source)).toEqual([
			[
				1,
				"manual",
				"`[!info]` is an Obsidian callout, which mdsvex leaves as a block quote. Write it as `:::info[Title]` with a `info` component of your own in a directives module, or as one of `:::note`, `:::tip`, `:::important`, `:::warning`, `:::caution` with `@mdsvex/plugin-callouts`.",
			],
		]);
	});

	test("a callout that folds is left as a quote, with a note", () => {
		expect(m("> [!NOTE]- Folded\n> Body.")).toBe("> [!NOTE]- Folded\n> Body.");
		expect(notes("> [!NOTE]- Folded\n> Body.")).toEqual([
			[
				1,
				"manual",
				"`[!NOTE]-` is a callout that folds in Obsidian, which mdsvex leaves as a block quote. Write a folding one as `:::details[Title]` with `@mdsvex/plugin-elements`, or as `:::note` with `@mdsvex/plugin-callouts` if it need not fold.",
			],
		]);
		expect(notes("> [!faq]+\n> Open.")[0][2]).toBe(
			"`[!faq]+` is a callout that folds in Obsidian, which mdsvex leaves as a block quote. Write a folding one as `:::details[Title]` with `@mdsvex/plugin-elements`.",
		);
	});
});

describe("migrate_document", () => {
	test("migrate is its code", () => {
		const source = "---\nlayout: blog\n---\n\n> [!NOTE]\n> Hi.";
		expect(migrate(source)).toBe(migrate_document(source).code);
	});

	test("the frontmatter notes come first", () => {
		const { notes } = migrate_document("---\nlayout: blog\ntemplate: x\n---\n\n> [!NOTE]\n> Hi.");
		expect(notes.map((n) => [n.line, n.kind])).toEqual([
			[3, "template_key"],
			[6, "plugin"],
		]);
	});
});
