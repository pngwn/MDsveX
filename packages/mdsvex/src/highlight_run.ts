// the highlight compile option, compile imports this, so it stays free of twinkleplop

import type {
	CodeHighlighter,
	HighlightedBlock,
	HighlightedCode,
	HighlightWarningCode,
} from '@mdsvex/render/html-cursor';
import {
	escape_braces,
	meta_parts,
	pre_props,
	read_meta,
	split_element,
} from './code_meta';
import { has_eval_flag, LiveCodeError } from './live_code';

export type { HighlightedBlock, HighlightedCode };

/** what a custom highlighter knows about the code it renders */
export interface CodeInfo {
	/** the first word of the info string, "" when the fence names none */
	lang: string;
	/** the rest of the info string, raw */
	meta: string;
	/** a code span with a #! hint rather than a fence */
	inline: boolean;
	/** the compile filename option, the module id in the vite plugin */
	filename?: string;
}

/**
 * html for a fence, usually a single <pre>, or for a code span, usually a
 * single <code>, null or undefined renders it plain, it must be synchronous
 * and must not escape for svelte, mdsvex escapes every brace
 *
 * @example
 * highlight: (code, { lang, inline }) =>
 *   inline ? null : shiki.codeToHtml(code, { lang, theme: 'github-dark' })
 */
export type Highlighter = (
	code: string,
	info: CodeInfo
) => string | null | undefined;

export type HighlightWarning =
	| HighlightWarningCode
	| 'unknown_language'
	| 'annotation'
	| 'eval_unsupported';

/** @internal what a highlight config tells the compile it runs in */
export interface HighlightContext {
	readonly filename: string | undefined;
	/** warns once per compile and language */
	unknown_language(lang: string): void;
	warn(code: HighlightWarning, message: string): void;
}

/**
 * a resolved synchronous highlight configuration, create_highlight from
 * mdsvex/highlight builds one
 */
export interface HighlightConfig {
	/** @internal null renders the fence plain */
	block(
		code: string,
		lang: string,
		meta: string,
		ctx: HighlightContext
	): HighlightedBlock | null;
	/** @internal null renders the code span plain */
	inline(
		code: string,
		lang: string,
		ctx: HighlightContext
	): HighlightedCode | null;
}

export type HighlightOption = HighlightConfig | Highlighter | false;

const custom_configs = new WeakMap<Highlighter, HighlightConfig>();

function returned(out: unknown): string | null {
	if (out === null || out === undefined) return null;
	if (typeof out !== 'string')
		throw new TypeError(
			`[mdsvex] a highlighter must return a string, null or undefined, it returned ${typeof out}`
		);
	return out;
}

/**
 * the eval flag needs mdsvex to render through twinkleplop, a custom
 * highlighter or twoslash renders the braces as text
 */
export function unsupported_eval(ctx: HighlightContext): void {
	ctx.warn(
		'eval_unsupported',
		'the highlighter of this fence does not support the eval flag, its braces render as text'
	);
}

/** a custom highlighter as a config, mdsvex escapes its braces and splits its <pre> */
export function custom_config(highlight: Highlighter): HighlightConfig {
	let config = custom_configs.get(highlight);
	if (config !== undefined) return config;
	config = {
		block(code, lang, meta, ctx) {
			const out = returned(
				highlight(code, { lang, meta, inline: false, filename: ctx.filename })
			);
			if (out === null) return null;
			if (
				lang === 'eval' ||
				(meta.indexOf('eval') !== -1 && has_eval_flag(meta_parts(meta)))
			)
				unsupported_eval(ctx);
			const html = escape_braces(out);
			const split = split_element(html, 'pre');
			const attributes = split === null ? null : split.attributes;
			const { props, dropped } = pre_props(read_meta(meta));
			return {
				before: '',
				attributes,
				body: split === null ? html : split.body,
				after: '',
				props,
				code,
				code_template: null,
				live: null,
				dropped,
			};
		},
		inline(code, lang, ctx) {
			const out = returned(
				highlight(code, {
					lang,
					meta: '',
					inline: true,
					filename: ctx.filename,
				})
			);
			if (out === null) return null;
			const html = escape_braces(out);
			const split = split_element(html, 'code');
			return split === null
				? { attributes: null, body: html }
				: { attributes: split.attributes, body: split.body };
		},
	};
	custom_configs.set(highlight, config);
	return config;
}

