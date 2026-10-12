// code from a file and code that runs, a walk over the finished tree, only
// for a document the parser saw src= or the run flag in an info string of

import type { NodeBuffer } from '@mdsvex/parse/utils';
import { K_CODE_FENCE } from '@mdsvex/render/html-cursor';
import type { FenceSource } from '@mdsvex/render/html-cursor';
import { meta_parts } from './code_meta';
import {
	RUN_FLAG,
	RunError,
	module_name,
	run_extension,
	run_flag,
	sibling_specifier,
	snippet_hash,
	snippet_of,
} from './run_blocks';
import type { RunErrorCode, Snippet, SnippetsOption } from './run_blocks';

/** a file a fence shows with src=, a render needs its text */
export interface SourceNeed {
	type: 'source';
	/** the file as the fence names it, without the line slice */
	spec: string;
	/** the first fence that names it, line from 1 and column from 0, which hold in the raw source */
	start: { line: number; column: number };
}

/**
 * src_spec, a src= that names no file or has a slice that is no line range,
 * src_body, a fence with src= and code of its own, src_missing, a file no
 * text was given for, src_slice, lines the file does not have
 */
export type SourceErrorCode =
	| 'src_spec'
	| 'src_body'
	| 'src_missing'
	| 'src_slice';

/** a fence with src= that can not show its file */
export class SourceError extends Error {
	code: SourceErrorCode;
	/** the file as the fence names it, without the line slice */
	spec: string;
	/** 1 based line of the fence in the document */
	line: number;
	/** 1 based column */
	column: number;

	constructor(
		code: SourceErrorCode,
		message: string,
		spec: string,
		line: number,
		column: number
	) {
		super(message);
		this.name = 'SourceError';
		this.code = code;
		this.spec = spec;
		this.line = line;
		this.column = column;
	}
}

/** a fence with src= or the run flag as the walk found it */
interface Shown {
	node: number;
	/** the offset of the fence */
	start: number;
	/** the file src= names, '' for a fence that has its own code */
	spec: string;
	/** the value of src= as written, with its slice */
	written: string;
	/** the first line, from 1, 0 for the whole file */
	from: number;
	/** the last line, 0 for the last of the file */
	to: number;
	/** the language as written, '' takes it from the file name */
	lang: string;
	/** the meta without the src= part and the run flag */
	rest: string;
	/** 0 for a fence that does not run, 1 for run and 2 for run=client */
	run: number;
	/** the code of a fence without src= */
	text: string;
	/** the module of a fence that runs its own code */
	snippet: Snippet | null;
}

/** @internal the fences of a document that show a file or run */
export interface SourceFences {
	/** one per file, in document order, none for a document that only runs blocks */
	needs: SourceNeed[];
	fences: Shown[];
	/** true when the document has a math fence, which may wait for its renderer */
	math: boolean;
	/** the code of the fences that run their own, one per hash, in document order */
	snippets: Snippet[] | null;
}

// must equal NONE in @mdsvex/parse
const NONE = 0xffffffff;

const SLICE = /#(?:L(\d+)(-(?:L(\d+))?)?|-L(\d+))$/;
const MAYBE_SLICE = /^#[L\d-]+$/;
// a marker of a block quote or an indent is no code
const CODE = /[^\s>]/;

function position(
	source: string,
	start: number
): { line: number; column: number } {
	const line_start = source.lastIndexOf('\n', start - 1) + 1;
	let line = 1;
	for (
		let i = source.indexOf('\n');
		i !== -1 && i < start;
		i = source.indexOf('\n', i + 1)
	)
		line++;
	return { line, column: start - line_start };
}

function where(
	filename: string | undefined,
	source: string,
	start: number
): string {
	const { line } = position(source, start);
	return filename === undefined
		? `fence at line ${line}`
		: `fence at ${filename}:${line}`;
}

function error(
	code: SourceErrorCode,
	message: string,
	spec: string,
	filename: string | undefined,
	source: string,
	start: number
): SourceError {
	const { line, column } = position(source, start);
	return new SourceError(
		code,
		`${message} (${where(filename, source, start)})`,
		spec,
		line,
		column + 1
	);
}

function run_error(
	code: RunErrorCode,
	message: string,
	filename: string | undefined,
	source: string,
	start: number
): RunError {
	const { line, column } = position(source, start);
	return new RunError(
		code,
		`${message} (${where(filename, source, start)})`,
		line,
		column + 1
	);
}

/** @internal a SourceError at the fence of a need, for a caller that could not fetch its file */
export function need_error(
	need: SourceNeed,
	message: string,
	filename: string | undefined
): SourceError {
	return new SourceError(
		'src_missing',
		`${message} (fence at ${filename === undefined ? 'line ' : filename + ':'}${need.start.line})`,
		need.spec,
		need.start.line,
		need.start.column + 1
	);
}

