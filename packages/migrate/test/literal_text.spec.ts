import { describe, expect, test } from "vitest";

import { migrate } from "../src/main";

const m = (input: string): string => migrate(input).replace(/\n$/, "");

describe("text that looks like markup", () => {
	test("an escaped tag stays text", () => {
		expect(m("\\<b>bold\\</b>")).toBe("\\<b>bold\\</b>");
		expect(m("&lt;b&gt;bold&lt;/b&gt;")).toBe("\\<b>bold\\</b>");
	});

	test("a less than sign that opens no tag is left alone", () => {
		expect(m("a < b and 1 <2")).toBe("a < b and 1 <2");
	});

	test("a brace that never closes is text", () => {
		expect(m("a { b")).toBe("a \\{ b");
	});

	test("an escaped brace stays text", () => {
		expect(m("\\{x\\} and &#123;y&#125;")).toBe("\\{x\\} and \\{y\\}");
	});

	test("an escaped character reference stays text", () => {
		expect(m("\\&amp; and &amp;lt; and AT&T")).toBe("\\&amp; and \\&lt; and AT&T");
	});
});
