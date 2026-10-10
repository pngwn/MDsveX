import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import { migrate } from "../src/main";

/** migrate + strip the single trailing newline for concise assertions. */
const m = (input: string): string => migrate(input).replace(/\n$/, "");

/** Assert the migrated output is valid PFM (parses with zero errors). */
function expect_valid_pfm(input: string): string {
	const out = migrate(input);
	const { errors } = parse_markdown_svelte(out);
	expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
	return out;
}

describe("headings", () => {
	test("setext h1 becomes ATX", () => {
		expect(m("Title\n=====")).toBe("# Title");
	});

	test("setext h2 becomes ATX", () => {
		expect(m("Title\n-----")).toBe("## Title");
	});

	test("ATX headings pass through", () => {
		expect(m("### Hello")).toBe("### Hello");
	});

	test("trailing hashes are dropped by the parser", () => {
		expect(m("## Hello ##")).toBe("## Hello");
	});
});

describe("emphasis and strong", () => {
	test("asterisk emphasis becomes underscore", () => {
		expect(m("*hi*")).toBe("_hi_");
	});

	test("underscore emphasis stays underscore", () => {
		expect(m("_hi_")).toBe("_hi_");
	});

	test("double-asterisk strong becomes single asterisk", () => {
		expect(m("**hi**")).toBe("*hi*");
	});

	test("double-underscore strong becomes single asterisk", () => {
		expect(m("__hi__")).toBe("*hi*");
	});

	test("strong inside emphasis", () => {
		expect(m("*__hi__*")).toBe("_*hi*_");
	});
});

describe("code", () => {
	test("indented code block becomes fenced", () => {
		expect(m("    const a = 1;")).toBe("```\nconst a = 1;\n```");
	});

	test("fenced code keeps its language", () => {
		expect(m("```js\nconst a = 1;\n```")).toBe("```js\nconst a = 1;\n```");
	});

	test("fence grows to escape inner backticks", () => {
		const out = m("````\n```\n````");
		expect(out).toBe("````\n```\n````");
	});

	test("inline code passes through", () => {
		expect(m("`code`")).toBe("`code`");
	});
});

describe("line breaks", () => {
	test("trailing-space hard break becomes backslash", () => {
		expect(m("a  \nb")).toBe("a\\\nb");
	});
});

describe("blockquotes", () => {
	test("lazy continuation gains explicit prefixes", () => {
		expect(m("> foo\nbar")).toBe("> foo\n> bar");
	});

	test("nested blockquote", () => {
		expect(m("> > deep")).toBe("> > deep");
	});
});

describe("lists", () => {
	test("tight unordered list", () => {
		expect(m("- a\n- b")).toBe("- a\n- b");
	});

	test("loose unordered list", () => {
		expect(m("- a\n\n- b")).toBe("- a\n\n- b");
	});

	test("ordered list preserves start", () => {
		expect(m("3. a\n4. b")).toBe("3. a\n4. b");
	});

	test("nested list indents under marker", () => {
		expect(m("- a\n  - b")).toBe("- a\n  - b");
	});

	test("task list checkbox is preserved", () => {
		expect(m("- [x] done\n- [ ] todo")).toBe("- [x] done\n- [ ] todo");
	});
});

describe("reference links", () => {
	test("shortcut reference becomes explicit collapsed", () => {
		const out = m("[foo]\n\n[foo]: /url");
		expect(out).toBe("[foo]: /url\n\n[foo][]");
	});

	test("forward reference is hoisted above its use", () => {
		const out = m("see [foo][]\n\n[foo]: /url");
		expect(out).toBe("[foo]: /url\n\nsee [foo][]");
	});

	test("full reference keeps its identifier", () => {
		const out = m("[text][id]\n\n[id]: /url");
		expect(out).toBe("[id]: /url\n\n[text][id]");
	});
});

describe("inline links and images", () => {
	test("inline link passes through", () => {
		expect(m("[a](/b)")).toBe("[a](/b)");
	});

	test("link with title", () => {
		expect(m('[a](/b "t")')).toBe('[a](/b "t")');
	});

	test("image passes through", () => {
		expect(m("![alt](/img.png)")).toBe("![alt](/img.png)");
	});
});

describe("gfm", () => {
	test("strikethrough", () => {
		expect(m("~~gone~~")).toBe("~~gone~~");
	});

	test("table with alignment", () => {
		const input = "| a | b |\n|:--|--:|\n| 1 | 2 |";
		expect(m(input)).toBe("| a | b |\n| :--- | ---: |\n| 1 | 2 |");
	});
});

/** migrate then parse as pfm, the top level block kinds and each cell text with its spans */
function pfm_tables(input: string): { blocks: string[]; cells: string[] } {
	const out = migrate(input);
	const { nodes, errors } = parse_markdown_svelte(out);
	expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
	const kids = (i: number) =>
		nodes.get_node(i).children.map((c) => nodes.get_node(c));
	const blocks = kids(0)
		.filter((n) => n.kind !== "line_break")
		.map((n) => n.kind);
	const cells: string[] = [];
	for (const table of kids(0).filter((n) => n.kind === "table")) {
		for (const row of kids(table.index)) {
			for (const cell of kids(row.index)) {
				let s = kids(cell.index)
					.filter((n) => n.kind === "text")
					.map((n) => out.slice(n.value[0], n.value[1]))
					.join("");
				if (cell.metadata?.colspan) s += `+c${cell.metadata.colspan}`;
				if (cell.metadata?.rowspan) s += `+r${cell.metadata.rowspan}`;
				cells.push(s);
			}
		}
	}
	return { blocks, cells };
}

