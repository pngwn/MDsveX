import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import { migrate } from "../src/main";

/** migrated for a project that used remark-math, without the trailing newline */
const math = (input: string): string =>
	migrate(input, { math: true }).replace(/\n$/, "");
const plain = (input: string): string => migrate(input).replace(/\n$/, "");

/** the latex of each inline math span and each math fence PFM reads in out */
function pfm_math(out: string): string[] {
	const { nodes, errors } = parse_markdown_svelte(out + "\n");
	expect(errors.size, `PFM parse errors in:\n${out}`).toBe(0);
	const found: string[] = [];
	for (let i = 0; i < nodes.size; i++) {
		const node = nodes.get_node(i);
		const text = nodes._strings[i] ?? out.slice(node.value[0], node.value[1]);
		if (node.kind === "code_span" && node.metadata.math === true)
			found.push(text);
		if (node.kind === "code_fence" && /^`+math\b/.test(out.slice(node.start)))
			found.push("fence:" + text);
	}
	return found;
}

describe("math, for a project that used remark-math", () => {
	test("inline math is a code span in dollars, its latex as written", () => {
		const out = math("Euler: $e^{i\\pi} + 1 = 0$ and $x_1^2 * y_2 * z$.");
		expect(out).toBe("Euler: $`e^{i\\pi} + 1 = 0`$ and $`x_1^2 * y_2 * z`$.");
		expect(pfm_math(out)).toEqual(["e^{i\\pi} + 1 = 0", "x_1^2 * y_2 * z"]);
	});

	test("display math is a math fence", () => {
		const out = math("before\n\n$$\n\\frac{a}{b}\n\n= c\n$$\n\nafter");
		expect(out).toBe("before\n\n```math\n\\frac{a}{b}\n\n= c\n```\n\nafter");
		expect(pfm_math(out)).toEqual(["fence:\\frac{a}{b}\n\n= c"]);
	});

	test("double dollars alone on a line are display math, in a sentence inline", () => {
		expect(math("$$x^2$$")).toBe("```math\nx^2\n```");
		expect(math("so $$x^2$$ holds")).toBe("so $`x^2`$ holds");
	});

	test("display math in a block quote and a list item", () => {
		const out = math("> $$\n> x\n> $$\n\n- a\n\n  $$\n  y\n  $$");
		expect(out).toBe("> ```math\n> x\n> ```\n\n- a\n\n  ```math\n  y\n  ```");
		expect(pfm_math(out)).toEqual(["fence:x", "fence:y"]);
	});

	test.each([
		["two prices", "it costs $5 and $10 ok"],
		["a price range", "from $5-$10 a head"],
		["three prices", "$5, $10 or $20"],
		["prices with cents", "between $1.50 and $2"],
	])("%s are not math", (_, input) => {
		expect(math(input)).toBe(input);
		expect(pfm_math(math(input))).toEqual([]);
	});

	test("a price before math leaves the math", () => {
		const out = math("I paid $5 for $n$ items and $2x + 1$ more");
		expect(out).toBe("I paid $5 for $`n`$ items and $`2x + 1`$ more");
		expect(pfm_math(out)).toEqual(["n", "2x + 1"]);
	});

	test("markup around prices is still migrated", () => {
		expect(math("**only** $5 and __now__ $10")).toBe("*only* $5 and *now* $10");
	});

	test("an escaped dollar is a dollar", () => {
		expect(math("\\$x\\$ and \\$5")).toBe("$x$ and $5");
	});

	test("math over two lines is written on one", () => {
		const out = math("a $x +\ny$ b");
		expect(out).toBe("a $`x + y`$ b");
		expect(pfm_math(out)).toEqual(["x + y"]);
	});

	test("a backtick in the latex gets a longer span", () => {
		const out = math("$a`b$ and $`c$ and $d``e$");
		expect(out).toBe("$``a`b``$ and $`` `c ``$ and $`d``e`$");
		expect(pfm_math(out)).toEqual(["a`b", "`c", "d``e"]);
	});

	test("in a table cell the latex double bar is spelled out", () => {
		const out = math("| a |\n|---|\n| $\\|x\\|$ and $y$ |");
		expect(out).toBe("| a |\n| --- |\n| $`\\Vert x\\Vert`$ and $`y`$ |");
		expect(pfm_math(out)).toEqual(["\\Vert x\\Vert", "y"]);
	});

	test("a fence of backticks inside display math gets a longer fence", () => {
		expect(math("$$\n```\n$$")).toBe("````math\n```\n````");
	});
});

describe("dollars, for a project without remark-math", () => {
	test("stay as written, and the text between them is markdown", () => {
		expect(plain("a $x$ b and $$y$$")).toBe("a $x$ b and $$y$$");
		expect(plain("$a *b* c$")).toBe("$a _b_ c$");
		expect(pfm_math(plain("a $x$ b and $$y$$"))).toEqual([]);
	});

	test("a code span between two dollars does not become math", () => {
		for (const convert of [plain, math]) {
			const out = convert("\\$`x`\\$ and \\$`y` and `z`\\$");
			expect(out).toBe("\\$`x`$ and $`y` and `z`$");
			expect(pfm_math(out)).toEqual([]);
		}
		expect(plain("$`x`$")).toBe("\\$`x`$");
	});
});
