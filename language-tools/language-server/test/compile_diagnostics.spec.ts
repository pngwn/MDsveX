import { describe, expect, it } from "vitest";
import { URI } from "vscode-uri";
import { create_compile_diagnostics } from "../src/compile_diagnostics";

const SOURCE = "::nope[y]\n<img use:a />\n";

/** the slice of a volar context the plugin reads */
function context(diagnostics: unknown) {
	const root = { diagnostics };
	return {
		decodeEmbeddedDocumentUri: (uri: URI) =>
			uri.scheme === "volar-embedded-content"
				? [URI.file("/doc.svx"), "root"]
				: undefined,
		language: { scripts: { get: () => ({ generated: { root } }) } },
	} as any;
}

function document(languageId: string) {
	return {
		uri: "volar-embedded-content://root/doc.svx",
		languageId,
		positionAt(offset: number) {
			const before = SOURCE.slice(0, offset).split("\n");
			return { line: before.length - 1, character: before.at(-1)!.length };
		},
	} as any;
}

describe("compile diagnostics", () => {
	const plugin = create_compile_diagnostics();

	it("reports the root diagnostics as errors and warnings from mdsvex", () => {
		const instance = plugin.create(
			context([
				{ start: 0, end: 6, message: "no component renders ::nope", severity: "error" },
				{ start: 10, end: 14, message: "<img> stays an element", severity: "warning" },
			]),
		);
		expect(instance.provideDiagnostics!(document("pfm"), {} as any)).toEqual([
			{
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
				message: "no component renders ::nope",
				severity: 1,
				source: "mdsvex",
			},
			{
				range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
				message: "<img> stays an element",
				severity: 2,
				source: "mdsvex",
			},
		]);
	});

	it("leaves embedded typescript, css and markdown to their services", () => {
		const instance = plugin.create(context([]));
		expect(instance.provideDiagnostics!(document("typescript"), {} as any)).toBeUndefined();
	});
});