/** a warning with the offset of the code it is about */
export interface RunWarning {
	code: HighlightWarning;
	message: string;
	start: number;
}

/**
 * the highlighter of one compile, it renders each fence once however often
 * the walk asks, and collects warnings at the offsets of their code
 */
export class HighlightRun implements CodeHighlighter, HighlightContext {
	warnings: RunWarning[] = [];
	private blocks = new Map<number, HighlightedBlock | null>();
	private unknown: Set<string> | null = null;
	private at = 0;

	constructor(
		private config: HighlightConfig,
		readonly filename: string | undefined,
		private source: string
	) {}

	block(
		code: string,
		lang: string,
		meta: string,
		start: number
	): HighlightedBlock | null {
		let b = this.blocks.get(start);
		if (b !== undefined) return b;
		this.at = start;
		try {
			b = this.config.block(code, lang, meta, this);
		} catch (e) {
			throw this.located(e, `\`${lang || 'plain'}\` fence`);
		}
		this.blocks.set(start, b);
		return b;
	}

	inline(code: string, lang: string, start: number): HighlightedCode | null {
		this.at = start;
		try {
			return this.config.inline(code, lang, this);
		} catch (e) {
			throw this.located(e, `\`${lang}\` code span`);
		}
	}

	unknown_language(lang: string): void {
		const seen = (this.unknown ??= new Set());
		if (seen.has(lang)) return;
		seen.add(lang);
		this.warn(
			'unknown_language',
			`no highlighter for the language ${lang}, its code renders plain`
		);
	}

	warn(code: HighlightWarning, message: string, start = this.at): void {
		this.warnings.push({ code, message, start });
	}

	/**
	 * the error keeps its class and gains where its code is, as markdown-core
	 * words it, highlight_error_at gives the position
	 */
	private located(e: unknown, what: string): unknown {
		if (!(e instanceof Error)) return e;
		const src = this.source;
		let line = 1;
		let line_start = 0;
		for (
			let i = src.indexOf('\n');
			i !== -1 && i < this.at;
			i = src.indexOf('\n', i + 1)
		) {
			line++;
			line_start = i + 1;
		}
		const where =
			this.filename === undefined ? `line ${line}` : `${this.filename}:${line}`;
		e.message += ` (${what} at ${where})`;
		error_at.set(
			e,
			e instanceof LiveCodeError
				? live_position(src, line, e)
				: { line, column: this.at - line_start + 1 }
		);
		return e;
	}
}

const error_at = new WeakMap<Error, { line: number; column: number }>();

/**
 * where in the source a highlight error is, line and column from 1, null
 * for an error no highlighter threw
 */
export function highlight_error_at(
	e: unknown
): { line: number; column: number } | null {
	return (e instanceof Error && error_at.get(e)) || null;
}

/**
 * the position of a group in the fence opening on fence_line, a code line is
 * the end of its source line once quote markers and indent go
 */
function live_position(
	source: string,
	fence_line: number,
	e: LiveCodeError
): { line: number; column: number } {
	const { code, offset } = e;
	let code_line = 0;
	for (
		let i = code.indexOf('\n');
		i !== -1 && i < offset;
		i = code.indexOf('\n', i + 1)
	)
		code_line++;
	let code_end = code.indexOf('\n', offset);
	if (code_end === -1) code_end = code.length;
	const line = fence_line + 1 + code_line;
	let start = 0;
	for (let l = 1; l < line; l++) {
		const nl = source.indexOf('\n', start);
		if (nl === -1) return { line: fence_line, column: 1 };
		start = nl + 1;
	}
	let end = source.indexOf('\n', start);
	if (end === -1) end = source.length;
	return { line, column: Math.max(1, end - start - (code_end - offset) + 1) };
}

/** null when the option highlights nothing */
export function highlight_run(
	option: HighlightOption | undefined,
	filename: string | undefined,
	source: string
): HighlightRun | null {
	if (option === undefined || option === false || option === null) return null;
	if (typeof option === 'function')
		return new HighlightRun(custom_config(option), filename, source);
	if (typeof option !== 'object' || typeof option.block !== 'function')
		throw new TypeError(
			'[mdsvex] highlight must be create_highlight() from mdsvex/highlight, a highlighter function or false'
		);
	return new HighlightRun(option, filename, source);
}
