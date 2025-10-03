import { expect, test } from "vitest";
import { parse } from "./parse";

test("parse", () => {
	const result = parse("Hello, world!");
	expect(result.type).toBe("root");
	expect(result.children.length).toBe(1);
});

test("parse svelte expression", () => {
	const result = parse("Hello, {name}!");
	console.log(JSON.stringify(result, null, 2));
});
