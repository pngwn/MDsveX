// what the build gives the finder and the plugin pages, catalog.server.ts makes it
import type { ConcernId } from './concerns';

/** what a plugin needs from mdsvex beside it, from its package's `mdsvex` field */
export interface Needs {
	heading_ids?: true;
	unwrap_images?: true;
}

/** a plugin's example, from the frontmatter of its docs page */
export interface Example {
	source: string;
	/** the plugin's own options */
	options?: Record<string, unknown>;
	/** files the example reads, by path from the example */
	files?: Record<string, string>;
	/** other first-party plugins it runs with, by package name, ahead of this one */
	with?: string[];
}

export interface Option {
	name: string;
	optional: boolean;
	type: string;
	text: string;
	default?: string;
	example?: string;
}

/** what a plugin reads, from the bundle its factory returns */
export interface Reads {
	/** directives it owns, by name */
	directives: string[];
	/** node kinds a handler of its acts on, `heading`, `link` */
	nodes: string[];
	/** runs of text, a sequential text handler */
	text: boolean;
	/** a hook over the whole document after the parse */
	document: boolean;
	/** fence languages it claims */
	fences: string[];
	/** elements its components replace, `pre` */
	elements: string[];
	/** directives it observes, owned by another plugin */
	observes: string[];
}

/** a compile of a source with the plugin on, made when the site builds */
export interface Output {
	/**
	 * server rendered, hydration marks out, its links marked rel="external" so
	 * the prerender crawler leaves them to the example: they point at pages the
	 * example has, not the site, and link-check's are broken on purpose. The
	 * html view shows `pretty`, as the plugin made it
	 */
	html: string;
	/** the same, laid out a block per line for reading */
	pretty: string;
	/** plugin_data, when the plugin left any */
	data: Record<string, unknown> | null;
	warnings: { code: string; message: string; line?: number }[];
	/** the page renders the same without the plugin, so what it gives is data or warnings */
	unchanged: boolean;
	/** the compile or render failed, and why: shown in place of output, never filled in */
	error: string | null;
}

export interface Sample {
	mark: string;
	/** the kind the parser reads the mark's outermost node as, for its colour */
	kind: string;
}

export interface Plugin {
	/** the folder of its docs page under docs/plugins, its anchor in the finder */
	id: string;
	/** its docs page */
	href: string;
	package: string;
	/** its docs page's title, `Table of contents` */
	title: string;
	/** its package without the scope, `toc` */
	short: string;
	factory: string;
	description: string;
	keywords: string[];
	version: string;
	concerns: ConcernId[];
	syntax: Sample[];
	reads: Reads;
	options: Option[];
	/** peers to install beside it, `pele`, optional or not */
	peers: { name: string; optional: boolean }[];
	/** components and stylesheets the package exports */
	exports: { components: string[]; css: string[] };
	needs: Needs | undefined;
	/** why a document that uses it needs compile_async or the Vite plugin */
	waits?: string;
	example: Example & { output: Output };
	/** what blocks the example running in the browser, null when it can */
	live: string | null;
}

/** one thing search can match, with the field it came from */
export interface Term {
	text: string;
	field: 'name' | 'package' | 'syntax' | 'directive' | 'option' | 'description' | 'keyword' | 'concern' | 'reads' | 'doc';
}
