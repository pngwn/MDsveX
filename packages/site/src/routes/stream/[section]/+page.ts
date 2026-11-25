import { redirect } from "@sveltejs/kit";
import { FIXTURE_SECTIONS } from "$lib/stream/fixtures";
import { SECTIONS } from "$lib/stream/snippets";

export function load({ params }) {
	const section = [...SECTIONS, ...FIXTURE_SECTIONS].find((s) => s.slug === params.section);
	if (!section) redirect(307, "/stream");
	redirect(307, `/stream/${section.slug}/${section.snippets[0].slug}`);
}