function unquoted(value: string): string {
	if (value.length < 2) return value;
	const open = value.charCodeAt(0);
	if (open !== 34 && open !== 39) return value;
	return value.charCodeAt(value.length - 1) === open
		? value.slice(1, value.length - 1)
		: value;
}

/** the first space or tab, -1 for none */
function space_of(info: string): number {
	for (let i = 0; i < info.length; i++) {
		const ch = info.charCodeAt(i);
		if (ch === 32 || ch === 9) return i;
	}
	return -1;
}

/** the language a file name stands for, its extension or its whole name */
function language_of(spec: string): string {
	let end = spec.length;
	const query = spec.indexOf('?');
	if (query !== -1) end = query;
	const name = spec.slice(
		Math.max(spec.lastIndexOf('/', end), spec.lastIndexOf('\\', end)) + 1,
		end
	);
	const dot = name.lastIndexOf('.');
	const lang = (dot === -1 ? name : name.slice(dot + 1)).toLowerCase();
	return lang === '' || space_of(lang) !== -1 ? 'text' : lang;
}

/** the file and line slice of a src= value, a slice that is no line range throws */
function sliced(
	written: string,
	filename: string | undefined,
	source: string,
	start: number
): { spec: string; from: number; to: number } {
	let spec = written;
	let from = 0;
	let to = 0;
	const hash = written.lastIndexOf('#');
	// #lib/a.ts is a subpath, a slice is the last # and all L, digits and dashes
	if (hash !== -1 && MAYBE_SLICE.test(written.slice(hash))) {
		const m = SLICE.exec(written);
		if (m === null || m.index !== hash)
			throw error(
				'src_spec',
				`${written} has a slice that is no line range, write #L5, #L5-L20, #L5- or #-L20`,
				written.slice(0, hash),
				filename,
				source,
				start
			);
		spec = written.slice(0, m.index);
		if (m[4] !== undefined) {
			from = 1;
			to = +m[4];
		} else {
			from = +m[1];
			to = m[2] === undefined ? from : m[3] === undefined ? 0 : +m[3];
		}
		if (from < 1 || (to !== 0 && to < from))
			throw error(
				'src_spec',
				`${written} has a slice that is no line range, lines count from 1 and the first comes first`,
				spec,
				filename,
				source,
				start
			);
	}
	if (spec === '')
		throw error(
			'src_spec',
			'src= needs the path of a file',
			spec,
			filename,
			source,
			start
		);
	return { spec, from, to };
}

/** the extension of the module of a block that runs, a block that can not run throws */
function runnable(
	flag: number,
	lang: string,
	parts: string[],
	filename: string | undefined,
	source: string,
	start: number
): string {
	if (flag === -1)
		throw run_error(
			'run_value',
			`${RUN_FLAG}= takes client, which imports the block when it is asked for, a bare ${RUN_FLAG} imports it with the document`,
			filename,
			source,
			start
		);
	if (lang === 'eval' || parts.includes('eval'))
		throw run_error(
			'run_eval',
			`A block is live with eval or runs with ${RUN_FLAG}, not both, its {...} groups mean different things in each`,
			filename,
			source,
			start
		);
	const extension = run_extension(lang);
	if (extension === undefined)
		throw run_error(
			'run_lang',
			lang === ''
				? `A block that runs needs a language, js, ts, jsx, tsx or svelte`
				: `A ${lang} block can not run, only js, ts, jsx, tsx and svelte blocks are modules`,
			filename,
			source,
			start
		);
	return extension;
}

/** a block with an [!eval] range in its code is live, which a block that runs can not be */
function no_live(
	code: string,
	filename: string | undefined,
	source: string,
	start: number
): void {
	if (code.indexOf('[!eval') !== -1)
		throw run_error(
			'run_eval',
			`A block is live with [!eval] or runs with ${RUN_FLAG}, not both, its {...} groups mean different things in each`,
			filename,
			source,
			start
		);
}

/**
 * the fences of a document that have src= or the run flag in their meta,
 * null when none has, shows is false for a compile that leaves src= as
 * written and runs for one that runs no block, the flag is then only taken
 * out of the meta, a fence that names no file, has a slice that is no line
 * range or has code of its own beside src= throws a SourceError, one that
 * can not run throws a RunError
 */
