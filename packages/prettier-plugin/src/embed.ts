import { doc, getSupportInfo } from 'prettier';
import type { AstPath, Doc, Options, ParserOptions } from 'prettier';

import { attribute, is_ts } from './ast';
import type { SvxNode } from './ast';
import { head } from './heads';
import {
	head_end,
	in_flow,
	is_raw_text,
	print_branch,
	print_html,
	quote_depth,
	root_of,
} from './printer';
import { parse_open_tag, print_open_tag } from './tag';

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
export function embed(
	path: AstPath<SvxNode>,
	options: Options
): Embedded | undefined {
	const node = path.node;
	const at_root = (path.parent as SvxNode | null)?.type === 'root';
	const text = (options as ParserOptions<SvxNode>).originalText;

	switch (node.type) {
		case 'frontmatter':
			if (!at_root || !root_of(path).yaml) return;
			return async (text_to_doc: TextToDoc) => {
				const yaml = text.slice(node.value_start, node.value_end);
				if (yaml.trim() === '') return ['---', hardline, '---'];
				return [
					'---',
					hardline,
					await text_to_doc(yaml, { parser: 'yaml' }),
					hardline,
					'---',
				];
			};

		case 'import_statement':
			if (!at_root) return;
			return async (text_to_doc) =>
				text_to_doc(text.slice(node.start, node.end), { parser: 'babel-ts' });

		case 'html': {
			const name = node.meta?.tag;
			if (name === 'script' || name === 'style') {
				// one inside an element, as in svelte:head, formats too, one in prose stays as written
				if (!at_root && (!in_flow(path) || quote_depth(path) > 0)) return;
				const parser =
					name === 'script' ? script_parser(node) : style_parser(node);
				if (parser === undefined) return;
				return (text_to_doc, _print, _path, options) =>
					element(text_to_doc, node, text, parser, options);
			}
			if (is_raw_text(node)) return;
			const tag = parse_open_tag(text.slice(node.start, node.value_start));
			if (tag === undefined) return;
			const ts = root_of(path).ts;
			// a tag in prose stays on its line, a line end in a quote needs its marker
			const multiline = in_flow(path) && quote_depth(path) === 0;
			return async (text_to_doc, print, path, options) => {
				const open = await print_open_tag(tag, {
					text_to_doc,
					options,
					ts,
					multiline,
					bracket_same_line: options.bracketSameLine === true,
					single_attribute_per_line: options.singleAttributePerLine === true,
				});
				return print_html(path, options as ParserOptions<SvxNode>, print, open);
			};
		}

		case 'mustache':
			return expression(path, text, '{', '}');

		case 'svelte_tag': {
			const tag = node.meta?.tag;
			if (tag === 'const' || tag === 'debug') return head_tag(path, text, tag);
			if (tag !== 'html' && tag !== 'render') return;
			return expression(path, text, `{@${tag} `, '}');
		}

		case 'svelte_branch':
			return branch(path, text);

		case 'code_fence':
			if (
				!at_root ||
				!(options as { mdsvexFormatFences?: boolean }).mdsvexFormatFences
			)
				return;
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
	if (type === 'application/json' || type === 'application/ld+json')
		return 'json';
}

function style_parser(node: SvxNode): string | undefined {
	const lang = attribute(node.meta, 'lang') ?? attribute(node.meta, 'type');
	if (
		lang === undefined ||
		lang === 'css' ||
		lang === 'text/css' ||
		lang === 'postcss'
	) {
		return 'css';
	}
	if (lang === 'scss' || lang === 'less') return lang;
}

/** a script or style, its content indented between its tags */
async function element(
	text_to_doc: TextToDoc,
	node: SvxNode,
	text: string,
	parser: string,
	options: Options
): Promise<Doc> {
	const written = text.slice(node.start, node.value_start);
	const tag = parse_open_tag(written);
	const open =
		tag === undefined
			? written
			: await print_open_tag(tag, {
					text_to_doc,
					options,
					ts: false,
					multiline: true,
					bracket_same_line: options.bracketSameLine === true,
					single_attribute_per_line: options.singleAttributePerLine === true,
				});
	const close = text.slice(node.value_end, node.end).trim();
	const content = text.slice(node.value_start, node.value_end);
	if (content.trim() === '') return [open, close];
	const code = await text_to_doc(content, { parser });
	const indented =
		(options as { svelteIndentScriptAndStyle?: boolean })
			.svelteIndentScriptAndStyle !== false;
	return indented
		? [open, indent([hardline, code]), hardline, close]
		: [open, hardline, code, hardline, close];
}

/** one line unless it is a multiline block of its own, a line end in a list or quote would need their prefix */
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

/** a const or debug tag, what follows its keyword on one line */
function head_tag(
	path: AstPath<SvxNode>,
	text: string,
	tag: string
): Embedded | undefined {
	const node = path.node;
	const source = text.slice(node.value_start, node.value_end);
	if (source.trim() === '') return;
	const ts = root_of(path).ts;
	return async (text_to_doc, _print, _path, options) => {
		const inside = await head(tag, source, { text_to_doc, options, ts });
		return inside === undefined ? undefined : `{@${tag} ${inside}}`;
	};
}

/** the only thing in a paragraph of the block flow, outside quotes */
function is_block(path: AstPath<SvxNode>): boolean {
	const parent = path.parent as SvxNode | null;
	if (parent?.type !== 'paragraph' || parent.children.length !== 1)
		return false;
	return quote_depth(path) === 0 && path.callParent((p) => in_flow(p));
}

/** a block branch, the expression and bindings of its head on one line */
function branch(path: AstPath<SvxNode>, text: string): Embedded | undefined {
	const node = path.node;
	const tag = node.meta?.tag;
	if (typeof tag !== 'string') return;
	const source = text.slice(node.value_start, node.value_end);
	const end = head_end(node, text);
	if (source.trim() === '' || end === 0) return;
	const prefix = text.slice(node.start, node.value_start).trimEnd() + ' ';
	const ts = root_of(path).ts;
	return async (text_to_doc, print, path, options) => {
		const inside = await head(tag, source, { text_to_doc, options, ts });
		if (inside === undefined) return undefined;
		return print_branch(path, options as ParserOptions<SvxNode>, print, [
			prefix,
			inside,
			'}',
		]);
	};
}

// these would format pfm as another markdown
const FENCE_SKIP = new Set(['markdown', 'mdx', 'remark', 'mdsvex']);

/** only a fence whose info string is a language alone, line range meta counts the lines of the code */
function fence(
	node: SvxNode,
	text: string,
	options: Options
): Embedded | undefined {
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
		return [
			open,
			hardline,
			await text_to_doc(body, { parser }),
			hardline,
			close,
		];
	};
}

async function parser_for(
	lang: string,
	options: Options
): Promise<string | undefined> {
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
