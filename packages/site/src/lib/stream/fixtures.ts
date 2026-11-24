// the parser's own test fixtures, so a failing one can be stepped through. The
// names are known when the site builds, the text of one is fetched when it opens
const files = import.meta.glob<string>(
	"../../../../parse/test/fixtures/pfm/*/*.md",
	{ query: "?raw", import: "default" },
);

export interface FixtureSection {
	name: string;
	slug: string;
	snippets: { name: string; slug: string }[];
}

/** the slug of a section of fixtures starts with this */
export const FIXTURES = "fixtures--";

const by_route = new Map<string, () => Promise<string>>();
const sections = new Map<string, FixtureSection>();

for (const [path, load] of Object.entries(files)) {
	const [category, file] = path.split("/").slice(-2);
	const id = file.slice(0, -".md".length);
	const slug = FIXTURES + category.replace(/_/g, "-");
	let section = sections.get(slug);
	if (section === undefined) {
		const name = category
			.replace(/_/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());
		sections.set(slug, (section = { name, slug, snippets: [] }));
	}
	section.snippets.push({ name: `#${id}`, slug: id });
	by_route.set(`${slug}/${id}`, load);
}

/** fixtures are numbered, so they sort by number and then by name */
function by_number(a: { slug: string }, b: { slug: string }) {
	const na = parseInt(a.slug, 10);
	const nb = parseInt(b.slug, 10);
	if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
	return a.slug.localeCompare(b.slug);
}

export const FIXTURE_SECTIONS: FixtureSection[] = [...sections.values()]
	.sort((a, b) => a.slug.localeCompare(b.slug))
	.map((section) => ({
		...section,
		snippets: section.snippets.sort(by_number),
	}));

/** the text of a fixture, undefined when there is none by that name */
export const load_fixture = (section: string, slug: string) =>
	by_route.get(`${section}/${slug}`)?.();
