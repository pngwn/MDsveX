import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import { migrate, migrate_config } from "../src/main";

const HEAD = "import { mdsvex } from 'mdsvex';\n";

function config(options: string): { code: string; kinds: string[]; messages: string[] } {
	const result = migrate_config(HEAD + options);
	const code = result.code;
	const notes = result.notes.filter((n) => n.kind !== "external_links");
	expect(code.startsWith(HEAD)).toBe(true);
	return {
		code: code.slice(HEAD.length),
		kinds: notes.map((n) => n.kind),
		messages: notes.map((n) => n.message),
	};
}

describe("config: smart punctuation was on by default", () => {
	test("a config without smartypants gains smart_punctuation", () => {
		const { code, kinds, messages } = config("mdsvex({ extensions: ['.svx'] });");
		expect(code).toBe("mdsvex({ extensions: ['.svx'], smart_punctuation: true });");
		expect(kinds).toEqual(["smart_punctuation"]);
		expect(messages[0]).toContain("on by default");
		expect(messages[0]).toContain("`--` was an em dash");
		expect(messages[0]).toContain("Backtick quotes are gone");
		expect(messages[0]).toContain("migrate(source, { smartypants: true })");
	});

	test("no options and empty options", () => {
		expect(config("mdsvex();").code).toBe("mdsvex({ smart_punctuation: true });");
		expect(config("mdsvex({});").code).toBe("mdsvex({ smart_punctuation: true });");
	});

	test("the option goes on its own line where the last one has its own", () => {
		expect(config("mdsvex({\n\textensions: ['.svx'],\n});").code).toBe(
			"mdsvex({\n\textensions: ['.svx'],\n\tsmart_punctuation: true,\n});",
		);
		expect(config("mdsvex({\n  extensions: ['.svx']\n});").code).toBe(
			"mdsvex({\n  extensions: ['.svx'],\n  smart_punctuation: true\n});",
		);
		expect(config("mdsvex({ extensions: ['.svx'], });").code).toBe(
			"mdsvex({ extensions: ['.svx'], smart_punctuation: true });",
		);
	});

	test("beside options that are rewritten or removed", () => {
		expect(config("mdsvex({ layout: './L.svelte' });").code).toBe(
			"mdsvex({ templates: { default: './L.svelte' }, smart_punctuation: true });",
		);
		expect(config("mdsvex({ extensions: ['.svx'], layout: false });").code).toBe(
			"mdsvex({ extensions: ['.svx'], smart_punctuation: true });",
		);
		expect(config("mdsvex({ layout: false });").code).toBe(
			"mdsvex({ smart_punctuation: true });",
		);
		expect(config("mdsvex({\n\tlayout: false,\n});").code).toBe(
			"mdsvex({\n\tsmart_punctuation: true\n});",
		);
	});

	test("options in a variable or behind a helper", () => {
		const { code } = migrate_config(
			HEAD + "const options = { extensions: ['.svx'] };\nexport default mdsvex(options);",
		);
		expect(code).toBe(
			HEAD +
				"const options = { extensions: ['.svx'], smart_punctuation: true };\nexport default mdsvex(options);",
		);
	});

	test("a config that already has smart_punctuation is left alone", () => {
		const source = "mdsvex({ smart_punctuation: { dashes: false } });";
		const { code, kinds } = config(source);
		expect(code).toBe(source);
		expect(kinds).toEqual([]);
	});

	test("the result is javascript", () => {
		for (const options of [
			"mdsvex();",
			"mdsvex({});",
			"mdsvex({ layout: false });",
			"mdsvex({ layout: false, });",
			"mdsvex({\n\tlayout: false,\n});",
			"mdsvex({ smartypants: false, });",
			"mdsvex({\n\tsmartypants: false,\n});",
			"mdsvex({ smartypants: { backticks: 'all' } });",
			"mdsvex({ smartypants: { backticks: false, }, layout: false });",
		]) {
			const { code } = migrate_config(HEAD + options);
			expect(() => new Function(code.replace(HEAD, "")), code).not.toThrow();
		}
	});
});