describe("footnotes stay as literal text", () => {
	test("a reference and its definition", () => {
		expect(m("Hello[^1] world.\n\n[^1]: The note.")).toBe(
			"Hello\\[\\^1\\] world.\n\n\\[\\^1\\]: The note.",
		);
	});

	test("the label keeps its case and is escaped", () => {
		expect(m("x[^My_Note]\n\n[^My_Note]: y")).toBe(
			"x\\[\\^My\\_Note\\]\n\n\\[\\^My\\_Note\\]: y",
		);
	});

	test("inline content of a definition is migrated", () => {
		expect(m("x[^a]\n\n[^a]: some **strong** and `code`")).toBe(
			"x\\[\\^a\\]\n\n\\[\\^a\\]: some *strong* and `code`",
		);
	});

	test("later blocks of a definition follow it", () => {
		expect(m("x[^a]\n\n[^a]: one\n\n    two\n\n    - three")).toBe(
			"x\\[\\^a\\]\n\n\\[\\^a\\]: one\n\ntwo\n\n- three",
		);
	});

	test("a definition that opens with a block keeps the label on its own line", () => {
		expect(m("x[^a]\n\n[^a]:\n    - one\n    - two")).toBe(
			"x\\[\\^a\\]\n\n\\[\\^a\\]:\n\n- one\n- two",
		);
	});

	test("a definition in a blockquote", () => {
		expect(m("> quote[^a]\n>\n> [^a]: in quote")).toBe(
			"> quote\\[\\^a\\]\n>\n> \\[\\^a\\]: in quote",
		);
	});

	test("a definition with no content", () => {
		expect(m("x[^a]\n\n[^a]:")).toBe("x\\[\\^a\\]\n\n\\[\\^a\\]:");
	});
});

describe("table merge markers stay literal", () => {
	test("a lone > cell is escaped", () => {
		const input = "| a | b |\n|---|---|\n| x | > |";
		expect(m(input)).toBe("| a | b |\n| --- | --- |\n| x | \\> |");
		expect(pfm_tables(input).cells).toEqual(["a", "b", "x", ">"]);
	});

	test("a lone > header cell is escaped", () => {
		const input = "| a | > |\n|---|---|\n| x | y |";
		expect(m(input)).toBe("| a | \\> |\n| --- | --- |\n| x | y |");
		expect(pfm_tables(input).cells).toEqual(["a", ">", "x", "y"]);
	});

	test("a lone > with spaces around it is escaped", () => {
		const input = "| a | b |\n|---|---|\n| x |   >   |";
		expect(m(input)).toBe("| a | b |\n| --- | --- |\n| x | \\> |");
		expect(pfm_tables(input).cells).toEqual(["a", "b", "x", ">"]);
	});

	test("a lone ^ cell is escaped", () => {
		const input = "| a | b |\n|---|---|\n| x | y |\n| ^ | z |";
		expect(m(input)).toBe(
			"| a | b |\n| --- | --- |\n| x | y |\n| \\^ | z |",
		);
		expect(pfm_tables(input).cells).toEqual(["a", "b", "x", "y", "^", "z"]);
	});

	test("a cell with more than a > is left alone", () => {
		const input = "| a | b |\n|---|---|\n| x | > quote |";
		expect(m(input)).toBe("| a | b |\n| --- | --- |\n| x | > quote |");
		expect(pfm_tables(input).cells).toEqual(["a", "b", "x", "> quote"]);
	});

	test("a || delimiter row was a paragraph and stays one", () => {
		const input = "| || a | b |\n|---||---|---|\n| h || x | y |";
		expect(m(input)).toBe(
			"\\| || a | b |\n\\|---||---|---|\n\\| h || x | y |",
		);
		expect(pfm_tables(input).blocks).toEqual(["paragraph"]);
	});
});

describe("escaping", () => {
	test("literal asterisks are escaped", () => {
		expect(m("1 * 2 * 3")).toBe("1 \\* 2 \\* 3");
	});

	test("literal underscore is escaped", () => {
		expect(m("a_b")).toBe("a\\_b");
	});
});

describe("thematic break", () => {
	test("renders as ---", () => {
		expect(m("***")).toBe("---");
	});
});

describe("frontmatter", () => {
	test("is kept as it is", () => {
		expect(m("---\ntitle: Hi\n---\n\nTitle\n=====")).toBe("---\ntitle: Hi\n---\n\n# Title");
	});
});

describe("valid PFM output (round-trip through @mdsvex/parse)", () => {
	const cases: Record<string, string> = {
		heading: "# Title\n\nA paragraph.",
		emphasis: "Some *emph* and **strong** text.",
		blockquote: "> quoted\nlazy line",
		"tight list": "- one\n- two\n- three",
		"loose list": "- one\n\n- two",
		"ordered list": "1. one\n2. two",
		"reference link": "Use [foo][] here.\n\n[foo]: https://example.com",
		"forward reference": "[foo][]\n\n[foo]: /x",
		"indented code": "    let x = 1;",
		"fenced code": "```ts\nlet x: number = 1;\n```",
		strikethrough: "~~nope~~",
		table: "| h1 | h2 |\n| -- | -- |\n| a | b |",
		"hard break": "line one  \nline two",
		mixed:
			"# Doc\n\nSome *text* with `code` and a [link](/a).\n\n> a quote\n\n- list a\n- list b",
		frontmatter: "---\nlayout: blog\ntitle: Hi\n---\n\n# Hi\n\nSome *text*.",
		footnote: "A claim[^1] and another[^note].\n\n[^1]: The source.\n\n[^note]: A *longer* note.\n\n    With a second paragraph.\n\n    - and a list",
	};

	for (const [name, input] of Object.entries(cases)) {
		test(name, () => {
			expect_valid_pfm(input);
		});
	}
});
