import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { compile } from "mdsvex/compile";

import { migrate } from "../src/main";

const fixtures = fileURLToPath(new URL("../../mdsvex/test/_fixtures", import.meta.url));

function compiled(source: string): string {
	return compile(migrate(source), { highlight: false, strict_directives: false }).code;
}

describe("0.x documents migrate to documents that compile", () => {
	for (const dir of ["markdown", "hybrid"]) {
		const input = `${fixtures}/${dir}/input`;
		for (const file of readdirSync(input)) {
			test(`${dir}/${file}`, () => {
				expect(() => compiled(readFileSync(`${input}/${file}`, "utf8"))).not.toThrow();
			});
		}
	}

	test("a document with a head, a script, a block and a component", () => {
		const source = [
			"---",
			"title: A post",
			"---",
			"",
			"<script>",
			"\timport Chart from './Chart.svelte';",
			"\tlet items = [{ name: 'a_b' }];",
			"</script>",
			"",
			"<svelte:head>",
			"<title>{title}</title>",
			"</svelte:head>",
			"",
			"Intro",
			"=====",
			"",
			"Some *emphasis*, some **strength** and {items[0].name}.",
			"",
			"{#each items as item (item.name)}",
			"- {item.name}",
			"{/each}",
			"",
			"<Chart data={items} on:select={(e) => e.detail_value} />",
			"",
		].join("\n");
		expect(migrate(source)).toBe(
			[
				"---",
				"title: A post",
				"---",
				"",
				"<script>",
				"\timport Chart from './Chart.svelte';",
				"\tlet items = [{ name: 'a_b' }];",
				"</script>",
				"",
				"<svelte:head>",
				"<title>{title}</title>",
				"</svelte:head>",
				"",
				"# Intro",
				"",
				"Some _emphasis_, some *strength* and {items[0].name}.",
				"",
				"{#each items as item (item.name)}",
				"",
				"- {item.name}",
				"",
				"{/each}",
				"",
				"<Chart data={items} on:select={(e) => e.detail_value} />",
				"",
			].join("\n"),
		);
		expect(compiled(source)).toBe(
			[
				"<script module>",
				'export const metadata = {"title":"A post"};',
				"</script><script>",
				"\timport Chart from './Chart.svelte';",
				"\tlet items = [{ name: 'a_b' }];",
				"</script><svelte:head><title>{title}</title></svelte:head><h1>Intro</h1><p>Some <em>emphasis</em>, some <strong>strength</strong> and {items[0].name}.</p>{#each items as item (item.name)}",
				"<ul>",
				"<li>{item.name}</li>",
				"",
				"</ul>{/each}<Chart data={items} on:select={(e) => e.detail_value} />",
			].join("\n"),
		);
	});
});
