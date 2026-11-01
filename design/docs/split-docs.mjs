// The one-off move of packages/site/src/routes/_docs.svtext into .svx routes,
// step one of PLAN.md. Kept as the record of where each line went. It needs the
// old file, so run it from a commit that still has it, from packages/site:
//
//   node ../../design/docs/split-docs.mjs
//
// Prose is copied as written. What it changes: heading levels (a page's top
// heading becomes h1), `docs#id` links (to the page that now holds the id), the
// link definitions (each page gets the ones it uses), and frontmatter on top.
// It also writes the map from every old `/docs#id` to its new page.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// mdsvex as the site resolves it
const { compile } = await import(
	pathToFileURL(createRequire(join(process.cwd(), 'package.json')).resolve('mdsvex')).href
);

const OLD = 'src/routes/_docs.svtext';
const OUT = 'src/routes/docs';

// [route, title, order, ranges, extra]. A range is [first, last] in lines of the
// old file, inclusive, with an optional third value added to its heading levels.
// `heading` puts a `# title` on a page whose top headings are siblings.
const pages = [
	['learn/what-mdsvex-is', 'What mdsvex is', 1, [[20, 45]]],
	['learn/quick-start', 'Quick start', 2, [[46, 148]], { heading: true }],
	['learn/markdown', 'Markdown', 3, [[258, 423]]],

	['guides/frontmatter', 'Frontmatter', 1, [[1385, 1527]]],
	['guides/templates', 'Templates', 2, [[1528, 1664]]],
	['guides/components', 'Custom components', 3, [[1665, 1840]]],
	['guides/directives', 'Directives', 4, [[1841, 1924]]],
	['guides/prettier', 'Formatting with Prettier', 5, [[3882, 3934]]],
	['guides/without-vite', 'Without Vite', 6, [[3935, 4006], [226, 257, -1]]],
	['guides/migrating-from-0x', 'Migrating from 0.x', 7, [[4007, 4194]]],
	['guides/remark-and-rehype', 'Coming from remark and rehype', 8, [[4195, 4274]]],

	['plugins', 'Using plugins', 0, [[1925, 1989]]],
	['plugins/steps', 'Steps', 1, [[1990, 2074]]],
	['plugins/tabs', 'Tabs', 2, [[2075, 2175]]],
	['plugins/elements', 'Elements', 3, [[2176, 2222]]],
	['plugins/embeds', 'Embeds', 4, [[2223, 2236]]],
	['plugins/figures', 'Figures', 5, [[2237, 2260]]],
	['plugins/code-blocks', 'Code blocks', 6, [[2261, 2274]]],
	['plugins/diagrams', 'Diagrams', 7, [[2275, 2294]]],
	['plugins/anchors', 'Anchors', 8, [[2295, 2342]]],
	['plugins/external-links', 'External links', 9, [[2343, 2409]]],
	['plugins/toc', 'Table of contents', 10, [[2410, 2496]]],
	['plugins/page-data', 'Page data', 11, [[2497, 2575]]],
	['plugins/emoji', 'Emoji', 12, [[2576, 2631]]],
	['plugins/references', 'References', 13, [[2632, 2699]]],
	['plugins/citations', 'Citations', 14, [[2700, 2771]]],
	['plugins/link-check', 'Link check', 15, [[2772, 2826]]],
	['plugins/numbering', 'Numbering', 16, [[2827, 2890]]],
	['plugins/writing/bundles', 'Bundles', 20, [[526, 698]], { group: 'Writing plugins' }],
	['plugins/writing/parse-plugins', 'Parse plugins', 21, [[699, 855]], { group: 'Writing plugins', heading: true }],
	['plugins/writing/deferred-work', 'Deferred work', 22, [[856, 916]], { group: 'Writing plugins' }],
	['plugins/writing/plugin-data', 'Plugin data', 23, [[917, 985]], { group: 'Writing plugins' }],

	['reference/options', 'Options', 1, [[424, 525], [986, 1058], [1258, 1384]]],
	['reference/images', 'Images', 2, [[1059, 1155]]],
	['reference/links', 'Links and rewrite', 3, [[1156, 1257]], { heading: true }],
	['reference/compile', 'Compile API', 4, [[149, 225]]],
	['reference/highlighting', 'Syntax highlighting', 5, [[2891, 3339]]],
	['reference/math', 'Math', 6, [[3340, 3532]]],
	['reference/footnotes', 'Footnotes', 7, [[3533, 3666]]],
	['reference/live-code', 'Live code', 8, [[3667, 3744]]],
	['reference/code-that-runs', 'Code that runs', 9, [[3745, 3881]]],
	['reference/limitations', 'Limitations', 10, [[4458, 4487]]],
];

// "Parser changes on `next`" leaves the docs for the release notes
const RELEASE_NOTES = [4275, 4457];

const lines = readFileSync(OLD, 'utf8').split('\n');

// line numbers (1 based) outside fences that are headings, and the link definitions
const in_fence = new Set();
{
	let fence = null;
	lines.forEach((line, i) => {
		const m = /^\s*(`{3,})/.exec(line);
		if (m && !fence) {
			fence = m[1];
			in_fence.add(i + 1);
			return;
		}
		if (fence) {
			in_fence.add(i + 1);
			const t = line.trim();
			if (/^`+$/.test(t) && t.length >= fence.length) fence = null;
		}
	});
}
const is_heading = (n) => !in_fence.has(n) && /^#{1,6} /.test(lines[n - 1]);

