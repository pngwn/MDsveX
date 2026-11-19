import { SECTIONS, set_all_sections } from "$lib/snippets";
import { load_fixture_sections } from "$lib/fixtures";
import type { Section } from "$lib/snippets";

const fixture_sections = load_fixture_sections();
const all_sections: Section[] = [...SECTIONS, ...fixture_sections];
set_all_sections(all_sections);

export function load() {
	return {
		sections: all_sections.map((s) => ({
			name: s.name,
			slug: s.slug,
			snippets: s.snippets.map((sn) => ({ name: sn.name, slug: sn.slug })),
		})),
	};
}