export function source_fences(
	buf: NodeBuffer,
	source: string,
	filename: string | undefined,
	shows: boolean,
	runs: boolean
): SourceFences | null {
	let fences: Shown[] | null = null;
	let needs: SourceNeed[] | null = null;
	let seen: Set<string> | null = null;
	let snippets: Snippet[] | null = null;
	let hashes: Set<string> | null = null;
	let math = false;
	let node = buf.first_child_at(0);
	while (node !== NONE) {
		let down = NONE;
		if ((buf.kind_at(node) as number) === K_CODE_FENCE) {
			const meta = buf.metadata_at(node);
			let info = meta?.info as string | undefined;
			if (!info && meta != null) {
				const a = meta.info_start as number | undefined;
				const b = meta.info_end as number | undefined;
				if (a != null && b != null && b > a) info = source.slice(a, b);
			}
			if (info) {
				const space = space_of(info);
				let lang = space === -1 ? info : info.slice(0, space);
				if (lang === 'math') math = true;
				const src_at = info.indexOf('src=');
				if (
					(shows || src_at === -1) &&
					(src_at !== -1 || info.indexOf(RUN_FLAG) !== -1)
				) {
					// with no language the first word is the src= or the flag itself
					let rest = space === -1 ? '' : info.slice(space);
					if (lang.startsWith('src=') || run_flag(lang) !== 0) {
						rest = info;
						lang = '';
					}
					const parts = meta_parts(rest);
					let at = -1;
					let run_at = -1;
					let flag = 0;
					for (let i = 0; i < parts.length; i++) {
						const part = parts[i];
						if (at === -1 && part.startsWith('src=')) at = i;
						else if (run_at === -1 && (flag = run_flag(part)) !== 0) run_at = i;
					}
					if (at !== -1 || run_at !== -1) {
						const start = buf.start_at(node);
						let spec = '';
						let written = '';
						let from = 0;
						let to = 0;
						let text = '';
						const vs = buf.value_start_at(node);
						const ve = buf.value_end_at(node);
						if (at !== -1) {
							written = unquoted(parts[at].slice(4));
							({ spec, from, to } = sliced(written, filename, source, start));
							if (ve > vs && CODE.test(source.slice(vs, ve)))
								throw error(
									'src_body',
									`A fence with src= shows ${spec}, so it can have no code of its own`,
									spec,
									filename,
									source,
									start
								);
						} else
							// a fence in a block quote or a list item holds its code as a string
							text =
								buf._strings[node] ??
								(vs === NONE || ve === NONE || ve <= vs
									? ''
									: source.slice(vs, ve));
						let snippet: Snippet | null = null;
						if (run_at === -1 || !runs) flag = 0;
						else {
							const extension = runnable(
								flag,
								lang === '' && at !== -1 ? language_of(spec) : lang,
								parts,
								filename,
								source,
								start
							);
							if (at === -1) {
								no_live(text, filename, source, start);
								// the code starts on the line after the fence opens
								snippet = snippet_of(
									lang,
									extension,
									text,
									position(source, start).line + 1
								);
								if (!(hashes ??= new Set()).has(snippet.hash)) {
									hashes.add(snippet.hash);
									(snippets ??= []).push(snippet);
								}
							}
						}
						// the later of the two first, so the other keeps its index
						if (run_at > at) {
							parts.splice(run_at, 1);
							if (at !== -1) parts.splice(at, 1);
						} else {
							parts.splice(at, 1);
							if (run_at !== -1) parts.splice(run_at, 1);
						}
						(fences ??= []).push({
							node,
							start,
							spec,
							written,
							from,
							to,
							lang,
							rest: parts.join(' '),
							run: flag,
							text,
							snippet,
						});
						if (at !== -1 && !(seen ??= new Set()).has(spec)) {
							seen.add(spec);
							(needs ??= []).push({
								type: 'source',
								spec,
								start: position(source, start),
							});
						}
					}
				}
			}
		} else down = buf.first_child_at(node);
		if (down !== NONE) {
			node = down;
			continue;
		}
		// the next node in document order
		for (;;) {
			const next = buf.next_at(node);
			const parent = buf.parent_at(node);
			if (next !== NONE && buf.parent_at(next) === parent) {
				node = next;
				break;
			}
			if (parent === 0 || parent === NONE) {
				node = NONE;
				break;
			}
			node = parent;
		}
	}
	return fences === null
		? null
		: { needs: needs ?? [], fences, math, snippets };
}

const has_own = Object.prototype.hasOwnProperty;

/** @internal true when the text of every file is among sources */
export function sources_met(
	found: SourceFences,
	sources: Readonly<Record<string, string>> | undefined
): boolean {
	const needs = found.needs;
	// a document that only runs blocks waits for nothing
	if (needs.length === 0) return true;
	if (sources === undefined) return false;
	for (let i = 0; i < needs.length; i++)
		if (!has_own.call(sources, needs[i].spec)) return false;
	return true;
}

/** @internal what a render of the fences of a document takes */
export interface Fenced {
	/** for renderer.fences */
	fences: Map<number, FenceSource>;
	/** the imports of the modules of the blocks that run, for renderer.imports */
	lines: string[] | undefined;
	/** the code of the blocks that run their own, for the caller to serve */
	snippets: Snippet[] | undefined;
	/** the offset of the first fence that runs, -1 for none, a component must replace pre then */
	runs: number;
}

