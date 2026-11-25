import { error } from "@sveltejs/kit";
import { load_fixture } from "$lib/stream/fixtures";
import { find_snippet, type Snippet } from "$lib/stream/snippets";

export async function load({ params }): Promise<{ snippet: Snippet }> {
	const snippet = find_snippet(params.section, params.example);
	if (snippet) return { snippet };

	const markdown = await load_fixture(params.section, params.example);
	if (markdown === undefined) error(404, `There is no example called '${params.example}'`);
	return { snippet: { name: `#${params.example}`, slug: params.example, markdown } };
}
