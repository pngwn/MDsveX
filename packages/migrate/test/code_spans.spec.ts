import { describe, expect, test } from "vitest";

import { migrate } from "../src/main";

const m = (input: string): string => migrate(input).replace(/\n$/, "");

describe("inline code with backticks", () => {
	test("a span of one backtick holds a run of two", () => {
		expect(m("x ```a``b``` y")).toBe("x `a``b` y");
	});

	test("a span of two backticks holds a run of one", () => {
		expect(m("x `` a`b `` y")).toBe("x ``a`b`` y");
	});

	test("code with a run of each is a code element", () => {
		expect(m("x ``` a`b``c ``` y")).toBe("x <code>a&#96;b&#96;&#96;c</code> y");
		expect(m("x ``` `*a*` ``{b}`` <c> ``` y")).toBe(
			"x <code>&#96;&#42;a&#42;&#96; &#96;&#96;&#123;b&#125;&#96;&#96; &#60;c&#62;</code> y",
		);
	});

	test("code that starts or ends with a backtick is padded", () => {
		expect(m("`` `a ``")).toBe("`` `a ``");
		expect(m("``` ``a ```")).toBe("` ``a `");
	});
});
