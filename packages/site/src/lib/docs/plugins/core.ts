// what mdsvex does with no plugin, for a search that would otherwise find
// nothing: someone looking for math, footnotes or highlighting needs to hear
// it is built in, and where it is documented. Not plugins, so not read from
// plugins/; these are the options and pages of the core
import type { Term } from './types';

export interface Core {
	name: string;
	line: string;
	href: string;
	/** what someone might type for it */
	words: string[];
}

export const CORE: Core[] = [
	{ name: 'Math', line: 'A `math` fence and inline math in a code span, MathML by Temml.', href: '/docs/reference/math', words: ['math', 'latex', 'equation', 'katex', 'temml', 'formula'] },
	{ name: 'Footnotes', line: '`[^note]` and its definition, numbered and linked both ways.', href: '/docs/reference/footnotes', words: ['footnote', 'footnotes', 'note', 'sidenote'] },
	{ name: 'Syntax highlighting', line: 'Fences highlighted at build time, themed with CSS.', href: '/docs/reference/highlighting', words: ['highlight', 'highlighting', 'syntax', 'shiki', 'prism', 'theme', 'twoslash'] },
	{ name: 'Heading ids', line: 'The `heading_ids` option gives every heading an id.', href: '/docs/reference/options#heading_ids', words: ['heading_ids', 'ids', 'slug', 'slugs', 'heading'] },
	{ name: 'Smart punctuation', line: 'Curly quotes, dashes and ellipses, behind `smart_punctuation`.', href: '/docs/reference/options#smart_punctuation', words: ['smart', 'quotes', 'dashes', 'typography', 'punctuation', 'smartypants'] },
	{ name: 'Images', line: 'Relative images become imports; `unwrap_images` drops the `<p>`.', href: '/docs/reference/images', words: ['image', 'images', 'img', 'unwrap_images', 'enhanced'] },
	{ name: 'Links and rewrite', line: 'Links to documents become routes, with a base and your own rewrites.', href: '/docs/reference/links', words: ['links', 'rewrite', 'routes', 'base', 'relative'] },
	{ name: 'Live code and code that runs', line: 'Values in a fence, and fences that run as Svelte.', href: '/docs/reference/live-code', words: ['live', 'run', 'eval', 'demo', 'playground'] },
	{ name: 'Frontmatter', line: 'YAML at the top, as `metadata`, for layouts and lists.', href: '/docs/guides/frontmatter', words: ['frontmatter', 'yaml', 'metadata', 'title'] },
	{ name: 'Your own directives', line: 'Any component as a directive, from a directives module.', href: '/docs/guides/directives', words: ['directive', 'directives', 'callout', 'admonition', 'note', 'component'] },
	{ name: 'Coming from remark and rehype', line: 'Every common remark or rehype plugin, and what replaces it.', href: '/docs/guides/remark-and-rehype', words: ['remark', 'rehype', 'unified', 'gfm', 'mdx'] },
];

export const core_terms = (c: Core): Term[] => [
	{ text: c.name, field: 'name' },
	...c.words.map((w) => ({ text: w, field: 'keyword' as const })),
	{ text: c.line, field: 'description' },
];