describe("config: the smartypants option", () => {
	test("false is the default now and is removed", () => {
		const { code, kinds } = config("mdsvex({ smartypants: false, extensions: ['.svx'] });");
		expect(code).toBe("mdsvex({ extensions: ['.svx'] });");
		expect(kinds).toEqual([]);
		expect(config("mdsvex({ smartypants: false });").code).toBe("mdsvex({  });");
	});

	test("true is renamed", () => {
		const { code, kinds, messages } = config("mdsvex({ smartypants: true });");
		expect(code).toBe("mdsvex({ smart_punctuation: true });");
		expect(kinds).toEqual(["smart_punctuation"]);
		expect(messages[0]).not.toContain("on by default");
		expect(messages[0]).toContain("`--` was an em dash");
	});

	test("quotes, dashes and ellipses keep their keys, with no note when the documents need no change", () => {
		const { code, kinds } = config(
			"mdsvex({ smartypants: { quotes: false, ellipses: false, dashes: false, backticks: false } });",
		);
		expect(code).toBe(
			"mdsvex({ smart_punctuation: { quotes: false, ellipses: false, dashes: false } });",
		);
		expect(kinds).toEqual([]);
	});

	test("oldschool dashes are what next does", () => {
		const { code, messages } = config(
			"mdsvex({ smartypants: { dashes: 'oldschool', backticks: false } });",
		);
		expect(code).toBe("mdsvex({ smart_punctuation: { dashes: true } });");
		expect(messages).toEqual([]);
	});

	test("inverted dashes become true with a note", () => {
		const { code, kinds, messages } = config(
			"mdsvex({ smartypants: { dashes: 'inverted', backticks: false } });",
		);
		expect(code).toBe("mdsvex({ smart_punctuation: { dashes: true } });");
		expect(kinds).toEqual(["smart_punctuation"]);
		expect(messages[0]).toContain("`dashes: 'inverted'` is gone");
		expect(messages[0]).not.toContain("Backtick");
	});

	test("backticks is removed with a note unless it was off", () => {
		const { code, kinds, messages } = config(
			"mdsvex({ smartypants: { backticks: 'all', dashes: false } });",
		);
		expect(code).toBe("mdsvex({ smart_punctuation: { dashes: false } });");
		expect(kinds).toEqual(["smart_punctuation"]);
		expect(messages[0]).toContain("Backtick quotes are gone");
		expect(messages[0]).not.toContain("em dash");
	});

	test("an object that leaves the defaults has both notes in one", () => {
		const { code, kinds, messages } = config("mdsvex({ smartypants: { quotes: false } });");
		expect(code).toBe("mdsvex({ smart_punctuation: { quotes: false } });");
		expect(kinds).toEqual(["smart_punctuation"]);
		expect(messages[0]).toContain("`--` was an em dash");
		expect(messages[0]).toContain("Backtick quotes are gone");
	});

	test("an object in a variable, and a shorthand", () => {
		const { code } = migrate_config(
			HEAD +
				"const smartypants = { dashes: 'oldschool', backticks: false };\nmdsvex({ smartypants });",
		);
		expect(code).toBe(
			HEAD +
				"const smartypants = { dashes: true };\nmdsvex({ smart_punctuation: smartypants });",
		);
	});

	test("a value that can not be read is flagged", () => {
		const source = "mdsvex({ smartypants: process.env.SMART === '1' });";
		const { code, kinds } = config(source);
		expect(code).toBe(source);
		expect(kinds).toEqual(["manual"]);
		const dashes = config("mdsvex({ smartypants: { dashes: mode, backticks: false } });");
		expect(dashes.code).toBe("mdsvex({ smart_punctuation: { dashes: mode } });");
		expect(dashes.kinds).toEqual(["manual"]);
	});

	test("both options at once are flagged", () => {
		const source = "mdsvex({ smartypants: true, smart_punctuation: true });";
		const { code, kinds } = config(source);
		expect(code).toBe(source);
		expect(kinds).toEqual(["manual"]);
	});
});

describe("documents: dashes and backtick quotes", () => {
	const m = (input: string, smartypants?: Parameters<typeof migrate>[1]["smartypants"]) =>
		migrate(input, { smartypants }).replace(/\n$/, "");

	test("nothing changes unless the old option is passed", () => {
		expect(m("a -- b --- c ``d''")).toBe("a -- b --- c \\`\\`d''");
		expect(m("a -- b --- c ``d''", false)).toBe("a -- b --- c \\`\\`d''");
	});

	test("the default made two hyphens an em dash and left three alone", () => {
		expect(m("a -- b", true)).toBe("a --- b");
		expect(m("a --- b", true)).toBe("a \\--- b");
		expect(m("a - b ---- c", true)).toBe("a - b ---- c");
		expect(m("a -- b", {})).toBe("a --- b");
		expect(m("a -- b", { dashes: true })).toBe("a --- b");
	});

	test("oldschool dashes are what next does", () => {
		expect(m("a -- b --- c", { dashes: "oldschool" })).toBe("a -- b --- c");
	});

	test("inverted dashes are swapped", () => {
		expect(m("a -- b --- c", { dashes: "inverted" })).toBe("a --- b -- c");
	});

	test("dashes off leaves them", () => {
		expect(m("a -- b --- c", { dashes: false })).toBe("a -- b --- c");
	});

	test("backtick quotes become straight quotes", () => {
		expect(m("``a'' b", true)).toBe('"a" b');
		expect(m("``a'' `b'", true)).toBe("\"a\" \\`b'");
		expect(m("``a'' `b'", { backticks: "all" })).toBe("\"a\" 'b'");
		expect(m("``a''", { backticks: false })).toBe("\\`\\`a''");
	});

	test("with quotes off nothing curls a straight quote, so they are written curly", () => {
		expect(m("``a''", { quotes: false })).toBe("“a”");
		expect(m("`a'", { quotes: false, backticks: "all" })).toBe("‘a'");
	});

	test("only text changes", () => {
		const source =
			"`a -- b` [c -- d](/x--y \"t -- u\") ![e -- f](/i--j)\n\n```\ng -- h ``i''\n```\n\n<b title=\"k--l\">m</b>";
		expect(m(source, true)).toBe(
			"`a -- b` [c --- d](/x--y \"t -- u\") ![e -- f](/i--j)\n\n```\ng -- h ``i''\n```\n\n<b title=\"k--l\">m</b>",
		);
	});

	test("the output is valid pfm", () => {
		const out = migrate("a -- b --- c ``d'' e\n\n- f -- g\n\n> h --- i\n", { smartypants: true });
		expect(parse_markdown_svelte(out).errors.size).toBe(0);
	});
});
