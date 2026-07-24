import { describe, expect, test } from "vitest";
import { compile, CompilerSession } from "../src/main";
import type { ParsePlugin } from "../src/main";

const documents = [
	"# Heading\n\nA paragraph with *emphasis* and [a link](https://example.com).\n",
	"| left | right |\n| :--- | ---: |\n| one | two |\n",
	"```ts\nconst value = 1;\n```\n\n<section>{value}</section>\n",
	"short\n",
];

describe("CompilerSession", () => {
	test("matches one-shot HTML and mappings across sequential documents", () => {
		const compiler = new CompilerSession();

		for (let pass = 0; pass < 4; pass++) {
			for (const source of documents) {
				expect(compiler.compile(source)).toEqual(compile(source));
				expect(compiler.compile(source, { sourcemap: true })).toEqual(
					compile(source, { sourcemap: true }),
				);
			}
		}
	});

	test("does not mutate a prior result when its arena is reset", () => {
		const compiler = new CompilerSession();
		const first = compiler.compile(documents[0], { sourcemap: true });
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compiler.compile(documents[i % documents.length], { sourcemap: true });
		}

		expect(first).toEqual(snapshot);
	});

	test("falls back safely for source-bound plugins", () => {
		const plugin: ParsePlugin = {
			heading: {
				parse(node) {
					node.attrs.id = "session-heading";
				},
			},
		};
		const options = { parsePlugins: [plugin], sourcemap: true };
		const compiler = new CompilerSession();

		expect(compiler.compile(documents[0], options)).toEqual(
			compile(documents[0], options),
		);
		expect(compiler.compile(documents[1], { sourcemap: true })).toEqual(
			compile(documents[1], { sourcemap: true }),
		);
	});
});
