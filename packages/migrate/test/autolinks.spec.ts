import { describe, expect, test } from "vitest";

import { migrate } from "../src/main";

const m = (input: string): string => migrate(input).replace(/\n$/, "");

describe("urls written as text", () => {
	test("a bare url becomes an autolink", () => {
		expect(m("See https://example.com/a_b for more.")).toBe(
			"See <https://example.com/a_b> for more.",
		);
	});

	test("an autolink stays one", () => {
		expect(m("<https://example.com/a_b> and <mailto:a@b.c>")).toBe(
			"<https://example.com/a_b> and <mailto:a@b.c>",
		);
	});

	test("a www address keeps its text", () => {
		expect(m("See www.example.com for more.")).toBe(
			"See [www.example.com](http://www.example.com) for more.",
		);
	});

	test("a link with its own text is a link", () => {
		expect(m("[https://example.com](https://example.com 't')")).toBe(
			'[https://example.com](https://example.com "t")',
		);
	});
});
