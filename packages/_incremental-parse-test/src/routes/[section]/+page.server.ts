import { redirect } from "@sveltejs/kit";
import { find_section } from "$lib/snippets";

export function load({ params }) {
	const section = find_section(params.section);
	if (!section) redirect(307, "/");
	redirect(307, `/${section.slug}/${section.snippets[0].slug}`);
}
