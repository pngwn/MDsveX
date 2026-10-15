import { doc, getSupportInfo } from 'prettier';
import type { AstPath, Doc, Options, ParserOptions } from 'prettier';

import { attribute, is_ts } from './ast';
import type { SvxNode } from './ast';
import { print_source, root_of } from './printer';

const { hardline, indent } = doc.builders;
const { removeLines, willBreak } = doc.utils;

type TextToDoc = (text: string, options: Options) => Promise<Doc>;
type Print = (path: AstPath<SvxNode>) => Doc;
type Embedded = (
	text_to_doc: TextToDoc,
	print: Print,
	path: AstPath<SvxNode>,
	options: Options
) => Promise<Doc | undefined>;

/** the parts of a document in another language, printed by prettier */
export function embed(path: AstPath<SvxNode>, options: Options): Embedded | undefined {
	const node = path.node;
	const at_root = (path.parent as SvxNode | null)?.type === 'root';
	const text = (options as ParserOptions<SvxNode>).originalText;

	switch (node.type) {
		case 'frontmatter':
			if (!at_root) return;
			return async (text_to_doc: TextToDoc) => {
				const yaml = text.slice(node.value_start, node.value_end);
				if (yaml.trim() === '') return ['---', hardline, '---'];
				return ['---', hardline, await text_to_doc(yaml, { parser: 'yaml' }), hardline, '---'];
			};

		case 'import_statement':
			if (!at_root) return;
			return async (text_to_doc) =>
				text_to_doc(text.slice(node.start, node.end), { parser: 'babel-ts' });

		case 'html': {
			if (!at_root) return;
			const tag = node.meta?.tag;
			const parser =
				tag === 'script' ? script_parser(node) : tag === 'style' ? style_parser(node) : undefined;
			if (parser === undefined) return;
			return (text_to_doc) => element(text_to_doc, node, text, parser);
		}

		case 'mustache':
			return expression(path, text, '{', '}');

		case 'svelte_tag': {
			const tag = node.meta?.tag;
			if (tag !== 'html' && tag !== 'render') return;
			return expression(path, text, `{@${tag} `, '}');
		}

		case 'svelte_branch':
			return branch(path, text);

		case 'code_fence':
			if (!at_root || !(options as { mdsvexFormatFences?: boolean }).mdsvexFormatFences) return;
			return fence(node, text, options);
	}
}

function script_parser(node: SvxNode): string | undefined {
	if (is_ts(node.meta)) return 'babel-ts';
	const type = attribute(node.meta, 'type');
	if (
		type === undefined ||
		type === 'module' ||
		type === 'text/javascript' ||
		type === 'application/javascript'
	) {
		return 'babel';
	}
	if (type === 'application/json' || type === 'application/ld+json') return 'json';
}

function style_parser(node: SvxNode): string | undefined {
	const lang = attribute(node.meta, 'lang') ?? attribute(node.meta, 'type');
	if (lang === undefined || lang === 'css' || lang === 'text/css' || lang === 'postcss') {
		return 'css';
	}
	if (lang === 'scss' || lang === 'less') return lang;
}

/** a script or style, its content indented between its tags */
async function element(
	text_to_doc: TextToDoc,
	node: SvxNode,
	text: string,
	parser: string
): Promise<Doc> {
	const open = text.slice(node.start, node.value_start);
	const close = text.slice(node.value_end, node.end);
	const content = text.slice(node.value_start, node.value_end);
	if (content.trim() === '') return [open, close];
	const code = await text_to_doc(content, { parser });
	return [open, indent([hardline, code]), hardline, close];
}

/**
 * an expression in braces, kept on one line unless it is a block of its own
 * that already took more than one, a line end in a paragraph inside a list or
 * a quote would need the prefix of the lines around it
 */
function expression(
	path: AstPath<SvxNode>,
	text: string,
	open: string,
	close: string
): Embedded | undefined {
	const node = path.node;
	const source = text.slice(node.value_start, node.value_end);
	if (source.trim() === '') return;
	const multiline = source.includes('\n');
	if (multiline && !is_block(path)) return;
	const parser = root_of(path).ts ? '__ts_expression' : '__js_expression';
	return async (text_to_doc) => {
		const code = await text_to_doc(source, { parser });
		if (multiline) return [open, code, close];
		const line = removeLines(code);
		return willBreak(line) ? undefined : [open, line, close];
	};
}

/** the only thing in a paragraph of the root */
function is_block(path: AstPath<SvxNode>): boolean {
	const parent = path.parent as SvxNode | null;
	const grandparent = path.grandparent as SvxNode | null;
	if (parent?.type !== 'paragraph' || grandparent?.type !== 'root') return false;
	return parent.children.length === 1;
}

const BRANCH_EXPRESSIONS = new Set(['if', 'else if', 'key']);

/** a block branch whose head holds one expression, the head on one line */
function branch(path: AstPath<SvxNode>, text: string): Embedded | undefined {
	const node = path.node;
	const tag = node.meta?.tag;
	if (typeof tag !== 'string' || !BRANCH_EXPRESSIONS.has(tag)) return;
	const source = text.slice(node.value_start, node.value_end);
	const head_end = text.indexOf('}', node.value_end) + 1;
	if (source.trim() === '' || head_end === 0) return;
	const prefix = text.slice(node.start, node.value_start).trimEnd() + ' ';
	const parser = root_of(path).ts ? '__ts_expression' : '__js_expression';
	return async (text_to_doc, print, path, options) => {
		const code = removeLines(await text_to_doc(source, { parser }));
		if (willBreak(code)) return undefined;
		return [
			prefix,
			code,
			'}',
			print_source(path, options as ParserOptions<SvxNode>, print, head_end),
		];
	};
}

// parsers whose output would not be pfm or would format pfm as another markdown
const FENCE_SKIP = new Set(['markdown', 'mdx', 'remark', 'mdsvex']);

/**
 * a fence of code in a language prettier knows, only when its info string
 * is the language alone, meta like line ranges counts the lines of the code
 * and annotations are comments a formatter could move
 */
function fence(node: SvxNode, text: string, options: Options): Embedded | undefined {
	const info_start = node.meta?.info_start;
	const info_end = node.meta?.info_end;
	if (typeof info_start !== 'number' || typeof info_end !== 'number') return;
	const lang = text.slice(info_start, info_end).trim().toLowerCase();
	if (!/^[\w+#.-]+$/.test(lang)) return;
	const body = text.slice(node.value_start, node.value_end);
	if (body.trim() === '' || body.includes('[!')) return;
	// unclosed, the fence runs to the end of the document
	if (node.end <= node.value_end + 1) return;
	const open = text.slice(node.start, node.value_start).trimEnd();
	const close = text.slice(node.value_end, node.end).replace(/^\n/, '');

	return async (text_to_doc) => {
		const parser = await parser_for(lang, options);
		if (parser === undefined) return undefined;
		return [open, hardline, await text_to_doc(body, { parser }), hardline, close];
	};
}

async function parser_for(lang: string, options: Options): Promise<string | undefined> {
	const { languages } = await getSupportInfo({ plugins: options.plugins });
	for (const language of languages) {
		if (
			language.name.toLowerCase() === lang ||
			language.aliases?.includes(lang) ||
			language.extensions?.includes('.' + lang)
		) {
			const parser = language.parsers[0];
			return FENCE_SKIP.has(parser) ? undefined : parser;
		}
	}
}
