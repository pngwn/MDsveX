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

	test("file= of remark-code-import becomes src= on a fence with no code", () => {
		expect(migrate("```js file=./a.js#L1-L2\n```\n")).toBe(
			"```js src=./a.js#L1-L2\n\n```\n",
		);
		expect(migrate("```js title=x file=./a.js\n```\n")).toBe(
			"```js title=x src=./a.js\n\n```\n",
		);
		// code of its own would be an error under src=
		expect(migrate("```js file=./a.js\nlet a;\n```\n")).toBe(
			"```js file=./a.js\nlet a;\n```\n",
		);
		expect(migrate("```js profile=x\n```\n")).toBe("```js profile=x\n\n```\n");
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

	/** the checked attr of every list item pfm reads in the migrated output */
	function checked_of(input: string): unknown[] {
		const { nodes } = parse_markdown_svelte(migrate(input));
		const out: unknown[] = [];
		const walk = (index: number): void => {
			const node = nodes.get_node(index);
			if (node.kind === "list_item") out.push(node.metadata?.checked);
			node.children.forEach(walk);
		};
		walk(0);
		return out;
	}

	test("a task item is still a task item in PFM", () => {
		expect(checked_of("- [x] done\n- [ ] todo\n- plain")).toEqual([
			true,
			false,
			undefined,
		]);
		expect(checked_of("1. [X] a\n\n   b\n\n2. [ ] c\n   * [x] d")).toEqual([
			true,
			false,
			true,
		]);
	});

	test("a task item keeps block-like text after its marker as text", () => {
		expect(m("- [x] # a\n- [ ] - b")).toBe("- [x] \\# a\n- [ ] \\- b");
		expect(checked_of("- [x] # a\n- [ ] - b")).toEqual([true, false]);
	});

	test("a marker GFM does not read as a task stays text in PFM", () => {
		const inputs = ["- \\[x] a", "- [ ]", "- [x]a", "- a [x] b"];
		for (const input of inputs) {
			expect(checked_of(input), input).toEqual([undefined]);
		}
		expect(m("- \\[x] a")).toBe("- \\[x\\] a");
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

describe("footnotes", () => {
	/** the labels of the references and of the definitions PFM reads in out */
	function pfm_notes(out: string): { references: string[]; definitions: string[] } {
		const { nodes, errors } = parse_markdown_svelte(out + "\n");
		expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
		const found = { references: [] as string[], definitions: [] as string[] };
		for (let i = 0; i < nodes.size; i++) {
			const node = nodes.get_node(i);
			if (node.kind === "footnote_reference") found.references.push(node.metadata.label);
			if (node.kind === "footnote_definition") found.definitions.push(node.metadata.label);
		}
		return found;
	}

	test("a reference and its definition are a PFM footnote", () => {
		const out = m("Hello[^1] world.\n\n[^1]: The note.");
		expect(out).toBe("Hello[^1] world.\n\n[^1]: The note.");
		expect(pfm_notes(out)).toEqual({ references: ["1"], definitions: ["1"] });
	});

	test("a reference takes the label of its definition, which PFM matches exactly", () => {
		const out = m("x[^MY_note] y[^my_Note]\n\n[^My_Note]: z");
		expect(out).toBe("x[^My_Note] y[^My_Note]\n\n[^My_Note]: z");
		expect(pfm_notes(out)).toEqual({
			references: ["My_Note", "My_Note"],
			definitions: ["My_Note"],
		});
	});

	test("a character a PFM label can not hold is replaced, in both", () => {
		const out = m("x[^a^b] y[^c\\]d]\n\n[^a^b]: one\n\n[^c\\]d]: two");
		expect(pfm_notes(out)).toEqual({
			references: ["a-b", "c-d"],
			definitions: ["a-b", "c-d"],
		});
	});

	test("inline content of a definition is migrated", () => {
		expect(m("x[^a]\n\n[^a]: some **strong** and `code`")).toBe(
			"x[^a]\n\n[^a]: some *strong* and `code`",
		);
	});

	test("a definition in a blockquote stays in it", () => {
		const out = m("> quote[^a]\n>\n> [^a]: in quote");
		expect(out).toBe("> quote[^a]\n>\n> [^a]: in quote");
		expect(pfm_notes(out)).toEqual({ references: ["a"], definitions: ["a"] });
	});

	test("later blocks of a definition follow it", () => {
		const out = m("x[^a]\n\n[^a]: one\n\n    two\n\n    - three");
		expect(out).toBe("x[^a]\n\n[^a]: one\n\ntwo\n\n- three");
		expect(pfm_notes(out)).toEqual({ references: ["a"], definitions: ["a"] });
	});

	test("a definition that opens with a block stays literal, with its references", () => {
		const out = m("x[^a]\n\n[^a]:\n    - one\n    - two");
		expect(out).toBe("x\\[\\^a\\]\n\n\\[\\^a\\]:\n\n- one\n- two");
		expect(pfm_notes(out)).toEqual({ references: [], definitions: [] });
	});

	test("a definition with no content stays literal", () => {
		expect(m("x[^a]\n\n[^a]:")).toBe("x\\[\\^a\\]\n\n\\[\\^a\\]:");
	});

	test("only the first definition of a label is one", () => {
		const out = m("x[^a]\n\n[^a]: one\n\n[^a]: two");
		expect(out).toBe("x[^a]\n\n[^a]: one\n\n\\[\\^a\\]: two");
		expect(pfm_notes(out)).toEqual({ references: ["a"], definitions: ["a"] });
	});

	test("a bracket and caret that were no footnote are escaped", () => {
		const out = m("the class [^abc] and [^1] with no definition");
		expect(out).toBe("the class \\[\\^abc\\] and \\[\\^1\\] with no definition");
		expect(pfm_notes(out)).toEqual({ references: [], definitions: [] });
	});
});

describe("a pipe in inline code in a table cell", () => {
	function pfm_code(input: string): string[] {
		const out = migrate(input);
		const { nodes, errors } = parse_markdown_svelte(out);
		expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
		const code: string[] = [];
		for (let i = 0; i < nodes.size; i++) {
			const node = nodes.get_node(i);
			if (node.kind !== "code_span") continue;
			code.push(nodes._strings[i] ?? out.slice(node.value[0], node.value[1]));
		}
		return code;
	}

	test("stays escaped and stays in the code", () => {
		const input =
			"| `a \\| b` | c |\n|---|---|\n| `string \\| number` or d \\| e | ``f`\\|g`` |";
		expect(m(input)).toBe(
			"| `a \\| b` | c |\n| --- | --- |\n| `string \\| number` or d \\| e | ``f`\\|g`` |",
		);
		expect(pfm_code(input)).toEqual(["a | b", "string | number", "f`|g"]);
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

describe("directive-like lines stay text", () => {
	/** kinds in the parsed output, and the text it holds with the escapes read */
	function parsed(out: string): { kinds: Set<string>; text: string } {
		const { nodes } = parse_markdown_svelte(out);
		const kinds = new Set<string>();
		let text = "";
		const walk = (index: number): void => {
			const node = nodes.get_node(index);
			kinds.add(node.kind);
			if (node.kind === "text") text += out.slice(node.value[0], node.value[1]);
			else if (node.kind === "soft_break") text += "\n";
			for (const child of node.children) walk(child);
		};
		walk(0);
		return { kinds, text: text.replace(/\\(?=:)/g, "") };
	}

	test("a line of two or three colons and a word is escaped", () => {
		expect(m(":::note")).toBe("\\:::note");
		expect(m("::word")).toBe("\\::word");
		expect(m("::toc(depth=2)")).toBe("\\::toc(depth=2)");
		expect(m("  :::note")).toBe("\\:::note");
	});

	const cases: Record<string, string> = {
		"a container name": ":::note",
		"a leaf name": "::word",
		"a leaf name with args": "::toc(depth=2)",
		"a container around text": ":::note\nbody\n:::",
		"a container with args": ":::note(kind=warn)\nbody\n:::",
		"after a paragraph line": "some text\n::word\nmore text",
		"between paragraphs": "before\n\n:::steps\n\nafter\n\n:::",
		"in a list item": "- ::word\n- :::note",
		"in a blockquote": "> :::note\n> body\n> :::",
		"nested by colon count": "::::outer\n:::inner\nx\n:::\n::::",
	};
	for (const [name, input] of Object.entries(cases)) {
		test(`${name} does not become a directive`, () => {
			const out = expect_valid_pfm(input);
			const { kinds, text } = parsed(out);
			expect(kinds.has("directive_leaf"), out).toBe(false);
			expect(kinds.has("directive_container"), out).toBe(false);
			expect(kinds.has("directive_inline"), out).toBe(false);
			for (const line of input.split("\n")) {
				const want = line.replace(/^(?:[->] )+/, "").trim();
				if (want !== "") expect(text, out).toContain(want);
			}
		});
	}

	test("the unescaped lines are directives in PFM, the escape is what keeps them text", () => {
		for (const raw of [":::note\nbody\n:::\n", "::word\n"]) {
			expect([...parsed(raw).kinds].some((k) => k.startsWith("directive_"))).toBe(
				true,
			);
		}
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
