export function lines(str?: string): string[] {
	if (!str) return [];
	return str
		.split("\n")
		.filter((s) => !!s.trim())
		.map((s) => s.trim());
}

import { parse_markdown_svelte } from "@mdsvex/parse";
import type { ComponentSource } from "../src/main";

const DIRECTIVE_KINDS = new Set([30, 31, 32]);

/** every directive name a document uses, so a sweep can register them all */
export function directive_names(raw: string): string[] {
	const { nodes } = parse_markdown_svelte(raw);
	const names = new Set<string>();
	for (let i = 0; i < nodes.size; i++) {
		if (!DIRECTIVE_KINDS.has(nodes.kind_at(i))) continue;
		const name = nodes.metadata_at(i)?.name;
		if (typeof name === "string") names.add(name);
	}
	return [...names];
}

/** the directives option that renders every directive of raw, undefined for none */
export function all_directives(raw: string): ComponentSource[] | undefined {
	const names = directive_names(raw);
	return names.length === 0
		? undefined
		: [{ specifier: "mdsvex:directives", names }];
}
