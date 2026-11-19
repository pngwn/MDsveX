import { describe, expect, it } from "vitest";
import { without_self } from "../src/definitions";

const range = (line: number, from: number, to: number) => ({
	start: { line, character: from },
	end: { line, character: to },
});

describe("without_self", () => {
	const at = { line: 3, character: 1 };

	it("drops a location holding the request when another target exists", () => {
		const self = { uri: "file:///doc.svx", range: range(3, 0, 10) };
		const component = { uri: "file:///Heading.svelte", range: range(0, 0, 0) };
		expect(without_self([self, component], "file:///doc.svx", at)).toEqual([component]);
	});

	it("keeps a lone self location and other places in the document", () => {
		const self = { uri: "file:///doc.svx", range: range(3, 0, 10) };
		const elsewhere = { uri: "file:///doc.svx", range: range(9, 0, 4) };
		expect(without_self([self], "file:///doc.svx", at)).toEqual([self]);
		expect(without_self([self, elsewhere], "file:///doc.svx", at)).toEqual([elsewhere]);
	});

	it("reads location links by their target", () => {
		const link = {
			targetUri: "file:///doc.svx",
			targetRange: range(3, 0, 10),
			targetSelectionRange: range(3, 0, 2),
		};
		const other = { ...link, targetUri: "file:///Heading.svelte" };
		expect(without_self([link, other], "file:///doc.svx", at)).toEqual([other]);
	});
});