/**
 * @internal what each fence with src= or the run flag renders, a file with
 * no text among sources or without the lines of a slice throws a
 * SourceError, a block nothing says how to import throws a RunError
 */
export function fence_sources(
	found: SourceFences,
	sources: Readonly<Record<string, string>> | undefined,
	source: string,
	filename: string | undefined,
	snippets?: SnippetsOption
): Fenced {
	const out = new Map<number, FenceSource>();
	const fences = found.fences;
	// a file many fences slice is split into lines once
	let split: Map<string, string[]> | null = null;
	let lines: string[] | undefined;
	let runs = -1;
	for (let i = 0; i < fences.length; i++) {
		const f = fences[i];
		const spec = f.spec;
		let text = f.text;
		let lang = f.lang;
		let props: string | undefined;
		if (spec !== '') {
			if (sources === undefined || !has_own.call(sources, spec))
				throw error(
					'src_missing',
					`No text was given for ${spec}, pass it in the sources option`,
					spec,
					filename,
					source,
					f.start
				);
			text = sources[spec];
			if (typeof text !== 'string')
				throw new TypeError(
					`[mdsvex] sources[${JSON.stringify(spec)}] must be the text of the file`
				);
			if (f.from === 0) {
				if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
				if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
				// a fence has no newline after its last line either
				if (text.charCodeAt(text.length - 1) === 10) text = text.slice(0, -1);
			} else {
				let rows = (split ??= new Map()).get(spec);
				if (rows === undefined) {
					rows = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(
						/\r\n?|\n/
					);
					if (rows[rows.length - 1] === '') rows.pop();
					split.set(spec, rows);
				}
				const to = f.to === 0 ? rows.length : f.to;
				if (f.from > rows.length || to > rows.length)
					throw error(
						'src_slice',
						`${f.written} asks for ${f.from === to ? 'line ' + to : 'lines ' + f.from + ' to ' + to}, ${spec} has ${rows.length}`,
						spec,
						filename,
						source,
						f.start
					);
				text = rows.slice(f.from - 1, to).join('\n');
			}
			if (lang === '') lang = language_of(spec);
			props = ' src={' + JSON.stringify(f.written) + '}';
		}
		if (f.run !== 0 && snippets !== false) {
			if (runs === -1) runs = f.start;
			let from = spec;
			let name: string;
			const snippet = f.snippet;
			if (snippet === null) {
				// the file is the module, whatever lines of it the fence shows
				no_live(text, filename, source, f.start);
				name = module_name(snippet_hash('src\n' + spec));
			} else {
				from = specifier_of(snippet, snippets, filename, source, f.start);
				name = module_name(snippet.hash);
			}
			if (f.run === 2)
				props =
					(props ?? '') + ' load={() => import(' + JSON.stringify(from) + ')}';
			else {
				const line =
					'import * as ' + name + ' from ' + JSON.stringify(from) + ';';
				if (lines === undefined) lines = [line];
				else if (!lines.includes(line)) lines.push(line);
				props = (props ?? '') + ' module={' + name + '}';
			}
		}
		out.set(f.node, {
			text,
			info: f.rest === '' ? lang : lang + ' ' + f.rest,
			props,
		});
	}
	return {
		fences: out,
		lines,
		snippets:
			runs === -1 || found.snippets === null ? undefined : found.snippets,
		runs,
	};
}

/** the specifier the document imports the module of a block by */
function specifier_of(
	snippet: Snippet,
	option: SnippetsOption | undefined,
	filename: string | undefined,
	source: string,
	start: number
): string {
	if (typeof option === 'function') {
		const given = option(snippet);
		if (typeof given !== 'string' || given === '')
			throw new TypeError(
				'[mdsvex] snippets must return the specifier the block is imported by'
			);
		return given;
	}
	if (option !== true)
		throw run_error(
			'run_module',
			`A block that runs is imported as a module, which compile() can not serve, pass snippets: true and serve the snippets of the result, or snippets: false to run no block`,
			filename,
			source,
			start
		);
	if (filename === undefined)
		throw run_error(
			'run_module',
			`A block that runs is imported as a sibling of the document, pass its filename`,
			filename,
			source,
			start
		);
	return sibling_specifier(filename, snippet);
}

/** @internal a RunError for a document with a block that runs and no component for pre */
export function pre_error(
	filename: string | undefined,
	source: string,
	start: number
): RunError {
	return run_error(
		'run_pre',
		`A block that runs hands its module to the component that replaces pre, and no component does, export one named pre from a components module or a template`,
		filename,
		source,
		start
	);
}
