// mdsvex/highlight, twinkleplop as a synchronous highlight config, every
// language loads in load_default_languages, the only asynchronous part

import {
	OVERLAY_VERBATIM,
	to_html,
	to_parts,
	visible_text,
	visible_text_map,
} from '@twinkleplop/core';
import type {
	AnnotationIssue,
	AnnotationOutput,
	AnnotationPlugin,
	HookResult,
	LanguageFn,
	LanguageOptions,
	OverlayItem,
	RenderOptions,
	TokenizeResult,
	VerbatimContribution,
	VisibleText,
} from '@twinkleplop/core';
import { parse_meta } from '@twinkleplop/markdown-core';
import type { ParsedMeta } from '@twinkleplop/markdown-core';
import {
	add,
	del,
	dim,
	em,
	err,
	focus,
	hl,
	info,
	mod,
	warn,
} from '@twinkleplop/annotation';
import type {
	HighlightConfig,
	HighlightContext,
	HighlightedBlock,
	HighlightedCode,
} from './highlight_run';
import { unsupported_eval } from './highlight_run';
import {
	attribute_text,
	escape_braces,
	escape_text,
	meta_parts,
	pre_props,
	read_meta,
	split_element,
} from './code_meta';
import {
	fence_groups,
	group_expression,
	has_eval_flag,
	live_groups,
	LiveCodeError,
	template_text,
} from './live_code';

export type { HighlightConfig, CodeInfo, Highlighter } from './highlight_run';
export type { AnnotationPlugin, RenderOptions } from '@twinkleplop/core';

/** a twinkleplop language package, mdsvex builds the language from its tokenize export */
export interface LanguageModule {
	tokenize: (options?: LanguageOptions) => LanguageFn;
}

/** a language that renders html itself, annotations do not apply to it */
export type HtmlHighlighter = (code: string, render?: RenderOptions) => string;

/** a language package namespace, a highlight function, or the name of another language */
export type LanguageValue = LanguageModule | HtmlHighlighter | string;

export interface HighlightOptions {
	/**
	 * languages by fence name, merged over the default aliases, the vite
	 * plugin merges them over every twinkleplop language too
	 *
	 * @example
	 * import * as zig from '@acme/twinkleplop-zig';
	 * languages: { zig, zg: 'zig' }
	 */
	languages?: Record<string, LanguageValue>;
	/** the language of a fence that names none */
	default_language?: string;
	/** plain renders an unknown language as plain code and warns once per file, throw fails the compile */
	on_unknown_language?: 'plain' | 'throw';
	/** line numbers on every fence, the fence meta overrides it */
	line_numbers?: boolean | { start?: number };
	/** the annotation plugins, default_annotations when undefined, false for none */
	annotations?: AnnotationPlugin[] | false;
	/** twinkleplop render options under the ones each fence gets */
	render?: RenderOptions;
	/** the render options of a fence from its raw meta and the ones the meta conventions set */
	parse_meta?: (raw: string, parsed: RenderOptions) => RenderOptions | void;
	/** highlighters for fences marked twoslash, by language */
	twoslash?: false | Record<string, HtmlHighlighter>;
}

/** the fence being tokenized, the eval annotation reads its source */
interface EvalRun {
	source: string;
	/** the eval fence flag makes every group live, markers add none */
	flag: boolean;
	/** the starts of the groups markers made live, a second marker adds none */
	seen: Set<number>;
	error: LiveCodeError | null;
}

let eval_run: EvalRun | null = null;

function is_eval_marker(source: string, at: number): boolean {
	if (!source.startsWith('[!eval', at)) return false;
	const next = source.charCodeAt(at + 6);
	// ] closes it, a space starts its args and # its id
	return next === 93 || next === 32 || next === 35;
}

/**
 * the [!eval] annotation of mdsvex, every top level {...} group in the range
 * it selects becomes a live svelte expression, emitted verbatim
 *
 * @example
 * console.log({ a: {some_val} }) // [!eval ="{some_val}"]
 */
