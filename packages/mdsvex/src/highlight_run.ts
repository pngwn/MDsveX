// the highlight compile option, compile imports this, so it stays free of twinkleplop

import type {
	CodeHighlighter,
	HighlightedBlock,
	HighlightedCode,
	HighlightWarningCode,
	PreMeta,
} from '@mdsvex/render/html-cursor';
import {
	escape_braces,
	meta_parts,
	pre_props,
	read_meta,
	split_element,
} from './code_meta.js';
import { has_eval_flag, LiveCodeError } from './live_code.js';

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

/** what a math renderer knows about the latex it renders */
export interface MathInfo {
	/** true for display math, a math fence, false for inline math, a code span in dollars */
	display: boolean;
	/** the info string of the fence after math, raw, reserved for labels, '' for inline math */
	meta: string;
	/** the compile filename option, the module id in the vite plugin */
	filename?: string;
}

/**
 * markup for a piece of latex, mathml or html, load_math from mdsvex/math
 * gives one for temml or katex, it must be synchronous, must throw on latex
 * it can not render and must not escape for svelte, mdsvex escapes every brace
 *
 * @example
 * math: (latex, { display }) => mathjax.tex2svg(latex, { display })
 */
export type MathRenderer = (latex: string, info: MathInfo) => string;

export type MathOption = MathRenderer | false;

/** latex the math renderer can not render, or a renderer that failed */
export class MathError extends Error {
	/** 1 based line in the document, of the latex when the renderer says where */
	line: number;
	/** 1 based column */
	column: number;

	/** what the renderer threw */
	cause: unknown;

	constructor(message: string, line: number, column: number, cause: unknown) {
		super(message);
		this.name = 'MathError';
		this.line = line;
		this.column = column;
		this.cause = cause;
	}
}

