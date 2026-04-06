import { redirect } from "@sveltejs/kit";
import { SECTIONS } from "$lib/snippets";

export function load() {
	const first = SECTIONS[0];
	redirect(307, `/${first.slug}/${first.snippets[0].slug}`);
}
