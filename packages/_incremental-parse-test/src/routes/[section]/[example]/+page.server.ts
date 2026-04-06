import { error } from "@sveltejs/kit";
import { find_snippet } from "$lib/snippets";

export function load({ params }) {
	const snippet = find_snippet(params.section, params.example);
	if (!snippet) error(404, "Example not found");
	return { markdown: snippet.markdown, name: snippet.name };
}
