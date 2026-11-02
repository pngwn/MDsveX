// what the finder can't read from a plugin itself: the concern it serves, the
// syntax it reads, the compile options it needs beside it, and one small
// example. Everything else (name, description, directives, the nodes it acts
// on, fences it claims, options and their docs, peers, components, stylesheet)
// is read from the package by catalog.server.ts.
//
// This file stands in for the metadata design/docs/PLUGINS.md proposes: the
// concern and syntax in a `mdsvex` field of the plugin's package.json, the
// example as a flagged fence on its docs page. Keys are package names, so a
// package with no entry here still shows up, under "Not sorted yet".
//
// Every syntax sample and every example is compiled with its plugin when the
// site builds, and a sample the plugin does nothing to fails the build

export type ConcernId = 'layout' | 'text' | 'code' | 'media' | 'navigate' | 'links' | 'cite' | 'data' | 'check';

/** the jobs readers come with, in the order a page is written: shape it, fill it, connect it, check it */
export const CONCERNS: { id: ConcernId; name: string; line: string }[] = [
	{ id: 'layout', name: 'Lay out a page', line: 'Steps, tabs, disclosures and figures around what you wrote.' },
	{ id: 'text', name: 'Mark up text', line: 'Keys, badges, marks, abbreviations and emoji inside a sentence.' },
	{ id: 'code', name: 'Show code', line: 'Code blocks with a copy button, and code groups.' },
	{ id: 'media', name: 'Pictures, video and diagrams', line: 'Captions, players, and diagrams drawn from text.' },
	{ id: 'navigate', name: 'Help readers find their way', line: 'Links on headings and a table of contents.' },
	{ id: 'links', name: 'Link out and refer', line: 'A policy for links that leave the site, and links from @user or #123.' },
	{ id: 'cite', name: 'Cite and cross-reference', line: 'A bibliography, and numbered figures, tables and equations.' },
	{ id: 'data', name: 'Know each page', line: 'Facts about a document for a layout or a list of posts.' },
	{ id: 'check', name: 'Catch broken things', line: 'Warnings, or a failed build, before a reader finds them.' },
];

export interface Syntax {
	/** as the finder shows it, one line */
	mark: string;
	/** a whole small document that uses it, when the mark alone isn't one */
	source?: string;
}

export interface Example {
	source: string;
	/** the plugin's own options */
	options?: Record<string, unknown>;
	/** files the example reads, by path from the example */
	files?: Record<string, string>;
	/** other first-party plugins it runs with, by package name, ahead of this one */
	with?: string[];
}

export interface Authored {
	concerns: ConcernId[];
	syntax: Syntax[];
	/** mdsvex options the plugin needs beside it */
	needs?: { heading_ids?: true; unwrap_images?: true };
	/** why compile alone won't do, when a document has to be compiled with compile_async or the Vite plugin */
	async?: string;
	example: Example;
	/** the docs page today */
	docs: string;
	/** where it stops, for a plugin page: markdown, `code` set as code */
	edges?: string[];
}

const fence = '```';