export const eval_annotation: AnnotationPlugin = {
	verbs: ['eval'],
	handle({ range, marker }): AnnotationOutput | void {
		const run = eval_run;
		// markdown tokenizes its fences again with offsets into the fence and
		// drops what they give, those offsets miss the marker in run.source
		if (run === null || !is_eval_marker(run.source, marker.start)) return;
		if (run.flag || run.error !== null) return;
		const groups: number[] = [];
		try {
			live_groups(run.source, range.start, range.end, groups);
		} catch (e) {
			if (!(e instanceof LiveCodeError)) throw e;
			run.error = e;
			return;
		}
		if (groups.length === 0)
			return {
				issues: [
					{
						kind: 'anchor_not_found',
						message: '[!eval] has no {...} group in its range',
					},
				],
			};
		const overlays: VerbatimContribution[] = [];
		for (let i = 0; i < groups.length; i += 2) {
			if (run.seen.has(groups[i])) continue;
			run.seen.add(groups[i]);
			overlays.push({ start: groups[i], end: groups[i + 1], verbatim: true });
		}
		return { overlays };
	},
};

/** the twinkleplop annotation plugins mdsvex enables when annotations is not set */
export const default_annotations: readonly AnnotationPlugin[] = [
	hl,
	em,
	focus,
	dim,
	add,
	del,
	mod,
	err,
	warn,
	info,
	eval_annotation,
];

/** aliases every highlight config has, for the languages it has */
export const default_aliases: Readonly<Record<string, string>> = {
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	jsx: 'tsx',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	console: 'shellsession',
	'shell-session': 'shellsession',
	yml: 'yaml',
	md: 'markdown',
	env: 'dotenv',
	patch: 'diff',
	py: 'python',
	rs: 'rust',
};

let loading: Promise<Record<string, LanguageModule>> | null = null;

/** every twinkleplop language package by name, loaded once */
export function load_default_languages(): Promise<
	Record<string, LanguageModule>
> {
	return (loading ??= import('./highlight_languages').then(
		(m) => m.default_languages,
		(e) => {
			// a later call tries again
			loading = null;
			throw e;
		}
	));
}

interface Entry {
	tokenize: LanguageFn | null;
	html: HtmlHighlighter | null;
	twoslash: HtmlHighlighter | null;
}

// a token stream with no tokens renders every byte as escaped text in the
// ordinary block markup, so plain code shares the markup and the themes
const NO_TOKENS: TokenizeResult = {
	tokens: new Uint32Array(0),
	token_types: [],
};

const NO_RANGES = new Uint32Array(0);

const HIGHLIGHT_CLASS = 'highlight';
const WORD_CLASS = 'highlighted-word';

/** the compile in progress, annotation issues become its warnings */
let issue_ctx: HighlightContext | null = null;

function on_issue(issue: AnnotationIssue): void {
	issue_ctx?.warn(
		'annotation',
		`${issue.message} (line ${issue.position.line} of the code)`
	);
}

function fail(message: string): never {
	throw new Error(message);
}

function is_module(value: unknown): value is LanguageModule {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as LanguageModule).tokenize === 'function'
	);
}

/** the registry, aliases resolved, a default alias of a missing language is left out */
function resolve_languages(
	written: Record<string, LanguageValue>,
	options: LanguageOptions | undefined
): Map<string, Entry> {
	if (typeof written !== 'object' || written === null || Array.isArray(written))
		throw new TypeError(
			'[mdsvex] highlight.languages must be an object of languages by fence name'
		);
	const values: Record<string, LanguageValue> = { ...default_aliases };
	for (const name of Object.keys(written)) values[name] = written[name];
	const own = (name: string) =>
		Object.prototype.hasOwnProperty.call(written, name);

	const entries = new Map<string, Entry>();
	const fns: Record<string, LanguageFn> = {};
	const markdown: string[] = [];
	for (const name of Object.keys(values)) {
		const value = values[name];
		if (typeof value === 'string') continue;
		if (is_module(value)) {
			// markdown highlights its fences with every other language
			if (name === 'markdown') {
				markdown.push(name);
				continue;
			}
			const tokenize = value.tokenize(options);
			fns[name] = tokenize;
			entries.set(name, { tokenize, html: null, twoslash: null });
		} else if (typeof value === 'function') {
			entries.set(name, { tokenize: null, html: value, twoslash: null });
		} else {
			throw new TypeError(
				`[mdsvex] highlight.languages.${name} must be a twinkleplop language module, a highlight function, or the name of another language`
			);
		}
	}

	// aliases name an entry, so they share it
	const aliases = new Map<string, string>();
	for (const name of Object.keys(values)) {
		if (typeof values[name] !== 'string') continue;
		const path = [name];
		let target = values[name] as LanguageValue;
		let last = name;
		while (typeof target === 'string') {
			if (path.includes(target))
				throw new Error(
					`[mdsvex] alias cycle in highlight.languages: ${[...path, target].join(' -> ')}`
				);
			if (!(target in values)) {
				if (!own(last)) break;
				throw new Error(
					`[mdsvex] highlight.languages.${last} aliases "${target}", which is not a language`
				);
			}
			path.push(target);
			last = target;
			target = values[target];
		}
		if (typeof target === 'string') continue;
		aliases.set(name, last);
	}
	const markdown_targets = new Set(markdown);
	for (const [name, target] of aliases) {
		if (markdown_targets.has(target)) continue;
		const entry = entries.get(target);
		if (entry === undefined) continue;
		entries.set(name, entry);
		if (entry.tokenize !== null) fns[name] = entry.tokenize;
	}
	for (const name of markdown) {
		const tokenize = (values[name] as LanguageModule).tokenize({
			...options,
			languages: fns,
			front_matter: fns.yaml,
		} as LanguageOptions);
		const entry: Entry = { tokenize, html: null, twoslash: null };
		entries.set(name, entry);
		for (const [alias, target] of aliases)
			if (target === name) entries.set(alias, entry);
	}
	return entries;
}