// classes remark-math made the convention, mathml takes no translate
// attribute of its own so an html element carries it
const MATH_OPEN = '<div class="math math-display" translate="no">';
const MATH_CLOSE = '</div>';
const MATH_INLINE_OPEN = '<span class="math math-inline" translate="no">';
const MATH_INLINE_CLOSE = '</span>';

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
export class HighlightRun
	implements CodeHighlighter, PreMeta, HighlightContext
{
	warnings: RunWarning[] = [];
	private blocks = new Map<number, HighlightedBlock | null>();
	private unknown: Set<string> | null = null;
	private at = 0;
	/** a math fence is display math, the render asks before it picks a replacement */
	math = false;
	private render_math: MathRenderer | null = null;

	constructor(
		private config: HighlightConfig,
		readonly filename: string | undefined,
		private source: string
	) {}

	/** math fences render through render from here on, never through the config */
	with_math(render: MathRenderer): this {
		if (typeof render !== 'function')
			throw new TypeError(
				'[mdsvex] math must be a math renderer, load_math() from mdsvex/math gives one, or false'
			);
		this.render_math = render;
		this.math = true;
		return this;
	}

	block(
		code: string,
		lang: string,
		meta: string,
		start: number
	): HighlightedBlock | null {
		let b = this.blocks.get(start);
		if (b !== undefined) return b;
		this.at = start;
		if (lang === 'math' && this.render_math !== null)
			b = this.math_block(this.render_math, code, meta);
		else
			try {
				b = this.config.block(code, lang, meta, this);
			} catch (e) {
				throw this.located(e, `\`${lang || 'plain'}\` fence`);
			}
		this.blocks.set(start, b);
		return b;
	}

	/**
	 * display math as a block with no <pre>, the same markup is the children
	 * of a math replacement, which takes display, code and meta as props
	 */
	private math_block(
		render: MathRenderer,
		code: string,
		meta: string
	): HighlightedBlock {
		let html: unknown;
		try {
			html = render(code, { display: true, meta, filename: this.filename });
		} catch (e) {
			throw this.math_error(e, code);
		}
		if (typeof html !== 'string')
			throw this.located(
				new TypeError(
					`[mdsvex] a math renderer must return a string, it returned ${html === null ? 'null' : typeof html}`
				),
				'`math` fence'
			);
		return {
			before: '',
			attributes: null,
			body: MATH_OPEN + escape_braces(html) + MATH_CLOSE,
			after: '',
			props: ' display',
			code,
			code_template: null,
			live: null,
			dropped: null,
		};
	}

	/** inline math as a span with no <code>, the same markup is the children of a math replacement */
	inline_math(code: string, start: number): HighlightedCode {
		this.at = start;
		let html: unknown;
		try {
			html = this.render_math!(code, {
				display: false,
				meta: '',
				filename: this.filename,
			});
		} catch (e) {
			throw this.inline_math_error(e, code);
		}
		if (typeof html !== 'string')
			throw this.located(
				new TypeError(
					`[mdsvex] a math renderer must return a string, it returned ${html === null ? 'null' : typeof html}`
				),
				'inline math'
			);
		return {
			attributes: null,
			body: MATH_INLINE_OPEN + escape_braces(html) + MATH_INLINE_CLOSE,
		};
	}

	inline(code: string, lang: string, start: number): HighlightedCode | null {
		// a math hint is no language to highlight and no math either, inline
		// math is a code span in dollars, so the span is plain code and nothing warns
		if (lang === 'math' && this.math) return null;
		this.at = start;
		try {
			return this.config.inline(code, lang, this);
		} catch (e) {
			throw this.located(e, `\`${lang}\` code span`);
		}
	}

	pre_props(meta: string, start: number): string {
		const { props, dropped } = pre_props(read_meta(meta));
		if (dropped !== null)
			for (let i = 0; i < dropped.length; i++)
				this.warn('meta_prop_ignored', dropped[i], start);
		return props;
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

	/** the line of the code the run is at, from 1, and the offset that line starts at */
	private line_at(): { line: number; line_start: number } {
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
		return { line, line_start };
	}

	private where(line: number): string {
		return this.filename === undefined
			? `line ${line}`
			: `${this.filename}:${line}`;
	}

	/**
	 * the error keeps its class and gains where its code is, as markdown-core
	 * words it, highlight_error_at gives the position
	 */
	private located(e: unknown, what: string): unknown {
		if (!(e instanceof Error)) return e;
		const { line, line_start } = this.line_at();
		e.message += ` (${what} at ${this.where(line)})`;
		error_at.set(
			e,
			e instanceof LiveCodeError
				? code_position(this.source, line, e.code, e.offset)
				: { line, column: this.at - line_start + 1 }
		);
		return e;
	}

	/**
	 * whatever a math renderer threw as a MathError, at the latex when the
	 * error has a position in it as temml and katex errors do, else at the fence
	 */
	private math_error(e: unknown, code: string): MathError {
		const { line, line_start } = this.line_at();
		const offset = (e as { position?: unknown } | null)?.position;
		const at =
			typeof offset === 'number' && offset >= 0 && offset <= code.length
				? code_position(this.source, line, code, offset)
				: { line, column: this.at - line_start + 1 };
		const said = e instanceof Error ? e.message : String(e);
		return new MathError(
			`${said.trim()} (\`math\` fence at ${this.where(line)})`,
			at.line,
			at.column,
			e
		);
	}
	/**
	 * whatever a math renderer threw for inline math as a MathError, at the
	 * latex when the error has a position in it, else at the first dollar
	 */
	private inline_math_error(e: unknown, code: string): MathError {
		const { line, line_start } = this.line_at();
		const offset = (e as { position?: unknown } | null)?.position;
		let at = this.at;
		if (typeof offset === 'number' && offset >= 0 && offset <= code.length) {
			// the latex is on the line of its dollar, as written unless a table cell escaped a pipe in it
			const found = this.source.indexOf(code, at);
			if (found !== -1) at = found + offset;
		}
		const said = e instanceof Error ? e.message : String(e);
		return new MathError(
			`${said.trim()} (inline math at ${this.where(line)})`,
			line,
			at - line_start + 1,
			e
		);
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
 * the position of an offset in the code of the fence opening on fence_line,
 * a code line is the end of its source line once quote markers and indent go
 */
function code_position(
	source: string,
	fence_line: number,
	code: string,
	offset: number
): { line: number; column: number } {
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

const PLAIN: HighlightConfig = {
	block: () => null,
	inline: () => null,
};

/** a run that highlights nothing, for the meta conventions of a plain pre replacement */
export function plain_run(
	filename: string | undefined,
	source: string
): HighlightRun {
	return new HighlightRun(PLAIN, filename, source);
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
