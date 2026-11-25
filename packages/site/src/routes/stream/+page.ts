import { redirect } from "@sveltejs/kit";
import { SECTIONS } from "$lib/stream/snippets";

export function load() {
	const first = SECTIONS[0];
	redirect(307, `/stream/${first.slug}/${first.snippets[0].slug}`);
}