function join(left: string, right: string): string {
	if (left.length === 0) return right;
	if (right.length === 0) return left;
	return left + ' ' + right;
}

function count_lines(source: string): number {
	let count = 1;
	for (let i = 0; i < source.length; i++)
		if (source.charCodeAt(i) === 10) count++;
	return count;
}

// a stale range in docs fails the build rather than highlighting nothing
function check_line(line: number, line_count: number): void {
	if (line < 1 || line > line_count)
		fail(
			`line ${line} is beyond the fence's ${line_count} line${line_count === 1 ? '' : 's'}`
		);
}

function occurrences(source: string, text: string): number[] {
	const hits: number[] = [];
	let from = 0;
	for (;;) {
		const at = source.indexOf(text, from);
		if (at === -1) return hits;
		hits.push(at);
		from = at + text.length;
	}
}

/** the verbatim ranges of a tokenize result, start and end pairs in order */
function verbatim_ranges(result: TokenizeResult): number[] {
	const out: number[] = [];
	const ranges = result.overlays?.ranges;
	if (ranges === undefined) return out;
	for (let r = 0; r < ranges.length; r += 4)
		if ((ranges[r + 3] & OVERLAY_VERBATIM) !== 0)
			out.push(ranges[r], ranges[r + 1]);
	return out;
}

/** the offset in body, offset in code and length of each live group, null for none */
function live_offsets(
	code: string,
	body: string,
	groups: number[]
): number[] | null {
	const live: number[] = [];
	let from = 0;
	for (let i = 0; i < groups.length; i += 2) {
		const start = groups[i];
		const text = code.slice(start, groups[i + 1]);
		// every other brace in body is a character reference
		const at = body.indexOf('{', from);
		if (at === -1 || !body.startsWith(text, at)) continue;
		live.push(at, start, text.length);
		from = at + text.length;
	}
	return live.length === 0 ? null : live;
}

/** the display text as a template literal with each live group interpolated */
function code_template(
	code: string,
	visible: VisibleText,
	groups: number[]
): string {
	const { text, segments } = visible;
	let out = '`';
	let last = 0;
	let k = 0;
	for (let i = 0; i < groups.length; i += 2) {
		const start = groups[i];
		const group = code.slice(start, groups[i + 1]);
		while (k < segments.length && segments[k + 1] <= start) k += 3;
		if (k >= segments.length || segments[k] > start) continue;
		const at = segments[k + 2] + start - segments[k];
		if (!text.startsWith(group, at)) continue;
		out +=
			template_text(text.slice(last, at)) +
			'${' +
			group_expression(group) +
			'}';
		last = at + group.length;
	}
	return out + template_text(text.slice(last)) + '`';
}

function merge_hook(theirs: HookResult | void, ours: HookResult): HookResult {
	if (theirs === undefined || theirs === null) return ours;
	return {
		class: join(theirs.class ?? '', ours.class ?? ''),
		attrs: { ...theirs.attrs, ...ours.attrs },
	};
}

/**
 * twinkleplop through the fence meta conventions of markdown-core, rendered
 * as markup with every brace escaped
 */
