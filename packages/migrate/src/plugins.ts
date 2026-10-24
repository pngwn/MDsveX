/** where the docs list what replaces each remark and rehype plugin */
export const PLUGINS_GUIDE =
	"https://mdsvex.com/docs#coming-from-remark-and-rehype-plugins";

export interface Replacement {
	/** what to do in place of the plugin */
	message: string;
	/** an option that does what the plugin did with no options of its own */
	option?: string;
}

const HEADING_IDS: Replacement = {
	message: "The `heading_ids` option makes the same ids.",
	option: "heading_ids: true",
};
const ANCHORS: Replacement = {
	message:
		"Install `@mdsvex/plugin-anchors` and add `anchors()` to `plugins`, with `heading_ids: true`.",
};
const EXTERNAL_LINKS: Replacement = {
	message:
		"Install `@mdsvex/plugin-external-links` and add `external_links()` to `plugins`. It takes `target`, `rel` and a list of your own hosts.",
};
const TOC: Replacement = {
	message:
		"Install `@mdsvex/plugin-toc` and add `toc()` to `plugins`. It leaves the headings as data, and `::toc` lists them in a document.",
};
const HIGHLIGHT: Replacement = {
	message:
		"Code is highlighted by default now, with twinkleplop. Import a theme, or pass your own highlighter as `highlight`.",
};
const MATH: Replacement = {
	message:
		"Math is built in: a `math` fence and a code span in dollars. Pass `math: true` to `migrate` to rewrite `$x$` and `$$x$$` in your documents.",
};
const KATEX: Replacement = {
	message:
		"Math renders with Temml by default. For KaTeX, install `katex` and set `math: { renderer: 'katex' }`.",
};
const MERMAID: Replacement = {
	message:
		"Install `@mdsvex/plugin-kit` and `mermaid`, and add `mermaid()` to `plugins`. Diagrams are drawn in the browser.",
};
const FIGURES: Replacement = {
	message:
		"Install `@mdsvex/plugin-kit` and add `figures()` to `plugins`. An image with a title on a line of its own is a figure, with the title as its caption.",
	option: "unwrap_images: true",
};
const DIRECTIVES: Replacement = {
	message:
		"Directives are built in: `:::note` renders the `note` component of a directives module. Rewrite the old container syntax by hand.",
};
const FOOTNOTES: Replacement = {
	message:
		"Footnotes are built in. `migrate` writes each reference with the label of its definition.",
};
const EMOJI: Replacement = {
	message:
		"Install `@mdsvex/plugin-emoji` and add `emoji()` to `plugins`. It has the shortcodes GitHub uses.",
};
const REFERENCES: Replacement = {
	message:
		"Install `@mdsvex/plugin-references` and add `references({ repo: 'owner/name' })` to `plugins`. It links `@user`, `#123` and commits.",
};
const IMAGES: Replacement = {
	message:
		"A relative image is imported by default now, so Vite hashes it. Set `import_images: false` to leave urls as written.",
};
const LINKS: Replacement = {
	message:
		"The `links` option turns links between documents into routes and adds a base path, and `rewrite` is a function for any other url.",
};
const CLASSES: Replacement = {
	message:
		"A parse plugin sets a class in a few lines: `parse_plugins: [{ table: { parse(node) { node.attrs.class = 'table'; } } }]`.",
};
const NOTHING_YET = "Nothing replaces it yet.";

