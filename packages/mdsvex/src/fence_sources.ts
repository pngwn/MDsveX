// code from a file, a walk over the finished tree, only for a document the
// parser saw a fence with an info string in

import type { NodeBuffer } from '@mdsvex/parse/utils';
import { K_CODE_FENCE } from '@mdsvex/render/html-cursor';
import type { FenceSource } from '@mdsvex/render/html-cursor';
import { meta_parts } from './code_meta';

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

/** a fence with src= as the walk found it */
interface Shown {
	node: number;
	/** the offset of the fence */
	start: number;
	spec: string;
	/** the value of src= as written, with its slice */
	written: string;
	/** the first line, from 1, 0 for the whole file */
	from: number;
	/** the last line, 0 for the last of the file */
	to: number;
	/** the language as written, '' takes it from the file name */
	lang: string;
	/** the meta without the src= part */
	rest: string;
}

/** @internal the fences of a document that show a file */
export interface SourceFences {
	/** one per file, in document order */
	needs: SourceNeed[];
	fences: Shown[];
	/** true when the document has a math fence, which may wait for its renderer */
	math: boolean;
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

/**
 * the fences of a document that have src= in their meta, null when none
 * has, a fence that names no file, has a slice that is no line range or has
 * code of its own throws a SourceError
 */
export function source_fences(
	buf: NodeBuffer,
	source: string,
	filename: string | undefined
): SourceFences | null {
	let fences: Shown[] | null = null;
	let needs: SourceNeed[] | null = null;
	let seen: Set<string> | null = null;
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
				if (info.indexOf('src=') !== -1) {
					// with no language the first word is the src= itself
					let rest = space === -1 ? '' : info.slice(space);
					if (lang.startsWith('src=')) {
						rest = info;
						lang = '';
					}
					const parts = meta_parts(rest);
					let at = -1;
					for (let i = 0; i < parts.length && at === -1; i++)
						if (parts[i].startsWith('src=')) at = i;
					if (at !== -1) {
						const start = buf.start_at(node);
						const written = unquoted(parts[at].slice(4));
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
						const vs = buf.value_start_at(node);
						const ve = buf.value_end_at(node);
						if (ve > vs && CODE.test(source.slice(vs, ve)))
							throw error(
								'src_body',
								`A fence with src= shows ${spec}, so it can have no code of its own`,
								spec,
								filename,
								source,
								start
							);
						parts.splice(at, 1);
						(fences ??= []).push({
							node,
							start,
							spec,
							written,
							from,
							to,
							lang,
							rest: parts.join(' '),
						});
						if (!(seen ??= new Set()).has(spec)) {
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
	return fences === null ? null : { needs: needs!, fences, math };
}

const has_own = Object.prototype.hasOwnProperty;

/** @internal true when the text of every file is among sources */
export function sources_met(
	found: SourceFences,
	sources: Readonly<Record<string, string>> | undefined
): boolean {
	if (sources === undefined) return false;
	const needs = found.needs;
	for (let i = 0; i < needs.length; i++)
		if (!has_own.call(sources, needs[i].spec)) return false;
	return true;
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

/**
 * @internal what each fence with src= renders, for renderer.fences, a file
 * with no text among sources or without the lines of a slice throws a
 * SourceError
 */
export function fence_sources(
	found: SourceFences,
	sources: Readonly<Record<string, string>> | undefined,
	source: string,
	filename: string | undefined
): Map<number, FenceSource> {
	const out = new Map<number, FenceSource>();
	const fences = found.fences;
	// a file many fences slice is split into lines once
	let split: Map<string, string[]> | null = null;
	for (let i = 0; i < fences.length; i++) {
		const f = fences[i];
		const spec = f.spec;
		if (sources === undefined || !has_own.call(sources, spec))
			throw error(
				'src_missing',
				`No text was given for ${spec}, pass it in the sources option`,
				spec,
				filename,
				source,
				f.start
			);
		let text = sources[spec];
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
			let lines = (split ??= new Map()).get(spec);
			if (lines === undefined) {
				lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(
					/\r\n?|\n/
				);
				if (lines[lines.length - 1] === '') lines.pop();
				split.set(spec, lines);
			}
			const to = f.to === 0 ? lines.length : f.to;
			if (f.from > lines.length || to > lines.length)
				throw error(
					'src_slice',
					`${f.written} asks for ${f.from === to ? 'line ' + to : 'lines ' + f.from + ' to ' + to}, ${spec} has ${lines.length}`,
					spec,
					filename,
					source,
					f.start
				);
			text = lines.slice(f.from - 1, to).join('\n');
		}
		const lang = f.lang === '' ? language_of(spec) : f.lang;
		out.set(f.node, {
			text,
			info: f.rest === '' ? lang : lang + ' ' + f.rest,
			props: ' src={' + JSON.stringify(f.written) + '}',
		});
	}
	return out;
}