export function create_highlight(
	options: HighlightOptions = {}
): HighlightConfig {
	if (typeof options !== 'object' || options === null)
		throw new TypeError('[mdsvex] create_highlight takes an options object');
	const annotations =
		options.annotations === undefined
			? default_annotations
			: options.annotations === false
				? []
				: options.annotations;
	if (!Array.isArray(annotations))
		throw new TypeError(
			'[mdsvex] highlight.annotations must be a list of annotation plugins or false'
		);
	const language_options: LanguageOptions | undefined =
		annotations.length === 0
			? undefined
			: { annotation: { plugins: [...annotations], on_error: on_issue } };
	const registry = resolve_languages(options.languages ?? {}, language_options);

	const lookup = (name: string): Entry | undefined =>
		registry.get(name) ?? registry.get(name.toLowerCase());

	const twoslash = options.twoslash;
	if (twoslash) {
		for (const name of Object.keys(twoslash)) {
			const entry = lookup(name);
			if (entry === undefined)
				throw new Error(
					`[mdsvex] highlight.twoslash.${name} is not a language in highlight.languages`
				);
			entry.twoslash = twoslash[name];
		}
	}

	const default_language = options.default_language;
	if (default_language !== undefined && lookup(default_language) === undefined)
		throw new Error(
			`[mdsvex] highlight.default_language "${default_language}" is not a language in highlight.languages`
		);
	const on_unknown = options.on_unknown_language ?? 'plain';
	const site_line_numbers = options.line_numbers;
	const hook = options.parse_meta;
	const base = options.render ?? {};
	// svelte reads braces in markup as expressions
	const escape = { ...base.escape, '{': '&#123;', '}': '&#125;' };

	function unknown(name: string, ctx: HighlightContext, what: string): void {
		if (on_unknown === 'throw') fail(`unknown ${what} language "${name}"`);
		ctx.unknown_language(name);
	}

	function build_render(
		name: string,
		parsed: ParsedMeta,
		source: string
	): RenderOptions {
		const items: OverlayItem[] =
			base.overlays === undefined ? [] : [...base.overlays];
		const line_ids = new Map<number, string>();
		if (parsed.line_groups.length !== 0) {
			const line_count = count_lines(source);
			for (const group of parsed.line_groups) {
				for (const entry of group.lines) {
					const [from, to] = typeof entry === 'number' ? [entry, entry] : entry;
					check_line(from, line_count);
					check_line(to, line_count);
					if (to < from) fail(`line range ${from}-${to} runs backwards`);
					if (group.id !== undefined)
						for (let line = from; line <= to; line++)
							line_ids.set(line, group.id);
				}
				items.push({ lines: group.lines, class: HIGHLIGHT_CLASS });
			}
		}
		const word_ids: { start: number; end: number; id: string }[] = [];
		for (const group of parsed.word_groups) {
			// an occurrence range that overshoots wraps fewer words
			const hits = occurrences(source, group.text);
			const from = group.from ?? 1;
			const to = Math.min(group.to ?? hits.length, hits.length);
			for (let n = from; n <= to; n++) {
				const start = hits[n - 1];
				const end = start + group.text.length;
				items.push({ start, end, class: WORD_CLASS });
				if (group.id !== undefined) word_ids.push({ start, end, id: group.id });
			}
		}

		const render: RenderOptions = {
			...base,
			class_name: join(
				base.class_name ?? 'twinkleplop',
				name === '' ? '' : 'language-' + name
			),
			line_numbers:
				parsed.line_numbers !== undefined
					? parsed.line_numbers
					: site_line_numbers !== undefined
						? site_line_numbers
						: base.line_numbers,
		};
		if (name !== '')
			render.attributes = { ...base.attributes, 'data-language': name };
		if (items.length !== 0) render.overlays = items;
		if (line_ids.size !== 0) {
			const user = base.line;
			render.line = (n, source_line) => {
				const id = line_ids.get(source_line);
				const theirs = user?.(n, source_line);
				if (id === undefined) return theirs;
				return merge_hook(theirs, {
					attrs: { 'data-highlighted-line-id': id },
				});
			};
		}
		if (word_ids.length !== 0) {
			const user = base.token;
			render.token = (type, start, end) => {
				const theirs = user?.(type, start, end);
				for (const word of word_ids)
					if (start >= word.start && end <= word.end)
						return merge_hook(theirs, { attrs: { 'data-chars-id': word.id } });
				return theirs;
			};
		}
		return render;
	}

	function figure(name: string, parsed: ParsedMeta): [string, string] {
		const { title, caption } = parsed;
		if (title === undefined && caption === undefined) return ['', ''];
		let before =
			name === ''
				? '<figure class="twinkleplop-block">\n'
				: `<figure class="twinkleplop-block" data-language="${escape_text(name)}">\n`;
		if (title !== undefined)
			before += `<figcaption class="twinkleplop-title">${escape_text(title)}</figcaption>\n`;
		let after = '\n</figure>';
		if (caption !== undefined)
			after =
				`\n<figcaption class="twinkleplop-caption">${escape_text(caption)}</figcaption>` +
				after;
		return [before, after];
	}

	function block(
		code: string,
		lang: string,
		meta: string,
		ctx: HighlightContext
	): HighlightedBlock {
		// a fence with no language has no meta, so eval there is the flag
		const bare_eval = lang === 'eval';
		const name = lang !== '' && !bare_eval ? lang : (default_language ?? '');
		const parsed = parse_meta(meta, fail);
		const flag =
			bare_eval ||
			(meta.indexOf('eval') !== -1 && has_eval_flag(meta_parts(meta)));
		let entry: Entry | null = null;
		if (name !== '') {
			entry = lookup(name) ?? null;
			if (entry === null) unknown(name, ctx, 'fence');
		}
		let render = build_render(name, parsed, code);
		if (hook !== undefined) render = hook(meta, render) ?? render;
		render.escape = escape;

		let attributes: string | null;
		let body: string;
		let text = code;
		let template: string | null = null;
		let live: number[] | null = null;
		const html = parsed.twoslash
			? (entry?.twoslash ?? fail(`"${name}" has no twoslash highlighter`))
			: entry?.html;
		if (html) {
			if (flag) unsupported_eval(ctx);
			const out = escape_braces(html(code, render));
			const split = split_element(out, 'pre');
			attributes = split === null ? null : split.attributes;
			body = split === null ? out : split.body;
		} else {
			const tokenize = entry?.tokenize;
			let result: TokenizeResult;
			let groups: number[] | null = null;
			// without a marker or the flag nothing in the fence is live
			if (flag || code.indexOf('[!') !== -1) {
				const prev = eval_run;
				const run: EvalRun = {
					source: code,
					flag,
					seen: new Set(),
					error: null,
				};
				eval_run = run;
				try {
					result = tokenize ? tokenize(code) : NO_TOKENS;
				} finally {
					eval_run = prev;
				}
				if (run.error !== null) throw run.error;
				if (flag) {
					groups = fence_groups(
						code,
						result.overlays?.skip_ranges ?? NO_RANGES
					);
					if (groups.length !== 0) {
						const items: OverlayItem[] = render.overlays
							? [...render.overlays]
							: [];
						for (let i = 0; i < groups.length; i += 2)
							items.push({
								start: groups[i],
								end: groups[i + 1],
								verbatim: true,
							});
						// a parse_meta hook may hand back an object it keeps
						render = { ...render, overlays: items };
					}
				} else groups = verbatim_ranges(result);
				if (groups.length === 0) groups = null;
			} else result = tokenize ? tokenize(code) : NO_TOKENS;
			const parts = to_parts(code, result, render);
			attributes = attribute_text(parts.attributes);
			body = parts.body;
			if (groups === null) text = visible_text(code, result, render);
			else {
				live = live_offsets(code, body, groups);
				const visible = visible_text_map(code, result, render);
				text = visible.text;
				template = code_template(code, visible, groups);
			}
		}
		const [before, after] = figure(name, parsed);
		const info = read_meta(meta);
		info.title = parsed.title;
		info.caption = parsed.caption;
		const { props, dropped } = pre_props(info);
		return {
			before,
			attributes,
			body,
			after,
			props,
			code: text,
			code_template: template,
			live,
			dropped,
		};
	}

	function inline(
		code: string,
		lang: string,
		ctx: HighlightContext
	): HighlightedCode {
		const entry = lookup(lang);
		if (entry === undefined) unknown(lang, ctx, 'inline code');
		const render: RenderOptions = { ...base, structure: 'inline', escape };
		let body: string;
		if (entry?.html) body = escape_braces(entry.html(code, render));
		else {
			const result = entry?.tokenize ? entry.tokenize(code) : NO_TOKENS;
			body = to_html(code, result, render);
		}
		return {
			attributes: ` class="twinkleplop twinkleplop-inline language-${escape_text(lang)}"`,
			body,
		};
	}

	return {
		block(code, lang, meta, ctx) {
			const prev = issue_ctx;
			issue_ctx = ctx;
			try {
				return block(code, lang, meta, ctx);
			} finally {
				issue_ctx = prev;
			}
		},
		inline(code, lang, ctx) {
			const prev = issue_ctx;
			issue_ctx = ctx;
			try {
				return inline(code, lang, ctx);
			} finally {
				issue_ctx = prev;
			}
		},
	};
}
