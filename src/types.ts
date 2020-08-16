import type { VFileMessage } from 'vfile-message';
import type { Node } from 'unist';
import type { Element, Root } from 'hast';
import type { Text, Code } from 'mdast';
import type { Processor, Plugin, Settings } from 'unified';

export type LayoutMode = 'named' | 'single';

export type parser_frontmatter_options = {
	parse: (
		fm: string,
		messages: VFileMessage[]
	) => undefined | Record<string, unknown>;
	type: string;
};

export interface FrontMatterNode extends Node {
	type: string;
	value: string;
}

export interface Parts {
	special: Node[];
	html: Array<Element | Text | (Node & { type: 'raw' })>;
	instance: Node[];
	module: Node[];
	css: Node[];
}

/**
 * Prismjs representation of a language
 */
export interface PrismLanguage {
	require?: string[];
	peerDependencies?: string[];
	alias?: string[];
}

/**
 * mdsvex representation of a language
 */
export interface MdsvexLanguage {
	aliases: Set<unknown>;
	name: string;
	path: string;
	deps: Set<string>;
}

/**
 * Prismjs meta information about language definitions
 */
export interface PrismMeta {
	path: string;
	noCSS: boolean;
	examplesPath: string;
	addCheckAll: boolean;
}

// interface Meta {
// 	meta: PrismMeta;
// }

/**
 * Extended `NodeJS.Process` to inlcude `browser` field
 */
export interface RollupProcess extends NodeJS.Process {
	browser: boolean;
}

// Public(ish) configuration options for mdsvex
interface FrontmatterOptions {
	parse: (
		fm: string,
		messages: VFileMessage[]
	) => undefined | Record<string, unknown>;
	type: string;
	marker: string;
}

interface SmartypantsOptions {
	quotes?: boolean;
	ellipses?: boolean;
	backticks?: boolean | 'all';
	dashes?: boolean | 'oldschool' | 'inverted';
}

export type LayoutMeta = { components: string[]; path: string };
export type Layout = Record<string, LayoutMeta>;

export type Highlighter = (code: string, lang: string | undefined) => string;
interface HighlightOptions {
	highlighter?: Highlighter;
	alias?: Record<string, string>;
}

export type UnifiedPlugins = Array<[Plugin, Settings] | Plugin>;

export interface TransformOptions {
	remarkPlugins?: UnifiedPlugins;
	rehypePlugins?: UnifiedPlugins;
	frontmatter?: FrontmatterOptions;
	smartypants?: boolean | SmartypantsOptions;
	layout?: Layout;
	highlight?: HighlightOptions | false;
	layout_mode: LayoutMode;
}

/**
 * Actual public options interface
 */
export interface MdsvexOptions {
	remarkPlugins?: Array<[Plugin, Settings] | Plugin>;
	rehypePlugins?: Array<[Plugin, Settings] | Plugin>;
	frontmatter?: FrontmatterOptions;
	smartypants?: SmartypantsOptions | boolean;
	highlight?: HighlightOptions | false;
	extension?: string;
	layout?: string | Record<string, string>;
}

export interface MdsvexCompileOptions extends MdsvexOptions {
	filename?: string;
}

export type PreprocessorReturn = Promise<
	{ code: string; map?: string } | undefined
>;

export interface Preprocessor {
	markup: (args: { content: string; filename: string }) => PreprocessorReturn;
}
