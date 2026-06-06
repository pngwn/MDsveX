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
	};

	for (const [name, input] of Object.entries(cases)) {
		test(name, () => {
			expect_valid_pfm(input);
		});
	}
});