const definitions = [];
for (let n = 1; n < 20; n++) {
	const m = /^\[([^\]]+)\]: /.exec(lines[n - 1]);
	if (m) definitions.push({ label: m[1], line: lines[n - 1] });
}

// every line from the first heading on lands in exactly one page or the notes
const owner = new Map();
const claim = (n, who) => {
	if (owner.has(n)) throw new Error(`line ${n} is in ${owner.get(n)} and ${who}`);
	owner.set(n, who);
};
for (const [route, , , ranges] of pages)
	for (const [a, b] of ranges) for (let n = a; n <= b; n++) claim(n, route);
for (let n = RELEASE_NOTES[0]; n <= RELEASE_NOTES[1]; n++) claim(n, 'release notes');
for (let n = 20; n <= lines.length; n++)
	if (!owner.has(n) && lines[n - 1].trim() !== '') throw new Error(`line ${n} is in no page`);

// the ids every heading had in the one page, in order
const ids_of = (source) =>
	[...compile(source, { heading_ids: true }).code.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);

const old_headings = [];
for (let n = 20; n <= lines.length; n++) if (is_heading(n)) old_headings.push(n);
const old_ids = ids_of(lines.join('\n'));
if (old_ids.length !== old_headings.length)
	throw new Error(`${old_ids.length} ids for ${old_headings.length} headings`);
const old_id_at = new Map(old_headings.map((n, i) => [n, old_ids[i]]));

// build each page's body, before its links are rewritten
const built = pages.map(([route, title, order, ranges, extra = {}]) => {
	const body = [];
	const heading_lines = []; // old line of each heading in the page, null for one we add
	const levels = [];
	for (const [a, b, delta = 0] of ranges)
		for (let n = a; n <= b; n++) {
			let line = lines[n - 1];
			if (is_heading(n)) {
				const level = /^#+/.exec(line)[0].length + delta;
				line = '#'.repeat(level) + line.replace(/^#+/, '');
				levels.push(level);
				heading_lines.push(n);
			}
			body.push({ n, line });
		}
	const top = Math.min(...levels);
	const shift = top - (extra.heading ? 2 : 1);
	for (const item of body)
		if (item.n !== undefined && is_heading(item.n))
			item.line = item.line.replace(/^#+/, (h) => '#'.repeat(h.length - shift));
	if (extra.heading) {
		body.unshift({ line: '' });
		body.unshift({ line: `# ${title}` });
		heading_lines.unshift(null);
	}
	while (body.at(-1)?.line.trim() === '') body.pop();
	return { route, title, order, extra, body, heading_lines };
});

// the new id of every old heading, from a compile of the page it moved to
const moved = new Map(); // old id -> { route, id, top }
for (const page of built) {
	const ids = ids_of(page.body.map((b) => b.line).join('\n'));
	if (ids.length !== page.heading_lines.length)
		throw new Error(`${page.route}: ${ids.length} ids for ${page.heading_lines.length} headings`);
	page.heading_lines.forEach((n, i) => {
		if (n === null) return;
		moved.set(old_id_at.get(n), { route: page.route, id: ids[i], top: i === 0 });
	});
}

const url = (route) => `/docs/${route}`;
const target = (old_id) => {
	const to = moved.get(old_id);
	if (!to) return null;
	return to.top ? url(to.route) : `${url(to.route)}#${to.id}`;
};

for (const page of built) {
	const text = page.body
		.map(({ n, line }) =>
			n !== undefined && in_fence.has(n)
				? line
				: line.replace(/\]\(docs#([^)\s]+)\)/g, (all, id) => {
						const to = target(id);
						if (!to) throw new Error(`${page.route}: docs#${id} goes nowhere`);
						return `](${to})`;
					}),
		)
		.join('\n');

	const used = definitions.filter(({ label }) => text.includes(`[${label}]`));
	const front = [
		'---',
		`title: ${page.title}`,
		`order: ${page.order}`,
		...(page.extra.group ? [`group: ${page.extra.group}`] : []),
		'---',
		'',
		...(used.length ? [...used.map((d) => d.line), ''] : []),
	].join('\n');

	const file = join(OUT, page.route, '+page.svx');
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${front}${text}\n`);
}

// old anchors with nowhere to go (the release notes) are left out, and land on /docs
const redirects = {};
for (const id of old_ids) {
	const to = target(id);
	if (to) redirects[id] = to;
}
writeFileSync(join(OUT, 'redirects.json'), JSON.stringify(redirects, null, '\t') + '\n');

writeFileSync(
	'../../design/docs/parser-changes-next.2.md',
	lines
		.slice(RELEASE_NOTES[0] - 1, RELEASE_NOTES[1])
		.join('\n')
		.replace(/\]\(docs#([^)\s]+)\)/g, (all, id) => `](https://mdsvex.pngwn.io${target(id) ?? '/docs'})`)
		.trimEnd() + '\n',
);

console.log(`${built.length} pages, ${Object.keys(redirects).length} redirects`);