export const authored: Record<string, Authored> = {
	'@mdsvex/plugin-steps': {
		concerns: ['layout'],
		syntax: [
			{ mark: ':::steps', source: ':::steps\n\n## Install\n\nRun it.\n\n:::\n' },
			{ mark: ':::step[Title]', source: ':::steps\n\n:::step[Install]\nRun it.\n:::\n\n:::\n' },
		],
		example: { source: ':::steps\n\n## Install\n\nAdd the package.\n\n## Configure\n\nPut it in `plugins`.\n\n:::\n' },
		docs: '/docs/plugins/steps',
	},
	'@mdsvex/plugin-tabs': {
		concerns: ['layout', 'code'],
		syntax: [
			{ mark: ':::tabs', source: ':::tabs\n\n## macOS\n\nBrew.\n\n:::\n' },
			{ mark: ':::tabs(group=pm)', source: `:::tabs(group=pm)\n\n${fence}sh [npm]\nnpm i mdsvex\n${fence}\n\n:::\n` },
		],
		example: {
			source: `:::tabs(group=pm)\n\n${fence}sh [npm]\nnpm install mdsvex\n${fence}\n\n${fence}sh [pnpm]\npnpm add mdsvex\n${fence}\n\n:::\n`,
		},
		docs: '/docs/plugins/tabs',
		edges: [
			'The first heading or fence written directly inside decides: headings make tabs, fences make a code group.',
			'The first heading sets the depth. A heading of another depth, or one inside a quote, a list or another directive, is content of its panel.',
			'A tab label is not a heading of the page: it gets no id from `heading_ids` and no anchor.',
			'`(group=name)` switches every set of that group together and keeps the choice in `localStorage`. The server renders the first tab, so the two never disagree.',
			'Without JavaScript every panel shows, one after another, under its label.',
			'Warns about `:::tabs` with no tabs, a tab with no label, and content before the first tab.',
		],
	},
	'@mdsvex/plugin-elements': {
		concerns: ['layout', 'text'],
		syntax: [
			{ mark: ':::details[Summary]', source: ':::details[Summary]\nHidden.\n:::\n' },
			{ mark: ':kbd[Ctrl]' },
			{ mark: ':badge[new](tone=tip)' },
			{ mark: ':abbr[PFM](title=…)', source: ':abbr[PFM](title="Penguin-Flavoured Markdown")\n' },
		],
		example: {
			source: ':::details[Does it need JavaScript?]\nNo, it is a `<details>`.\n:::\n\nPress :kbd[Ctrl] :kbd[K] to search. :badge[new](tone=tip)\n',
		},
		docs: '/docs/plugins/elements',
	},
	'@mdsvex/plugin-embeds': {
		concerns: ['media'],
		syntax: [{ mark: '::youtube[Title](id=…)', source: '::youtube[A talk](id=dQw4w9WgXcQ)\n' }, { mark: '::vimeo[Title](id=…)', source: '::vimeo[A film](id=76979871)\n' }],
		example: { source: '::vimeo[The New Vimeo Player](id=76979871)\n' },
		docs: '/docs/plugins/embeds',
	},
	'@mdsvex/plugin-figures': {
		concerns: ['media', 'cite'],
		syntax: [{ mark: ':::figure[Caption]', source: ':::figure[A caption]\nAnything.\n:::\n' }],
		needs: { unwrap_images: true },
		example: { source: ':::figure[The score of a heading](id=fig:score)\n\n![A heading drawn as its score](/favicon.svg)\n\n:::\n' },
		docs: '/docs/plugins/figures',
	},
	'@mdsvex/plugin-code-blocks': {
		concerns: ['code'],
		syntax: [{ mark: `${fence}js title="a.js"`, source: `${fence}js title="a.js"\nlet a = 1;\n${fence}\n` }],
		example: { source: `${fence}js title="mdsvex.config.js"\nexport default { heading_ids: true };\n${fence}\n` },
		docs: '/docs/plugins/code-blocks',
	},
	'@mdsvex/plugin-diagram': {
		concerns: ['media', 'code'],
		syntax: [{ mark: `${fence}mermaid`, source: `${fence}mermaid\ngraph LR\n  A --> B\n${fence}\n` }],
		example: { source: `${fence}mermaid\ngraph LR\n  source --> parser --> plugins --> component\n${fence}\n` },
		docs: '/docs/plugins/diagrams',
	},
	'@mdsvex/plugin-anchors': {
		concerns: ['navigate'],
		syntax: [{ mark: '## Heading' }],
		needs: { heading_ids: true },
		example: { source: '## Getting started\n\nEvery heading with an id links to itself.\n' },
		docs: '/docs/plugins/anchors',
	},
	'@mdsvex/plugin-toc': {
		concerns: ['navigate', 'data'],
		syntax: [{ mark: '::toc[On this page]', source: '::toc[On this page]\n\n## Install\n' }, { mark: '## Heading' }],
		needs: { heading_ids: true },
		example: { source: '# Guide\n\n::toc[On this page]\n\n## Install\n\n### With pnpm\n\n## Configure\n' },
		docs: '/docs/plugins/toc',
		edges: [
			'It needs `heading_ids`. With it off, a document with a heading to list fails with a `TocError`.',
			'`::toc` lists the whole document, headings after it too. While a document streams, nothing shows in its place until the stream ends.',
			'A heading with no id, such as `## {title}`, is left out with a warning. `<!-- no-toc -->` inside a heading leaves it out and keeps its id.',
			'The headings of steps are listed. The headings that start a tab are labels, and are not.',
			'Warns about a heading that skips a level, and a `::toc` with nothing to list.',
			'`toc_tree(headings)` nests the flat list, and `Toc.svelte` renders it in a template.',
		],
	},
	'@mdsvex/plugin-page-data': {
		concerns: ['data'],
		syntax: [{ mark: '<!-- more -->', source: 'An excerpt.\n\n<!-- more -->\n\nThe rest.\n' }, { mark: '# Title' }],
		example: { source: '# Moving to runes\n\nSignals changed how I write components.\n\n<!-- more -->\n\nHere is what I learned, in order.\n' },
		docs: '/docs/plugins/page-data',
	},
	'@mdsvex/plugin-external-links': {
		concerns: ['links'],
		syntax: [{ mark: '[text](https://…)', source: '[the spec](https://example.com)\n' }],
		example: { source: 'Read [the spec](https://example.com/spec), then [the guide](/guide).\n', options: { target: '_blank', new_tab_label: 'opens in a new tab' } },
		docs: '/docs/plugins/external-links',
	},
	'@mdsvex/plugin-references': {
		concerns: ['links', 'text'],
		syntax: [{ mark: '@user' }, { mark: '#123' }, { mark: 'owner/repo#45' }],
		example: { source: 'Thanks @ada for #123, which also closes sveltejs/kit#45.\n', options: { repo: 'sveltejs/svelte' } },
		docs: '/docs/plugins/references',
	},
	'@mdsvex/plugin-emoji': {
		concerns: ['text'],
		syntax: [{ mark: ':tada:' }],
		example: { source: 'We shipped it :tada: and nobody was paged :+1:\n' },
		docs: '/docs/plugins/emoji',
	},
	'@mdsvex/plugin-citations': {
		concerns: ['cite'],
		syntax: [{ mark: ':cite[key]' }, { mark: '::bibliography' }].map((s) => ({
			...s,
			source: `---\nbibliography: ./refs.json\n---\n\n${s.mark === ':cite[key]' ? 'As shown :cite[lovelace1843].' : 'As shown :cite[lovelace1843].\n\n::bibliography'}\n`,
		})),
		async: 'it reads the bibliography the frontmatter names',
		example: {
			source: '---\nbibliography: ./refs.json\n---\n\nThe engine could do more than count :cite[lovelace1843].\n\n::bibliography[References]\n',
			files: {
				'./refs.json': JSON.stringify(
					[
						{
							id: 'lovelace1843',
							type: 'article-journal',
							title: 'Notes on the Analytical Engine',
							author: [{ family: 'Lovelace', given: 'Ada' }],
							'container-title': 'Scientific Memoirs',
							issued: { 'date-parts': [[1843]] },
						},
					],
					null,
					'\t',
				),
			},
		},
		docs: '/docs/plugins/citations',
	},
	'@mdsvex/plugin-numbering': {
		concerns: ['cite'],
		syntax: [{ mark: ':ref[sec:id]', source: '## Results\n\nSee :ref[sec:results].\n' }],
		needs: { heading_ids: true },
		example: {
			source: ':::figure[Sales by month](id=fig:sales)\nA chart.\n:::\n\nSales rose in March, as :ref[fig:sales] shows.\n',
			with: ['@mdsvex/plugin-figures'],
		},
		docs: '/docs/plugins/numbering',
	},
	'@mdsvex/plugin-link-check': {
		concerns: ['check'],
		syntax: [{ mark: '[text](#id)', source: '[nowhere](#nowhere)\n' }, { mark: '[text](./page.svx#id)', source: '[a page](./page.svx#usage)\n' }],
		needs: { heading_ids: true },
		async: 'it reads the documents a page links to',
		example: {
			source: '# Install\n\nSee [the setup](#setup), [install](#install)\nand [the guide](./guide.svx#usage).\n',
			files: { './guide.svx': '# Guide\n\n## Use it\n' },
		},
		docs: '/docs/plugins/link-check',
		edges: [
			'`#id` is checked against every id the document gives an element: headings (which need `heading_ids`), typed ids, footnotes, directive ids and ids a plugin set. `#top` and `#` need none.',
			'An id a component makes as it renders is not known. Skip it with `ignore`.',
			'Other documents are checked by file, `./guide.svx#usage`, and by route when `routes` is given. A route with no document may be a Svelte page, and is not reported.',
			'Reading other documents waits, so it needs the Vite plugin or `compile_async` with a `read`. `documents: false` checks within a page alone, under `compile` too.',
			'In the dev server a linked document is a dependency: change its headings and every page that links to it is checked again.',
			'Markdown links only. An `<a>` typed as HTML, and files that are no documents, such as images, are not checked.',
		],
	},
};