const REPLACEMENTS: Record<string, Replacement> = {
	"remark-gfm": {
		message:
			"Tables, strikethrough, task lists and footnotes are built in. A bare url is not a link now, `migrate` writes each one as `<https://example.com>`.",
	},
	"remark-frontmatter": {
		message: "Frontmatter is built in, and `frontmatter.parse` takes TOML or full YAML.",
	},
	"remark-slug": HEADING_IDS,
	"rehype-slug": HEADING_IDS,
	"remark-autolink-headings": ANCHORS,
	"rehype-autolink-headings": ANCHORS,
	"remark-external-links": EXTERNAL_LINKS,
	"rehype-external-links": EXTERNAL_LINKS,
	"remark-toc": TOC,
	"rehype-toc": TOC,
	"@stefanprobst/rehype-extract-toc": TOC,
	"@vcarl/remark-headings": TOC,
	"remark-reading-time": {
		message:
			"Install `@mdsvex/plugin-page-data` and add `page_data()` to `plugins`. A document exports its `plugin_data.page.minutes` and `words`.",
	},
	"rehype-infer-description-meta": {
		message:
			"Install `@mdsvex/plugin-page-data` and add `page_data()` to `plugins`. A document exports its `plugin_data.page.excerpt`.",
	},
	"rehype-code-group": {
		message:
			"Install `@mdsvex/plugin-tabs` and add `tabs()` to `plugins`. A `:::tabs` around the fences makes a code group.",
	},
	"remark-unwrap-images": {
		message: "The `unwrap_images` option does the same.",
		option: "unwrap_images: true",
	},
	"rehype-unwrap-images": {
		message: "The `unwrap_images` option does the same.",
		option: "unwrap_images: true",
	},
	"mdsvex-relative-images": IMAGES,
	"remark-embed-images": IMAGES,
	"remark-link-rewrite": LINKS,
	"rehype-urls": LINKS,
	"remark-prepend-url": LINKS,
	"remark-relative-links": LINKS,
	"remark-code-import": {
		message:
			"`src=./file.ts` on a fence shows a file. `migrate` renames `file=` on a fence with no code.",
	},
	"remark-math": MATH,
	"rehype-katex": KATEX,
	"rehype-katex-svelte": KATEX,
	"remark-html-katex": KATEX,
	"rehype-mathjax": {
		message:
			"Math renders with Temml by default. For MathJax, pass a function as `math` that returns its markup.",
	},
	"remark-smartypants": {
		message: "The `smart_punctuation` option does the same.",
	},
	"remark-highlight.js": HIGHLIGHT,
	"remark-prism": HIGHLIGHT,
	"rehype-highlight": HIGHLIGHT,
	"rehype-prism-plus": HIGHLIGHT,
	"rehype-pretty-code": HIGHLIGHT,
	"@shikijs/rehype": HIGHLIGHT,
	"rehype-code-titles": {
		message: "A fence takes its title as `title=\"file.ts\"` or `[file.ts]` in its meta.",
	},
	"remark-code-titles": {
		message: "A fence takes its title as `title=\"file.ts\"` or `[file.ts]` in its meta.",
	},
	"remark-directive": DIRECTIVES,
	"remark-containers": DIRECTIVES,
	"remark-admonitions": DIRECTIVES,
	"remark-custom-blocks": DIRECTIVES,
	"remark-sub-super": { message: "`~sub~` and `^sup^` are built in." },
	"remark-supersub": { message: "`~sub~` and `^sup^` are built in." },
	"remark-footnotes": FOOTNOTES,
	"remark-breaks": {
		message:
			"A line end is a space, and no option changes that. End a line with a backslash for a break.",
	},
	"rehype-raw": { message: "Not needed, HTML in a document is always markup." },
	"rehype-class-names": CLASSES,
	"rehype-add-classes": CLASSES,
	"remark-sectionize": {
		message: "A parse plugin wraps sections with `wrap_from`, the docs have it under plugin handlers.",
	},
	"rehype-section": {
		message: "A parse plugin wraps sections with `wrap_from`, the docs have it under plugin handlers.",
	},
	"rehype-mermaid": MERMAID,
	"remark-mermaidjs": MERMAID,
	"rehype-figure": FIGURES,
	"@microflash/rehype-figure": FIGURES,
	"remark-figure-caption": FIGURES,
	"remark-youtube": {
		message:
			"Install `@mdsvex/plugin-kit` and add `kit()` to `plugins`. Write a video as `::youtube[A talk](id=dQw4w9WgXcQ)`.",
	},
	"remark-kbd": {
		message:
			"Install `@mdsvex/plugin-kit` and add `kit()` to `plugins`. Write a key as `:kbd[Ctrl]`.",
	},
	"remark-abbr": {
		message: "An inline directive does this: `:abbr[HTML](title=HyperText)` with an `abbr` component.",
	},
	"remark-emoji": EMOJI,
	"remark-gemoji": EMOJI,
	"remark-attr": {
		message: `${NOTHING_YET} Braces belong to Svelte, so \`{.class}\` and \`{#id}\` can't exist. A parse plugin can set any attribute.`,
	},
	"remark-heading-id": {
		message: `${NOTHING_YET} Braces belong to Svelte, so \`{#id}\` can't exist. \`heading_ids\` makes ids from the text.`,
	},
	"remark-github": REFERENCES,
	"remark-mentions": REFERENCES,
	"remark-ping": REFERENCES,
	"remark-wiki-link": { message: `${NOTHING_YET} \`[[Page]]\` is text.` },
	"remark-definition-list": { message: `${NOTHING_YET} Type \`<dl>\`, \`<dt>\` and \`<dd>\`.` },
	"remark-deflist": { message: `${NOTHING_YET} Type \`<dl>\`, \`<dt>\` and \`<dd>\`.` },
	"remark-github-blockquote-alert": {
		message: `${NOTHING_YET} Write \`:::note\` with a directive component.`,
	},
	"rehype-callouts": {
		message: `${NOTHING_YET} Write \`:::note\` with a directive component.`,
	},
	"rehype-citation": {
		message:
			"Install `@mdsvex/plugin-citations` and add `citations()` to `plugins`. Cite with `:cite[key]` from a CSL JSON file named by `bibliography` in the frontmatter, and list the entries with `::bibliography`.",
	},
	"remark-validate-links": { message: NOTHING_YET },
	"rehype-sanitize": {
		message:
			"Nothing replaces it. A document compiles to a component and runs as code, so don't compile markdown you don't trust.",
	},
};

/** what replaces the remark or rehype plugin a module exports, undefined for one the docs do not list */
export function replacement_of(module_name: string): Replacement | undefined {
	return REPLACEMENTS[module_name];
}
