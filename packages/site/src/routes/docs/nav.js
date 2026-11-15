// the docs nav, from the frontmatter of every page: a page's folder names its
// section, `order` places it, `group` puts it under a heading in the section

const SECTIONS = [
	["learn", "Learn"],
	["guides", "Guides"],
	["plugins", "Plugins"],
	["reference", "Reference"],
	["internals", "Internals"],
];

const metadata = import.meta.glob("./**/+page.svx", {
	query: "?metadata",
	import: "metadata",
	eager: true,
});

/** @type {{ href: string, section: string, title: string, order: number, group?: string }[]} */
export const pages = Object.entries(metadata).map(([path, data]) => {
	const route = path.slice(2, -"/+page.svx".length);
	if (!data?.title || typeof data.order !== "number")
		throw new Error(`docs/${route} needs a title and an order in its frontmatter`);
	return {
		href: `/docs/${route}`,
		section: route.split("/")[0],
		title: data.title,
		order: data.order,
		group: data.group,
	};
});

for (const page of pages)
	if (!SECTIONS.some(([key]) => key === page.section))
		throw new Error(`${page.href} is in no docs section`);

/** each section with its pages, ungrouped first, and the groups after them */
export const nav = SECTIONS.map(([key, title]) => {
	const in_section = pages.filter((p) => p.section === key).sort((a, b) => a.order - b.order);
	const groups = [];
	for (const page of in_section) {
		const name = page.group ?? null;
		let group = groups.find((g) => g.title === name);
		if (!group) groups.push((group = { title: name, pages: [] }));
		group.pages.push(page);
	}
	groups.sort((a, b) => (a.title === null ? -1 : b.title === null ? 1 : 0));
	return { key, title, groups };
}).filter((section) => section.groups.length > 0);
