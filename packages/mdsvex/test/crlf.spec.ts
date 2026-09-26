import { describe, expect, test } from "vitest";
import { mappings_to_v3 } from "@mdsvex/render/sourcemap";

import { compile } from "../src/main";

const CASES = [
	"\r\n>b",
	"a\r\nb",
	"- one\r\n- two",
	"# h\r\n\r\npara",
	"a *b*\r\n\r\n```js\r\nlet x = 1;\r\n```\r\n\r\n| a | b |\r\n| --- | --- |\r\n| 1 | {x} |\r\n",
	"---\r\ntitle: x\r\n---\r\n\r\n<div>\r\n{#if x}\r\n_y_\r\n{/if}\r\n</div>\r\n",
	"mixed\rbare\r\ncrlf\nlf",
	"{\r\n}",
];

const to_lf = (s: string) => s.replace(/\r\n?/g, "\n");

describe("compile with \\r line endings", () => {
	test.each(CASES)("html matches the LF document: %j", (raw) => {
		expect(compile(raw).code).toBe(compile(to_lf(raw)).code);
	});

	test.each(CASES)("mappings index the raw source: %j", (raw) => {
		const lf = to_lf(raw);
		const a = compile(raw, { sourcemap: true }).mappings!;
		const b = compile(lf, { sourcemap: true }).mappings!;
		expect(a.length).toBe(b.length);

		for (let i = 0; i < a.length; i++) {
			const lf_src = b[i].sourceOffsets[0];
			const lf_gen = b[i].generatedOffsets[0];
			const lf_len = b[i].lengths[0];

			if (b[i].generatedLengths) {
				const s = a[i].sourceOffsets[0];
				const text = raw.slice(s, s + a[i].lengths[0]);
				expect(to_lf(text)).toBe(lf.slice(lf_src, lf_src + lf_len));
				expect(a[i].generatedOffsets).toEqual(b[i].generatedOffsets);
				expect(a[i].generatedLengths).toEqual(b[i].generatedLengths);
				continue;
			}

			expect(a[i].generatedLengths).toBeUndefined();
			let gen = lf_gen;
			for (let p = 0; p < a[i].sourceOffsets.length; p++) {
				const s = a[i].sourceOffsets[p];
				const len = a[i].lengths[p];
				expect(a[i].generatedOffsets[p]).toBe(gen);
				const lf_s = lf_src + (gen - lf_gen);
				expect(raw.slice(s, s + len).replace(/\r/g, "\n")).toBe(
					lf.slice(lf_s, lf_s + len),
				);
				gen += len;
			}
			expect(gen).toBe(lf_gen + lf_len);
		}
	});

	test.each(CASES)("v3 map matches the LF document: %j", (raw) => {
		const lf = to_lf(raw);
		const a = compile(raw, { sourcemap: true });
		const b = compile(lf, { sourcemap: true });
		expect(mappings_to_v3(a.mappings!, raw, a.code, "x.svx").mappings).toBe(
			mappings_to_v3(b.mappings!, lf, b.code, "x.svx").mappings,
		);
	});
});
