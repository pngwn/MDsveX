import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import {
	migrate,
	migrate_frontmatter,
} from "../src/main";

describe("frontmatter", () => {
	const fm = (source: string): string => {
		const { code, notes } = migrate_frontmatter(source);
		expect(notes).toEqual([]);
		return code;
	};

	test("layout becomes template", () => {
		expect(fm("---\ntitle: Hi\nlayout: blog\n---\n\n# Hi\n")).toBe(
			"---\ntitle: Hi\ntemplate: blog\n---\n\n# Hi\n",
		);
	});

	test("layout: false becomes template: false", () => {
		expect(fm("---\nlayout: false\n---\n")).toBe("---\ntemplate: false\n---\n");
	});

	test("the _ fallback becomes default", () => {
		expect(fm("---\nlayout: _\n---\n")).toBe("---\ntemplate: default\n---\n");
		expect(fm("---\nlayout: '_' # fallback\n---\n")).toBe(
			"---\ntemplate: 'default' # fallback\n---\n",
		);
	});

	test("quoted values and keys are kept", () => {
		expect(fm('---\n"layout": "blog"\n---\n')).toBe('---\n"template": "blog"\n---\n');
	});

	test("nested layout keys are left alone", () => {
		const source = "---\npage:\n  layout: grid\n---\n";
		expect(fm(source)).toBe(source);
	});

	test("layout in the body is left alone", () => {
		const source = "---\ntitle: Hi\n---\n\nlayout: blog\n";
		expect(fm(source)).toBe(source);
	});

	test("crlf line endings", () => {
		expect(fm("---\r\nlayout: blog\r\n---\r\n")).toBe("---\r\ntemplate: blog\r\n---\r\n");
	});

	test("an existing template key is flagged", () => {
		const source = "---\nlayout: blog\ntemplate: two-column\n---\n";
		const { code, notes } = migrate_frontmatter(source);
		expect(code).toBe(source);
		expect(notes).toEqual([
			{ kind: "template_key", message: expect.any(String), line: 3, column: 1 },
		]);
	});

	test("migrate keeps frontmatter and renames layout", () => {
		const out = migrate("---\nlayout: blog\ntitle: Hi\n---\n\n# Hello *x*\n");
		expect(out).toBe("---\ntemplate: blog\ntitle: Hi\n---\n\n# Hello _x_\n");
		expect(parse_markdown_svelte(out).errors.size).toBe(0);
	});

	test("migrate with only frontmatter", () => {
		expect(migrate("---\nlayout: false\n---")).toBe("---\ntemplate: false\n---\n");
	});
});
